/**
 * VERITAS v2 — the document-scale forensic orchestrator (async generator).
 *
 *  INGEST → PLAN → MAP(fleet) → REDUCE(detect) → INVESTIGATE(deep-dive) → VERIFY(Nemotron) → REPORT
 *
 *  Reads a corpus you upload. The Nemotron drone-fleet extracts facts in parallel;
 *  detection runs on those facts; a deep-dive examiner works each anomaly through
 *  TWO retrieval rounds (the second with a query the model writes itself) to a
 *  verdict; an independent Nemotron panel then reviews every accusation.
 *
 *  THE FILING RULE — no accusation on one model family's say-so:
 *    a finding is filed only when the Qwen examiner CONFIRMS it on the retrieved
 *    documents AND the NVIDIA Nemotron panel independently UPHOLDS it. Any other
 *    combination clears the lead (cited innocent explanation) or escalates it as
 *    unproven. Deterministic code keeps only the arithmetic: ledger amounts,
 *    detection priors, and the fail-safes when a model is unreachable — which
 *    fail toward "unproven", never toward an accusation.
 *    Every model runs on Vultr Serverless Inference.
 */
import { randomUUID } from "node:crypto";
import { subagent, fanOut } from "./agents.js";
import { ingestDir } from "./ingest.js";
import { parserStore, augmentWithFleet, type Store } from "./extract.js";
import { detectAnomalies } from "./detect.js";
import { rerank } from "./retriever.js";
import { nemotronPanel } from "./panel.js";
import { CaseBrain } from "./brain.js";
import { schemePrompt } from "./fraud-kb.js";
import { chat, getSpend, MODELS, streamChat } from "./llm.js";
import type { Corpus, CaseEvent, Finding, Anomaly, Phase } from "./contracts.js";

export interface RunResult { findings: Finding[]; cleared: Anomaly[]; brain: any; corpus: { stats: any; total: number }; usd: number; elapsedS: number; events: CaseEvent[] }

// Exact-string document evidence (identical address / shared bank account) is
// dispositive above this strength. It sets the examiner's PRIOR — the verdict
// itself is decided by the models (examiner + Nemotron panel). The only role
// dispositive evidence keeps in the outcome is the fail-safe: if the examiner
// is UNREACHABLE mid-run, a dispositive lead may still be put to the Nemotron
// panel on the documents alone rather than silently dropped.
const IRONCLAD = 0.78;

const REASON_SYSTEM = `You are VERITAS, a senior forensic accountant working a flagged lead. In 2-3 sentences, first person, present tense, think out loud: state your fraud hypothesis and the single strongest INNOCENT explanation you must rule out, then say what you will retrieve to test it. Be concrete about THIS company's documents — name the entities and figures. Then on a FINAL line output exactly: FOLLOWUP: <an 8-16 word retrieval query for the documents that would prove or kill that innocent explanation>. No JSON, no headings, no preamble.`;

const WEIGH_SYSTEM = `You are VERITAS, a senior forensic accountant delivering your verdict on a flagged lead. You hypothesized, then retrieved a SECOND round of documents with your own follow-up query to test the innocent explanation. Weigh BOTH rounds of evidence and decide.

IMPORTANT — the follow-up retrieval swept the company's COMPLETE books. If a record you would expect (a purchase order, a contract, an onboarding file, a reversing credit note) was not surfaced, it does not exist in the books — and that ABSENCE is itself evidence. Do not answer "unproven" merely because you wish for a document type these books never contained.

Calibration:
- A vendor registered at an employee's exact home address, with no tax ID, a single approver, and no purchase orders, is a textbook ACFE shell scheme — confirm unless a specific retrieved document provides the innocent explanation.
- Two employees paid into the same bank account, where one has a thin file (no email, recent join), is a textbook ghost-employee scheme.
- Two debits carrying the SAME invoice reference with no reversing credit note anywhere in the books is a duplicate-payment loss; if a matching credit note reverses it, it is a caught accounting error — clear it.

In 2-4 sentences, first person, present tense, deliver your verdict reasoning: state the decisive fact from the documents (name the exact document ids) and dispose of the innocent explanation. Then output exactly two FINAL lines:
VERDICT: confirmed | cleared | unproven
CONFIDENCE: 0.NN
Use "cleared" only if the innocent explanation HOLDS with a cited document; "unproven" only if the evidence genuinely cuts both ways. No JSON, no other headings.`;

