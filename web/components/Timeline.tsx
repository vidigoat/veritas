"use client";
import { useEffect, useRef } from "react";
import { Brain, MagnifyingGlass, FileText, Calculator, Scales, Buildings, User, Bank, ShieldCheck, Flame, Lock, CheckCircle, CaretDown } from "@phosphor-icons/react";
import type { PhaseBlock, Step } from "@/lib/useCase";
import { PhaseHeader } from "./PhaseHeader";

const ICON: Record<string, any> = { brain: Brain, search: MagnifyingGlass, file: FileText, calc: Calculator, scale: Scales };
function ToolIcon({ tool }: { tool: string }) {
  const map: Record<string, any> = { run_sweep: MagnifyingGlass, vendor_profile: Buildings, query_ledger: FileText, search_documents: MagnifyingGlass, get_document: FileText, cross_reference: Scales, trace_payments: Bank, recompute: Calculator, update_hypothesis: Brain, file_finding: ShieldCheck, freeze_vendor: Lock };
  const I = map[tool] ?? MagnifyingGlass; return <I size={13} weight="duotone" className="text-gold" />;
}

export function Timeline({ phases, elapsed }: { phases: PhaseBlock[]; elapsed: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = endRef.current?.parentElement; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 220) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [phases]);
  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      {phases.map((ph, i) => (
        <div key={ph.phase + i} className="mb-4 fadeup">
          {ph.done ? (
            <div className="flex items-center gap-2.5 bg-[#FAFAF5] border border-line rounded-[13px] px-4 py-3 text-sm font-semibold text-ink-60">
              <CheckCircle size={16} weight="fill" className="text-green" /> {ph.title} — {ph.summary}
              <span className="mono text-xs text-ink-30 ml-auto">{ph.toolCalls ? `${ph.toolCalls} tools · ` : ""}{ph.seconds}s</span>
              <CaretDown size={14} className="text-ink-30" />
            </div>
          ) : (
            <div className="pt-1">
              <PhaseHeader phase={ph.phase} index={ph.index} of={ph.of} title={ph.title} elapsed={elapsed} />
              <div className="mt-3">{ph.steps.map(st => <StepRow key={st.stepId} st={st} />)}</div>
            </div>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function StepRow({ st }: { st: Step }) {
  const Icon = ICON[st.icon] ?? Brain;
  return (
    <div className="relative pl-10 pb-6 fadeup">
      <div className="absolute left-[11px] top-8 bottom-0 w-px bg-line" />
      <div className={`absolute left-0 top-0.5 w-6 h-6 rounded-full flex items-center justify-center ${st.live ? "bg-amber-t text-amber ping-ring" : "bg-green-t text-green"}`}>
        {st.live ? <div className="relative"><Icon size={13} weight="duotone" /></div> : <CheckCircle size={14} weight="fill" />}
      </div>
      <div className="font-semibold text-[15.5px] leading-snug">{st.title}</div>
      {st.reasoning && <div className={`text-ink-60 text-[14.5px] leading-relaxed mt-1.5 max-w-[640px] ${st.live ? "caret" : ""}`}>{st.reasoning}</div>}
      {st.tools.map((t, i) => t.tool === "nemotron_verify" ? (
        <div key={i} className="flex items-start gap-3 border rounded-[13px] px-4 py-3 mt-3 max-w-[600px]" style={{ background: "#F3F9E8", borderColor: "#B5D96A" }}>
          <div className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#76B900" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M4 6h6a5 5 0 015 5v7H4V6zm2 2v8h7v-5a3 3 0 00-3-3H6z"/><path d="M14 6h6v12h-2V8h-4V6z"/></svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold" style={{ color: "#4a7300" }}>NVIDIA Nemotron · independent second examiner</div>
            {t.summary && <div className={`text-[13px] leading-relaxed mt-1 ${t.flagged ? "text-crimson font-semibold" : "text-ink"}`}>{t.summary}</div>}
            {!t.done && <div className="text-xs mt-1 flex items-center gap-1.5" style={{ color: "#76B900" }}><span className="w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "#D6EBB0", borderTopColor: "#76B900" }} /> reviewing the finding…</div>}
          </div>
        </div>
      ) : (
        <div key={i} className="flex items-center gap-3 bg-[#FBFBF6] border border-line rounded-[13px] px-4 py-2.5 mt-3 max-w-[560px]">
          <div className="w-8 h-8 rounded-[9px] bg-gold-t flex items-center justify-center shrink-0"><ToolIcon tool={t.tool} /></div>
          <div className="min-w-0">
            <div className="mono text-[13px] font-semibold truncate">{t.argsSummary}</div>
            {t.summary && <div className={`text-[12.5px] truncate ${t.flagged ? "text-crimson font-semibold" : "text-ink-60"}`}>{t.summary}</div>}
          </div>
          <div className={`ml-auto text-xs font-semibold shrink-0 flex items-center gap-1.5 ${t.done ? "text-green" : "text-amber"}`}>
            {t.done ? `✓ ${t.ms}ms` : <><span className="w-3 h-3 border-2 border-amber-t border-t-amber rounded-full animate-spin" /> running</>}
          </div>
        </div>
      ))}
      {st.docs.length > 0 && <div className="flex gap-2 mt-3 flex-wrap">{st.docs.map(d => <span key={d.docId} className="inline-flex items-center gap-2 bg-white border border-line rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold shadow-sm"><span className="w-5 h-5 rounded-md bg-crimson-t text-crimson text-[8.5px] font-bold flex items-center justify-center">DOC</span>{d.docId}</span>)}</div>}
      {st.entities.length > 0 && <div className="flex gap-2 mt-2.5 flex-wrap">{st.entities.map(e => <span key={e.entityId} className="inline-flex items-center gap-1.5 bg-[#FAFAF5] border border-line rounded-full px-3 py-1.5 text-[13px] font-semibold">{e.kind === "employee" ? <User size={13} weight="duotone" /> : <Buildings size={13} weight="duotone" />}{e.name}</span>)}</div>}
    </div>
  );
}
