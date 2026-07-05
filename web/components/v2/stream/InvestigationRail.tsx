"use client";
/**
 * InvestigationRail — the vertical "watch it think" timeline.
 *
 * While a lead is ACTIVE it stays fully expanded (streamed thinking, both
 * searches, the review panel). The moment it RESOLVES it collapses to ONE
 * compact row — a status glyph + scheme · subject + € amount + a chevron —
 * so the currently-active work is what fills the screen. Click the row (or
 * chevron) to re-expand any worked lead.
 */
import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MagnifyingGlass, Brain, Scales, Check, CaretDown } from "@phosphor-icons/react";
import type { Step, Finding, Retrieval, StepPanel } from "@/lib/useCorpus";
import { EASE, SCHEME_LABEL, fmt, DocChip, BrandBadge, VultrFavicon, NvidiaFavicon } from "./kit";
import { RevealText } from "./PhaseHeader";
import { FindingCard, ClearedCard, UnprovenCard } from "./Findings";

// hide the machine-readable tail the server sometimes leaks into streamed prose
function cleanHyp(h?: string): string {
  if (!h) return "";
  return h.replace(/\n\s*(FOLLOW[-\s]?UP|VERDICT|CONFIDENCE)\s*:[\s\S]*$/i, "").trim();
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function InvestigationRail({ steps, findings, running, onOpenDoc, showResolutions = true, currency = "\u20AC" }: { steps: Step[]; findings: Finding[]; running: boolean; onOpenDoc: (id: string) => void; showResolutions?: boolean; currency?: string }) {
  return (
    <div className="space-y-3">
      {steps.map(st => <StepBlock key={st.stepId} st={st} findings={findings} running={running} onOpenDoc={onOpenDoc} showResolutions={showResolutions} currency={currency} />)}
    </div>
  );
}

function StepBlock({ st, findings, running, onOpenDoc, showResolutions, currency = "\u20AC" }: { st: Step; findings: Finding[]; running: boolean; onOpenDoc: (id: string) => void; showResolutions: boolean; currency?: string }) {
  const scheme = SCHEME_LABEL[st.scheme ?? "other"] ?? "anomaly";
  const resolved = !!st.resolution;
  const active = running && !resolved;
  const kind = st.resolution?.kind;
  const first = st.retrievals.find(r => !r.followup) ?? st.retrievals[0];
  const followups = st.retrievals.filter(r => r !== first);
  const hyp = cleanHyp(st.hypothesis);
  const finding = kind === "confirmed" ? findings.find(f => f.id === st.resolution?.findingId) : null;

  // resolved leads collapse by default; the reader can expand any of them
  const [open, setOpen] = useState(!resolved);
  const touched = useRef(false);
  useEffect(() => { if (!touched.current) setOpen(!resolved); }, [resolved]);
  const toggle = () => { touched.current = true; setOpen(o => !o); };
  const collapsed = resolved && !open;

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: EASE }} className="relative">
      {/* head — a one-line compact row once resolved, the full lead head while working */}
      {collapsed ? (
        <CompactRow scheme={scheme} title={st.title} amount={finding?.amount} kind={kind!} onClick={toggle} currency={currency} />
      ) : (
        <div className="flex items-start gap-3">
          <StepHead active={active} resolution={st.resolution} />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="mono text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-30">
              Lead{resolved ? " · worked" : active ? " · investigating" : ""}
            </div>
            <div className="text-[15px] font-medium text-ink leading-snug">
              A possible {scheme}{st.title ? <span className="text-ink-70"> — {st.title}</span> : null}
            </div>
          </div>
          {resolved && (
            <button onClick={toggle} className="shrink-0 mt-0.5 text-ink-30 hover:text-ink transition-colors" title="collapse this lead">
              <CaretDown size={14} className="rotate-180" />
            </button>
          )}
        </div>
      )}

      {/* body — the timeline of moves + the payoff; height-animated collapse/expand */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div key="body" initial={resolved ? { height: 0, opacity: 0 } : false} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.38, ease: EASE }} style={{ overflow: "hidden" }}>
            <div className="relative mt-2.5 ml-[14px] pl-7 space-y-2.5 border-l" style={{ borderColor: "#E8E8E5" }}>
              {first && <SubStep icon={<BrandBadge><VultrFavicon size={13} /></BrandBadge>}><RetrievalBody r={first} onOpenDoc={onOpenDoc} /></SubStep>}
              {(hyp || st.hypStreaming) && <SubStep icon={<IconBadge><Brain size={13} weight="duotone" /></IconBadge>}><Thinking text={hyp} streaming={!!st.hypStreaming} /></SubStep>}
              {followups.map((r, i) => <SubStep key={i} icon={<BrandBadge><VultrFavicon size={13} /></BrandBadge>}><RetrievalBody r={r} onOpenDoc={onOpenDoc} /></SubStep>)}
              {st.verdictStatement && <SubStep icon={<IconBadge tone={st.verdict}><Scales size={13} weight="duotone" /></IconBadge>}><Verdict statement={st.verdictStatement} verdict={st.verdict} /></SubStep>}
              {st.panel && <SubStep icon={<BrandBadge><NvidiaFavicon size={13} /></BrandBadge>}><Panel panel={st.panel} /></SubStep>}
              {st.errorText && <SubStep icon={<IconBadge><Scales size={13} weight="duotone" /></IconBadge>}><div className="text-[13.5px] text-ink-50">{st.errorText}</div></SubStep>}
            </div>

            {/* the payoff of this lead */}
            {showResolutions && finding && <div className="mt-3"><FindingCard f={finding} onOpenDoc={onOpenDoc} cur={currency} /></div>}
            {showResolutions && kind === "cleared" && <div className="mt-3"><ClearedCard title={st.title} why={st.resolution?.why} /></div>}
            {showResolutions && kind === "unproven" && <div className="mt-3"><UnprovenCard title={st.title} /></div>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** The collapsed one-liner a resolved lead shrinks to. Crimson if confirmed, calm otherwise. */
function CompactRow({ scheme, title, amount, kind, onClick, currency = "\u20AC" }: { scheme: string; title?: string; amount?: number; kind: "confirmed" | "cleared" | "unproven"; onClick: () => void; currency?: string }) {
  const color = kind === "confirmed" ? "#C0182A" : kind === "cleared" ? "#4a7300" : "#8A8A82";
  return (
    <button onClick={onClick} className="group w-full flex items-center gap-2.5 text-left py-1 -my-0.5">
      <span className="inline-flex items-center justify-center rounded-full shrink-0" style={{ width: 16, height: 16, background: color }}>
        <Check size={9} weight="bold" color="#fff" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
        <span className="font-medium">{cap(scheme)}</span>{title ? <span className="text-ink-70"> — {title}</span> : null}
      </span>
      {amount != null
        ? <span className="mono text-[13px] font-semibold shrink-0" style={{ color }}>{currency}{fmt(Math.round(amount))}</span>
        : <span className="text-[12px] font-medium shrink-0" style={{ color }}>{kind === "cleared" ? "cleared" : "escalated"}</span>}
      <CaretDown size={13} className="shrink-0 text-ink-30 group-hover:text-ink-50 transition-colors" />
    </button>
  );
}

/** A sub-step row with its marker sitting on the timeline line. */
function SubStep({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: EASE }} className="relative">
      <span className="absolute flex items-center justify-center" style={{ left: -35, top: -1 }}>{icon}</span>
      {children}
    </motion.div>
  );
}

