# VERITAS Design System — v1 (frozen 2026-07-03)
> Sources: wisprflow.ai measured CSS (2026-07-03 capture) + Harvey AI agent-run
> screenshot. Synthesis: "forensic paper" — Harvey calm × Wispr warmth × audit gravitas.
> This file is pasted verbatim into every Cursor brief. No taste drift allowed.

## 1. Tokens

### Color (only these; color = meaning, never decoration)
--paper:        #FBF9F1   page background
--panel:        #FFFFFF   cards, timeline surface
--ink:          #141414   text, borders, graph default
--ink-60:       #5C5A54   secondary text / reasoning prose
--ink-30:       #B8B5AC   hairlines, disabled, connector lines
--green:        #1F6F54   verified / cleared / success
--green-tint:   #E8F2EE   cleared chip fill
--amber:        #C77D28   investigating / open hypothesis
--amber-tint:   #F9EFE2   investigating fill
--crimson:      #C4322E   confirmed fraud / freeze action
--crimson-tint: #F9E7E6   fraud fill
--gold:         #C9A227   THE REVEAL flash + evidence highlight only
--gold-tint:    #F7F0DC   highlighted passage bg
Dark is NOT a theme. Report page uses --paper, deeper: #F6F1E4.

### Type
Display: Fraunces (Google Fonts), w400 + w600 semi, italic for emphasis word
  h1 hero/deck: 84px / 1.02 / -0.04em
  h2 section:   44px / 1.05 / -0.03em
  h3 card:      24px / 1.15 / -0.02em
UI: Inter — 16px/1.5 default, 14px/1.45 secondary, 13px chips, w500 default w600 buttons
Data: JetBrains Mono — ALL amounts, doc IDs, counts, queries. 15px in timeline,
  28px verdict-bar total, tabular-nums always.
Rule: every $ figure on screen is mono. No exceptions.

### Space / radius / border / shadow
Spacing scale: 4 8 12 16 24 32 48 64 96 (px)
Radius: 8px chips · 12px inputs/buttons · 20px cards · 32px page sections
Borders: 1.5px solid var(--ink) on INTERACTIVE (buttons, chips, intake box,
  graph nodes); 1px solid var(--ink-30) hairlines on static cards
Shadow: none while working (Harvey calm). One exception: verdict bar
  0 -8px 32px rgba(20,20,20,.08) when it slides up.

### Motion
120ms hover · 200ms ease-out state changes · 350ms panel slides
Active step bullet: 1.4s soft pulse loop
Graph edge draw-in: 400ms per edge
THE REVEAL: gold ring flash 600ms → settle crimson 400ms. The one big moment;
nothing else may animate this large.
prefers-reduced-motion: all animation off except opacity.

