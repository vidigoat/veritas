"use client";
import { useEffect, useRef } from "react";
import { Books, Scales, ShieldCheck, Lock, LinkSimple, DownloadSimple, ListChecks } from "@phosphor-icons/react";
import type { CorpusState, Step, Retrieval } from "@/lib/useCorpus";
import { LogoMark } from "../Logo";
import { Swarm } from "./Swarm";

const SCHEME_LABEL: Record<string, string> = { shell_company: "Shell company", ghost_employee: "Ghost employee", duplicate_payment: "Duplicate payment", threshold_evasion: "Threshold evasion", expense_fraud: "Expense fraud", kickback: "Kickback", other: "Anomaly" };

const fmt = (n?: number) => (n ?? 0).toLocaleString("en-US");

export function CorpusThread({ state, engagement, onOpenDoc, onAsk, onApprove }: { state: CorpusState; engagement?: string; onOpenDoc: (id: string) => void; onAsk?: (q: string) => void; onApprove?: (target: string) => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    const el = endRef.current?.closest("[data-scroller]") as HTMLElement | null;
    if (!el) return;
    // follow the stream by default; stop when the user deliberately scrolls up,
    // resume when they return near the bottom — never hijack a reader
    const onWheel = (e: WheelEvent) => { if (e.deltaY < 0) follow.current = false; };
    const onTouch = () => { follow.current = false; };
    const onScroll = () => { if (el.scrollHeight - el.scrollTop - el.clientHeight < 90) follow.current = true; };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchmove", onTouch, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("wheel", onWheel); el.removeEventListener("touchmove", onTouch); el.removeEventListener("scroll", onScroll); };
  }, []);
  useEffect(() => {
    if (follow.current) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state]);
  const running = state.status === "running";

  return (
    <div className="mx-auto w-full max-w-[740px] px-5 pt-8 pb-40">
      <UserBubble text={engagement ?? "Audit these books — find any fraud, and cite the source documents."} />
      <div className="mt-7 flex gap-3.5">
        <Avatar />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="text-[15.5px] leading-relaxed text-ink">I&rsquo;ll read every document in these books, plan the examination, cross-reference the entities, and work each anomaly to a verdict &mdash; retrieving again whenever the evidence demands it, with an independent Nemotron panel on every finding. Watch.</div>

          {/* INGEST */}
          {state.corpus && <Label>Ingest</Label>}
          {state.corpus && <div className="text-[15px] text-ink">{state.corpus.company ? <>These books belong to <b>{state.corpus.company}</b>. </> : null}<b>{fmt(state.corpus.total)} documents</b> read{Object.keys(state.corpus.stats||{}).length ? <> — {Object.entries(state.corpus.stats).map(([k, v]) => `${fmt(v as number)} ${k.replace(/_/g, " ")}`).join(" · ")}</> : null}.</div>}

          {/* PLAN — the examiner states its plan, generated from THESE books */}
          {state.plan && <Label>Plan</Label>}
          {state.plan && (
            <div className="rounded-card border border-hairline bg-cream/60 px-4 py-3 fadeup">
              <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink"><ListChecks size={14} weight="duotone" /> Examination plan <span className="text-ink-30 font-normal">· {state.plan.model ?? "Qwen on Vultr"}</span></div>
              <ol className="mt-2 space-y-1">
                {state.plan.steps.map((st, i) => (
                  <li key={i} className="text-[13.5px] text-ink flex gap-2.5">
                    <span className="mono text-[11px] text-ink-30 mt-0.5 shrink-0">{i + 1}</span>
                    <span>{st.step}{st.why ? <span className="text-ink-50"> — {st.why}</span> : null}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* READ — the drone fleet */}
          {state.fleet.shards > 0 && <><Label>Read</Label><Swarm shards={state.fleet.shards} done={state.fleet.done} drones={state.fleet.drones} facts={state.fleet.fleetFacts} corpusTotal={state.corpus?.total} /></>}
          {state.fleet.facts != null && <div className="text-[15px] text-ink">The books are reconstructed from the documents: <b>{fmt(state.fleet.vendors)} vendors</b>, <b>{fmt(state.fleet.employees)} employees</b>, <b>{fmt(state.fleet.txns)} transactions</b> — {fmt(state.fleet.facts)} facts, each cited to its source page.</div>}

          {/* CROSS-REFERENCE — anomalies + the reveal */}
          {(state.anomalies.length > 0 || state.noAnomalies) && <Label>Cross-reference</Label>}
          {state.noAnomalies && <div className="text-[15px] text-ink">Cross-reference clean: no shared identities between vendors and employees, no unexplained duplicate patterns. These books hold up.</div>}
          {state.anomalies.map(a => (
            <div key={a.id} className={`rounded-card border px-3.5 py-2.5 ${a.strength >= 0.7 ? "bg-crimson-pale border-crimson/25" : "bg-cream border-hairline"}`}>
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <Scales size={14} weight="duotone" className={a.strength >= 0.7 ? "text-crimson" : "text-ink-50"} />
                <span className={a.strength >= 0.7 ? "text-crimson" : "text-ink"}>{SCHEME_LABEL[a.scheme]} — {a.title}</span>
              </div>
              <div className="text-[13px] text-ink-70 mt-1">{a.detail}</div>
              {a.proofDocs.length > 0 && <div className="flex gap-1.5 mt-2 flex-wrap">{a.proofDocs.map(d => <DocChip key={d} id={d} onOpen={onOpenDoc} />)}</div>}
            </div>
          ))}
          {state.reveals.map((r, i) => (
            <div key={i} className="rounded-card border border-crimson/40 bg-crimson text-white px-4 py-3.5 crimsonflash scalein">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider opacity-80"><LinkSimple size={13} weight="bold" /> The cross-reference lands</div>
              <div className="text-[16px] font-medium leading-snug mt-1.5">{r.label}.</div>
              <div className="text-[12.5px] opacity-80 mt-1">The identity match is exact — character for character. This is no longer an anomaly; it is a suspect.</div>
            </div>
          ))}

          {/* INVESTIGATE — plan → retrieve → reason → retrieve again → decide */}
          {state.steps.length > 0 && <Label>Investigate + Verify</Label>}
          {state.steps.map(st => <StepBlock key={st.stepId} st={st} running={running} onOpenDoc={onOpenDoc} />)}

          {/* FINDINGS + CLEARED + UNPROVEN + VERDICT */}
          {state.findings.map(f => <FindingCard key={f.id} f={f} onOpenDoc={onOpenDoc} />)}
          {state.cleared.map((c, i) => (
            <div key={i} className="mt-2 rounded-card border border-nvidia/30 bg-nvidia-pale px-4 py-3 scalein">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#4a7300" }}>Cleared — not fraud</div>
              <div className="text-[14px] text-ink mt-1">{c.anomaly?.title}</div>
              {c.why && <div className="text-[13px] text-ink-70 mt-0.5">{c.why}</div>}
            </div>
          ))}
          {state.unproven.map((u, i) => (
            <div key={i} className="mt-2 rounded-card border border-hairline bg-cream px-4 py-3 scalein">
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-50">Unproven — escalated for manual review</div>
              <div className="text-[14px] text-ink mt-1">{u.anomaly?.title}</div>
              <div className="text-[13px] text-ink-70 mt-0.5">The evidence cuts both ways, so VERITAS does not accuse. A human examiner gets the file.</div>
            </div>
          ))}

          {/* ACTIONS — human-in-the-loop freezes, with receipts */}
          {state.freezes.map(f => (
            <div key={f.target} className="mt-2 rounded-card border border-crimson/25 bg-white px-4 py-3 flex items-center gap-3 flex-wrap scalein">
              <Lock size={16} weight="duotone" className="text-crimson shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink">Freeze payments to {f.target}</div>
                <div className="text-[12.5px] text-ink-50">{f.receiptId ? <>Executed — receipt <span className="mono">{f.receiptId}</span></> : f.failed ? <span className="text-crimson">Couldn&rsquo;t reach the engine — try again.</span> : state.replay ? "In the live run, a human approves this before anything moves." : "The agent requests approval before acting. Nothing moves without a human."}</div>
              </div>
              {!f.receiptId && !state.replay && <button onClick={() => onApprove?.(f.target)} className="bg-crimson text-white font-medium text-[12.5px] px-3.5 py-2 rounded-control hover:opacity-90 shrink-0">{f.failed ? "Retry freeze" : "Approve freeze"}</button>}
              {f.receiptId && <span className="text-nvidia font-semibold text-[12.5px] shrink-0">✓ Frozen</span>}
            </div>
          ))}

          {state.verdict && state.findings.length > 0 && <VerdictCard state={state} />}
          {state.verdict && state.findings.length === 0 && <div className="mt-3 rounded-card border border-nvidia/30 bg-nvidia-pale px-4 py-3 text-[15px]"><b>No material findings.</b> Every anomaly cleared — the books present no evidence of fraud. VERITAS does not cry wolf.</div>}

          {state.status === "error" && (
            <div className="rounded-card border border-crimson/25 bg-crimson-pale px-4 py-3 text-[14px]">
              <b className="text-crimson">The engine hit a snag.</b> {state.error ?? "Something went wrong."}{" "}
              <button onClick={() => location.reload()} className="underline underline-offset-2 font-medium">Reload and retry</button>
            </div>
          )}

          {running && <div className="flex items-center gap-1.5 pt-1"><span className="tdot" /><span className="tdot" style={{ animationDelay: ".16s" }} /><span className="tdot" style={{ animationDelay: ".32s" }} /></div>}
        </div>
      </div>

      {/* INTERROGATE — follow-up turns in the same thread */}
      {state.qa.map((t, i) => t.role === "user" ? (
        <div key={i} className="mt-6"><UserBubble text={t.text} /></div>
      ) : (
        <div key={i} className="mt-5 flex gap-3.5 fadeup">
          <Avatar />
          <div className="min-w-0 flex-1 space-y-2.5">
            {t.retrieval && (
              <div className="flex items-start gap-2.5 border rounded-card px-3.5 py-2.5 max-w-[600px] bg-ice-pale" style={{ borderColor: "#BBD9F3" }}>
                <div className="w-7 h-7 rounded-control flex items-center justify-center shrink-0 mt-px" style={{ background: "#0B69C7" }}><Books size={14} weight="duotone" color="#fff" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold" style={{ color: "#0B4E93" }}>{t.retrieval.model} · re-read the books for this question ({fmt(t.retrieval.candidates)} candidate pages)</div>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">{t.retrieval.surfaced.map(d => <DocChip key={d.docId} id={d.docId} score={d.score} onOpen={onOpenDoc} />)}</div>
                </div>
              </div>
            )}
            {t.text && <div className="text-[15px] leading-relaxed text-ink whitespace-pre-wrap">{renderCited(t.text, onOpenDoc)}</div>}
            {t.streaming && !t.text && <div className="flex items-center gap-1.5 pt-0.5"><span className="tdot" /><span className="tdot" style={{ animationDelay: ".16s" }} /><span className="tdot" style={{ animationDelay: ".32s" }} /></div>}
          </div>
        </div>
      ))}

      {/* suggested questions once the exam is filed */}
      {state.status === "done" && !state.replay && state.qa.length === 0 && state.findings.length > 0 && (
        <div className="mt-6 flex gap-2 flex-wrap justify-end fadeup">
          {["How do you know it's a shell company?", "Could the duplicate payment be innocent?", "Who approved the fraudulent invoices?"].map(q => (
            <button key={q} onClick={() => onAsk?.(q)} className="text-[12.5px] border border-line rounded-chip px-3 py-1.5 text-ink-70 hover:border-ink hover:text-ink transition-colors">{q}</button>
          ))}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

/** One investigation, rendered in the exact order it happened:
 *  hypothesis → retrieval №1 → reasoning → the agent's OWN follow-up retrieval → verdict. */
function StepBlock({ st, running, onOpenDoc }: { st: Step; running: boolean; onOpenDoc: (id: string) => void }) {
  const nRet = st.items.filter(i => i.kind === "retrieval").length;
  const awaiting = running && !st.verdict;
  return (
    <div className="fadeup space-y-2">
      {st.items.map((it, i) => it.kind === "text"
        ? <div key={i} className="text-[15px] leading-relaxed text-ink">{it.text}</div>
        : <RetrievalCard key={i} r={it.r} onOpenDoc={onOpenDoc} />)}
      {awaiting && nRet > 0 && !st.panel && (
        <div className="text-[13px] shimmer w-fit">{nRet > 1 ? "weighing both retrieval rounds against the innocent explanation…" : "reading the retrieved pages, deciding what to fetch next…"}</div>
      )}
      {st.panel && <PanelCard panel={st.panel} />}
      {st.panel?.summary && st.panel.done && <div className={`text-[13px] font-medium ${st.panel.upheld ? "text-nvidia" : "text-crimson"}`}>{st.panel.summary}</div>}
    </div>
  );
}

function RetrievalCard({ r, onOpenDoc }: { r: Retrieval; onOpenDoc: (id: string) => void }) {
  return (
    <div className="flex items-start gap-2.5 border rounded-card px-3.5 py-2.5 max-w-[620px] bg-ice-pale" style={{ borderColor: "#BBD9F3" }}>
      <div className="w-7 h-7 rounded-control flex items-center justify-center shrink-0 mt-px" style={{ background: "#0B69C7" }}><Books size={14} weight="duotone" color="#fff" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold" style={{ color: "#0B4E93" }}>
          {r.model} {r.followup ? "· retrieving AGAIN — the agent's own follow-up query" : `· ranked ${fmt(r.candidates)} candidate page${r.candidates === 1 ? "" : "s"}`}
        </div>
        {r.query && <div className="text-[12px] text-ink-50 mt-0.5 italic">&ldquo;{r.query}&rdquo;</div>}
        <div className="flex gap-1.5 mt-1.5 flex-wrap">{r.surfaced.map(d => <DocChip key={d.docId} id={d.docId} score={d.score} onOpen={onOpenDoc} />)}</div>
      </div>
    </div>
  );
}

/** Render [DOC-ID] citations inside an answer as clickable chips.
 *  Doc ids mix cases (HR-E015-record, F-1) — match any word-ish id. */
function renderCited(text: string, onOpen: (id: string) => void) {
  const parts = text.split(/\[([A-Za-z][A-Za-z0-9_\-]{1,40})\]/g);
  return parts.map((p, i) => i % 2 === 1 ? <DocChip key={i} id={p} onOpen={onOpen} inline /> : <span key={i}>{p}</span>);
}

function PanelCard({ panel }: { panel: any }) {
  return (
    <div className="rounded-card border max-w-[620px] bg-nvidia-pale overflow-hidden" style={{ borderColor: "#C6E39A" }}>
      <div className="flex items-center gap-2 px-3.5 py-2 border-b" style={{ borderColor: "#D9EBBF" }}>
        <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: "#76B900" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M4 6h6a5 5 0 015 5v7H4V6zm2 2v8h7v-5a3 3 0 00-3-3H6z"/><path d="M14 6h6v12h-2V8h-4V6z"/></svg></div>
        <span className="text-[12.5px] font-semibold" style={{ color: "#4a7300" }}>NVIDIA Nemotron panel · independent review</span>
        {panel.done && <span className={`mono text-[11px] ml-auto font-semibold ${panel.upheld ? "text-nvidia" : "text-crimson"}`}>{panel.upheld ? "UPHELD" : "REFUTED"}</span>}
      </div>
      <div className="px-3.5 py-2 space-y-1.5">
        {(panel.votes ?? [{ lens: "correctness" }, { lens: "innocent explanation" }, { lens: "sufficiency" }]).map((v: any, i: number) => (
          <div key={i} className="flex items-start gap-2 text-[12.5px]">
            {panel.votes ? <span className={`mono text-[11px] mt-px ${v.abstained ? "text-ink-30" : v.upheld ? "text-nvidia" : "text-crimson"}`}>{v.abstained ? "○" : v.upheld ? "✓" : "✗"}</span> : <span className="w-2 h-2 rounded-full mt-1 pulse" style={{ background: "#76B900" }} />}
            <span className="text-ink-50 w-[120px] shrink-0">{v.lens}</span>
            <span className="text-ink-70">{v.reasoning ?? "reviewing…"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FindingCard({ f, onOpenDoc }: { f: any; onOpenDoc: (id: string) => void }) {
  return (
    <div className="mt-2 rounded-card border border-crimson/25 bg-white shadow-card scalein">
      <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-crimson border-b border-crimson/15 bg-crimson-pale flex items-center gap-1.5"><ShieldCheck size={13} weight="fill" /> {SCHEME_LABEL[f.scheme] ?? "Finding"} · {f.id}{f.nemotron?.overridden && <span className="ml-auto normal-case font-medium tracking-normal text-amber-700">filed over panel objection — document-proven</span>}</div>
      <div className="p-4">
        <div className="flex items-baseline gap-3"><div className="mono text-[24px] font-semibold text-crimson leading-none">€{fmt(Math.round(f.amount))}</div><div className="text-[12.5px] text-ink-50">at risk · {Math.round((f.confidence ?? 0) * 100)}% confidence</div></div>
        <div className="text-[14.5px] leading-relaxed text-ink mt-2.5">{f.statement}</div>
        <div className="mt-3 space-y-1.5">{(f.evidence ?? []).slice(0, 5).map((e: any, i: number) => <div key={i} className="text-[13px] text-ink-70 flex gap-2"><span className="text-crimson mt-px">▸</span><span>{e.claim} {(e.doc_ids ?? e.docIds ?? []).map((d: string) => <DocChip key={d} id={d} onOpen={onOpenDoc} inline />)}</span></div>)}</div>
      </div>
    </div>
  );
}

function VerdictCard({ state }: { state: CorpusState }) {
  const total = state.findings.reduce((s, f) => s + (f.amount || 0), 0);
  const reviewed = state.findings.filter(f => f.nemotron?.upheld !== false).length;
  return (
    <div className="mt-3 rounded-card border border-crimson/30 bg-white shadow-card scalein">
      <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-crimson border-b border-crimson/15 bg-crimson-pale">Verdict</div>
      <div className="p-4">
        <div className="flex items-baseline gap-4 flex-wrap">
          <div className="mono text-[28px] font-semibold text-crimson leading-none">€{fmt(Math.round(total))}</div>
          <div className="text-[13px] text-ink-50">total at risk · {state.findings.length} finding{state.findings.length !== 1 ? "s" : ""} · {state.cleared.length} cleared · {state.unproven.length > 0 ? `${state.unproven.length} escalated · ` : ""}{reviewed}/{state.findings.length} upheld by the Nemotron panel</div>
        </div>
        <button onClick={() => downloadReport(state)} className="mt-3.5 inline-flex items-center gap-2 bg-ink text-white font-medium text-[13px] px-4 py-2.5 rounded-control hover:bg-fire transition-colors">
          <DownloadSimple size={15} weight="bold" /> Download the cited examination report
        </button>
      </div>
    </div>
  );
}

/** The artifact an audit committee walks away with — built from the filed case. */
function downloadReport(state: CorpusState) {
  const L: string[] = [];
  const company = state.corpus?.company ?? "the audited company";
  const total = state.findings.reduce((s, f) => s + (f.amount || 0), 0);
  L.push(`# VERITAS — Forensic Examination Report`);
  L.push(``);
  L.push(`**Subject:** ${company}  `);
  L.push(`**Corpus:** ${fmt(state.corpus?.total)} documents  `);
  L.push(`**Verdict:** ${state.findings.length} confirmed finding(s), €${fmt(Math.round(total))} at risk · ${state.cleared.length} lead(s) cleared · ${state.unproven.length} escalated  `);
  L.push(`**Method:** plan → read all documents → cross-reference identities → per-anomaly investigation with VultronRetriever retrieval (twice per anomaly) → independent NVIDIA Nemotron panel review · all inference on Vultr Serverless Inference`);
  L.push(``);
  for (const f of state.findings) {
    L.push(`## ${f.id} — ${SCHEME_LABEL[f.scheme] ?? f.scheme} · €${fmt(Math.round(f.amount))} at risk`);
    L.push(``);
    L.push(f.statement);
    L.push(``);
    L.push(`Confidence: ${Math.round((f.confidence ?? 0) * 100)}% · Nemotron panel: ${f.nemotron?.upheld === false ? "objection recorded (filed on dispositive document evidence)" : "upheld"}`);
    L.push(``);
    L.push(`**Evidence**`);
    for (const e of f.evidence ?? []) L.push(`- ${e.claim} _[${(e.doc_ids ?? e.docIds ?? []).join(", ")}]_`);
    if (f.recommendedActions?.length) { L.push(``); L.push(`**Recommended actions**`); for (const a of f.recommendedActions) L.push(`- ${a}`); }
    L.push(``);
  }
  if (state.cleared.length) {
    L.push(`## Cleared leads — investigated and exonerated`);
    L.push(``);
    for (const c of state.cleared) L.push(`- **${c.anomaly?.title ?? "lead"}** — ${c.why ?? "innocent explanation holds"}`);
    L.push(``);
  }
  if (state.unproven.length) {
    L.push(`## Escalated for manual review`);
    L.push(``);
    for (const u of state.unproven) L.push(`- ${u.anomaly?.title ?? "lead"} — evidence cuts both ways; no accusation filed`);
    L.push(``);
  }
  for (const f of state.freezes) if (f.receiptId) L.push(`**Action executed:** payments to ${f.target} frozen — receipt ${f.receiptId}`);
  L.push(``);
  L.push(`---`);
  L.push(`_Every dollar figure recomputed from the ledger; every claim cited to a source document. Generated by VERITAS on Vultr._`);
  const blob = new Blob([L.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `VERITAS-examination-${(company || "report").replace(/[^\w]+/g, "-")}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Avatar() { return <div className="shrink-0 mt-0.5"><LogoMark size={30} /></div>; }
function UserBubble({ text }: { text: string }) { return <div className="flex justify-end"><div className="max-w-[80%] bg-cream border border-hairline text-ink rounded-[16px] rounded-br-[5px] px-4 py-2.5 text-[14.5px] leading-relaxed">{text}</div></div>; }
function Label({ children }: { children: React.ReactNode }) { return <div className="flex items-center gap-2.5 pt-2"><span className="mono text-[10.5px] font-semibold text-ink-30 uppercase tracking-[0.14em]">{children}</span><div className="flex-1 h-px bg-line" /></div>; }
function DocChip({ id, score, onOpen, inline }: { id: string; score?: number; onOpen: (id: string) => void; inline?: boolean }) {
  return <button onClick={() => onOpen(id)} className={`inline-flex items-center gap-1.5 bg-ice-pale border border-ice/20 rounded-chip px-2 py-0.5 text-[12px] font-medium text-ice hover:bg-ice hover:text-white transition-colors ${inline ? "mx-0.5 align-middle" : ""}`} title="open the source document">
    <span className="mono text-[8px] font-bold opacity-70">DOC</span>{id}{score != null && <span className="mono text-[10px] opacity-70">{score}</span>}</button>;
}
