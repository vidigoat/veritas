/**
 * CASE INTERROGATION (v2) — ask the examiner anything about a completed run.
 *
 * This is a fresh retrieval pass, live, per question: keyword recall proposes
 * candidates from the ACTUAL corpus, VultronRetriever reranks them, and the
 * senior examiner (Qwen on Vultr Serverless Inference) answers — streaming —
 * grounded ONLY in the retrieved pages and the case's filed findings.
 *
 *   question ─▶ recall(corpus) ─▶ VultronRetriever rerank ─▶ Qwen (stream) ─▶ cited answer
 */
import { streamChat, type ChatMsg } from "./llm.js";
import { rerank } from "./retriever.js";
import type { Corpus } from "./contracts.js";

const ASK_SYSTEM = `You are VERITAS, a senior forensic accountant, answering follow-up questions about an examination you just completed. You are given the case's filed findings, the cleared items, and source pages retrieved for this question by VultronRetriever.

Rules:
- Ground every claim in the retrieved source documents or the filed findings. Cite documents inline as [DOC-ID] (use the exact ids given).
- Never invent a number — quote figures exactly as they appear in the documents or findings.
- If asked whether something could be innocent, weigh the innocent explanation honestly; if the evidence does not rule it out, say so.
- Be concise and direct: 2-5 sentences. You examine records, not people.`;

export interface AskEvent { type: string; payload: any }

/** Keyword recall — cheap wide net over the corpus, before the rerank. The case's
 *  own cited documents are always included: the examiner re-reads its exhibits. */
function recall(corpus: Corpus, question: string, kase: { findings: any[] }, limit = 40): { docId: string; text: string; docType?: string }[] {
  const cited = new Set<string>();
  for (const f of kase.findings ?? []) for (const e of f.evidence ?? []) for (const d of e.doc_ids ?? e.docIds ?? []) cited.add(String(d));
  const terms = question.toLowerCase().match(/[a-z0-9][a-z0-9\-]{2,}/g) ?? [];
  const scored: { docId: string; text: string; docType?: string; s: number }[] = [];
  for (const id of corpus.order) {
    const d = corpus.docs.get(id)!;
    const hay = (d.docId + " " + d.text.slice(0, 4000)).toLowerCase();
    let s = cited.has(d.docId) ? 8 : 0;   // the case exhibits always make the pool
    for (const t of terms) if (hay.includes(t)) s += t.length > 5 ? 2 : 1;
    if (s > 0) scored.push({ docId: d.docId, text: d.text, docType: d.type, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(({ s, ...rest }) => rest);
}

export async function* answerCorpusQuestion(
  corpus: Corpus,
  kase: { findings: any[]; cleared: any[]; company?: string },
  question: string,
): AsyncGenerator<AskEvent> {
  // 1) retrieve — live, per-question (this is a genuine second/third/nth retrieval)
  const candidates = recall(corpus, question, kase);
  let surfaced: { docId: string; text: string; score: number }[] = [];
  if (candidates.length) {
    try {
      surfaced = await rerank(question, candidates, { topN: 6, tier: "core" });
      yield { type: "answer_retrieval", payload: { model: "VultronRetriever Core", candidates: candidates.length, surfaced: surfaced.map(r => ({ docId: r.docId, score: +r.score.toFixed(2) })) } };
    } catch {
      surfaced = candidates.slice(0, 6).map(c => ({ docId: c.docId, text: c.text, score: 0 }));
    }
  }

  // 2) answer — streamed from Vultr Serverless Inference, grounded in the pages
  const findingsCtx = (kase.findings ?? []).map((f: any) => `FINDING ${f.id} [${f.scheme}] — ${f.statement} (€${Math.round(f.amount ?? 0).toLocaleString("en-US")}, confidence ${f.confidence})`).join("\n");
  const clearedCtx = (kase.cleared ?? []).map((c: any) => `CLEARED — ${(c.anomaly?.title ?? c.title ?? "")}: ${c.why ?? c.anomaly?.detail ?? ""}`).join("\n");
  const pages = surfaced.map(r => `--- ${r.docId} ---\n${r.text.slice(0, 1400)}`).join("\n\n");
  const messages: ChatMsg[] = [
    { role: "system", content: ASK_SYSTEM },
    { role: "user", content: `CASE — ${kase.company ?? "the audited company"}\n\nFILED FINDINGS:\n${findingsCtx || "none"}\n\nCLEARED ITEMS:\n${clearedCtx || "none"}\n\nSOURCE PAGES RETRIEVED FOR THIS QUESTION (by VultronRetriever):\n${pages || "none matched"}\n\nQUESTION: ${question}` },
  ];
  try {
    for await (const delta of streamChat("senior", messages, { maxTokens: 700, noThink: true })) {
      yield { type: "answer_delta", payload: { text: delta } };
    }
  } catch (e: any) {
    yield { type: "answer_delta", payload: { text: "I hit an error reaching the reasoning model — please ask again." } };
  }
  yield { type: "answer_done", payload: {} };
}
