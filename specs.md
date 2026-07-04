> ⚠ BINDING OVERRIDES live in plan.md §REVIEW ADDENDA (2026-07-04): tools 14→11 (run_sweep merge, timeline_check dropped), SQL views replace the DSL grammar, FTS5-primary retrieval, fenced-JSON tool fallback, demo-mode public URL. Read that section first.

# VERITAS Engineering Specs — v1 (frozen 2026-07-03)
> Contracts only — interfaces, schemas, grammars, checklists. NO implementation
> code before Sat 3:00 PM IST (hackathon rule). Companion to plan.md + design-system.md.

## 1. SSE event vocabulary (events.ts contract — Cursor builds against THIS)
All events: { id, ts, type, phase, payload }. phase ∈ plan|sweep|investigate|verify|decide|report.
type:
  case_opened        { brief, corpus_stats:{docs,txns,vendors,employees} }
  ingest_progress    { indexed, total }
  phase_start        { phase, index, of, title }
  step_start         { step_id, title, icon }
  reasoning_delta    { step_id, text }                    // stream into prose
  tool_call          { step_id, tool, args_summary, mono } // render query chip
  tool_result        { step_id, tool, summary, flagged?, artifacts?:[DocRef|EntityRef] }
  doc_touched        { step_id, doc_id, doc_type, note }   // doc card
  entity_touched     { step_id, entity_id, kind, name }    // entity chip + graph
  hypothesis_update  { hyp_id, statement, status:open|investigating|cleared|confirmed,
                       confidence, evidence_for, evidence_against, next_probe }
  graph_update       { nodes:[...], edges:[...], focus?:entity_id, reveal?:bool }
  finding_filed      { finding }                            // full Finding object
  reveal             { vendor_id, employee_id, match_field, label } // THE moment
  verify_pass        { claim_id, recompute_ref }
  phase_done         { phase, summary, anomalies?, tool_calls, seconds }
  approval_request   { action:"freeze_vendor", target, reason }   // verdict bar btn
  action_executed    { action, target, receipt_id }
  report_ready       { url, sections, exhibit_count }
  usage              { model, in_tokens, out_tokens, cached, usd_total }
  case_closed        { findings, total_usd, confidence, elapsed_s }
  error              { message, recoverable }
Rule: UI renders ONLY from events (replayable → fixtures/demo-run.json is just
a recorded event array; mock-server replays it with realistic delays).

## 2. Tool contracts (name / in / out / UI describe-string)
benford_analysis   {scope:"expenses"|"all"|account}  → {distribution, deviations:[{account,digit,z}], flagged:[account]} · "Running Benford's-law digit analysis on {scope}"
detect_duplicates  {keys:[amount|vendor|date], window_days} → {clusters:[{txn_ids, amount, vendor, dates}]} · "Scanning for duplicate payments"
scan_patterns      {type:round|weekend|threshold|velocity, params?} → {hits:[{txn_id|vendor_id, detail}]} · "Scanning for {type} anomalies"
vendor_profile     {vendor_id} → {totals, monthly_series, invoice_count, numbering_gaps:bool, sequential:bool, po_coverage_pct, approvers:[{employee_id,count}], first_seen} · "Profiling vendor {name}"
query_ledger       {filter DSL, aggregate?} → {rows≤200, total_matched, aggregates} · "Querying ledger: {summary}"
search_documents   {query, doc_type?, entity_id?, limit=10} → {hits:[{doc_id, type, score, snippet}]} · "Searching documents for '{query}'"
get_document       {doc_id} → {doc_id, type, date, text, metadata, entities} · "Reading {doc_id}"
cross_reference    {entity_a, entity_b?|scan:"vendors_vs_employees", fields:[address|bank_account|phone|tax_id]} → {matches:[{a, b, field, value_a, value_b, exact:bool}]} · "Cross-referencing {fields}"
trace_payments     {entity_id, date_range?} → {payments:[{txn_id, date, amount, from_acct, to_acct, bank_line_doc_id}], total} · "Tracing payments to {name}"
recompute          {claim:{figure, derivation:{op, txn_ids|filter}}} → {verified:bool, computed, delta} · "Re-verifying ${figure}"
timeline_check     {events:[{date, claim}]} → {consistent:bool, violations} · "Checking timeline consistency"
update_hypothesis  {hyp_id?, statement, status, evidence_refs, confidence, next_probe} → {hyp_id} · (silent, drives hypothesis_update event)
file_finding       {finding} → {finding_id} | ERROR "uncited claim: …" · "Filing finding {class}"
freeze_vendor      {vendor_id, reason} → approval_request → {receipt_id} · "Requesting approval to freeze {name}"
All tools: Zod-validated; invalid input / not-found / exception → tool_result
with is_error=true, message ≤200 chars (model self-repairs). Read-only tools
concurrency-safe; file_finding/freeze_vendor serialized.

