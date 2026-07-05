"use client";
/**
 * InvestigationRail — the vertical "watch it think" timeline.
 *
 *  ┌ [lead icon]  Lead — a possible <scheme>: <subject>
 *  │   • search the documents · ranked N pages   "query"   [DOC][DOC]
 *  │   • [brain]  thinking out loud …  (streams token-by-token, caret)
 *  │   • search again — its own follow-up query   [DOC]
 *  │   • [scales] Verdict — confirmed/cleared/unproven  (word-stagger reveal)
 *  │   • independent review · 3 lens votes · UPHELD/REFUTED
 *  └ resolution card (the confirmed finding / cleared / unproven payoff)
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { MagnifyingGlass, Brain, Scales, Check } from "@phosphor-icons/react";
import type { Step, Finding, Retrieval, StepPanel } from "@/lib/useCorpus";
import { EASE, SCHEME_LABEL, fmt, DocChip, BrandBadge, VultrFavicon, NvidiaFavicon } from "./kit";
import { RevealText } from "./PhaseHeader";
import { FindingCard, ClearedCard, UnprovenCard } from "./Findings";

// hide the machine-readable tail the server sometimes leaks into streamed prose
function cleanHyp(h?: string): string {
  if (!h) return "";
  return h.replace(/\n\s*(FOLLOW[-\s]?UP|VERDICT|CONFIDENCE)\s*:[\s\S]*$/i, "").trim();
}

export function InvestigationRail({ steps, findings, running, onOpenDoc, showResolutions = true }: { steps: Step[]; findings: Finding[]; running: boolean; onOpenDoc: (id: string) => void; showResolutions?: boolean }) {
  return (
    <div className="space-y-6">
      {steps.map(st => <StepBlock key={st.stepId} st={st} findings={findings} running={running} onOpenDoc={onOpenDoc} showResolutions={showResolutions} />)}
    </div>
  );
}

function StepBlock({ st, findings, running, onOpenDoc, showResolutions }: { st: Step; findings: Finding[]; running: boolean; onOpenDoc: (id: string) => void; showResolutions: boolean }) {
  const scheme = SCHEME_LABEL[st.scheme ?? "other"] ?? "anomaly";
  const resolved = !!st.resolution;
  const active = running && !resolved;
  const first = st.retrievals.find(r => !r.followup) ?? st.retrievals[0];
  const followups = st.retrievals.filter(r => r !== first);
  const hyp = cleanHyp(st.hypothesis);
  const finding = st.resolution?.kind === "confirmed" ? findings.find(f => f.id === st.resolution?.findingId) : null;

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: EASE }} className="relative">
      {/* lead head */}
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
      </div>

      {/* sub-rail — the timeline of moves */}
      <div className="relative mt-3 ml-[14px] pl-7 space-y-3.5 border-l" style={{ borderColor: "#E8E8E5" }}>
        {first && <SubStep icon={<BrandBadge><VultrFavicon size={13} /></BrandBadge>}><RetrievalBody r={first} onOpenDoc={onOpenDoc} /></SubStep>}
        {(hyp || st.hypStreaming) && <SubStep icon={<IconBadge><Brain size={13} weight="duotone" /></IconBadge>}><Thinking text={hyp} streaming={!!st.hypStreaming} /></SubStep>}
        {followups.map((r, i) => <SubStep key={i} icon={<BrandBadge><VultrFavicon size={13} /></BrandBadge>}><RetrievalBody r={r} onOpenDoc={onOpenDoc} /></SubStep>)}
        {st.verdictStatement && <SubStep icon={<IconBadge tone={st.verdict}><Scales size={13} weight="duotone" /></IconBadge>}><Verdict statement={st.verdictStatement} verdict={st.verdict} /></SubStep>}
        {st.panel && <SubStep icon={<BrandBadge><NvidiaFavicon size={13} /></BrandBadge>}><Panel panel={st.panel} /></SubStep>}
        {st.errorText && <SubStep icon={<IconBadge><Scales size={13} weight="duotone" /></IconBadge>}><div className="text-[13.5px] text-ink-50">{st.errorText}</div></SubStep>}
      </div>

      {/* the payoff of this lead */}
      {showResolutions && finding && <div className="mt-3.5"><FindingCard f={finding} onOpenDoc={onOpenDoc} /></div>}
      {showResolutions && st.resolution?.kind === "cleared" && <div className="mt-3.5"><ClearedCard title={st.title} why={st.resolution.why} /></div>}
      {showResolutions && st.resolution?.kind === "unproven" && <div className="mt-3.5"><UnprovenCard title={st.title} /></div>}
    </motion.div>
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
