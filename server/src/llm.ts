/**
 * LLM layer — Vultr Serverless Inference, junior/senior routing.
 *
 *   route(tier) ──▶ model ──▶ chat(): retries(429/5xx) → failover(once, pre-output)
 *                              └─ usage metering → spend guard ($150 hard kill)
 *
 * All models run on Vultr Serverless Inference. Retrieval runs on VultronRetriever
 * (see retriever.ts). Bake-off (scripts/bakeoff-vultr.mjs): Qwen3.5-397B, Qwen3.6-27B,
 * Kimi, Nemotron all 4/4 on the forensic tool-call suite.
 *   senior = Qwen3.6-27B        (Vultr-native, newest generation; Qwen3.5-397B fallback)
 *   junior = Qwen3.6-27B        (Vultr-native, fast sweep/triage)
 *   judge  = Nemotron-Cascade-2 (Vultr-served independent verifier; NVIDIA)
 */
import { env } from "./env.js";
import type { ModelTier } from "@veritas/shared";

const BASE = "https://api.vultrinference.com/v1/chat/completions";
export const MODELS: Record<ModelTier, string> = {
  senior: "Qwen/Qwen3.6-27B",                     // deep reasoning (Vultr-native)
  junior: "Qwen/Qwen3.6-27B",
  judge: "nvidia/Nemotron-Cascade-2-30B-A3B",     // panel + fleet (NVIDIA, compulsory)
  drone: "nvidia/Nemotron-Cascade-2-30B-A3B",     // the AI reading fleet (no-think)
};
// NOTE: judge/drone (Nemotron) deliberately has NO fallback — the verifier's
// independence is the point. If Nemotron is unreachable the reviewer ABSTAINS;
// it is never silently replaced by the examiner's own model family.
const FALLBACK: Record<string, string> = {
  "Qwen/Qwen3.6-27B": "Qwen/Qwen3.5-397B-A17B",
};
// $/1M tokens (from live catalog)
const PRICE: Record<string, [number, number]> = {
  "Qwen/Qwen3.5-397B-A17B": [0.4, 1.6],
  "Qwen/Qwen3.6-27B": [0.1, 0.4],
  "nvidia/Nemotron-Cascade-2-30B-A3B": [0.15, 0.6],
  "moonshotai/Kimi-K2.6": [0.3, 1.2],
  "deepseek-ai/DeepSeek-V4-Flash": [0.15, 0.6],
};

export interface ChatMsg { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }
export interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export interface ToolDef { type: "function"; function: { name: string; description: string; parameters: unknown } }

const spend = { usd: 0, inTok: 0, outTok: 0 };
const SPEND_KILL_USD = 150;
export const getSpend = () => ({ ...spend });

export async function chat(tier: ModelTier, messages: ChatMsg[], tools?: ToolDef[], opts: { maxTokens?: number; signal?: AbortSignal; noThink?: boolean; timeoutMs?: number } = {}) {
  if (spend.usd >= SPEND_KILL_USD) throw new Error(`SPEND KILL: $${spend.usd.toFixed(2)} >= $${SPEND_KILL_USD}`);
  const primary = MODELS[tier];
  let model = primary;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const t0 = Date.now();
      const r = await fetch(BASE, {
        method: "POST",
        headers: { Authorization: `Bearer ${env("VULTR_INFERENCE_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, ...(tools ? { tools } : {}), ...(opts.noThink ? { chat_template_kwargs: { enable_thinking: false } } : {}), temperature: 0.1, top_p: 0.9, max_tokens: opts.maxTokens ?? 1200 }),
        signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 90_000),
      });
      if (r.status === 429 || r.status >= 500) {
        lastErr = new Error(`HTTP ${r.status}`);
        if (attempt === 1 && FALLBACK[model]) model = FALLBACK[model]; // failover once, pre-output only
        await new Promise(res => setTimeout(res, 800 * (attempt + 1)));
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      const u = j.usage ?? {};
      const [pin, pout] = PRICE[model] ?? [0.3, 1.2];
      spend.inTok += u.prompt_tokens ?? 0; spend.outTok += u.completion_tokens ?? 0;
      spend.usd += ((u.prompt_tokens ?? 0) * pin + (u.completion_tokens ?? 0) * pout) / 1e6;
      const msg = j.choices?.[0]?.message ?? {};
      return { message: msg as ChatMsg, model, ms: Date.now() - t0, usage: { in: u.prompt_tokens ?? 0, out: u.completion_tokens ?? 0, usd: spend.usd } };
    } catch (e: any) {
      lastErr = e;
      // a full timeout already burned the clock once — allow ONE more attempt
      // (with failover if available), never four. Live demos need a bounded worst case.
      if (e.name === "TimeoutError") { if (attempt >= 1) break; if (FALLBACK[model]) model = FALLBACK[model]; continue; }
      if (attempt >= 3) break;
      await new Promise(res => setTimeout(res, 600 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error("chat failed");
}

/** Streaming chat — yields token deltas as they arrive from Vultr Serverless Inference. */
export async function* streamChat(tier: ModelTier, messages: ChatMsg[], opts: { maxTokens?: number; noThink?: boolean; timeoutMs?: number } = {}): AsyncGenerator<string> {
  if (spend.usd >= SPEND_KILL_USD) throw new Error(`SPEND KILL: $${spend.usd.toFixed(2)} >= $${SPEND_KILL_USD}`);
  const model = MODELS[tier];
  const r = await fetch(BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("VULTR_INFERENCE_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true }, ...(opts.noThink ? { chat_template_kwargs: { enable_thinking: false } } : {}), temperature: 0.1, top_p: 0.9, max_tokens: opts.maxTokens ?? 900 }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
  });
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const j = JSON.parse(payload);
        const u = j.usage;
        if (u) {
          const [pin, pout] = PRICE[model] ?? [0.3, 1.2];
          spend.inTok += u.prompt_tokens ?? 0; spend.outTok += u.completion_tokens ?? 0;
          spend.usd += ((u.prompt_tokens ?? 0) * pin + (u.completion_tokens ?? 0) * pout) / 1e6;
        }
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* partial line */ }
    }
  }
}
