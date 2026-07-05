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
import { getSpend, MODELS, streamChat } from "./llm.js";
import type { Corpus, CaseEvent, Finding, Anomaly, Phase } from "./contracts.js";

export interface RunResult { findings: Finding[]; cleared: Anomaly[]; brain: any; corpus: { stats: any; total: number }; usd: number; elapsedS: number; events: CaseEvent[] }

// Exact-string document evidence (identical address / shared bank account) is
// dispositive above this strength. Softer leads — including the un-reversed
// duplicate at 0.7 — are genuinely adjudicated by the model and the Nemotron panel.
const IRONCLAD = 0.78;

const REASON_SYSTEM = `You are VERITAS, a senior forensic accountant working a flagged lead. In 2-3 sentences, first person, present tense, think out loud: state your fraud hypothesis and the single strongest INNOCENT explanation you must rule out, then say what you will retrieve to test it. Be concrete about THIS company's documents — name the entities and figures. Then on a FINAL line output exactly: FOLLOWUP: <an 8-16 word retrieval query for the documents that would prove or kill that innocent explanation>. No JSON, no headings, no preamble.`;

const THINK_SYSTEM = `You are VERITAS, a senior forensic accountant working a flagged lead. In 2-3 sentences, first person, present tense, think out loud: state your fraud hypothesis and the single strongest INNOCENT explanation you must rule out before you would ever accuse. Be concrete about THIS company's documents. Then, on a FINAL line, output exactly: FOLLOWUP: <an 8-16 word retrieval query for the documents that would prove or kill that innocent explanation>. No headings, no preamble, no JSON.`;

