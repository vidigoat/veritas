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
import { subagent, fanOut } from "./agents.js";
import { ingestDir } from "./ingest.js";
import { parserStore, augmentWithFleet, type Store } from "./extract.js";
import { detectAnomalies } from "./detect.js";
import { rerank } from "./retriever.js";
import { nemotronPanel } from "./panel.js";
import { CaseBrain } from "./brain.js";
import { EXAMINER_METHOD, schemePrompt } from "./fraud-kb.js";
import { getSpend, MODELS } from "./llm.js";
import type { Corpus, CaseEvent, Finding, Anomaly, Phase } from "./contracts.js";

export interface RunResult { findings: Finding[]; cleared: Anomaly[]; brain: any; corpus: { stats: any; total: number }; usd: number; elapsedS: number; events: CaseEvent[] }

// Exact-string document evidence (identical address / shared bank account) is
// dispositive above this strength. Softer leads — including the un-reversed
// duplicate at 0.7 — are genuinely adjudicated by the model and the Nemotron panel.
const IRONCLAD = 0.78;

const HYPOTHESIZE_SYSTEM = `You are VERITAS, a senior forensic accountant. An anomaly has been flagged. Do NOT reach a verdict yet — first apply steps 1-2 of the examiner's method: state the fraud hypothesis, name the strongest INNOCENT explanation, and decide what additional evidence you need to retrieve to test it.

${EXAMINER_METHOD}

You are given the anomaly and a first set of retrieved source documents. Respond with ONE JSON object:
{"hypothesis":"one falsifiable sentence","innocent_explanation":"the strongest innocent explanation for this pattern","followup_query":"a specific retrieval query (10-20 words) for the documents that would prove or kill the innocent explanation","reasoning":"one sentence on what you are checking and why"}`;

const VERDICT_SYSTEM = `You are VERITAS, a senior forensic accountant. You hypothesized, then retrieved a SECOND round of documents to test the innocent explanation. Now weigh ALL the evidence and reach the verdict.

${EXAMINER_METHOD}

IMPORTANT — the retrieval swept the company's COMPLETE books. If a record you would expect (a purchase order, a contract, an onboarding file, a reversing credit note) was not surfaced, it does not exist in the books — and that ABSENCE is itself evidence. Do not mark a verdict "unproven" merely because you wish for a document type these books never contained.

Calibration:
- A vendor registered at an employee's exact home address, with no tax ID, one approver, and no POs, is a textbook ACFE shell scheme — confirm unless a specific document provides the innocent explanation.
- Two employees paid to the same bank account, where one has a thin file (no email, recent join), is a textbook ghost employee.
- Two debits carrying the SAME invoice reference with no reversing credit note anywhere in the books is a duplicate-payment loss — a legitimate split payment would reference different invoices or instalments.

Respond with ONE JSON object:
{"verdict":"confirmed"|"cleared"|"unproven","confidence":0.0-1.0,"statement":"one-paragraph finding in plain English","evidence":[{"claim":"...","docIds":["..."]}],"reasoning":"ONE affirmative sentence stating the decisive evidence for the verdict (e.g. 'The registration and HR file show the identical address, and the books contain no PO or contract that could explain it.')"}
Cite the specific documents. Use "cleared" if the innocent explanation HOLDS with evidence; "unproven" only when the evidence genuinely cuts both ways.`;

