"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ListChecks, Check, CaretDown, Books } from "@phosphor-icons/react";
import type { CorpusState } from "@/lib/useCorpus";
import { LogoMark } from "../Logo";
import { Swarm } from "./Swarm";
import { PhaseHeader } from "./stream/PhaseHeader";
import { InvestigationRail } from "./stream/InvestigationRail";
import { VerdictBanner, RecommendedActions, DoneFooter, FindingCard, ClearedCard, UnprovenCard } from "./stream/Findings";
import { EASE, SCHEME_LABEL, fmt, DocChip, renderCited } from "./stream/kit";

const API = (typeof window !== "undefined" && (window as any).__VERITAS_API__)
  || process.env.NEXT_PUBLIC_API_BASE
  || (typeof window !== "undefined" && window.location.port === "3000" ? "http://localhost:8787" : "");

export function CorpusThread({ state, engagement, onOpenDoc, onAsk, onApprove }: { state: CorpusState; engagement?: string; onOpenDoc: (id: string) => void; onAsk?: (q: string) => void; onApprove?: (target: string) => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [showWorking, setShowWorking] = useState(false);
  const [caseId, setCaseId] = useState<string | undefined>(state.caseId);
  useEffect(() => { try { setCaseId(state.caseId ?? sessionStorage.getItem("veritas-case") ?? undefined); } catch { /* noop */ } }, [state.caseId]);

  useEffect(() => {
    const el = endRef.current?.closest("[data-scroller]") as HTMLElement | null;
    if (!el) return;
    // follow the stream by default; release when the reader scrolls up, resume near the bottom
    const onWheel = (e: WheelEvent) => { if (e.deltaY < 0) follow.current = false; };
    const onTouch = () => { follow.current = false; };
    const onScroll = () => { if (el.scrollHeight - el.scrollTop - el.clientHeight < 90) follow.current = true; };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchmove", onTouch, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("wheel", onWheel); el.removeEventListener("touchmove", onTouch); el.removeEventListener("scroll", onScroll); };
  }, []);
  useEffect(() => { if (follow.current) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state]);

  const running = state.status === "running";
  const done = state.status === "done";
  const c = state.corpus;
  const f = state.fleet;

  // progressive disclosure: once the run moves past a section, collapse it to a one-liner
  const hasPlan = !!state.plan;
  const hasRead = f.shards > 0;
  const hasCross = state.anomalies.length > 0 || !!state.noAnomalies;
  const hasSteps = state.steps.length > 0;
  const ingestPast = hasPlan || hasRead || hasCross || hasSteps || done;
  const planPast = hasRead || hasCross || hasSteps || done;
  const readPast = hasCross || hasSteps || done;
  const crossPast = hasSteps || done;

  return (
    <div className="mx-auto w-full max-w-[740px] px-5 pt-6 pb-40">
      <UserBubble text={engagement ?? "Audit these books — find any fraud, and cite the source documents."} />
      <div className="mt-5 flex gap-3.5">
        <Avatar />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="text-[15.5px] leading-relaxed text-ink">I&rsquo;ll read every document in these books, plan the examination, cross-reference the entities, and work each lead to a verdict &mdash; retrieving again whenever the evidence demands it, with an independent review on every finding. Watch.</div>

          {/* INGEST */}
          {c && (
            <Section label="Ingest" past={ingestPast}
              summary={<>Ingested <b className="font-semibold text-ink-70">{fmt(c.total)}</b> documents{c.company ? ` · ${c.company}` : ""}</>}>
              <div className="text-[15px] text-ink">
                {c.company ? <>These books belong to <b>{c.company}</b>. </> : null}
                <b>{fmt(c.total)} documents</b> read{Object.keys(c.stats || {}).length ? <> — {Object.entries(c.stats).map(([k, v]) => `${fmt(v as number)} ${k.replace(/_/g, " ")}`).join(" · ")}</> : null}.
              </div>
            </Section>
          )}

          {/* PLAN */}
          {state.plan && (
            <Section label="Plan" past={planPast}
              summary={<>Examination plan · {state.plan.steps.length} step{state.plan.steps.length !== 1 ? "s" : ""}</>}>
              <PlanCard plan={state.plan} />
            </Section>
          )}

          {/* READ — the drone fleet */}
          {f.shards > 0 && (
            <Section label="Read" past={readPast}
              summary={<>Read <b className="font-semibold text-ink-70">{fmt(c?.total)}</b> documents{f.facts != null ? <> · {fmt(f.facts)} facts</> : null}</>}>
              <Swarm shards={f.shards} done={f.done} drones={f.drones} facts={f.fleetFacts} corpusTotal={c?.total} />
              {f.facts != null && (
                <div className="text-[15px] text-ink mt-3">The books are reconstructed from the documents: <b>{fmt(f.vendors)} vendors</b>, <b>{fmt(f.employees)} employees</b>, <b>{fmt(f.txns)} transactions</b> — {fmt(f.facts)} facts, each cited to its source page.</div>
              )}
            </Section>
          )}

          {/* CROSS-REFERENCE — leads, framed as suspects (never verdicts) */}
          {(state.anomalies.length > 0 || state.noAnomalies) && (
            <Section label="Cross-reference" past={crossPast}
              summary={state.noAnomalies
                ? <>Cross-reference clean · no shared identities</>
                : <>Cross-reference · {state.anomalies.length} lead{state.anomalies.length !== 1 ? "s" : ""} to work</>}>
              {state.noAnomalies && <div className="text-[15px] text-ink">Cross-reference clean: no shared identities between vendors and employees, no unexplained duplicate patterns. These books hold up.</div>}
              {state.anomalies.length > 0 && <CrossRefSummary anomalies={state.anomalies} />}
            </Section>
          )}

          {/* INVESTIGATE + VERIFY — the live rail, or the collapsed "show working" */}
          {state.steps.length > 0 && <Label>Investigate + Verify</Label>}
          {state.steps.length > 0 && (running || showWorking ? (
            <InvestigationRail steps={state.steps} findings={state.findings} running={running} onOpenDoc={onOpenDoc} showResolutions={running} />
          ) : (
            <CollapsedWorking leads={state.steps.length} elapsedS={state.elapsedS} onExpand={() => setShowWorking(true)} />
          ))}
          {done && showWorking && state.steps.length > 0 && (
            <button onClick={() => setShowWorking(false)} className="text-[12.5px] text-ink-50 hover:text-ink inline-flex items-center gap-1.5"><CaretDown size={12} className="rotate-180" /> hide working</button>
          )}

          {/* SETTLE — the clean payoff, once the run is filed */}
          {done && (
            <AnimatePresence>
              <motion.div key="settle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="space-y-4">
                {state.findings.length > 0 && <Label>Findings</Label>}
                {state.findings.map(fn => <FindingCard key={fn.id} f={fn} onOpenDoc={onOpenDoc} reveal={false} />)}
                {state.cleared.map((cl, i) => <ClearedCard key={i} title={cl.anomaly?.title} why={cl.why} />)}
                {state.unproven.map((u, i) => <UnprovenCard key={i} title={u.anomaly?.title} />)}
                {state.findings.length > 0 ? <VerdictBanner state={state} /> : (
                  <div className="rounded-card border border-nvidia/30 bg-nvidia-pale px-4 py-3 text-[15px]"><b>No material findings.</b> Every lead cleared — the books present no evidence of fraud. VERITAS does not cry wolf.</div>
                )}
                <RecommendedActions findings={state.findings} />
                <DoneFooter state={state} api={API || undefined} caseId={caseId} />
              </motion.div>
            </AnimatePresence>
          )}

          {state.status === "error" && (
            <div className="rounded-card border border-crimson/25 bg-crimson-pale px-4 py-3 text-[14px]">
              <b className="text-crimson">The engine hit a snag.</b> {state.error ?? "Something went wrong."}{" "}
              <button onClick={() => location.reload()} className="underline underline-offset-2 font-medium">Reload and retry</button>
            </div>
          )}

          {/* LIVE PULSE — the breathing phase header, pinned to the stream head */}
          {running && state.phase && <PhaseHeader title={state.phase.title} detail={pulseDetail(state)} />}
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
            {t.text && <div className="text-[15px] leading-relaxed text-ink whitespace-pre-wrap">{renderCited(t.text, onOpenDoc)}{t.streaming && <span className="caret" />}</div>}
            {t.streaming && !t.text && <div className="flex items-center gap-1.5 pt-0.5"><span className="tdot" /><span className="tdot" style={{ animationDelay: ".16s" }} /><span className="tdot" style={{ animationDelay: ".32s" }} /></div>}
          </div>
        </div>
      ))}

      {/* suggested questions once the exam is filed */}
      {done && !state.replay && state.qa.length === 0 && state.findings.length > 0 && (
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

/** A collapsing section: full content (label header + body) while active,
 *  a tidy one-line summary once the run has moved past it. Reader can toggle. */
function Section({ label, past, summary, children }: { label: string; past: boolean; summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(!past);
  const touched = useRef(false);
  useEffect(() => { if (!touched.current) setOpen(!past); }, [past]);
  const toggle = () => { touched.current = true; setOpen(o => !o); };
  return (
    <div>
      {open ? (
        <button onClick={toggle} disabled={!past} className="group flex items-center gap-2.5 pt-0.5 w-full">
          <span className="mono text-[10.5px] font-semibold text-ink-30 uppercase tracking-[0.14em]">{label}</span>
          <div className="flex-1 h-px bg-line" />
          {past && <CaretDown size={12} className="shrink-0 rotate-180 text-ink-30 group-hover:text-ink-50 transition-colors" />}
        </button>
      ) : (
        <button onClick={toggle} className="group flex items-center gap-2 pt-0.5 w-full text-left text-[13px] text-ink-50 hover:text-ink transition-colors">
          <Check size={13} weight="bold" style={{ color: "#4a7300" }} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{summary}</span>
          <CaretDown size={12} className="shrink-0 text-ink-30 group-hover:text-ink-50" />
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="sec-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} style={{ overflow: "hidden" }}>
            <div className="mt-2.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── plain-English pulse under the live phase word ──
function pulseDetail(state: CorpusState): string {
  const ph = state.phase?.title;
  if (!ph) return "";
  if (ph === "Ingest") return "reading every document in";
  if (ph === "Plan") return "drawing up the examination plan";
  if (ph === "Read") return `${state.fleet.done}/${state.fleet.shards} document shards read`;
  if (ph === "Cross-reference") return "matching identities across the books";
  if (ph === "Investigate + Verify") {
    if (state.steps.some(s => s.hypStreaming)) return "thinking through a lead";
    if (state.steps.some(s => s.panel && !s.panel.done)) return "an independent review is running";
    const worked = state.steps.filter(s => s.resolution).length;
    return `${worked}/${state.steps.length} lead${state.steps.length !== 1 ? "s" : ""} worked`;
  }
  if (ph === "Report") return "filing the examination";
  return "";
}

/** Small section-divider label (used for the live Investigate + Verify head). */
function Label({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 pt-0.5">
      <span className="mono text-[10.5px] font-semibold text-ink-30 uppercase tracking-[0.14em]">{children}</span>
      <div className="flex-1 h-px bg-line" />
    </div>
  );
}

function CrossRefSummary({ anomalies }: { anomalies: { scheme: string }[] }) {
  const counts = new Map<string, number>();
  for (const a of anomalies) counts.set(a.scheme, (counts.get(a.scheme) ?? 0) + 1);
  const parts = [...counts.entries()].map(([k, v]) => `${v} ${SCHEME_LABEL[k] ?? "anomaly"}${v > 1 ? "s" : ""}`);
  return (
    <div className="text-[15px] text-ink">
      Cross-reference surfaced <b>{anomalies.length} lead{anomalies.length !== 1 ? "s" : ""}</b> to work — {parts.join(", ")}. Nothing is called fraud yet; each is investigated to a verdict below.
    </div>
  );
}

function PlanCard({ plan }: { plan: { steps: { step: string; why?: string }[]; model?: string } }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="rounded-card border border-hairline bg-cream/60 px-4 py-3">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink"><ListChecks size={14} weight="duotone" /> Examination plan</div>
      <motion.ol className="mt-2 space-y-1" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
        {plan.steps.map((st, i) => (
          <motion.li key={i} variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }} transition={{ duration: 0.3, ease: EASE }} className="text-[13.5px] text-ink flex gap-2.5">
            <span className="mono text-[11px] text-ink-30 mt-0.5 shrink-0">{i + 1}</span>
            <span>{st.step}{st.why ? <span className="text-ink-50"> — {st.why}</span> : null}</span>
          </motion.li>
        ))}
      </motion.ol>
    </motion.div>
  );
}

function CollapsedWorking({ leads, elapsedS, onExpand }: { leads: number; elapsedS?: number; onExpand: () => void }) {
  return (
    <button onClick={onExpand} className="inline-flex items-center gap-2 text-[13px] text-ink-50 hover:text-ink transition-colors">
      <Check size={14} weight="bold" style={{ color: "#4a7300" }} />
      <span>Examined {leads} lead{leads !== 1 ? "s" : ""}{elapsedS != null ? ` in ${elapsedS}s` : ""}</span>
      <span className="text-ink-30">·</span>
      <span className="inline-flex items-center gap-1 text-ink-50">show working <CaretDown size={12} /></span>
    </button>
  );
}

function Avatar() { return <div className="shrink-0 mt-0.5"><LogoMark size={30} /></div>; }
function UserBubble({ text }: { text: string }) { return <div className="flex justify-end"><div className="max-w-[80%] bg-cream border border-hairline text-ink rounded-[16px] rounded-br-[5px] px-4 py-2.5 text-[14.5px] leading-relaxed">{text}</div></div>; }
