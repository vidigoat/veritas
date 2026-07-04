# VERITAS — Master Build Plan (frozen 2026-07-03, pre-event)
> Claude's execution reference for RAISE Summit Hackathon 2026, Vultr track.
> RULES GUARD: NO project code before Sat July 4, 11:30 AM Paris / 3:00 PM IST.
> This doc is planning only. COMPANIONS: design-system.md (full visual spec — paste into Cursor briefs) · specs.md (SSE events, tool contracts, DSL, datagen, eval rubric, test matrix, Cursor briefs, Vultr specifics, README + submission checklists, live-pitch script). Repo goes public from first commit. Push every commit.
> git user.email = vidit.patankar16@gmail.com. Port Titan PATTERNS, never code.

## 0. Mission
VERITAS — The AI Forensic Auditor. Autonomous agent that audits a company's full
books and hunts fraud in minutes. Pitch numbers: 5% of revenue lost to fraud
($5T/yr, ACFE 2024) · external audits catch 3% (tips 43%) · median fraud runs
12 months · median loss $145K · VERITAS: ~4 minutes on demo books.

Victory gates: demo case 10/10 consecutive clean runs · evals ≥9/10 detection,
ZERO false accusations (hard gate), amounts ±5%, 100% citation coverage, red
herrings CLEARED, ≤5min runtime · clean-company test passes · submitted Sun
11:30 AM IST (deadline 3:30 PM IST / 12:00 Paris).

## 1. DESIGN SYSTEM (first-class — judges see design before code)
Reference studies done 2026-07-03: wisprflow.ai (screenshots /tmp/w1-hero..w5.png,
computed CSS extracted) + Harvey AI agent-streaming screenshot (from Vidit).

### 1.1 What Wispr Flow actually does (measured, not vibes)
- Body bg cream `#FFFFEB`; ink `#1A1A1A`. Only 2 neutrals + accents.
- H1: EB Garamond 120px / 102px line-height, weight 400, letter-spacing -6px
  (-5%). Massive, TIGHT serif. Italic serif for emphasis words ("way *you* work").
- H2: EB Garamond 64px, ls -3%. Body/UI: Figtree 20px/26px w500; nav 16px w600.
- Buttons: lavender `#F0D7FF` bg, 12px radius, **2px solid #1A1A1A border**,
  16×24 padding, w600 — the "sticker" look. Chips/pills same recipe (border!).
- Sections = full-bleed rounded containers (~40px radius) alternating
  cream → black → deep green `#1D4A3E` → cream. Rhythm via bg flips, not rules.
- Playful details: marquee ribbon of user quotes, hand-drawn illustrations,
  wavy underline accents, logos row on green. Serif headline + sans body.
- Lesson: warmth + confidence come from (a) one huge tight serif, (b) borders
  on everything interactive, (c) very few colors, (d) generous rounding.

### 1.2 What the Harvey screenshot teaches (agent streaming UX)
- LEFT sidebar: workspace name, Create btn, 7 nav items w/ thin line icons.
- Agent run = VERTICAL TIMELINE: "Working…" header w/ chevron → steps, each:
  small icon bullet + bold step title + muted-gray prose reasoning underneath.
  Thin vertical connector line links step bullets.
- Inline artifacts INSIDE steps: file card (icon + "Complaint.pdf" + type tag,
  bordered rounded rect, full row) · search-term chips w/ magnifier icons ·
  source chips w/ favicons, wrapped in rows.
- End state: "✓ Finished in 4 steps" + collapse chevron → result card
  ("Version 1 · 2 minutes ago", bordered).
- Palette: calm. White bg, near-black titles, gray-500/600 prose, hairline
  borders. Zero loud color while working. Trust = quiet.
- Lesson: stream REASONING PROSE under step titles (not just spinner labels);
  render evidence as inline chips/cards the moment it's touched; collapse
  finished work; keep the working state calm, save color for verdicts.

### 1.3 VERITAS design language (the synthesis)
- Light-first "forensic paper" UI (Harvey calm × Wispr warmth), NOT a dark
  hacker console. Paper `#FBF9F1` bg, panels `#FFFFFF`, ink `#141414`.