## 1.5 Icons & status verbs (ADDED 2026-07-04 — anti-AI-slop rules)
ICONS: @phosphor-icons/react DUOTONE ONLY (Titan's semantic icon voice — pairs
with editorial serif; audit confirmed mixing libraries was a Titan mistake).
NEVER emoji in UI, never mixed sets, never hand-rolled paths. Brand favicons
via Titan's BrandLogo chain: logo.dev → google.com/s2/favicons?domain=X&sz=128
→ serif monogram fallback, white-framed 6px-radius box at every size.
Key mappings: brain=thinking · search=retrieval · file-text=doc · calculator=
recompute · scale=verdict · building-2=vendor · user=employee · landmark=bank ·
shield-check=cleared · flame/alert-triangle=finding · lock=freeze · scroll=report.
STATUS VERBS (Vidit's Titan pattern — rotate while agent works, with icon):
  Cooking 🍳(chef-hat) · Brewing ☕(coffee) · Thinking 🧠(brain) · Working 🔨(hammer)
  → DERIVED from stream state (Titan derivePhase pattern), NOT timed: step
  running→Working · prose streaming→Cooking · wrap-up pulse language→Brewing ·
  else→Thinking. Icon crossfade (scale .6 rot -8° → 1/0°, .28s) + 1.8s breathe;
  word crossfade + CSS ink-shimmer (background-clip:text gradient sweep 2.4s).
  Header rule: "No spinner. No glowing avatar. Calm and legible." 
ANTI-AI-GENERATED RULES: no default shadows everywhere, no uniform 16px grid
monotony (vary rhythm), no lorem-y copy (every string written like product
copy), real file badges (PDF/CSV/HR) not emoji, hover states on EVERYTHING
interactive, one accent per view. Judge test: "does any element look like a
template default?" — if yes, restyle it.

## 2. Logo
FINAL MARK (Vidit, 2026-07-04): assets/logo.svg — black spiral coil on #2F5EA8 blue rounded square. Brand blue #2F5EA8 joins the palette as LOGO/BRAND color only (app icon, favicon, video sting, report seal recolor); the console UI palette (paper/ink/green/amber/crimson/gold) is unchanged — one accent per view still rules. Derive favicon + monochrome ink variant from this SVG during GO-5.

ORIGINAL CONCEPT (superseded):
Engraved-serif V (Fraunces-derived, custom-drawn SVG): the counter (negative
space inside the V) reads as a magnifier lens (circle + angled handle formed by
the V's right stroke). Thin horizontal crossbar at optical center = balance
scale. Lockups: (a) mark only (b) mark + VERITAS in Fraunces w600 small-caps
letterspaced +0.08em (c) crimson wax-seal circle variant for report header.
Ink on paper primary; paper on ink inverse. Favicon = mark at 32px, test legibility.

## 3. Console layout (1440 design target, min 1200)
┌sidebar┬────────── case timeline ──────────┬── right panel (tabs) ──┐
│ 56px  │  ~55% width, max 760px column     │ Money Graph | Evidence │
│ icons │                                   │                        │
│       │  [intake box docks bottom]        │                        │
└───────┴───────────────────────────────────┴────────────────────────┘
Bottom-right: FACECAM-SAFE ZONE 320×200px — nothing critical renders here.
Verdict bar: full-width, slides over bottom when DECIDE begins.
Sidebar items: Case, Data Room, Report, Audit Log, Settings (line icons, 1.5px).

## 4. Components (anatomy + states)

### 4.0 Onboarding (2 screens — ADDED 2026-07-04; replaces deck in video)
In-app first-run: Screen 1 (2.5s auto): logo stroke-draws + VERITAS small-caps
+ italic "The AI Forensic Auditor". Screen 2 (4s): "Companies lose 5% of
revenue to fraud. Audits catch 3% of it." — Fraunces, count-up numbers, then
[Open a case →] button. [Skip] top-right always. Paper bg, no other chrome.
Rule-proof: it's product onboarding, not a presentation; also self-pitches to
judges who open the live URL. Video opens through it (VO over, ~8s).

### 4.0b Data-source picker (connector gallery — ADDED 2026-07-04)
On "Open a case": grid of source tiles. "Upload books" = LIVE (zip flow).
QuickBooks · NetSuite · Stripe · Gmail tiles = honest roadmap, visibly labeled
"enterprise rollout", non-interactive. Signals platform, pre-answers the
"how does data get in?" judge question. NO fake-working connectors ever.

### 4.1 Intake box (the chat box — Wispr warmth)
Rounded 16px, 1.5px ink border, panel bg, focus = border→2px + subtle gold ring.
Placeholder: "Engage VERITAS — describe the examination…"
Left: paperclip icon-button. Whole box is a DROPZONE: dragover = dashed 2px
gold border + "Drop the books (.zip, .csv, .pdf)".
On files: chips inside box [📄 meridian_books.zip · 4.2 MB ·×], then ingest
strip below: mono counter animating "312 documents · 5,000 transactions ·
47 vendors · 18 employees" + thin progress bar (green fill).
Submit: ↵ or arrow button (ink circle, paper glyph). After submit the letter
collapses to a pinned "CASE BRIEF" card at timeline top (italic serif quote).
States: empty / typing / drag / ingesting / submitted / error (crimson text).

### 4.2 Case timeline (Harvey anatomy, the star)
Phase header row: "Working — Phase 2/6 · Statistical Sweep" (h3) + elapsed
mono timer + chevron. Vertical 1px ink-30 connector line down the left.
STEP anatomy:
  ● bullet 10px (amber pulse=active, green check=done, crimson=finding)
  Title 16px w600 ink: "Cross-referencing vendor registry against employees"
  Reasoning prose 14px ink-60, streams word-by-word, max 3 lines then
  "…more" expander.
  Inline artifacts (any, in flow):
   · doc card: 1px hairline, 12px radius: [icon] INV-0047 · invoice · "cited
     for sequential numbering" — click → Evidence tab, passage gold-highlighted
   · query chip (mono, 13px): benford(expenses) → z=4.2 ⚠   (amber if flagged)
   · entity chips: [🏢 Apex Supplies] [👤 R. Mehta] — click → graph focuses
   · hypothesis card: bordered 1.5px, status pill + statement + confidence
     meter (thin bar) + "evidence 4 for / 0 against" mono
Finished phase collapses: "✓ Sweep — 3 anomalies · 6 tool calls · 41s".
Auto-scroll follows newest; user scroll-up pauses follow (resume pill appears).

### 4.3 Money graph (react-flow)
Node = sticker: panel bg, 1.5px ink border, 12px radius, name + mono total.
Employee nodes get 👤 prefix, vendors 🏢, accounts 🏦.
Edge = payment flow, width ∝ log(amount), mono label on hover.
States: default ink → amber glow (under investigation) → green (cleared) →
crimson persistent (confirmed). REVEAL: gold ring flash on the two nodes,
then a NEW crimson edge labeled "SAME ADDRESS" draws between vendor & employee.
Camera: gentle auto-pan/zoom to active entity (600ms), user drag overrides 10s.
Minimap bottom-left (outside facecam zone). Empty state: faint grid +
"No entities yet — drop the books."

### 4.4 Evidence drawer (right tab 2)
Header: mono counter "23 claims · 23 cited · 0 uncited" (the flex).
Row: claim text (14px) + doc_id chips. Click → split view: doc rendered
(parchment card) with cited passage gold-tint highlighted, metadata sidebar
(type, date, entities, hash). Search box top (FTS). Filter pills: all /
confirmed / cleared / unproven.

### 4.5 Verdict bar
Hidden until DECIDE. Slides up 350ms with shadow. Contents left→right:
findings pill "1 CONFIRMED · 2 CLEARED · 1 UNPROVEN", quantified total in
28px mono crimson "$212,400", confidence "94%", then buttons:
[Approve Freeze: V-031] crimson fill, paper text, 1.5px ink border — requires
human click (says so on hover: "VERITAS never acts alone") ·
[Generate Report] ink fill. Post-report: green "✓ Case closed — 4m 12s".

### 4.6 Report page
Parchment #F6F1E4, 720px column, Fraunces headings, wax-seal logo top.
8 sections (scope · methodology · findings+exhibits · quantification table
(mono, ruled) · timeline · cleared items with reasons · unresolved · recommendations).
Exhibit chips inline → drawer. Footer: "Generated by VERITAS · every claim
cited · audit log attached". Print CSS → PDF pixel-perfect.

### 4.7 System states
Skeleton shimmer (paper→panel gradient) during ingest · SSE drop = amber toast
"Reconnecting…" auto-retry · empty states everywhere designed · error toast
crimson with retry. NOTHING may ever render as unstyled default.

## 5. Deck (3 slides, HTML — DEMOTED 2026-07-04: NOT in video ('no presentation' rule); optional live-call aid only. Stat content now lives as VIDEO OVERLAYS: animated text cards composited on console footage, same Fraunces/count-up treatment.)
Slide bg paper, ink text, Fraunces 84px, numbers count up 800ms on enter.
S1: logo mark draws in (stroke animation 600ms) + "VERITAS" small-caps +
    "The AI Forensic Auditor" italic ink-60.
S2: "Companies lose 5% of revenue to fraud." → "5%" scales, then
    "— $5 trillion a year. Audits catch 3% of it." "3%" in crimson.
S3: "VERITAS reads 100% of the books." + italic "Fraud has nowhere to hide."
Keyboard → advances; recorded at 1440×900.

## 6. Accessibility & QA bar
Contrast ≥ 4.5:1 all text (ink-60 on paper passes). Focus rings visible (gold).
All interactive = real buttons. Timeline is a live region (aria-live=polite).
Test at 1280 and 1440; no horizontal scroll; facecam zone stays clear.


## 7. Ported Titan UI patterns (audit 2026-07-04 — implement these verbatim-in-spirit)
1. Turn view-model bridge: SSE events → typed Turn {pulse, thinking, steps[],
   prose, artifact, workingSummary, done}; renderers never see wire events.
   + MOCK bridge with identical interface (?mock=1) → console demos/rehearses
   with zero backend. Build FIRST (it replaces fixtures/mock-server plan).
2. Step timeline: running = expanding ping ring (opacity .45→0, scale .95→1.3,
   1.8s) NEVER spinner; done = 13px green check badge bottom-right of icon;
   evidence chips under steps; collapse-on-answer to one-line QuietSummary
   ("✓ Read 14 invoices, vendor registry +2 · 41s ▾"), height-animated re-expand.
3. Typewriter smoother: rAF chase ~130 chars/s, word-boundary snap,
   safeMarkdownPrefix (trim unmatched **), 2px blinking caret, reduced-motion
   instant.
4. Scoped --console-* CSS var namespace (page-bg/surface/surface-2/ink/
   ink-muted/ink-faint/hairline/focus-ring), hairlines rgba(ink,.07) not
   shadows; half-pixel font sizes (13.5/14.5) + -0.005em tracking.
5. ONE easing everywhere: cubic-bezier(.22,1,.36,1); entrances opacity 0→1 +
   y 6→0 (.26-.45s); collapses height 0↔auto AnimatePresence initial={false}.
6. Citation pills: dashed accent underline + accent dot; TAP-to-expand inline
   tinted bubble w/ mono metadata ("VND-031 · p.2 · cited 3×"); lazy fetch +
   Map cache. → VERITAS evidence citations.
7. Auto-scroll: only when scrollHeight-scrollTop-clientHeight < 180px; 1px
   anchor div; gradient fade above docked intake.
8. Ambient backdrop: 22px dot grid + seeded node-constellation SVG whose
   pulse cadence accelerates while investigation is live.
9. SSE robustness trio: content-type guard w/ diagnostic error; finally-
   settled streaming flags; reverse-scan tool_result→step matching.
10. Mono 9.5px uppercase 0.12em-tracked eyebrows for section labels
   ("3 FINDINGS FILED"). Radii hierarchy 3/6/10/14/full — never uniform.
AVOID (Titan's own debt): god-hooks (typed small reducer day one) · dual
state stores · inline style-token soup (extract text-style utilities) ·
two icon libraries · dead parallel component generations.
