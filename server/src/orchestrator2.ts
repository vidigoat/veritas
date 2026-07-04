/**
 * VERITAS v2 — the document-scale forensic orchestrator (async generator).
 *
 *  INGEST → MAP(fleet) → REDUCE(detect) → INVESTIGATE(deep-dive) → VERIFY(Nemotron) → REPORT
 *
 *  Reads a corpus you upload. The Nemotron drone-fleet extracts facts in parallel;
 *  detection runs on those facts; a deep-dive subagent works each anomaly to a
 *  verdict against the retrieved source documents; Nemotron independently reviews
 *  every confirmed finding. Every model runs on Vultr Serverless Inference.
 */
import { randomUUID } from "node:crypto";
import { subagent } from "./agents.js";
import { ingestDir } from "./ingest.js";
import { extractCorpus, type Store } from "./extract.js";
import { detectAnomalies } from "./detect.js";
import { rerank } from "./retriever.js";
import { nemotronPanel } from "./panel.js";
import { CaseBrain } from "./brain.js";
import { EXAMINER_METHOD, schemePrompt } from "./fraud-kb.js";
import { getSpend, MODELS } from "./llm.js";
import type { Corpus, CaseEvent, Finding, Anomaly, Phase } from "./contracts.js";

export interface RunResult { findings: Finding[]; cleared: Anomaly[]; brain: any; corpus: { stats: any; total: number }; usd: number; elapsedS: number; events: CaseEvent[] }

const INVESTIGATE_SYSTEM = `You are VERITAS, a senior forensic accountant. An anomaly has been flagged by the analytics fleet. Work it to a verdict using the examiner's method — try to EXONERATE it first, then confirm only if the fraud theory survives.

${EXAMINER_METHOD}

You are given the anomaly and the actual source documents retrieved for it. Weigh them. Respond with ONE JSON object:
{"verdict":"confirmed"|"cleared"|"unproven","confidence":0.0-1.0,"statement":"one-paragraph finding in plain English","evidence":[{"claim":"...","docIds":["..."]}],"reasoning":"one sentence on why"}
Cite the specific documents. If you cannot rule out an innocent explanation, use "unproven".`;

