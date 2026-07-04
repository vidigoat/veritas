"use client";
import { useEffect, useRef } from "react";
import { MagnifyingGlass, FileText, Calculator, Scales, Buildings, User, Bank, ShieldCheck, Lock, Books, Brain } from "@phosphor-icons/react";
import type { CaseState, Step } from "@/lib/useCase";
import { MoneyGraph } from "./MoneyGraph";

export interface FollowMsg { role: "user" | "veritas"; text: string; tools: string[]; live?: boolean }

/** The whole examination rendered as ONE chat conversation. No dashboard — a thread. */
export function ChatThread({ state, followups, engagement }: { state: CaseState; followups: FollowMsg[]; engagement: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state, followups]);
  const steps = state.phases.flatMap(ph => ph.steps.map(st => ({ st, phase: ph.phase })))
    .filter(({ st }) => st.reasoning || st.tools.length || st.docs.length || st.entities.length);
  const revealed = !!state.reveal;
  const finding = state.findings[0];

  return (
    <div className="mx-auto w-full max-w-[760px] px-5 pt-8 pb-40">
      {/* opening user turn */}
      <UserBubble text={engagement} />

      {/* VERITAS acknowledges + streams the examination */}
      <div className="mt-6 flex gap-3.5">
        <Avatar />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="text-[15px] leading-relaxed text-ink">
            On it — running a full forensic examination of the books. I'll plan, retrieve the documents that matter, chase every anomaly to a verdict, and show my work.
          </div>

          {steps.map(({ st, phase }, i) => <StepTurn key={st.stepId + i} st={st} phase={phase} prev={steps[i - 1]?.phase} />)}

          {revealed && (
            <Artifact title="Conflict of interest — the money graph" tone="crimson">
              <div className="h-[320px] -mx-1"><MoneyGraph hypotheses={state.hypotheses} reveal={state.reveal} findings={state.findings} /></div>
              <div className="mono text-[12px] text-crimson mt-2">⚠ {state.reveal!.label}</div>
            </Artifact>
          )}

          {finding && <VerdictCard state={state} />}
        </div>
      </div>

      {/* interrogation — continues the same conversation */}
      {followups.map((m, i) => m.role === "user"
        ? <UserBubble key={i} text={m.text} />
        : <div key={i} className="mt-6 flex gap-3.5"><Avatar /><div className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink whitespace-pre-wrap">{fmt(m.text)}{m.live && <span className="caret" />}</div></div>)}

      <div ref={endRef} />
    </div>
  );
}

function StepTurn({ st, phase, prev }: { st: Step; phase: string; prev?: string }) {
  return (
    <div className="fadeup">
      {phase !== prev && <PhaseChip phase={phase} />}
      {st.reasoning && <div className={`text-[15px] leading-relaxed text-ink mt-1 ${st.live ? "caret" : ""}`}>{st.reasoning}</div>}
      {st.tools.map((t, i) => <ToolCard key={i} t={t} />)}
      {st.docs.length > 0 && <div className="flex gap-1.5 mt-2 flex-wrap">{st.docs.map(d => <DocChip key={d.docId} id={d.docId} />)}</div>}
      {st.entities.length > 0 && <div className="flex gap-1.5 mt-2 flex-wrap">{st.entities.map(e => <span key={e.entityId} className="inline-flex items-center gap-1.5 bg-[#FAFAF5] border border-line rounded-full px-2.5 py-1 text-[12.5px] font-semibold">{e.kind === "employee" ? <User size={12} weight="duotone" /> : <Buildings size={12} weight="duotone" />}{e.name}</span>)}</div>}
    </div>
  );
}

function ToolCard({ t }: { t: any }) {
  // VultronRetriever — the retrieval engine gets its own branded card
  if (t.tool === "search_documents") {
    return (
      <div className="flex items-start gap-2.5 border rounded-[13px] px-3.5 py-2.5 mt-2 max-w-[560px]" style={{ background: "#EEF4FB", borderColor: "#B8D0EC" }}>
        <div className="w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#2F5EA8" }}><Books size={15} weight="duotone" color="#fff" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold" style={{ color: "#274b86" }}>VultronRetriever · reads the pages, not just the words</div>
          <div className="text-[13px] text-ink-60 mt-0.5 truncate">{t.argsSummary}</div>
          {t.summary && <div className={`text-[12.5px] mt-0.5 ${t.flagged ? "text-crimson font-semibold" : "text-ink-60"}`}>{t.summary}</div>}
        </div>
      </div>
    );
  }
  // NVIDIA Nemotron — independent second examiner
  if (t.tool === "nemotron_verify") {
    return (
      <div className="flex items-start gap-2.5 border rounded-[13px] px-3.5 py-2.5 mt-2 max-w-[600px]" style={{ background: "#F3F9E8", borderColor: "#B5D96A" }}>
        <div className="w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#76B900" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M4 6h6a5 5 0 015 5v7H4V6zm2 2v8h7v-5a3 3 0 00-3-3H6z"/><path d="M14 6h6v12h-2V8h-4V6z"/></svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold" style={{ color: "#4a7300" }}>NVIDIA Nemotron · independent second examiner</div>
          {t.summary && <div className={`text-[12.5px] leading-relaxed mt-0.5 ${t.flagged ? "text-crimson font-semibold" : "text-ink"}`}>{t.summary}</div>}
          {!t.done && <div className="text-[11px] mt-1 flex items-center gap-1.5" style={{ color: "#76B900" }}><span className="w-2.5 h-2.5 rounded-full border-2 animate-spin" style={{ borderColor: "#D6EBB0", borderTopColor: "#76B900" }} /> reviewing the finding…</div>}
        </div>
      </div>
    );
  }
  // generic tool card
  const Icon = TOOL_ICON[t.tool] ?? MagnifyingGlass;
  return (
    <div className="flex items-center gap-2.5 bg-[#FBFBF6] border border-line rounded-[12px] px-3.5 py-2 mt-2 max-w-[540px]">
      <div className="w-7 h-7 rounded-[8px] bg-gold-t flex items-center justify-center shrink-0"><Icon size={13} weight="duotone" className="text-amber" /></div>
      <div className="min-w-0 flex-1">
        <div className="mono text-[12.5px] font-semibold truncate">{t.argsSummary}</div>
        {t.summary && <div className={`text-[12px] truncate ${t.flagged ? "text-crimson font-semibold" : "text-ink-60"}`}>{t.summary}</div>}
      </div>
      {t.done && <span className="mono text-[11px] text-green shrink-0">✓</span>}
    </div>
  );
}