## 3. query_ledger DSL (no raw SQL to the model)
filter := cond (AND cond)*
cond   := field op value | field IN [v,...] | date BETWEEN d AND d
field  := amount|date|vendor_id|employee_id|account|memo|txn_id|approved_by
op     := = != > < >= <= CONTAINS
aggregate := {group_by?:field, fn:sum|count|avg|min|max, of?:amount}
Parser rejects anything else with the exact grammar error (model retries).

## 4. Finding schema (file_finding input)
{ id?, class: "billing_scheme.shell_company"|"duplicate_payment"|"expense_fraud"|
  "threshold_evasion"|"other", statement, evidence:[ {claim, doc_ids:[..]} |
  {claim, verified_by:recompute_ref} ], confidence:0-1,
  unresolved:[{item, needed}], recommended_actions:[..] }
VALIDATION: every evidence item needs ≥1 doc_id OR verified_by; statement must
name entities by ID; confidence<0.5 → status forced UNPROVEN. Report compiles
ONLY from filed findings + cleared-hypothesis records.

## 5. Datagen spec
Layout: datagen/config/company.config.json (seed, scale knobs, scheme+herring
toggles) → out/: ledger.csv · invoices/INV-*.txt (structured text w/ letterhead
noise) · statements/BS-YYYY-MM.txt · vendors.csv · employees.csv · contracts/*.txt ·
po_index.csv · manifest.json (EVALS ONLY).
Scheme injector (shell_company): params {vendor_name, employee, n_invoices:14,
start_amount:9000, growth:1.07, threshold:25000, months:11, address_match:exact}.
Invoice realism: numbering styles differ per vendor; Apex = strictly sequential.
Amount realism: normal vendors get organic decimals; Apex mixes round + just-
under-threshold. Red herrings: (1) DUP-pair to legit vendor + reversal txn 3
days later (memo "reversal of duplicate") (2) $250,000.00 CAPEX + PO + board
minutes doc authorizing it. manifest.json: {scheme:{type, vendor_id, employee_id,
total, txn_ids, proof_doc_ids}, herrings:[{kind, txn_ids, clearing_doc_ids}]}.
Eval variants (10 companies): shell_company ×3 (placement/size vary) ·
duplicate_payment ×2 · expense_fraud ×2 · threshold_evasion ×1 · CLEAN ×2.

## 6. System prompt (full text lives in prompts/system.md at build; spine)
Persona: senior forensic examiner, ACFE-methodology. Phase contracts:
PLAN: output ≤6-step examination plan, risk-ranked, cite fraud-KB entries.
SWEEP: run ALL sweep tools before forming hypotheses; enumerate anomalies.
INVESTIGATE: one hypothesis at a time (max 2 live); after each tool result
state in ONE line: what changed / what's needed next / why. Retrieval must be
CAUSED by prior finding (say the cause).
VERIFY: recompute every figure in candidate findings; timeline_check sequences.
DECIDE: verdict per hypothesis: CONFIRMED (cited) / CLEARED (state innocent
explanation) / UNPROVEN (state exactly what record would resolve).
REPORT: no new claims — findings ledger only.
Iron rules + banned list per plan.md §5. Cache split marker:
"## Instance Context (per-call, not cached)".

## 7. Eval rubric (L3) — per company, 100 pts
detection (scheme found, right class)            30
perpetrator + vendor correctly identified        15
amount within ±5%                                10
citation coverage (every claim cited)            15
herrings cleared with correct reason             10
false accusations                                HARD FAIL (score=0)
honesty (unproven items flagged, not asserted)   10
runtime ≤5 min                                    5
report quality (LLM-judge: clarity, structure)    5
PASS = ≥80 avg across 10 companies AND 0 hard-fails AND both CLEAN companies
produce "no material findings".

## 8. Test matrix
L1 unit: each tool ×(happy, empty, invalid-input, not-found) on seeded fixture.
L2 loop (mock LLM scripts): tool-error self-repair · truncation resume ·
maxTurns exit · malformed JSON retry · approval flow · SSE ordering.
L3 evals: §7. L4 auto-iterate protocol: run L3 → cluster failures (prompt vs
tool vs data) → patch ONE dimension → rerun failed cases only → full rerun on
green. Vidit sees scoreboard messages only.
L5 rehearsal: scripted runner, demo case ×10, assert: reveal fires, timings
within budget, zero errors; log per-phase seconds for video pacing.

## 9. Console build order (CURSOR REMOVED — Claude builds solo, same 3 milestones)
M1 "Shell + timeline": layout, sidebar, intake box (all states), case timeline
rendering ALL event types from replayed fixtures, phase collapse.
Acceptance: demo-run.json replay is pixel-faithful to design-system.md.
M2 "Graph + evidence drawer": react-flow per DS §4.3 incl. reveal animation,
drawer + doc viewer w/ gold highlight. Acceptance: reveal matches spec;
any doc chip opens the exact passage.
M3 "Verdict bar + report": slide-up bar, approval interaction, parchment
report w/ print CSS. Acceptance: print → clean PDF.
Built during eval wall-clock gaps (GO-3.5); wired to live SSE at GO-4.

## 10. Vultr specifics — LIVE CATALOG confirmed 2026-07-03 from create screen ($/1M in/out)
CHAT: Kimi-K2.6 0.30/1.20 (favorite) · DeepSeek-V4-Flash 0.30/1.00 (strong cheap
contender) · MiniMax-M2.7 0.30/1.20 · Qwen3.5-397B-A17B 0.30/2.00 · Qwen3.6-27B
0.30/2.00 · MiMo-V2.5-Pro 0.55/1.65 · DeepSeek-V3.2-NVFP4 0.55/1.65 ·
GLM-5.2-fp8 0.85/3.10 (pricey — must win bake-off) · Nemotron-Cascade-2-30B
0.15/0.60 (UTILITY: LLM-judge, datagen assist, cheap loops) · Nemotron-3-Nano
0.13/0.38. RETRIEVERS SERVED (research said self-host-only — WRONG, event
catalog has them): VultronRetrieverPrime-8B 0.20/1.00 · Core-4.5B 0.10/0.50 ·
Flash-0.8B 0.05/0.25 → GO-0 probe their API shape for doc retrieval; if usable
= "100% Vultr: brain + retrieval + hosting" pitch line; FTS5 hybrid fallback.
COST DISCIPLINE (real prices = 2x old estimate): big model ONLY for
investigation reasoning; Nemotron-Cascade for judge/datagen/smoke. Full run
≈ $0.27 on Kimi. Realistic total $45-60, worst ~$120, cap $200 holds.
Inference base: https://api.vultrinference.com/v1 (OpenAI-compatible; also
/chat/completions/RAG + vector store). GO-0: GET /v1/models · Usage-tab price
check · vector-store probe · bake-off task set (10): 3 single tool-call
(schema exactness), 3 multi-turn chains, 2 JSON-repair provocations, 2 long-
context digests; score valid-call rate, chain coherence 1-5, p50 latency, cost.
Hosting: Vultr VM if platform API enables (else Fallback A: run locally for
demo/video; B: Vidit clicks VM deploy ~10min, I take over via SSH; C:
Cloudflare Pages frontend).

## 11. README outline (written GO-7)
Hero: logo, one-liner, 60s video embed, live URL. → The problem (5%/3%/12mo,
sourced) → What VERITAS does (demo gif) → Architecture diagram (ASCII, from
plan) → The anti-hallucination design (file_finding gate, recompute, clean-
company test) → Built during RAISE 2026 (timeline of commits) → Stack (Vultr
inference + vector store + VM, model, Next.js) → Eval results table →
Run locally (3 commands) → License MIT.

## 12. Submission checklist (GO-7, in order)
[] L5 10/10 green  [] video uploaded (YouTube unlisted→public) [] README done
[] repo public, no secrets (key scan), .env.example  [] live URL up on Vultr VM
[] form: track=Vultr, video link, repo link, team=solo-remote  [] confirmation
screenshot saved  [] Discord post in track channel (visibility with judges)

## 13. 3-min live pitch (if remote judging = call; skeleton)
0:00 hook: Wirecard/€1.9B + "audits catch 3%" · 0:20 numbers (5%, $5T, 12mo)
0:40 LIVE RUN kicked off (talk over sweep) · 1:10 architecture in one breath
(agent plans→retrieves-because-of-findings→tools→verifies→decides; hallucination
structurally impossible) · 1:40 REVEAL lands · 2:10 report + freeze approval
2:30 impact (KPMG pays for weaker; continuous audit) · 2:50 "I'm Vidit, I'm 14,
built solo on Vultr in 24h." Q&A ammo in plan.md §10.

## 14. GitHub repo excellence spec (the repo IS a judged artifact)
Repo: github.com/vidigoat/veritas · desc: "The AI Forensic Auditor — reads 100%
of the books, finds fraud in minutes. Built in 24h at RAISE Summit Hackathon
2026 (Vultr track)." · topics: ai-agent, forensic-audit, fraud-detection,
vultr, hackathon · MIT license · public from commit #1.
README anatomy (order matters — judges skim top-down):
 1. Hero: logo banner SVG (dark/light aware) + one-liner + badges
    (built-in-24h · Vultr Serverless Inference · evals 9/10 · MIT)
 2. 60s video embed + 15s demo GIF (the reveal moment, autoplays in README)
 3. The problem — 3 stat cards (5% / 3% / 12 months, ACFE-sourced links)
 4. What it does — the 6-phase investigation, one line each
 5. Architecture — the ASCII diagram from plan.md + link to specs
 6. Why it can't hallucinate — file_finding gate, recompute, clean-company
    test (the section judges screenshot)
 7. Eval scoreboard — real table from L3 (incl. the failures we fixed —
    honesty reads as engineering maturity)
 8. Built during the event — link to commit history; commits ARE the proof
 9. Run it — 3 commands + .env.example (keys never committed; key-scan
    before every push)
 10. Stack credits — Vultr inference + VultronRetriever + VM, model chosen
    by bake-off (link bake-off results table)
Commit discipline: conventional messages that tell the build story
("feat(tools): benford_analysis with z-scores", "eval: v4 scoreboard 7/10 →
fix retrieval gap"), pushed continuously — the timeline is our "new work only"
evidence. No force-pushes, no squash. deck/ + assets/ live in-repo (judges can
run the deck too). docs/ carries plan.md+design-system.md+specs.md copied in
at GO-0 (shows judges the engineering process — planning docs are legal
pre-event artifacts, noted as such in README).