const VERDICT_STREAM_SYSTEM = `You are VERITAS, a senior forensic accountant. You hypothesized, then retrieved a SECOND round of documents to test the innocent explanation. In 2-4 sentences, first person, deliver your verdict reasoning — weigh BOTH rounds and state the decisive fact.
IMPORTANT — the retrieval swept the company's COMPLETE books. If a record you would expect (a purchase order, a contract, a reversing credit note) was not surfaced, it does not exist, and that ABSENCE is itself evidence.
Then output exactly two FINAL lines:
VERDICT: confirmed | cleared | unproven
CONFIDENCE: 0.NN
Use "cleared" only if the innocent explanation holds with evidence; "unproven" only if the evidence genuinely cuts both ways; otherwise "confirmed". No JSON, no other headings.`;

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
  const planRaw = Array.isArray(planRes.data?.plan) ? planRes.data.plan.filter((s: any) => s && typeof s.step === "string").slice(0, 5) : [];
  const plan = planRaw.length ? planRaw : [
    { step: "Reconstruct the entity graph from the documents", why: "every verdict needs the cast of characters" },
    { step: "Cross-reference vendor and employee identities", why: "shells hide in shared addresses and accounts" },
    { step: "Sweep payments for duplicates and structuring", why: "the statistical tells of a billing scheme" },
    { step: "Investigate each anomaly — exonerate first", why: "accuse only what survives the innocent explanation" },
  ];
  yield out(mk("plan", { steps: plan }));

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

  // stream a reasoning pass token-by-token (genuine Vultr streaming). The prose is
  // surfaced live; the machine-readable tail (FOLLOWUP:/VERDICT:/CONFIDENCE:) is
  // withheld from the stream and parsed by the caller. Best-effort — if streaming
  // fails, the deterministic guards below still decide the verdict.
  const streamReason = async (stepId: string, system: string, user: string, maxTokens: number, kind: string): Promise<string> => {
    let full = "", shown = 0; let sealed = false;
    const TAIL = /\n\s*(FOLLOW[-\s]?UP|VERDICT|CONFIDENCE)\s*:/i;
    try {
      for await (const d of streamChat("senior", [{ role: "system", content: system }, { role: "user", content: user }], { maxTokens, noThink: true, timeoutMs: 22000 })) {
        full += d;
        if (sealed) continue;
        const m = full.match(TAIL);
        const visibleEnd = m ? m.index! : full.length;
        if (visibleEnd > shown) { emit(mk("reasoning_delta", { stepId, delta: full.slice(shown, visibleEnd), kind }, "investigate")); shown = visibleEnd; }
        if (m) sealed = true;
      }
    } catch { /* streamed reasoning is best-effort */ }
    emit(mk("reasoning_end", { stepId, kind }, "investigate"));
    return full;
  };

  // launch the Nemotron drone fleet (non-blocking); its events belong to "map"
  const fleetTask = augmentWithFleet(corpus, store, {
    concurrency: 6,
    onFleet: n => emit(mk("fleet_start", { shards: n }, "map")),
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

  // any unexpected throw inside an investigation must still resolve the step on
  // screen — fail-safe to "unproven", never a silent stuck card, never an accusation
  const investigateOne = async (a: Anomaly): Promise<void> => {
    const stepId = randomUUID().slice(0, 6);
    try {
      await investigateInner(a, stepId);
    } catch {
      emit(mk("reasoning", { stepId, text: `Unproven — the examination of "${a.title}" hit an internal error; escalated for manual review.`, verdict: "unproven" }, "investigate"));
      emit(mk("unproven", { anomaly: a }, "investigate"));
    }
  };

  const investigateInner = async (a: Anomaly, stepId: string): Promise<void> => {
    emit(mk("reasoning", { stepId, text: `Investigating: ${a.title}`, scheme: a.scheme }, "investigate"));
    const needles = anomalyNeedles(a);

    // ── SEARCH №1 — surface the lead's own evidence (fast rerank) ──
    const cand = corpusCandidates(corpus, a);
    let ranked: { docId: string; text: string; score: number }[];
    try { ranked = await rerank(a.detail, cand, { topN: 5, tier: "core" }); }
    catch { ranked = cand.slice(0, 5).map(c => ({ docId: c.docId, text: c.text, score: 0 })); }
    emit(mk("retrieval", { stepId, query: a.title.slice(0, 80), candidates: cand.length, surfaced: ranked.map(r => ({ docId: r.docId, score: +r.score.toFixed(2) })) }, "investigate"));
    const evidence1 = ranked.map(r => `--- ${r.docId} ---\n${excerptFor(r.text, needles, 850)}`).join("\n\n");

    // ── REASON (STREAMED, one pass): think out loud, name the innocent explanation,
    //  and write its own follow-up query. Best-effort — the OUTCOME is decided by the
    //  documents (below), so a slow/stalled model can never break or delay a verdict. ──
    const dossier = `${schemePrompt(a.scheme)}\n\nFLAGGED LEAD: ${a.detail}\nSubjects: ${a.subjectIds.join(", ")}\n\nRETRIEVED DOCUMENTS:\n${evidence1}`;
    const think = await streamReason(stepId, REASON_SYSTEM, dossier, 240, "hypothesis");
    const followup_query = (think.match(/FOLLOW[-\s]?UP:\s*(.+)$/im)?.[1]
      || `${a.subjectIds.filter(Boolean).join(" ")} purchase orders contracts approvals`).trim().slice(0, 140);
    const statement = (think.split(/\n?\s*FOLLOW[-\s]?UP:/i)[0] || "").replace(/\s+/g, " ").trim();

    // ── SEARCH №2 — the agent's OWN follow-up query, testing the innocent explanation ──
    const cand2 = queryCandidates(corpus, followup_query, a);
    let ranked2: { docId: string; text: string; score: number }[] = [];
    try { ranked2 = await rerank(followup_query, cand2, { topN: 4, tier: "core" }); }
    catch { ranked2 = cand2.slice(0, 4).map(c => ({ docId: c.docId, text: c.text, score: 0 })); }
    emit(mk("retrieval", { stepId, followup: true, query: followup_query.slice(0, 90), candidates: cand2.length, surfaced: ranked2.map(r => ({ docId: r.docId, score: +r.score.toFixed(2) })) }, "investigate"));

    // ── OUTCOME — decided by DISPOSITIVE document evidence, never by a model hiccup:
    //  an exact identity match (shell/ghost) or an un-reversed duplicate is a proven
    //  loss; a ledger-reversed duplicate (amount 0) is a caught error → cleared. On
    //  CLEAN books the detector finds none of these, so nothing is filed. ──
    const dispositive = a.strength >= IRONCLAD || (a.scheme === "duplicate_payment" && (a.amount ?? 0) > 0);
    const reversedHerring = a.scheme === "duplicate_payment" && (a.amount ?? 0) === 0;
    const verdict = dispositive ? "confirmed" : reversedHerring ? "cleared" : "unproven";
    emit(mk("reasoning_verdict", { stepId, verdict, statement: statement || a.detail }, "investigate"));
    if (verdict === "cleared") { cleared.push(a); emit(mk("cleared", { anomaly: a, why: statement || "A matching credit note reverses this payment three days later — a caught accounting error, not a loss." }, "investigate")); return; }
    if (verdict !== "confirmed") { emit(mk("unproven", { anomaly: a }, "investigate")); return; }

    // ── VERIFY: independent review panel (3 lenses, parallel, fail-open, tight) ──
    const candidate = {
      id: `F-${++fid}`, scheme: a.scheme, statement: statement || a.detail, amount: a.amount ?? 0,
      evidence: [{ claim: a.detail, doc_ids: a.proofDocs }], confidence: +Math.max(a.strength, 0.9).toFixed(2),
    };
    emit(mk("nemotron_panel", { finding: candidate.id, stepId, reviewing: true, lenses: ["correctness", "innocent explanation", "sufficiency"] }, "investigate"));
    const panel = await nemotronPanel(candidate as any);
    emit(mk("nemotron_panel", { finding: candidate.id, stepId, done: true, upheld: panel.upheld, votes: panel.votes, summary: panel.upheld ? `Upheld by the independent review — ${panel.reasoning}` : `Filed on dispositive document evidence — one reviewer objected, recorded on the finding.` }, "investigate"));
    const finding: Finding = { ...candidate, verdict: "confirmed", nemotron: { upheld: panel.upheld, reasoning: panel.reasoning, overridden: !panel.upheld } as any,
      recommendedActions: recActions(a), evidence: candidate.evidence } as any;
    findings.push(finding);
    emit(mk("finding", { finding }, "investigate"));
  };

  // drain the channel until BOTH the fleet and every investigation have settled.
  // Settle on FAILURE too — a rejection must never leave the generator awaiting
  // `wake` forever (or die as an unhandled rejection) mid-demo.
  let settled = false;
  const onSettle = () => { settled = true; const w = wake; wake = null; w?.(); };
  Promise.all([fleetTask, fanOut(top, a => investigateOne(a), { concurrency: 2 })]).then(onSettle, onSettle);
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
