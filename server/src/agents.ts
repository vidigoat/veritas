/**
 * THE HARNESS — subagent primitives for a document-scale forensic agent.
 *
 *  A single context cannot hold thousands of documents. So VERITAS is a fleet:
 *  the orchestrator dispatches many focused subagents, each of which reads a
 *  slice of the corpus and returns COMPACT structured facts — never raw text.
 *  The orchestrator reasons over the facts (the CaseBrain), not the documents.
 *
 *    fanOut(shards, worker, {concurrency})  →  parallel map, bounded concurrency
 *    subagent(prompt, {model, schema})      →  one focused worker, JSON-validated
 *
 *  Every model runs on Vultr Serverless Inference. The extraction fleet is
 *  NVIDIA Nemotron (fast, cheap, massively parallel); the deep reasoning is Qwen/Kimi.
 */
import { chat, type ChatMsg, type ModelTier, MODELS } from "./llm.js";

export interface SubagentResult<T> { ok: boolean; data?: T; raw?: string; model: string; ms: number; error?: string }

/** One subagent: a focused model call that returns validated JSON matching `shape` keys. */
export async function subagent<T = any>(
  system: string,
  user: string,
  opts: { tier?: ModelTier; model?: string; maxTokens?: number; expectKeys?: string[]; signal?: AbortSignal; noThink?: boolean; timeoutMs?: number } = {},
): Promise<SubagentResult<T>> {
  const tier = opts.tier ?? "junior";
  const t0 = Date.now();
  const messages: ChatMsg[] = [
    { role: "system", content: system + "\n\nRespond with ONLY a single valid JSON object. No prose, no markdown fences." },
    { role: "user", content: user },
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await chat(tier, messages, undefined, { maxTokens: opts.maxTokens ?? 1400, signal: opts.signal, noThink: opts.noThink, timeoutMs: opts.timeoutMs });
      const raw = (res.message.content ?? (res.message as any).reasoning ?? "").toString();
      const data = extractJson<T>(raw);
      if (data && (!opts.expectKeys || opts.expectKeys.every(k => k in (data as any)))) {
        return { ok: true, data, raw, model: res.model, ms: Date.now() - t0 };
      }
      messages.push({ role: "assistant", content: raw.slice(0, 500) });
      messages.push({ role: "user", content: `That was not valid JSON with keys [${(opts.expectKeys ?? []).join(", ")}]. Return ONLY the JSON object.` });
    } catch (e: any) {
      if (attempt === 2) return { ok: false, model: MODELS[tier], ms: Date.now() - t0, error: e.message?.slice(0, 120) };
    }
  }
  return { ok: false, model: MODELS[tier], ms: Date.now() - t0, error: "no valid JSON after retries" };
}

/** Parallel map with bounded concurrency — the fan-out. onDone fires as each finishes (for streaming). */
export async function fanOut<I, O>(
  items: I[],
  worker: (item: I, index: number) => Promise<O>,
  opts: { concurrency?: number; onStart?: (i: number, item: I) => void; onDone?: (i: number, out: O) => void } = {},
): Promise<O[]> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 12, items.length));
  const out: O[] = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      opts.onStart?.(i, items[i]);
      try { out[i] = await worker(items[i], i); } catch (e: any) { out[i] = { __error: e.message } as any; }
      opts.onDone?.(i, out[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => runner()));
  return out;
}

/** Robustly pull the first balanced JSON object out of a model response. */
export function extractJson<T = any>(raw: string): T | null {
  const s = String(raw ?? "").replace(/```json|```/g, "");
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

/** Split a list into n roughly-equal shards. */
export function shard<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