- Accents (used ONLY for meaning): ledger green `#1F6F54` = verified/cleared ·
  crimson `#C4322E` = confirmed fraud · amber `#C77D28` = investigating ·
  gold `#C9A227` = the reveal moment. Lavender is Wispr's — we don't copy it.
- Type: **Fraunces** (serif display; 72-96px hero, -4% tracking, w400;
  italic for emphasis) + **Inter** (UI, 14-16px) + **JetBrains Mono**
  (numbers, doc IDs, amounts — ALL figures render in mono).
- Borders: 1.5px solid ink on interactive elements (Wispr sticker energy,
  dialed to enterprise). Radius: 12px controls, 20px cards, 32px sections.
- Motion: 150-200ms ease-out; step bullets pulse while active; graph edges
  draw in; the reveal = gold flash → crimson settle (the ONE big animation).
- Logo: engraved serif V, magnifier-lens counter, balance-scale crossbar.
  Ink on paper; crimson wax-seal variant for the report.

### 1.4 Console spec (component by component)
Layout: left sidebar (56px icons / 220px expanded) · center = CASE TIMELINE
(Harvey pattern, the star, ~55% width) · right = TABBED PANEL (Money Graph /
Evidence Drawer, ~45%) · bottom-right corner reserved 320×200 FACECAM-SAFE.

1. CHAT/INTAKE BOX (bottom of timeline, Wispr-warm): rounded 16px, 1.5px ink
   border, placeholder "Engage VERITAS…", paperclip + DRAG-DROP zone
   ("Drop the books — zip, csv, pdf"). On drop: file chips w/ type tags +
   ingest progress ("312 documents indexed · 5,000 transactions · 47 vendors").
   Enter = engagement letter submitted; box collapses to top as "case brief".