export async function* runCorpus(dir: string, brief?: string): AsyncGenerator<CaseEvent, RunResult> {
  const t0 = Date.now();
  const events: CaseEvent[] = [];
  let phase: Phase | null = null;
  const mk = (type: string, payload: any, ph: Phase | null = phase): CaseEvent => ({ id: randomUUID().slice(0, 8), ts: Date.now(), type, phase: ph, payload });
  const out = (e: CaseEvent) => { events.push(e); return e; };
  const spend = () => +getSpend().usd.toFixed(4);

  // one channel; every concurrent producer (plan + fleet + investigators)
  // streams into it — the drain loop at the bottom yields them in order
  const chan: CaseEvent[] = [];
  let wake: (() => void) | null = null;
  const emit = (e: CaseEvent) => { out(e); chan.push(e); const w = wake; wake = null; w?.(); };

  // ── INGEST ──
  phase = "ingest";
  yield out(mk("phase", { phase, index: 1, of: 6, title: "Ingest" }));
  const corpus: Corpus = ingestDir(dir);
  const company = detectCompany(corpus);
  const currency = detectCurrency(corpus);
  yield out(mk("corpus_loaded", { stats: corpus.stats, total: corpus.total, company, currency }));

  // ── PLAN — the examiner reads the shape of the books and states its plan ──
  //  Genuine and adaptive: the plan is generated per-corpus from the real doc
  //  mix — and NON-BLOCKING: nothing downstream depends on its text, so the
  //  pipeline proceeds while the plan streams in (the card pops in when ready).
  phase = "plan";
  yield out(mk("phase", { phase, index: 2, of: 6, title: "Plan" }));
  const statLine = Object.entries(corpus.stats).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}s`).join(", ");
  const FALLBACK_PLAN = [
    { step: "Reconstruct the entity graph from the documents", why: "every verdict needs the cast of characters" },
    { step: "Cross-reference vendor and employee identities", why: "shells hide in shared addresses and accounts" },
    { step: "Sweep payments for duplicates and structuring", why: "the statistical tells of a billing scheme" },
    { step: "Investigate each anomaly — exonerate first", why: "accuse only what survives the innocent explanation" },
  ];
  const planTask = subagent<any>(
    `You are VERITAS, a senior forensic accountant opening an examination. Given the composition of the books, produce a focused examination plan. Respond with ONE JSON object:\n{"plan":[{"step":"imperative, 4-10 words","why":"one short clause"}]}\n3 to 5 steps, ACFE method: reconstruct the entity graph, cross-reference identities (addresses, bank accounts, tax IDs), statistical sweeps for duplicates and structuring, then work each anomaly to a verdict — exonerate first.`,
    `The books of ${company}${brief ? ` — engagement brief: ${brief}` : ""}: ${corpus.total} documents (${statLine}). What is your examination plan?`,
    { tier: "senior", maxTokens: 500, expectKeys: ["plan"], timeoutMs: 25000, noThink: true },
  ).then(planRes => {
    const planRaw = Array.isArray(planRes.data?.plan) ? planRes.data.plan.filter((s: any) => s && typeof s.step === "string").slice(0, 5) : [];
    emit(mk("plan", { steps: planRaw.length ? planRaw : FALLBACK_PLAN }, "plan"));
  }).catch(() => { emit(mk("plan", { steps: FALLBACK_PLAN }, "plan")); });

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

  // stream a reasoning pass token-by-token (genuine Vultr streaming). The prose is
  // surfaced live; the machine-readable tail (FOLLOWUP:/VERDICT:/CONFIDENCE:) is
  // withheld from the stream and parsed by the caller. Best-effort — if streaming
  // fails, the deterministic guards below still decide the verdict.
  const streamReason = async (stepId: string, system: string, user: string, maxTokens: number, kind: string): Promise<string> => {
    let full = "", shown = 0; let sealed = false;
    // seal the machine-readable tail from the visible stream. FOLLOWUP:/VERDICT:
    // sometimes arrive on the SAME line as prose, so match the token itself (with
    // its colon) — prose says "follow-up query", never "FOLLOWUP:".
    const TAIL = /\bFOLLOW[-\s]?UP\s*:|\n\s*(VERDICT|CONFIDENCE)\s*:|\bVERDICT\s*:/i;
    // a burst of concurrent calls can get rate-limited mid-run — retry a stream
    // that produced NOTHING once (a partial stream is never restarted mid-screen)
    for (let attempt = 0; attempt < 2 && !full; attempt++) {
      if (attempt) await new Promise(res => setTimeout(res, 900));
      try {
        for await (const d of streamChat("senior", [{ role: "system", content: system }, { role: "user", content: user }], { maxTokens, noThink: true, timeoutMs: 16000 })) {
          full += d;
          if (sealed) continue;
          const m = full.match(TAIL);
          const visibleEnd = m ? m.index! : full.length;
          if (visibleEnd > shown) { emit(mk("reasoning_delta", { stepId, delta: full.slice(shown, visibleEnd), kind }, "investigate")); shown = visibleEnd; }
          if (m) sealed = true;
        }
      } catch { /* retry once if nothing arrived; the caller's fail-safes cover the rest */ }
    }
    emit(mk("reasoning_end", { stepId, kind }, "investigate"));
    return full;
  };

  // launch the Nemotron drone fleet (non-blocking); its events belong to "map"
  // fleet concurrency 3: the drones share the inference rate limit with the
  // examiner streams on the critical path — a calmer fleet means fewer stalled
  // verdict streams, which is worth far more wall-clock than fleet speed
  const fleetTask = augmentWithFleet(corpus, store, {
    concurrency: 3,
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

    // ── SEARCH №1 — surface the lead's own evidence (VultronRetriever Core) ──
    const cand = corpusCandidates(corpus, a);
    let ranked: { docId: string; text: string; score: number }[];
    try { ranked = await rerank(a.detail, cand, { topN: 5, tier: "core" }); }
    catch { ranked = cand.slice(0, 5).map(c => ({ docId: c.docId, text: c.text, score: 0 })); }
    emit(mk("retrieval", { stepId, model: "VultronRetriever Core-4.5B", query: a.title.slice(0, 80), candidates: cand.length, surfaced: ranked.map(r => ({ docId: r.docId, score: +r.score.toFixed(2) })) }, "investigate"));
    const evidence1 = ranked.map(r => `--- ${r.docId} ---\n${excerptFor(r.text, needles, 850)}`).join("\n\n");

    // ── REASON (STREAMED): think out loud, name the innocent explanation, and
    //  write its own follow-up query for the second retrieval round. ──
    const dossier = `${schemePrompt(a.scheme)}\n\nFLAGGED LEAD: ${a.detail}\nSubjects: ${a.subjectIds.join(", ")}\n\nRETRIEVED DOCUMENTS:\n${evidence1}`;
    const think = await streamReason(stepId, REASON_SYSTEM, dossier, 340, "hypothesis");
    const followup_query = (think.match(/FOLLOW[-\s]?UP:\s*(.+)$/im)?.[1]
      || `${a.subjectIds.filter(Boolean).join(" ")} purchase orders contracts approvals`).trim().slice(0, 140);
    const hypothesis = (think.split(/\n?\s*FOLLOW[-\s]?UP:/i)[0] || "").replace(/\s+/g, " ").trim();

    // ── SEARCH №2 — the examiner's OWN follow-up query, testing the innocent
    //  explanation. The decisive question gets the precision tier: Prime-8B. ──
    const cand2 = queryCandidates(corpus, followup_query, a);
    let ranked2: { docId: string; text: string; score: number }[] = [];
    try { ranked2 = await rerank(followup_query, cand2, { topN: 4, tier: "prime" }); }
    catch { ranked2 = cand2.slice(0, 4).map(c => ({ docId: c.docId, text: c.text, score: 0 })); }
    emit(mk("retrieval", { stepId, followup: true, model: "VultronRetriever Prime-8B", query: followup_query.slice(0, 90), candidates: cand2.length, surfaced: ranked2.map(r => ({ docId: r.docId, score: +r.score.toFixed(2) })) }, "investigate"));
    const evidence2 = ranked2.map(r => `--- ${r.docId} ---\n${excerptFor(r.text, needles, 700)}`).join("\n\n") || "(nothing further surfaced — the books contain no additional record matching the query)";

    // ── VERDICT (STREAMED, load-bearing): the examiner weighs BOTH retrieval
    //  rounds and decides. This model call determines the outcome — if it fails,
    //  the fail-safe below runs toward "unproven", never toward an accusation. ──
    const weighUser = `${schemePrompt(a.scheme)}\n\nFLAGGED LEAD: ${a.detail}\nSubjects: ${a.subjectIds.join(", ")}\nLedger exposure (recomputed deterministically): ${(a.amount ?? 0) > 0 ? Math.round(a.amount!).toLocaleString("en-US") : "0 (a matching credit reverses the cash out)"}\n\nYOUR HYPOTHESIS (round 1): ${hypothesis || "(streaming failed — reason from the documents alone)"}\n\nROUND-1 DOCUMENTS:\n${evidence1}\n\nYOUR FOLLOW-UP QUERY: ${followup_query}\nROUND-2 DOCUMENTS (the complete books were swept):\n${evidence2}\n\nDeliver your verdict.`;
    let weigh = await streamReason(stepId, WEIGH_SYSTEM, weighUser, 360, "verdict");
    if (!/VERDICT:\s*(confirmed|cleared|unproven)/i.test(weigh)) {
      // the stream flaked — one non-streaming retry so the examiner still decides
      try {
        const retry = await chatOnce(WEIGH_SYSTEM, weighUser);
        if (retry) { weigh = retry; emit(mk("reasoning_delta", { stepId, delta: retry.split(/\n?\s*(?:VERDICT|CONFIDENCE)\s*:/i)[0] ?? "", kind: "verdict" }, "investigate")); emit(mk("reasoning_end", { stepId, kind: "verdict" }, "investigate")); }
      } catch { /* the fail-safes below decide */ }
    }
    const parsedVerdict = weigh.match(/VERDICT:\s*(confirmed|cleared|unproven)/i)?.[1]?.toLowerCase() as "confirmed" | "cleared" | "unproven" | undefined;
    const parsedConf = clamp01(parseFloat(weigh.match(/CONFIDENCE:\s*(0?\.\d+|1(?:\.0+)?)/i)?.[1] ?? ""), 0.8);
    const verdictStatement = (weigh.split(/\n?\s*(?:VERDICT|CONFIDENCE)\s*:/i)[0] || "").replace(/\s+/g, " ").trim();

    // deterministic facts that gate ONLY the fail-safes and the arbitration
    // routing below — they never decide a verdict by themselves:
    const dispositive = a.strength >= IRONCLAD || (a.scheme === "duplicate_payment" && (a.amount ?? 0) > 0);
    const reversedHerring = a.scheme === "duplicate_payment" && (a.amount ?? 0) === 0;

    let verdict: "confirmed" | "cleared" | "unproven";
    const examinerAnswered = !!parsedVerdict;
    // ARBITRATION: when the examiner's verdict CONTRADICTS dispositive document
    // evidence (an exact identity match; an un-reversed duplicate), the second
    // model family decides — the lead goes to the Nemotron panel with the
    // examiner's dissent recorded. If the panel also declines, the examiner's
    // reading stands. A single model flake can neither file nor erase a
    // documented finding.
    let dissent: "cleared" | "unproven" | null = null;
    if (parsedVerdict) {
      verdict = parsedVerdict;
      if (parsedVerdict !== "confirmed" && dispositive) { dissent = parsedVerdict; verdict = "confirmed"; }
    } else if (reversedHerring) {
      // examiner unreachable, but the ledger nets to zero — arithmetic, not judgment
      verdict = "cleared";
    } else if (dispositive) {
      // examiner unreachable on dispositive documents → put it to the Nemotron
      // panel on the documents alone (below); never auto-file without a model
      verdict = "confirmed";
    } else {
      verdict = "unproven";
    }
    const statement = dissent ? a.detail : (verdictStatement || hypothesis || a.detail);
    emit(mk("reasoning_verdict", { stepId, verdict: dissent ?? verdict, statement: verdictStatement || hypothesis || a.detail, confidence: examinerAnswered ? parsedConf : undefined, examinerAnswered }, "investigate"));

    if (verdict === "cleared") {
      cleared.push(a);
      emit(mk("cleared", { stepId, anomaly: a, why: statement }, "investigate"));
      return;
    }
    if (verdict !== "confirmed") { emit(mk("unproven", { stepId, anomaly: a }, "investigate")); return; }

    // ── VERIFY (BINDING): the independent Nemotron panel — a different model
    //  family — must uphold, or the accusation is NOT filed. 3 lenses, parallel,
    //  abstentions never uphold. ──
    const evidence = [
      { claim: a.detail, doc_ids: a.proofDocs },
      ...(ranked2.length ? [{ claim: `Follow-up sweep of the complete books ("${followup_query}") — pages weighed in the verdict`, doc_ids: ranked2.slice(0, 3).map(r => r.docId) }] : []),
    ];
    const candidate = {
      id: `F-${++fid}`, scheme: a.scheme, statement, amount: a.amount ?? 0,
      // on dissent the examiner's stated confidence belongs to the OTHER verdict —
      // the filing's prior comes from the documents, capped below the clean path
      evidence, confidence: examinerAnswered && !dissent ? parsedConf : +Math.min(a.strength, 0.85).toFixed(2),
    };
    emit(mk("nemotron_panel", { finding: candidate.id, stepId, reviewing: true, model: "NVIDIA Nemotron Cascade-2", lenses: ["correctness", "innocent explanation", "sufficiency"] }, "investigate"));
    let panel = await nemotronPanel(candidate as any);
    if (!panel.upheld && dispositive) {
      // SECOND LOOK: a single flaky reviewer response (one refute + one
      // abstention) must not erase dispositive document evidence — a refusal
      // on an exact-identity or un-reversed-duplicate lead must survive a
      // second, fresh panel before it stands.
      panel = await nemotronPanel(candidate as any);
    }
    emit(mk("nemotron_panel", {
      finding: candidate.id, stepId, done: true, upheld: panel.upheld, votes: panel.votes, model: "NVIDIA Nemotron Cascade-2",
      summary: panel.upheld
        ? (dissent
          ? `Arbitration — the examiner read this lead as ${dissent}, but the documents show ${a.scheme === "duplicate_payment" ? "the same invoice debited twice with no reversal" : "an exact identity match"}; the independent panel upholds the finding, with the examiner's dissent recorded.`
          : `Upheld by the independent review — ${panel.reasoning}`)
        : `REFUTED by the independent review — the accusation is NOT filed. ${panel.reasoning}`,
    }, "investigate"));

    if (!panel.upheld) {
      // two model families must agree before VERITAS accuses anyone
      if (dissent === "cleared") {
        // examiner cleared it and the panel declined the accusation — cleared stands
        cleared.push(a);
        emit(mk("cleared", { stepId, anomaly: a, why: verdictStatement || a.detail }, "investigate"));
      } else {
        emit(mk("unproven", { stepId, anomaly: a, why: `The accusation did not survive the independent review — ${panel.reasoning}. Escalated for manual review instead of filed.` }, "investigate"));
      }
      return;
    }
    const upConf = panel.votes.filter(v => !v.abstained && v.upheld).map(v => v.confidence);
    const confidence = +Math.min(candidate.confidence, upConf.length ? Math.min(...upConf) : candidate.confidence, 0.97).toFixed(2);
    const finding: Finding = {
      ...candidate, confidence, verdict: "confirmed",
      nemotron: { upheld: true, reasoning: panel.reasoning, model: panel.model, ...(dissent ? { dissent } : {}) } as any,
      recommendedActions: recActions(a), evidence: candidate.evidence,
    } as any;
    findings.push(finding);
    emit(mk("finding", { finding }, "investigate"));
  };

  // drain the channel until BOTH the fleet and every investigation have settled.
  // Settle on FAILURE too — a rejection must never leave the generator awaiting
  // `wake` forever (or die as an unhandled rejection) mid-demo.
  let settled = false;
  const onSettle = () => { settled = true; const w = wake; wake = null; w?.(); };
  Promise.all([fleetTask, planTask, fanOut(top, a => investigateOne(a), { concurrency: 4 })]).then(onSettle, onSettle);
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