const TOOL_ICON: Record<string, any> = { run_sweep: MagnifyingGlass, vendor_profile: Buildings, employee_profile: User, account_profile: Calculator, query_ledger: FileText, get_document: FileText, cross_reference: Scales, trace_payments: Bank, recompute: Calculator, exonerate: Scales, corroborate: Scales, update_hypothesis: Brain, file_finding: ShieldCheck, freeze_vendor: Lock };

function VerdictCard({ state }: { state: CaseState }) {
  const f = state.findings[0];
  const total = state.findings.reduce((s, x) => { const m = x.statement.replace(/,/g, "").match(/(\d{5,})/); return s + (m ? parseInt(m[1]) : 0); }, 0);
  const cleared = state.hypotheses.filter(h => h.status === "cleared").length;
  return (
    <Artifact title="Verdict" tone="crimson">
      <div className="flex items-baseline gap-3">
        <div className="mono text-[26px] font-semibold text-crimson leading-none">${total.toLocaleString()}</div>
        <div className="text-[12.5px] text-ink-60">at risk · {Math.round((f.confidence ?? 0) * 100)}% confidence · {cleared} cleared</div>
      </div>
      <div className="text-[14px] leading-relaxed text-ink mt-2">{f.statement}</div>
      <div className="mt-2.5 space-y-1">{f.evidence.slice(0, 4).map((e: any, i: number) => <div key={i} className="text-[12.5px] text-ink-60 flex gap-1.5"><span className="text-crimson">▸</span><span>{e.claim} <span className="mono text-crimson">[{(e.doc_ids ?? [e.verified_by]).filter(Boolean).join(", ")}]</span></span></div>)}</div>
    </Artifact>
  );
}

const fmt = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p);
function Avatar() { return <div className="w-8 h-8 rounded-[10px] shrink-0 flex items-center justify-center" style={{ background: "#2F5EA8" }}><svg width="18" height="18" viewBox="0 0 240 240"><g transform="translate(8,17) scale(1.75)" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round"><path d="M 60 62 C 52 62 46 56 46 48 C 46 38 55 30 66 30 C 80 30 90 42 90 57 C 90 76 74 90 55 90 C 32 90 15 71 15 47 C 15 19 39 -2 68 0" /></g></svg></div>; }
function UserBubble({ text }: { text: string }) { return <div className="mt-6 flex justify-end"><div className="max-w-[80%] bg-ink text-paper rounded-[16px] rounded-br-[5px] px-4 py-2.5 text-[14.5px] leading-relaxed">{text}</div></div>; }
function PhaseChip({ phase }: { phase: string }) { const label = phase[0].toUpperCase() + phase.slice(1); return <div className="flex items-center gap-2 mt-3 mb-0.5"><span className="mono text-[11px] font-semibold text-ink-30 uppercase tracking-wider">{label}</span><div className="flex-1 h-px bg-line" /></div>; }
function DocChip({ id }: { id: string }) { return <span className="inline-flex items-center gap-1.5 bg-white border border-line rounded-[9px] px-2.5 py-1 text-[12px] font-semibold shadow-sm"><span className="w-4 h-4 rounded bg-crimson-t text-crimson text-[7px] font-bold flex items-center justify-center">DOC</span>{id}</span>; }
function Artifact({ title, tone, children }: { title: string; tone?: "crimson" | "plain"; children: React.ReactNode }) {
  return (
    <div className={`mt-3 rounded-[16px] border bg-panel overflow-hidden ${tone === "crimson" ? "border-crimson/30" : "border-line"}`} style={{ boxShadow: "0 2px 14px rgba(26,26,26,0.05)" }}>
      <div className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider border-b ${tone === "crimson" ? "text-crimson border-crimson/15 bg-crimson-t" : "text-ink-60 border-line bg-[#FAFAF5]"}`}>{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}