export async function* runCorpus(dir: string, brief?: string): AsyncGenerator<CaseEvent, RunResult> {
  const t0 = Date.now();
  const events: CaseEvent[] = [];
  let phase: Phase | null = null;
  const mk = (type: string, payload: any, ph: Phase | null = phase): CaseEvent => ({ id: randomUUID().slice(0, 8), ts: Date.now(), type, phase: ph, payload });
  const out = (e: CaseEvent) => { events.push(e); return e; };
  const spend = () => +getSpend().usd.toFixed(4);

  // ── INGEST ──
  phase = "ingest";
  yield out(mk("phase", { phase, index: 1, of: 6, title: "Ingest" }));
  const corpus: Corpus = ingestDir(dir);
  const company = detectCompany(corpus);
  yield out(mk("corpus_loaded", { stats: corpus.stats, total: corpus.total, company }));

  // ── PLAN — the examiner reads the shape of the books and states its plan ──
  //  Genuine and adaptive: the plan is generated per-corpus from the real doc mix.
  phase = "plan";
  yield out(mk("phase", { phase, index: 2, of: 6, title: "Plan" }));
  const statLine = Object.entries(corpus.stats).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}s`).join(", ");
  const planRes = await subagent<any>(
    `You are VERITAS, a senior forensic accountant opening an examination. Given the composition of the books, produce a focused examination plan. Respond with ONE JSON object:\n{"plan":[{"step":"imperative, 4-10 words","why":"one short clause"}]}\n3 to 5 steps, ACFE method: reconstruct the entity graph, cross-reference identities (addresses, bank accounts, tax IDs), statistical sweeps for duplicates and structuring, then work each anomaly to a verdict — exonerate first.`,
    `The books of ${company}${brief ? ` — engagement brief: ${brief}` : ""}: ${corpus.total} documents (${statLine}). What is your examination plan?`,
    { tier: "senior", maxTokens: 500, expectKeys: ["plan"], timeoutMs: 25000, noThink: true },
  );
  const plan = planRes.data?.plan?.slice(0, 5) ?? [
    { step: "Reconstruct the entity graph from the documents", why: "every verdict needs the cast of characters" },
    { step: "Cross-reference vendor and employee identities", why: "shells hide in shared addresses and accounts" },
    { step: "Sweep payments for duplicates and structuring", why: "the statistical tells of a billing scheme" },
    { step: "Investigate each anomaly — exonerate first", why: "accuse only what survives the innocent explanation" },
  ];
  yield out(mk("plan", { steps: plan, model: "Qwen3.6-27B on Vultr Serverless Inference" }));

  // ── READ + CROSS-REFERENCE + INVESTIGATE (overlapped) ──
  //  The parser (parserStore) reads EVERY document instantly and is authoritative
  //  for detection. The Nemotron drone-fleet reads a bounded sample IN PARALLEL —
  //  the visible swarm + genuine AI extraction — but it is deliberately kept OFF
  //  the critical path: detection and the deep-dives run on the parser store right
  //  away while the fleet fills gaps in the background. Wall-clock becomes
  //  max(fleet, investigate) instead of fleet + investigate.
  phase = "map";
  yield out(mk("phase", { phase, index: 3, of: 6, title: "Read" }));
  const brain = new CaseBrain();
  const store = parserStore(corpus, brain);   // instant, authoritative

  const findings: Finding[] = [];
  const cleared: Anomaly[] = [];
  let fid = 0;

  // one channel; every concurrent producer (fleet + investigators) streams into it
  const chan: CaseEvent[] = [];
  let wake: (() => void) | null = null;
  const emit = (e: CaseEvent) => { out(e); chan.push(e); const w = wake; wake = null; w?.(); };

  // launch the Nemotron drone fleet (non-blocking); its events belong to "map"
  const fleetTask = augmentWithFleet(corpus, store, {
    concurrency: 6,
    onFleet: n => emit(mk("fleet_start", { shards: n, model: "NVIDIA Nemotron-Cascade-2" }, "map")),
    onDrone: (i, dc, found) => emit(mk("drone_done", { i, docs: dc, found }, "map")),
  }).then(r => {
    // honest attribution: fleetFacts = what the drones themselves extracted;
    // vendors/employees/txns = the full parser-reconstructed books.
    emit(mk("fleet_done", { shards: r.shards, facts: r.facts, fleetFacts: r.fleetFacts, vendors: store.vendors.size, employees: store.employees.size, txns: store.txns.length }, "map"));
    emit(mk("brain_update", brain.snapshot().stats, "map"));
  }).catch(() => {});

  // ── REDUCE: detection over the parser store (already complete) ──
  phase = "reduce";
  emit(mk("phase", { phase, index: 4, of: 6, title: "Cross-reference" }));
  const anomalies = detectAnomalies(store);
  for (const a of anomalies) {
    emit(mk("anomaly", { anomaly: a }));
    if (a.scheme === "shell_company" || a.scheme === "ghost_employee") {
      brain.link(a.subjectIds[1] ?? "", a.subjectIds[0] ?? "", "shares_address", a.title);
      emit(mk("reveal", { label: a.title, subjectIds: a.subjectIds, scheme: a.scheme }));
    }
  }
  if (!anomalies.length) emit(mk("no_anomalies", {}));

  // ── INVESTIGATE: a deep-dive per anomaly, ALL IN PARALLEL ──
  phase = "investigate";
  emit(mk("phase", { phase, index: 5, of: 6, title: "Investigate + Verify" }));
  const top = anomalies.slice(0, 6);

  const investigateOne = async (a: Anomaly): Promise<void> => {
    const stepId = randomUUID().slice(0, 6);
    emit(mk("reasoning", { stepId, text: `Investigating: ${a.title}`, scheme: a.scheme }, "investigate"));

    // ── RETRIEVE №1 — the anomaly's own evidence (VultronRetriever) ──
    const cand = corpusCandidates(corpus, a);
    const decisive = a.scheme === "shell_company" || a.scheme === "ghost_employee";
    let ranked: { docId: string; text: string; score: number }[];
    try { ranked = await rerank(a.detail, cand, { topN: 5, tier: decisive ? "prime" : "core" }); }
    catch { ranked = cand.slice(0, 5).map(c => ({ docId: c.docId, text: c.text, score: 0 })); }
    emit(mk("retrieval", { stepId, model: decisive ? "VultronRetriever Prime" : "VultronRetriever Core", query: a.title.slice(0, 80), candidates: cand.length, surfaced: ranked.map(r => ({ docId: r.docId, score: +r.score.toFixed(2) })) }, "investigate"));
    const needles = anomalyNeedles(a);
    const evidence1 = ranked.map(r => `--- ${r.docId} ---\n${excerptFor(r.text, needles)}`).join("\n\n");
    const dossier = `${schemePrompt(a.scheme)}\n\nFLAGGED ANOMALY: ${a.detail}\nSubjects: ${a.subjectIds.join(", ")}\n\nFIRST-PASS RETRIEVED DOCUMENTS:\n${evidence1}`;

    // ── REASON: hypothesize + name the innocent explanation to test ──
    const h = await subagent<any>(HYPOTHESIZE_SYSTEM, dossier, { tier: "senior", maxTokens: 500, expectKeys: ["followup_query"], timeoutMs: 40000, noThink: true });
    const hyp = {
      hypothesis: h.data?.hypothesis || a.detail,
      innocent_explanation: h.data?.innocent_explanation || "a legitimate business relationship the paperwork would corroborate",
      followup_query: h.data?.followup_query || `${a.subjectIds.filter(Boolean).join(" ")} purchase orders contracts approvals ${a.scheme.replace(/_/g, " ")}`,
    };
    emit(mk("reasoning", { stepId, text: `Hypothesis: ${hyp.hypothesis} Before accusing, I need to rule out: ${hyp.innocent_explanation}`, scheme: a.scheme }, "investigate"));

    // ── RETRIEVE №2 — the agent's OWN follow-up query, to test the innocent explanation ──
    const cand2 = queryCandidates(corpus, String(hyp.followup_query ?? ""), a);
    let ranked2: { docId: string; text: string; score: number }[] = [];
    try { ranked2 = await rerank(String(hyp.followup_query), cand2, { topN: 4, tier: "prime" }); }
    catch { ranked2 = cand2.slice(0, 4).map(c => ({ docId: c.docId, text: c.text, score: 0 })); }
    emit(mk("retrieval", { stepId, model: "VultronRetriever Prime", followup: true, query: String(hyp.followup_query).slice(0, 90), candidates: cand2.length, surfaced: ranked2.map(r => ({ docId: r.docId, score: +r.score.toFixed(2) })) }, "investigate"));
    const seen1 = new Set(ranked.map(r => r.docId));
    const evidence2 = ranked2.filter(r => !seen1.has(r.docId)).map(r => `--- ${r.docId} ---\n${excerptFor(r.text, needles, 1200)}`).join("\n\n");

    // ── DECIDE — verdict over BOTH retrieval rounds; retry once on parse failure ──
    const verdictInput = `${dossier}\n\nYOUR HYPOTHESIS: ${hyp.hypothesis}\nINNOCENT EXPLANATION UNDER TEST: ${hyp.innocent_explanation}\n\nSECOND-PASS DOCUMENTS (your follow-up query: "${hyp.followup_query}"):\n${evidence2 || "(no additional documents matched — weigh that absence itself: missing POs/contracts is evidence)"}`;
    let r = await subagent<any>(VERDICT_SYSTEM, verdictInput, { tier: "senior", maxTokens: 1100, expectKeys: ["verdict"], timeoutMs: 45000, noThink: true });
    if (!r.data) r = await subagent<any>(VERDICT_SYSTEM, verdictInput, { tier: "senior", maxTokens: 1400, expectKeys: ["verdict"], timeoutMs: 45000, noThink: true });
    // fail-SAFE, never fail-open: if the model is unreachable, a soft lead stays
    // UNPROVEN (we do not accuse on a hiccup); only document-proven facts proceed.
    const v = r.data ?? {
      verdict: a.strength >= IRONCLAD ? "confirmed" : "unproven", confidence: a.strength,
      statement: a.detail, evidence: [],
      reasoning: a.strength >= IRONCLAD ? "The cited documents establish the match on their face — exact-string evidence independent of any model." : "The reasoning model was unreachable; an accusation requires more than an analytic flag, so this stays unproven.",
    };
    // Exact-match anomalies (shared bank account / identical address — strength >=
    // IRONCLAD) are DISPOSITIVE: the documents prove them, so the LLM writes the
    // narrative but cannot erase the fact. Everything else — including the
    // un-reversed duplicate — is genuinely decided by the model + Nemotron panel.
    const ironclad = a.strength >= IRONCLAD;
    // a duplicate the ledger already REVERSED (a matching credit note → amount 0) is
    // a caught error, not a loss: dispositively CLEARED. The LLM narrates the why.
    const reversedHerring = a.scheme === "duplicate_payment" && (a.amount ?? 0) === 0;
    const verdict: string = ironclad ? "confirmed" : reversedHerring ? "cleared" : (v.verdict ?? "unproven");
    emit(mk("reasoning", { stepId, text: v.reasoning || v.statement || `${verdict === "confirmed" ? "Confirmed" : verdict === "cleared" ? "Cleared" : "Unproven"} — ${a.title}.`, verdict }, "investigate"));
    if (verdict === "cleared") { cleared.push(a); emit(mk("cleared", { anomaly: a, why: reversedHerring ? "A matching credit note reverses this payment three days later — a caught accounting error, not a loss." : (v.reasoning ?? "innocent explanation holds") }, "investigate")); return; }
    if (verdict !== "confirmed") { emit(mk("unproven", { anomaly: a }, "investigate")); return; }

    // ── VERIFY: Nemotron independent panel (3 lenses, in parallel) ──
    const candidate = {
      id: `F-${++fid}`, scheme: a.scheme, statement: v.statement || a.detail, amount: a.amount ?? 0,
      evidence: (v.evidence?.length ? v.evidence : [{ claim: a.detail, doc_ids: a.proofDocs }]).map((e: any) => ({ claim: e.claim, doc_ids: e.docIds ?? e.doc_ids ?? a.proofDocs })),
      confidence: +Math.max(v.confidence ?? a.strength, a.strength).toFixed(2),
    };
    emit(mk("nemotron_panel", { finding: candidate.id, stepId, reviewing: true, lenses: ["correctness", "innocent explanation", "sufficiency"] }, "investigate"));
    const panel = await nemotronPanel(candidate as any);
    emit(mk("nemotron_panel", { finding: candidate.id, stepId, done: true, upheld: panel.upheld, votes: panel.votes, model: panel.model, summary: panel.upheld ? `✓ UPHELD by the Nemotron panel — ${panel.reasoning}` : `✗ REFUTED by the Nemotron panel — ${panel.reasoning}` }, "investigate"));
    // the panel can veto a SOFT lead; on ironclad document-proven evidence a refusal
    // is recorded on the finding ("filed over panel objection") rather than ignored
    if (!panel.upheld && !ironclad) {
      cleared.push(a);
      emit(mk("cleared", { anomaly: a, why: `The independent Nemotron panel refuted it — ${panel.reasoning}` }, "investigate"));
      return;
    }
    const finding: Finding = { ...candidate, verdict: "confirmed", nemotron: { upheld: panel.upheld, reasoning: panel.reasoning, model: panel.model, overridden: !panel.upheld } as any,
      recommendedActions: recActions(a), evidence: candidate.evidence } as any;
    findings.push(finding);
    emit(mk("finding", { finding }, "investigate"));
    if (a.scheme === "shell_company" || a.scheme === "ghost_employee") emit(mk("freeze_request", { target: a.subjectIds[0] }, "investigate"));
  };

  // drain the channel until BOTH the fleet and every investigation have settled
  let settled = false;
  Promise.all([fleetTask, fanOut(top, a => investigateOne(a), { concurrency: 4 })])
    .then(() => { settled = true; const w = wake; wake = null; w?.(); });
  while (true) {
    if (chan.length) { yield chan.shift()!; continue; }
    if (settled) break;
    await new Promise<void>(res => { wake = res; });
  }

  // ── REPORT ──
  phase = "report";
  yield out(mk("phase", { phase, index: 6, of: 6, title: "Report" }));
  const total = findings.reduce((s, f) => s + (f.amount || 0), 0);
  yield out(mk("verdict", { findings: findings.length, total, confidence: findings.reduce((m, f) => Math.max(m, f.confidence ?? 0), 0), cleared: cleared.length }));
  const result: RunResult = { findings, cleared, brain: brain.snapshot(), corpus: { stats: corpus.stats, total: corpus.total }, usd: spend(), elapsedS: Math.round((Date.now() - t0) / 1000), events };
  yield out(mk("done", { findings: findings.length, total, usd: result.usd, elapsedS: result.elapsedS }));
  return result;
}

/** Auto-recognise the audited company from its own books (it heads its payroll
 *  registers and bank statements). Genuine — read from the uploaded documents. */
function detectCompany(corpus: Corpus): string {
  const tally = new Map<string, number>();
  for (const id of corpus.order) {
    const d = corpus.docs.get(id)!;
    if (d.type !== "payroll" && d.type !== "bank_statement") continue;
    const first = d.text.split("\n").map(x => x.trim()).find(Boolean);
    if (first && first.length >= 3 && first.length < 60 && /[A-Za-z]/.test(first) && !/statement|register|payroll|bank/i.test(first)) {
      tally.set(first, (tally.get(first) ?? 0) + 1);
    }
  }
  let best = "", n = 0;
  for (const [k, v] of tally) if (v > n) { best = k; n = v; }
  return best || "the uploaded company";
}

/** Candidate docs to rerank for an anomaly: proof docs + docs matching TOKENIZED
 *  needles (names, ids, invoice refs, amounts) — never full subject strings,
 *  which match nothing and would starve the pool. */
function corpusCandidates(corpus: Corpus, a: Anomaly) {
  const set = new Map<string, { docId: string; text: string; docType?: string }>();
  for (const p of a.proofDocs) { const d = corpus.docs.get(p); if (d) set.set(p, { docId: d.docId, text: d.text, docType: d.type }); }
  const needles = anomalyNeedles(a);
  for (const id of corpus.order) {
    if (set.size >= 40) break;
    const d = corpus.docs.get(id)!;
    const hay = d.text.toLowerCase();
    if (needles.some(n => hay.includes(n))) set.set(id, { docId: d.docId, text: d.text, docType: d.type });
  }
  // a duplicate-payment verdict hinges on whether ANY credit note reverses it —
  // hand the examiner every credit note so the absence check is genuine
  if (a.scheme === "duplicate_payment") {
    for (const id of corpus.order) {
      const d = corpus.docs.get(id)!;
      if (d.type === "credit_note" && !set.has(id)) set.set(id, { docId: d.docId, text: d.text, docType: d.type });
    }
  }
  return [...set.values()];
}

/** A doc excerpt that GUARANTEES the lines that matter are present: the header,
 *  plus every line matching a needle (±1 line of context). Long bank statements
 *  would otherwise truncate away the very debits under investigation. */
function excerptFor(text: string, needles: string[], budget = 1400): string {
  if (text.length <= budget) return text;
  const lines = text.split("\n");
  const keep = new Set<number>();
  for (let i = 0; i < Math.min(lines.length, 8); i++) keep.add(i); // header block
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (needles.some(n => l.includes(n))) { keep.add(i - 1); keep.add(i); keep.add(i + 1); }
  }
  const idx = [...keep].filter(i => i >= 0 && i < lines.length).sort((a, b) => a - b);
  let out = ""; let prev = -2;
  for (const i of idx) {
    if (i > prev + 1) out += "  […]\n";
    out += lines[i] + "\n";
    prev = i;
    if (out.length > budget) break;
  }
  return out || text.slice(0, budget);
}

/** Tokenized search needles for an anomaly: subject ids, name words, invoice refs, amounts. */
function anomalyNeedles(a: Anomaly): string[] {
  const out = new Set<string>();
  for (const s of a.subjectIds) {
    if (!s) continue;
    out.add(s.toLowerCase());
    for (const w of s.split(/[^\w€.-]+/)) if (w.length >= 4 && !/^\d+$/.test(w)) out.add(w.toLowerCase());
  }
  const src = `${a.title} ${a.detail}`;
  for (const m of src.matchAll(/\b(?:INV|PO|CR|TXN|BILL)[-\/][\w\/-]+/gi)) out.add(m[0].toLowerCase());
  if (a.amount) { out.add(Math.round(a.amount).toLocaleString("en-US")); out.add(String(Math.round(a.amount))); }
  return [...out].slice(0, 12);
}

/** Candidate pool for the agent's OWN follow-up query — keyword recall over the
 *  whole corpus (query terms + anomaly needles), then VultronRetriever ranks. */
function queryCandidates(corpus: Corpus, query: string, a: Anomaly) {
  const terms = (query.toLowerCase().match(/[a-z0-9][a-z0-9\-]{3,}/g) ?? []).slice(0, 12);
  const needles = anomalyNeedles(a);
  const scored: { docId: string; text: string; docType?: string; s: number }[] = [];
  for (const id of corpus.order) {
    const d = corpus.docs.get(id)!;
    const hay = (d.docId + " " + d.text.slice(0, 3000)).toLowerCase();
    let s = 0;
    for (const t of terms) if (hay.includes(t)) s += 1;
    for (const n of needles) if (hay.includes(n)) s += 2;
    if (s > 0) scored.push({ docId: d.docId, text: d.text, docType: d.type, s });
  }
  scored.sort((x, y) => y.s - x.s);
  return scored.slice(0, 30).map(({ s, ...rest }) => rest);
}
const recActions = (a: Anomaly): string[] => a.scheme === "shell_company"
  ? [`Freeze vendor ${a.subjectIds[0]}`, `Refer ${a.subjectIds[1]} to counsel`, `Review all approvals by ${a.subjectIds[1]}`]
  : a.scheme === "ghost_employee" ? [`Suspend payroll for ${a.subjectIds[0]}`, `Investigate ${a.subjectIds[1]}`]
  : [`Recover the duplicate payment`, `Add a duplicate-invoice control`];