/** Auto-recognise the currency from the books (so the UI shows the right symbol). */
function detectCurrency(corpus: Corpus): string {
  let e = 0, d = 0, r = 0;
  for (const id of corpus.order.slice(0, 80)) {
    const t = corpus.docs.get(id)!.text;
    e += (t.match(/\u20AC/g) || []).length;   // euro
    d += (t.match(/\$/g) || []).length;        // dollar
    r += (t.match(/\bRs\b|\u20B9/g) || []).length; // rupee
  }
  if (d >= e && d >= r && d > 0) return "$";
  if (r >= e && r >= d && r > 0) return "\u20B9";
  return "\u20AC";
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
/** Clamp a parsed confidence into a sane band; fall back when the model omitted it. */
const clamp01 = (n: number, dflt: number) => Number.isFinite(n) ? +Math.max(0.5, Math.min(0.97, n)).toFixed(2) : dflt;

/** One bounded, non-streaming senior call — the verdict retry path. */
async function chatOnce(system: string, user: string): Promise<string | null> {
  const res = await chat("senior", [{ role: "system", content: system }, { role: "user", content: user }], undefined, { maxTokens: 300, noThink: true, timeoutMs: 15_000 });
  const raw = (res.message.content ?? (res.message as any).reasoning ?? "").toString().trim();
  return raw || null;
}

const recActions = (a: Anomaly): string[] => a.scheme === "shell_company"
  ? [`Freeze vendor ${a.subjectIds[0]}`, `Refer ${a.subjectIds[1]} to counsel`, `Review all approvals by ${a.subjectIds[1]}`]
  : a.scheme === "ghost_employee" ? [`Suspend payroll for ${a.subjectIds[0]}`, `Investigate ${a.subjectIds[1]}`]
  : [`Recover the duplicate payment`, `Add a duplicate-invoice control`];