/** Neutral icon badge (masks the timeline line with a white background). */
function IconBadge({ children, tone }: { children: ReactNode; tone?: string }) {
  const color = tone === "confirmed" ? "#C0182A" : tone === "cleared" ? "#4a7300" : "#57574F";
  return (
    <span className="inline-flex items-center justify-center rounded-[6px] bg-white border border-hairline shrink-0" style={{ width: 20, height: 20, color }}>{children}</span>
  );
}

/** The lead's head icon — pulses while active, checks + tints when resolved. */
function StepHead({ active, resolution }: { active: boolean; resolution?: Step["resolution"] }) {
  const color = resolution?.kind === "confirmed" ? "#C0182A" : resolution?.kind === "cleared" ? "#4a7300" : resolution ? "#8A8A82" : "#111";
  return (
    <span className="relative flex items-center justify-center shrink-0" style={{ width: 28, height: 28 }}>
      {active && (
        <motion.span aria-hidden className="absolute inset-0" style={{ borderRadius: 9, boxShadow: "0 0 0 1.5px #EA580C" }}
          animate={{ opacity: [0, 0.4, 0], scale: [0.95, 1.25, 1.25] }} transition={{ duration: 1.8, ease: "easeOut", repeat: Infinity }} />
      )}
      <span className="flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: 9, background: "#fff", border: `1px solid ${resolution ? "transparent" : "#E8E8E5"}`, color }}>
        <MagnifyingGlass size={15} weight="duotone" />
      </span>
      {resolution && (
        <span className="absolute flex items-center justify-center" style={{ bottom: -3, right: -3, width: 14, height: 14, borderRadius: 999, background: color, border: "2px solid #fff" }}>
          <Check size={8} weight="bold" color="#fff" />
        </span>
      )}
    </span>
  );
}

