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
  senior: "Qwen/Qwen3.6-27B",
  junior: "Qwen/Qwen3.6-27B",
  judge: "nvidia/Nemotron-Cascade-2-30B-A3B",
  drone: "deepseek-ai/DeepSeek-V4-Flash",  // fast direct-JSON extraction fleet
};
const FALLBACK: Record<string, string> = {
  "Qwen/Qwen3.6-27B": "Qwen/Qwen3.5-397B-A17B",        // both Vultr-native
  "Qwen/Qwen3.5-397B-A17B": "moonshotai/Kimi-K2.6",     // Kimi is Vultr-served too
  "nvidia/Nemotron-Cascade-2-30B-A3B": "Qwen/Qwen3.6-27B",
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
      if (e.name === "TimeoutError") { if (attempt === 1 && FALLBACK[model]) model = FALLBACK[model]; continue; }
      if (attempt >= 3) break;
      await new Promise(res => setTimeout(res, 600 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error("chat failed");
}