export async function* runCorpus(dir: string, brief?: string): AsyncGenerator<CaseEvent, RunResult> {
  const t0 = Date.now();
  const events: CaseEvent[] = [];
  let phase: Phase | null = null;
  const mk = (type: string, payload: any): CaseEvent => ({ id: randomUUID().slice(0, 8), ts: Date.now(), type, phase, payload });
  const out = (e: CaseEvent) => { events.push(e); return e; };
  const spend = () => +getSpend().usd.toFixed(4);

  // ── INGEST ──
  phase = "ingest";
  yield out(mk("phase", { phase, index: 1, of: 6, title: "Ingest" }));
  const corpus: Corpus = ingestDir(dir);
  yield out(mk("corpus_loaded", { stats: corpus.stats, total: corpus.total }));

  // ── MAP: the Nemotron drone fleet reads the corpus ──
  phase = "map";
  yield out(mk("phase", { phase, index: 2, of: 6, title: "Read" }));
  const brain = new CaseBrain();
  const pending: CaseEvent[] = [];
  const { store, shards, facts } = await extractCorpus(corpus, {
    brain, concurrency: 14,
    onFleet: n => pending.push(mk("fleet_start", { shards: n, model: "NVIDIA Nemotron-Cascade-2" })),
    onDrone: (i, dc, found) => pending.push(mk("drone_done", { i, docs: dc, found })),
  });
  // (fleet events were queued during the await; surface them now, then the summary)
  for (const e of pending) yield out(e);
  yield out(mk("fleet_done", { shards, facts, vendors: store.vendors.size, employees: store.employees.size, txns: store.txns.length }));
  yield out(mk("brain_update", brain.snapshot().stats));

  // ── REDUCE: detection over the extracted facts ──
  phase = "reduce";
  yield out(mk("phase", { phase, index: 3, of: 6, title: "Cross-reference" }));
  const anomalies = detectAnomalies(store);
  for (const a of anomalies) {
    yield out(mk("anomaly", { anomaly: a }));
    if (a.scheme === "shell_company" || a.scheme === "ghost_employee") {
      brain.link(a.subjectIds[1] ?? "", a.subjectIds[0] ?? "", "shares_address", a.title);
      yield out(mk("reveal", { label: a.title, subjectIds: a.subjectIds, scheme: a.scheme }));
    }
  }
  if (!anomalies.length) yield out(mk("no_anomalies", {}));

  // ── INVESTIGATE: a deep-dive per anomaly ──
  phase = "investigate";
  yield out(mk("phase", { phase, index: 4, of: 6, title: "Investigate" }));
  const findings: Finding[] = [];
  const cleared: Anomaly[] = [];
  for (const a of anomalies) {
    const stepId = randomUUID().slice(0, 6);
    yield out(mk("reasoning", { stepId, text: `Investigating: ${a.title}`, scheme: a.scheme }));
    // retrieve the source documents for this anomaly (VultronRetriever)
    const cand = corpusCandidates(corpus, a);
    const ranked = await rerank(a.detail, cand, { topN: 5, tier: "prime" });
    yield out(mk("retrieval", { stepId, model: "VultronRetriever Prime", query: a.title.slice(0, 60), candidates: cand.length, surfaced: ranked.map(r => ({ docId: r.docId, score: +r.score.toFixed(2) })) }));
    const evidenceText = ranked.map(r => `--- ${r.docId} ---\n${r.text.slice(0, 1400)}`).join("\n\n");
    const brief = `${schemePrompt(a.scheme)}\n\nFLAGGED ANOMALY: ${a.detail}\nSubjects: ${a.subjectIds.join(", ")}\n\nRETRIEVED SOURCE DOCUMENTS:\n${evidenceText}`;
    const r = await subagent<any>(INVESTIGATE_SYSTEM, brief, { tier: "senior", maxTokens: 1200, expectKeys: ["verdict"] });
    const v = r.data ?? { verdict: a.strength >= 0.7 ? "confirmed" : "unproven", confidence: a.strength, statement: a.detail, evidence: [], reasoning: "analytics prior" };
    yield out(mk("reasoning", { stepId, text: v.reasoning || v.statement, verdict: v.verdict }));
    if (v.verdict === "cleared") { cleared.push(a); yield out(mk("cleared", { anomaly: a, why: v.reasoning })); continue; }
    if (v.verdict !== "confirmed") { yield out(mk("unproven", { anomaly: a })); continue; }

    // ── VERIFY: Nemotron independent second examiner ──
    const candidate = {
      id: `F-${findings.length + 1}`, scheme: a.scheme, statement: v.statement || a.detail, amount: a.amount ?? 0,
      evidence: (v.evidence?.length ? v.evidence : [{ claim: a.detail, doc_ids: a.proofDocs }]).map((e: any) => ({ claim: e.claim, doc_ids: e.docIds ?? e.doc_ids ?? a.proofDocs })),
      confidence: Math.max(v.confidence ?? a.strength, a.strength),
    };
    yield out(mk("nemotron_panel", { finding: candidate.id, stepId, reviewing: true, lenses: ["correctness", "innocent explanation", "sufficiency"] }));
    const panel = await nemotronPanel(candidate as any);
    yield out(mk("nemotron_panel", { finding: candidate.id, stepId, done: true, upheld: panel.upheld, votes: panel.votes, model: panel.model, summary: panel.upheld ? `✓ UPHELD by the Nemotron panel — ${panel.reasoning}` : `✗ REFUTED by the Nemotron panel — ${panel.reasoning}` }));
    if (!panel.upheld) { cleared.push(a); continue; }
    const finding: Finding = { ...candidate, verdict: "confirmed", nemotron: { upheld: true, reasoning: panel.reasoning, model: panel.model } as any,
      recommendedActions: recActions(a), evidence: candidate.evidence } as any;
    findings.push(finding);
    yield out(mk("finding", { finding }));
    if (a.scheme === "shell_company" || a.scheme === "ghost_employee") yield out(mk("freeze_request", { target: a.subjectIds[0] }));
  }

  // ── REPORT ──
  phase = "report";
  yield out(mk("phase", { phase, index: 6, of: 6, title: "Report" }));
  const total = findings.reduce((s, f) => s + (f.amount || 0), 0);
  yield out(mk("verdict", { findings: findings.length, total, confidence: findings[0]?.confidence ?? 0, cleared: cleared.length }));
  const result: RunResult = { findings, cleared, brain: brain.snapshot(), corpus: { stats: corpus.stats, total: corpus.total }, usd: spend(), elapsedS: Math.round((Date.now() - t0) / 1000), events };
  yield out(mk("done", { findings: findings.length, total, usd: result.usd, elapsedS: result.elapsedS }));
  return result;
}

/** Candidate docs to rerank for an anomaly: its proof docs + docs mentioning its subjects. */
function corpusCandidates(corpus: Corpus, a: Anomaly) {
  const set = new Map<string, { docId: string; text: string; docType?: string }>();
  for (const p of a.proofDocs) { const d = corpus.docs.get(p); if (d) set.set(p, { docId: d.docId, text: d.text, docType: d.type }); }
  const subj = a.subjectIds.map(s => s.toLowerCase());
  for (const id of corpus.order) {
    if (set.size >= 40) break;
    const d = corpus.docs.get(id)!;
    if (subj.some(s => s && d.text.toLowerCase().includes(s))) set.set(id, { docId: d.docId, text: d.text, docType: d.type });
  }
  return [...set.values()];
}
const recActions = (a: Anomaly): string[] => a.scheme === "shell_company"
  ? [`Freeze vendor ${a.subjectIds[0]}`, `Refer ${a.subjectIds[1]} to counsel`, `Review all approvals by ${a.subjectIds[1]}`]
  : a.scheme === "ghost_employee" ? [`Suspend payroll for ${a.subjectIds[0]}`, `Investigate ${a.subjectIds[1]}`]
  : [`Recover the duplicate payment`, `Add a duplicate-invoice control`];