function RetrievalBody({ r, onOpenDoc }: { r: Retrieval; onOpenDoc: (id: string) => void }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[13px] font-semibold text-ink">{r.model}</span>
        <span className="text-[12.5px] text-ink-50">{r.followup ? "· retrieving again — its own follow-up query" : `· ranked ${fmt(r.candidates)} candidate page${r.candidates === 1 ? "" : "s"}`}</span>
      </div>
      {r.query && <div className="text-[12.5px] text-ink-50 mt-0.5 italic">&ldquo;{r.query}&rdquo;</div>}
      {r.surfaced?.length > 0 && <div className="flex gap-1.5 mt-1.5 flex-wrap">{r.surfaced.map(d => <DocChip key={d.docId} id={d.docId} score={d.score} onOpen={onOpenDoc} />)}</div>}
    </div>
  );
}

/** The streamed "thinking out loud" — grows token-by-token with a live caret. */
function Thinking({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div>
      <div className="mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-30 mb-1">Thinking it through</div>
      {text ? (
        <div className="text-[14px] leading-relaxed text-ink-70" style={{ maxWidth: "62ch" }}>
          {text}{streaming && <span className="caret" />}
        </div>
      ) : streaming ? (
        <span className="inline-flex items-center gap-1.5"><span className="tdot" /><span className="tdot" style={{ animationDelay: ".16s" }} /><span className="tdot" style={{ animationDelay: ".32s" }} /></span>
      ) : null}
    </div>
  );
}

function Verdict({ statement, verdict }: { statement: string; verdict?: string }) {
  const label = verdict === "confirmed" ? "Verdict — confirmed" : verdict === "cleared" ? "Verdict — cleared" : "Verdict — unproven";
  const color = verdict === "confirmed" ? "#C0182A" : verdict === "cleared" ? "#4a7300" : "#8A8A82";
  return (
    <div>
      <div className="mono text-[10.5px] font-semibold uppercase tracking-[0.12em] mb-1" style={{ color }}>{label}</div>
      <RevealText text={statement} className="text-[14.5px] leading-relaxed text-ink" />
    </div>
  );
}

/** The independent review — 3 lens votes, one line each. */
function Panel({ panel }: { panel: StepPanel }) {
  const rows = panel.votes ?? (panel.lenses ?? ["correctness", "innocent explanation", "sufficiency"]).map(l => ({ lens: l } as any));
  const reviewing = !panel.done;
  return (
    <div className="rounded-card border bg-nvidia-pale overflow-hidden" style={{ borderColor: "#D9EBBF", maxWidth: 560 }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "#E4F0CE" }}>
        <span className="text-[12.5px] font-semibold" style={{ color: "#4a7300" }}>Independent review</span>
        {panel.done
          ? <span className="mono text-[11px] ml-auto font-bold" style={{ color: panel.upheld ? "#4a7300" : "#C0182A" }}>{panel.upheld ? "UPHELD" : "REFUTED"}</span>
          : <span className="mono text-[11px] ml-auto text-ink-50">reviewing…</span>}
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {rows.map((v: any, i: number) => {
          const mark = v.upheld == null || reviewing ? "○" : v.abstained ? "○" : v.upheld ? "✓" : "✗";
          const mc = v.upheld == null || reviewing ? "#B9B9B2" : v.abstained ? "#B9B9B2" : v.upheld ? "#4a7300" : "#C0182A";
          return (
            <div key={i} className="flex items-start gap-2 text-[12.5px]">
              <span className="mono text-[11px] mt-px" style={{ color: mc }}>{mark}</span>
              <span className="text-ink-50 shrink-0" style={{ width: 120 }}>{v.lens}</span>
              <span className="text-ink-70 min-w-0">{v.reasoning ?? "reviewing…"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
