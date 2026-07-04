/**
 * VultronRetriever — the document-retrieval engine (Vultr Serverless Inference).
 *
 *  This is the CORE retrieval requirement of the Vultr track. VultronRetriever is a
 *  reranker: it reads candidate pages the way a person does — layout, tables, the
 *  fields that matter — and scores them for a query. It catches what keyword search
 *  misses: a query like "vendor registered at an employee's home address" surfaces the
 *  registration page even though those words never appear on it.
 *
 *   query ─▶ [stage 1] keyword recall (FTS5, cheap, wide net) ─▶ ~40 candidate pages
 *         ─▶ [stage 2] VultronRetriever rerank (semantic + layout) ─▶ top-K, scored
 *
 *  Three flavors, matched to the job:
 *    Flash-0.8B  → fast broad passes           Core-4.5B → the default rerank
 *    Prime-8B    → precision on the decisive question (the reveal)
 *
 *  Fail-open: if the retriever is unreachable, we fall back to keyword order so the
 *  examination never stalls — but the ranking is VultronRetriever's whenever it answers.
 */
import { env } from "./env.js";

const RERANK_URL = "https://api.vultrinference.com/v1/rerank";
export type RetrieverTier = "flash" | "core" | "prime";
export const RETRIEVER_MODELS: Record<RetrieverTier, string> = {
  flash: "vultr/VultronRetrieverFlash-Qwen3.5-0.8B",
  core: "vultr/VultronRetrieverCore-Qwen3.5-4.5B",
  prime: "vultr/VultronRetrieverPrime-Qwen3.5-8B",
};

export interface RankedDoc { docId: string; text: string; score: number; docType?: string }
export interface RerankStat { model: string; candidates: number; returned: number; ms: number; ok: boolean }
const rerankStats: RerankStat[] = [];
export const getRerankStats = () => [...rerankStats];

/** Rerank candidate documents for a query with a VultronRetriever model. Fail-open. */
export async function rerank(
  query: string,
  candidates: { docId: string; text: string; docType?: string }[],
  opts: { topN?: number; tier?: RetrieverTier; signal?: AbortSignal } = {},
): Promise<RankedDoc[]> {
  const topN = opts.topN ?? 8;
  const tier = opts.tier ?? "core";
  const model = RETRIEVER_MODELS[tier];
  if (!candidates.length) return [];
  // VultronRetriever reads whole pages; cap each to keep the request lean.
  const documents = candidates.map(c => c.text.slice(0, 1600));
  const t0 = Date.now();
  try {
    const r = await fetch(RERANK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("VULTR_INFERENCE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, query, documents, top_n: Math.min(topN, candidates.length) }),
      signal: opts.signal ?? AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const ranked: RankedDoc[] = (j.results ?? []).map((res: any) => ({
      docId: candidates[res.index].docId,
      docType: candidates[res.index].docType,
      text: candidates[res.index].text,
      score: res.relevance_score,
    }));
    rerankStats.push({ model, candidates: candidates.length, returned: ranked.length, ms: Date.now() - t0, ok: true });
    return ranked;
  } catch {
    // fail-open: keyword order, unscored — the examination continues
    rerankStats.push({ model, candidates: candidates.length, returned: Math.min(topN, candidates.length), ms: Date.now() - t0, ok: false });
    return candidates.slice(0, topN).map(c => ({ docId: c.docId, docType: c.docType, text: c.text, score: 0 }));
  }
}