2. CASE TIMELINE (SSE-driven, Harvey anatomy): phase header ("Working — Phase
   2/6: Statistical Sweep" + elapsed + chevron) → steps with icon bullet, bold
   title ("Cross-referencing vendor registry against employee records"),
   muted reasoning prose streaming under it, and inline artifacts:
   - doc card: icon + "INV-0047.pdf" + tag + one-line relevance note
   - query chip: mono, e.g. `benford(expenses) → z=4.2 ⚠`
   - entity chips: 🏢 Apex Supplies · 👤 R. Mehta (click → graph focus)
   - hypothesis card: bordered, status pill (open/investigating/cleared/
     confirmed), confidence meter, evidence count
   Phases collapse when done: "✓ Sweep finished — 3 anomalies, 6 tool calls".
3. MONEY GRAPH (react-flow): entities as bordered nodes (Wispr sticker style),
   payments as edges w/ mono amounts; neutral ink default; amber pulse while
   under investigation; the REVEAL = gold flash, then crimson persistent edge
   vendor↔employee w/ "SAME ADDRESS" label. Physics gentle; camera auto-pans
   to active entity.
4. EVIDENCE DRAWER: every filed claim = row (claim text + doc_id chips);
   click → document viewer w/ the exact passage highlighted gold. Search box.
   Counter: "23 claims · 23 cited · 0 uncited" (flex the zero).
5. VERDICT BAR (bottom): findings count, quantified $ (mono, big), overall
   confidence, [APPROVE FREEZE] (crimson, needs click = human-in-command) and
   [GENERATE REPORT]. Idle until DECIDE phase — then slides up (the only
   layout animation).
6. REPORT VIEW: parchment page, Fraunces headings, wax-seal logo, 8 sections,
   exhibits as clickable chips → drawer. Print-perfect (PDF via browser print
   CSS). This is the artifact judges screenshot.
7. Empty/loading/error states designed, not defaulted: skeleton shimmer on
   ingest, friendly empty graph ("No entities yet — drop the books"),
   SSE-reconnect toast. Judges poke; nothing may look unfinished.

## 2. Architecture (unchanged, confirmed)
Next.js console ← SSE typed events ← Node/TS async-generator orchestrator
(PLAN→SWEEP→INVESTIGATE⟲→VERIFY→DECIDE→REPORT) → LLM layer (Vultr serverless,
models.ts registry, GO-0 bake-off: Kimi K2.6 favorite vs DeepSeek-V3.2 /
GLM-5.x / MiniMax; auto-failover pre-output only) + tool executor (14 Zod
tools, every failure = error tool_result) + case memory (hypothesis ledger,
evidence store, findings ledger = sole report source, agent audit log) +
data layer: SQLite ledger (exact math) / FTS5+Vultr-vector hybrid docs w/
doc_id citations / entity index / fraud KB (ACFE tree, red flags, methodology).
Titan patterns ported (see memory: raise-veritas-battle-plan §Titan) — loop
shape, buildTool, synthetic error results, SSE contract, stop_reason capture,
1h cache split, per-turn spend guard, withTimeout+abort.

## 3. Tools (14)
sweep: benford_analysis · detect_duplicates · scan_patterns(round|weekend|
threshold|velocity) · vendor_profile
investigate: query_ledger(DSL) · search_documents · get_document ·
cross_reference(address/bank/tax/phone) · trace_payments
verify: recompute · timeline_check
case: update_hypothesis · file_finding(REJECTS uncited claims) ·
freeze_vendor(approval-gated sim ERP)
Report generator compiles ONLY from findings ledger.

## 4. Data room — Meridian Traders Pvt Ltd (datagen, seeded)
5,000 txns FY25-26 · 312 invoices · 24 bank stmts · 47 vendors · 18 employees ·
8 contracts · PO index. PLANTED (ACFE-canonical shell co): V-031 "Apex
Supplies" by E-007 "R. Mehta" (procurement mgr) — 14 sequential service
invoices, no POs, self-approved, $9K→$22K some just under $25K threshold,
vendor addr == E-007 home addr, total $212,400 / 11 months. RED HERRINGS:
(1) duplicate payment reversed 3 days later (2) round-number CAPEX w/ board
minutes — both must be CLEARED with stated reasons. manifest.json = ground
truth, evals only, never shipped to agent.

## 5. Prompts
System: VERITAS senior forensic examiner, ACFE methodology, iron rules
(cite-or-doesn't-exist · numbers only from query_ledger/recompute · recompute
before filing · verdicts CONFIRMED/CLEARED-with-reason/UNPROVEN-with-what-would-
resolve · one hypothesis at a time, max 2 live leads · records not people ·
banned phrases list). 1h cache split at literal volatile marker.
Demo user prompt (verbatim, no-hint): "You are engaged as the forensic auditor
for Meridian Traders Pvt Ltd. This is a routine annual examination — management
has no specific suspicions. Examine the complete books for FY 2025–26: general
ledger, all invoices, bank statements, vendor master, and employee records.
Investigate any irregularities to conclusion, clear or confirm each one,
quantify any losses, and produce a full fraud examination report with cited
evidence. You have authority to freeze vendors, pending my approval."
Input: drag-drop meridian_books.zip.

## 6. Testing (5 layers, autonomous — Vidit writes/tests nothing)
L1 unit (tools vs fixtures; gate every commit) · L2 loop (mock-LLM: self-repair,
truncation-resume, maxTurns) · L3 evals (10 seeded companies incl. 2 clean;
metrics = victory gates) · L4 auto-iterate (I run evals→patch→re-run; Vidit
sees scoreboards only: "Eval v7: 9/10, 0 FA, 3.8min") · L5 demo rehearsal ×10
before any recording. Clean-company test = anti-embarrassment gate.

## 7. Sessions (UPDATED 2026-07-03: CURSOR REMOVED — Claude builds everything solo)
One Claude Code session builds backend AND frontend. The events.ts contract +
fixtures/demo-run.json + mock-server still get built first (hour 1) — not for
Cursor, but because contract-first lets the console be developed/tested against
replayed fixtures before the live agent exists, and makes the demo rehearsable.

## 8. GO schedule (IST, Sat 3:00 PM start)
GO-0 3:00-4:00 smoke: Vultr key, GET /v1/models, BAKE-OFF (10 tool-call tasks),
     vector store probe, rate limits, repo init + contracts + design tokens.
GO-1 4:00-6:30 datagen + corpus + manifest ✦ browsable. + events.ts/fixtures/mock-server committed.
GO-2 6:30-10:30 orchestrator + LLM layer + 14 tools + L1/L2 green
     ✦ HALFWAY GATE 10:30 PM: agent finds V-031 in terminal.
     CUT: simplify scheme (fewer hops).
GO-3 10:30 PM-2:00 AM retrieval polish + fraud KB + eval harness + first full
     L3 scoreboard ✦ ≥7/10 by 2 AM or simplify variants.
GO-3.5 (interleaved 10:30 PM-4 AM): console built by me against mock fixtures
     (layout, intake box, timeline, graph, drawer, verdict bar) in gaps while
     evals run — eval cycles are wall-clock wait time, perfect for UI work.
GO-4 2:00-4:00 AM iterate evals to green + wire console to LIVE SSE
     ✦ full run WATCHABLE. Vidit sleeps 4:00-6:00 (PROTECTED).
GO-5 6:00-8:30 AM design pass to §1 spec + logo SVG + deck + rehearsal ×10
     ✦ CUT: freeze investigation ORDER (reasoning stays live).
GO-6 8:30-10:30 AM VIDEO: Vidit records (Screen Studio, mic, corner facecam),
     I assemble (ffmpeg). 60s cut; extended ≤2min only if 60s is perfect.
GO-7 10:30-11:30 AM README (arch diagram, "built during RAISE 2026", video
     embed) + form + upload ✦ SUBMITTED 11:30 AM (2h buffer).
GO-8 UPDATED (doc §9 re-updated 2026-07-04): remote judging = ARTIFACTS ONLY (video + description + repo + 'and more'). NO live call. GO-8 hours flow into: extended-cut video polish, README excellence pass, project-description copy, demo-mode URL verification. Keep a 15-min light live-demo readiness (in case 'and more' surprises). Submission form: https://cerebralvalley.ai/e/raise-summit-hackathon/hackathon/submit — submit by Sun 2:00 PM IST (deadline 3:30 PM IST).
BONUS-PRIZE CHECKBOXES — CONFIRMED by organizer (AJC, Discord 2026-07-04): "best use case — only select if you use their tech"; NVIDIA prize = RTX 5080 for BEST USE OF NEMOTRON (details in livestream — Vidit watching #nvidia channel).
STRATEGY: tick CLOUDFLARE (frontend fronting at GO-7) + NVIDIA. NVIDIA play = "JUNIOR EXAMINER" pattern: Nemotron-Nano/Cascade-2 (on Vultr — track-compliant) does fast first-pass anomaly triage in the SWEEP phase + serves as eval judge + datagen helper; Kimi = senior examiner for investigation. Honest, load-bearing, architecturally sound (cheap triage → expensive reasoning only where needed), visible in UI ("triage: Nemotron" chip) + README section "Best use of Nemotron". Bake-off validates Nano for triage; fallback = judge/datagen roles only, still honest. Tick nothing else; OpenRouter skipped (all-LLM-on-Vultr rule).

## 9. Video (60s, locked)
Logo sting 2s → 2 problem slides 10s (Fraunces, animated numbers: "5% of
revenue. $5T." / "Audits catch 3%.") → demo 40s (paste engagement letter, drop
zip, ingest counter, speed-ramp sweep, REAL-TIME reveal — script pause on
"Watch.") → verdict + "$212,000. Four minutes. Every claim cited." + logo/URL.
Corner facecam throughout. Script (~150 words) in transcript + memory.
Deck: 3 slides only — (1) logo + "The AI Forensic Auditor" (2) 5%/$5T/3%
(3) "VERITAS reads 100% of the books. Fraud has nowhere to hide."

## 10. Q&A ammo
Synthetic data (ACFE #1 scheme, canonical red flags, data-agnostic arch) ·
hallucination structurally impossible (file_finding gate + recompute + clean-
company test) · vs MindBridge/KPMG (they score anomalies, human still
investigates; VERITAS IS the investigator) · trust (auditable auditor, human
approvals) · biz model (continuous-audit SaaS; internal audit, Big 4
forensics, PE diligence).

## 11. Risks
Credit-claim stall (claim TONIGHT, Discord escalate) · weak tool-calling
(bake-off, strict schemas, repair, fallback) · vector store weak (FTS5 fallback,
2h) · slow runs (cache summaries, parallel read-only tools, speed-ramps) ·
Cursor weak (absorb; console solo-buildable) · demo flake (L5 gate; frozen
order last resort) · live-call judging (runs locally, zero deploy dependency).

## 12. Tonight checklist (Vidit)
① Claim Vultr credits ② Discord: remote judging format? bonus prize criteria?
③ Sleep. — Sat 3:00 PM IST: say "go".

## REVIEW ADDENDA — CEO review 2026-07-04 (BINDING — overrides earlier sections where they conflict)
Mode: HOLD SCOPE · Approach A confirmed · all findings below auto-adjudicated per Vidit's delegation.

### A. Scope simplifications (from outside-voice OV1/OV4 — accepted)
- TOOLS 14 → 11: merge benford_analysis/detect_duplicates/scan_patterns into ONE
  run_sweep(kind: benford|duplicates|round|weekend|threshold|velocity). Drop
  timeline_check (dates verified via SQL + recompute). Keep: run_sweep,
  vendor_profile, query_ledger, search_documents, get_document, cross_reference,
  trace_payments, recompute, update_hypothesis, file_finding, freeze_vendor.
- query_ledger = READ-ONLY SQL over named SQLite views (vw_ledger, vw_vendors,
  vw_payments, vw_approvals) — replaces the custom DSL grammar entirely. Sandboxing:
  read-only connection + SELECT-only regex + row cap 200. Simpler AND better Q&A.
- RETRIEVAL: FTS5-primary. Vultr vector store gets a hard 20-min GO-0 probe; adopt
  only if trivially good, else one README roadmap sentence. "100% Vultr" pitch line
  scoped to inference + hosting.

### B. Reliability & failure-path fixes (my S1-S11 findings + OV6)
- F1 INGEST: validate zip before indexing (corrupt/foreign/oversize → friendly error
  card "expected a books export — see sample"); partial-index failure → abort with
  message, never half-loaded state.
- F2 REHYDRATE: server keeps per-run in-memory event log; console reconnect/refresh
  replays it (GET /run/:id/events). A stray F5 during judging costs nothing. Full
  cross-restart resume: explicitly NOT in scope (runs are ~4 min).
- F6 DETERMINISM: pin temperature=0.1, top_p fixed, seeded corpus for demo + evals.
- F7 MOBILE: <1000px shows a branded gate card ("VERITAS is a desktop console" +
  embedded video) — judges opening the URL on phones see intent, not breakage.
- OV6 TOOL-CALL FALLBACK: if Vultr endpoint lacks native tools param support, flip
  LLM layer to fenced-JSON text protocol (```tool {name, args}``` + parser + same
  executor). Spec'd now = flag flip, not redesign. GO-0 bake-off tests this first.

### C. Live-demo & security protocol (OV3/OV10 + F3/F4)
- PUBLIC URL = DEMO MODE: anonymous visitors get mock-bridge replay (labeled
  "recorded investigation"). Live runs require ?key=<token>. Global daily spend cap
  + per-IP rate limit on any live endpoint. Submission checklist item reworded:
  "URL up in demo mode OR local + README run instructions."
- LIVE CALL: pre-start the real run BEFORE the call begins (talk over it mid-flight;
  reveal lands during, not after). One-keystroke switch to fixture replay as plan B —
  used only with explicit disclosure ("this is a recording of an earlier run").
  Total API outage during call: disclose + replay + point to video. Honesty is the
  brand; never pass replay as live.

### D. Schedule & human-factors corrections (OV2/OV8/OV9/OV11)
- GO-2 GATE SOFTENED: gate = ONE honest end-to-end terminal run finding V-031.
  Full L1 matrix: sweep+SQL tools only by GO-2; remaining unit/loop tests land
  during GO-3/4. L2 scenarios halved pre-gate, rest after.
- GO-2 PROMPT v1 already contains: ACFE checklist stub + MANDATORY sweep-phase
  vendors-vs-employees cross_reference scan (the reveal's steering wheel installed
  BEFORE the gate that needs it, not after).
- EVALS PARALLELIZED: 10 companies run concurrently via detached eval-runner script
  (writes scoreboard JSON; session reads results — session never blocks on evals).
  Console building happens DURING eval wall-clock by design.
- REHEARSAL GATE: 5/5 consecutive clean runs with frozen investigation ORDER as the
  standard demo config (agent reasoning stays live; order pinning kills variance).
  Background rehearsals start 5:00 AM. 10/10 was theater; 5/5 + frozen order is
  engineering.
- SECOND SLEEP BLOCK (protected): Sun 12:00-1:30 PM IST, post-submission,
  pre-judging (window 3:45-6:30 PM IST). The pitch is delivered by a human;
  the human is a deliverable too.
- Context-window protocol: at each GO boundary I write a 10-line state summary into
  plan.md §STATE; any fresh session resumes from docs + memory, zero re-derivation.

### E. Claims discipline (OV7)
- BANNED PHRASE: "hallucination is structurally impossible." REPLACEMENT (pitch,
  README, Q&A): "Every figure is recomputed from the ledger. Every claim carries a
  citation or it cannot enter the report. Validated on clean books — VERITAS finds
  nothing where nothing exists." Same punch, unfalsifiable.

### F. Video corrections (OV12)
- Stat numbers live in the RECORDED onboarding screens (already in the video flow) —
  no ffmpeg-typography compositing job exists. ffmpeg = concatenation + audio only.
- Reveal shown in TRUE real time (speed-ramps only on the sweep).
- Video length rule: form says "short one minute" — 60s remains primary; ≤2-min
  extended cut in README. ASK IN DISCORD if longer is acceptable (pending).

### G. Open items requiring VIDIT (the only unresolved decisions)
1. AGE/ELIGIBILITY (OV5 — existential): verify prize eligibility terms for a
   14-year-old (Discord/#faqs/organizer email tonight). Decide DELIBERATELY whether
   "I'm 14" stays in the pitch. Until verified: build proceeds regardless (worst
   case = guardian collects prize), but the pitch line is conditional.
2. Video max-length question in Discord (bundled with bonus-prize question).

### Error & Rescue Registry (consolidated)
CODEPATH            FAILURE                    RESCUE                        USER SEES
llm.call            429/5xx pre-output         retry→model failover once     nothing (transparent)
llm.call            malformed tool JSON        repair prompt ≤2, then error  step marked failed, agent continues
llm.call            truncation                 budget bump → resume ≤3       nothing
llm.call            no native tools support    fenced-JSON protocol flag     nothing (GO-0 decision)
tool.*              invalid input/not found    error tool_result → self-fix  brief amber step note
ingest              corrupt/foreign zip        reject w/ friendly card       "expected a books export"
SSE                 disconnect/refresh         event-log replay on reconnect ≤1s hiccup + toast
evals               model outage               eval-runner retries, marks    scoreboard shows holes, not lies
report              figure fails recompute     finding demoted to UNPROVEN   honest flag
live call           total API outage           disclosed replay + video      honesty
Any row silent = CRITICAL GAP → none remain.

### Implementation task deltas (fold into GO blocks)
- [ ] T1 (P1) run_sweep merge + 11-tool registry (GO-2)
- [ ] T2 (P1) SQL views + read-only sandbox replacing DSL (GO-2)
- [ ] T3 (P1) fenced-JSON tool-protocol fallback in llm layer (GO-0/2)
- [ ] T4 (P1) event-log + reconnect replay endpoint (GO-2/4)
- [ ] T5 (P1) zip validation + error card (GO-1)
- [ ] T6 (P1) demo-mode public URL + token gate + rate limit (GO-6/7)
- [ ] T7 (P2) mobile gate card (GO-5)
- [ ] T8 (P2) pinned decoding params everywhere (GO-0)
- [ ] T9 (P2) eval-runner as detached parallel script (GO-3)
- [ ] T10 (P2) frozen-order demo config + 5/5 rehearsal harness (GO-5)

### H. ENGINEERING REVIEW findings 2026-07-04 (plan-eng-review — adjudicated, binding)
E1 [P1, conf 8/10] SSE server architecture pinned: standalone Node server (Hono)
   owns orchestrator + SSE + ingest; Next.js is frontend-only (dev proxy →
   server port). Avoids Next API-route SSE buffering quirks entirely. One
   process each, zero framework fighting at 2 AM.
E2 [P2, conf 8/10] SQLite discipline: better-sqlite3 (sync, fast), ONE DB FILE
   PER COMPANY (datagen emits meridian/books.db per variant), WAL mode.
   Parallel eval-runner spawns a child process per company → zero lock
   contention by construction.
E3 [P1, conf 9/10] Zip hardening: extraction via yauzl w/ entry-name
   sanitization (reject ../ and absolute paths — zip-slip), 20MB cap,
   entry-count cap 2,000. Complements F1's friendly-error card.
E4 [P2, conf 7/10] Text-protocol fallback contract: ONE fenced tool block per
   turn (enforced in prompt + parser rejects multiples with repair message).
   Deterministic > clever.
E5 [P3, conf 7/10] Repo = pnpm workspace: packages/shared (types: events,
   Finding, manifest) + server + web + datagen + evals. Shared types kill
   drift between datagen ground truth and eval scoring — DRY at the type level.
E6 [P2, conf 8/10] Context budget: tool_result payloads capped at 4K chars
   (query_ledger already row-capped 200); per-turn prompt target ≤60K tokens;
   cleared-hypothesis compaction (already specced) enforced by a turn-level
   assertion that logs when exceeded.
E7 [P3, conf 7/10] Datagen determinism test: same seed → byte-identical
   manifest.json (guards eval reproducibility).

### I. Test coverage map (eng review §3 — targets, all land with their feature)
CODE PATHS                                    USER FLOWS
[+] server/ingest      corrupt zip [L1] ·     [+] onboarding→case  skip btn [L1-web]
    zip-slip [L1] · oversize [L1] ·           [+] drop zip→ingest  happy [L5] ·
    happy [L1]                                    foreign file [L1]
[+] llm layer          native tool-call [GO-0]· [+] refresh mid-run  event replay [L2]
    fenced-JSON parse [L1] · repair ≤2 [L2] ·  [+] approve freeze   click flow [L2-mock]
    truncation resume [L2] · failover [L2]     [+] report render    print CSS [manual GO-6]
[+] tools ×11          happy/empty/invalid/    [+] mobile <1000px   gate card [L1-web]
    not-found [L1 ×44 cases]                   [+] live-call plan B  one-key replay [L5]
[+] orchestrator       phase transitions ·
    maxTurns · spend guard [L2]
[+] evals              parallel isolation [E2] · seed determinism [E7]
GAPS after this map: none known — every path has a named layer. COVERAGE TARGET: L1 ~60 cases, L2 8 scenarios, L3 rubric (already defined), L5 rehearsal.

### J. Parallel lanes (worktree/session strategy)
Lane A: datagen → server core → tools (sequential, shared packages/shared)
Lane B: web console vs mock fixtures (independent after events.ts lands, GO-1)
Lane C: eval-runner script (independent process; consumes A's artifacts)
Order: A starts first; B forks after contracts commit; C after first agent run.
Conflict: A and B both touch packages/shared → shared types are append-only
during the event; only Lane A edits them.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR (issues fixed) | HOLD SCOPE; 19 findings adjudicated into §REVIEW ADDENDA A-G; 0 critical gaps |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (issues fixed) | 7 issues (E1-E7) adjudicated into §H; coverage map §I complete, 0 gaps; lanes §J |
| Outside Voice | Claude subagent (codex not installed) | Independent 2nd opinion | 1 | ABSORBED | 12 findings (heavily eng-focused: schedule math, eval parallelism, tool-call fallback, live-demo protocol) absorbed in §A-§F; a second identical dispatch would duplicate — noted, not re-run |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | design-system.md carries Titan-audit patterns + S11 findings (mobile gate F7) |
| DX Review | `/plan-devex-review` | Developer experience | 0 | — | n/a (24h hackathon, solo) |

CROSS-MODEL: no contradictions; outside voice extended both reviews. Prior tension ("100% Vultr retrieval" vs vector-store time-sink) resolved via 20-min hard probe rule.
VERDICT: CEO + ENG CLEARED — ready to implement on "go". Build order: GO-0 per plan §8 with §H architecture pins (Hono server, better-sqlite3 per-company DBs, pnpm workspace, shared types package).

**UNRESOLVED DECISIONS:**
- Age/prize-eligibility verification for a 14-year-old (Vidit: Discord/#faqs or organizer email; pitch's "I'm 14" line conditional)
- Video max-length rule (Vidit: bundle into Discord ask; 60s default stands)
