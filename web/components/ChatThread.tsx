"use client";
import { useEffect, useRef } from "react";
import { MagnifyingGlass, FileText, Calculator, Scales, Buildings, User, Bank, ShieldCheck, Lock, Books, Brain, Sparkle } from "@phosphor-icons/react";
import type { CaseState, Step } from "@/lib/useCase";
import { MoneyGraph } from "./MoneyGraph";
import { LogoMark } from "./Logo";

export interface FollowMsg { role: "user" | "veritas"; text: string; tools: string[]; live?: boolean }

/** The whole examination as one chat conversation. */
export function ChatThread({ state, followups, engagement }: { state: CaseState; followups: FollowMsg[]; engagement: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = endRef.current?.parentElement; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state, followups]);
  const steps = state.phases.flatMap(ph => ph.steps.map(st => ({ st, phase: ph.phase })))
    .filter(({ st }) => st.reasoning || st.tools.length || st.docs.length || st.entities.length);
  const running = state.status === "running";
  const finding = state.findings[0];

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pt-8 pb-40">
      <UserBubble text={engagement} />
      <div className="mt-7 flex gap-3.5">
        <Avatar />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="text-[15.5px] leading-relaxed text-ink">Running a full forensic examination of the books. I’ll plan, retrieve the documents that matter, chase every anomaly to a verdict, and show my work.</div>
          {steps.map(({ st, phase }, i) => <StepTurn key={st.stepId + i} st={st} phase={phase} prev={steps[i - 1]?.phase} />)}
          {state.reveal && <RevealCard state={state} />}
          {finding && <VerdictCard state={state} />}
          {running && !finding && <div className="flex items-center gap-1.5 pt-1"><span className="tdot" /><span className="tdot" style={{ animationDelay: ".16s" }} /><span className="tdot" style={{ animationDelay: ".32s" }} /></div>}
        </div>
      </div>
      {followups.map((m, i) => m.role === "user"
        ? <UserBubble key={i} text={m.text} />
        : <div key={i} className="mt-7 flex gap-3.5"><Avatar /><div className="min-w-0 flex-1 text-[15.5px] leading-relaxed text-ink whitespace-pre-wrap">{fmt(m.text)}{m.live && <span className="caret" />}</div></div>)}
      <div ref={endRef} />
    </div>
  );
}

function StepTurn({ st, phase, prev }: { st: Step; phase: string; prev?: string }) {
  return (
    <div className="fadeup">
      {phase !== prev && <PhaseLabel phase={phase} />}
      {st.reasoning && <div className={`text-[15.5px] leading-relaxed text-ink mt-1 ${st.live ? "caret" : ""}`}>{st.reasoning}</div>}
      {st.tools.map((t, i) => <ToolCard key={i} t={t} />)}
      {st.docs.length > 0 && <div className="flex gap-1.5 mt-2 flex-wrap">{st.docs.map(d => <DocChip key={d.docId} id={d.docId} note={d.note} />)}</div>}
      {st.entities.length > 0 && <div className="flex gap-1.5 mt-2 flex-wrap">{st.entities.map(e => <span key={e.entityId} className="inline-flex items-center gap-1.5 bg-cream border border-hairline rounded-full px-2.5 py-1 text-[12.5px] font-medium">{e.kind === "employee" ? <User size={12} weight="duotone" /> : <Buildings size={12} weight="duotone" />}{e.name}</span>)}</div>}
    </div>
  );
}

function ToolCard({ t }: { t: any }) {
  if (t.tool === "search_documents") return (
    <Card accent="ice" icon={<Books size={14} weight="duotone" />} title="VultronRetriever · reads the pages, not just the words"
      sub={t.argsSummary} body={t.summary} flagged={t.flagged} />
  );
  if (t.tool === "nemotron_verify") return (
    <div className="flex items-start gap-2.5 border rounded-card px-3.5 py-2.5 mt-2.5 max-w-[600px] bg-nvidia-pale" style={{ borderColor: "#C6E39A" }}>
      <div className="w-7 h-7 rounded-control flex items-center justify-center shrink-0 mt-px" style={{ background: "#76B900" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M4 6h6a5 5 0 015 5v7H4V6zm2 2v8h7v-5a3 3 0 00-3-3H6z"/><path d="M14 6h6v12h-2V8h-4V6z"/></svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold" style={{ color: "#4a7300" }}>NVIDIA Nemotron · independent second examiner</div>
        {t.summary && <div className={`text-[13px] leading-relaxed mt-0.5 ${t.flagged ? "text-crimson font-medium" : "text-ink"}`}>{t.summary}</div>}
        {!t.done && <div className="text-[11.5px] mt-1 flex items-center gap-1.5" style={{ color: "#76B900" }}><span className="w-2.5 h-2.5 rounded-full border-2 animate-spin" style={{ borderColor: "#D6EBB0", borderTopColor: "#76B900" }} /> reviewing the finding…</div>}
      </div>
    </div>
  );
  const flaggedMatch = t.flagged && /MATCH|SAME ADDRESS|CONFLICT/i.test(t.summary ?? "");
  const Icon = TOOL_ICON[t.tool] ?? MagnifyingGlass;
  return (
    <div className={`flex items-center gap-2.5 border rounded-card px-3.5 py-2.5 mt-2.5 max-w-[560px] ${flaggedMatch ? "bg-crimson-pale border-crimson/25" : "bg-cream border-hairline"}`}>
      <div className={`w-7 h-7 rounded-control flex items-center justify-center shrink-0 ${flaggedMatch ? "bg-crimson/10" : "bg-white border border-hairline"}`}><Icon size={13} weight="duotone" className={flaggedMatch ? "text-crimson" : "text-ink-50"} /></div>
      <div className="min-w-0 flex-1">
        <div className="mono text-[12.5px] font-medium truncate text-ink">{t.argsSummary}</div>
        {t.summary && <div className={`text-[12.5px] truncate ${flaggedMatch ? "text-crimson font-semibold" : "text-ink-70"}`}>{t.summary}</div>}
      </div>
      {t.done && <span className="mono text-[11px] text-nvidia shrink-0">✓</span>}
    </div>
  );
}

const TOOL_ICON: Record<string, any> = { run_sweep: MagnifyingGlass, vendor_profile: Buildings, employee_profile: User, account_profile: Calculator, query_ledger: FileText, get_document: FileText, cross_reference: Scales, trace_payments: Bank, recompute: Calculator, exonerate: Scales, corroborate: Scales, update_hypothesis: Brain, file_finding: ShieldCheck, freeze_vendor: Lock };

function Card({ accent, icon, title, sub, body, flagged }: { accent: "ice"; icon: React.ReactNode; title: string; sub?: string; body?: string; flagged?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 border rounded-card px-3.5 py-2.5 mt-2.5 max-w-[600px] bg-ice-pale" style={{ borderColor: "#BBD9F3" }}>
      <div className="w-7 h-7 rounded-control flex items-center justify-center shrink-0 mt-px" style={{ background: "#0B69C7" }}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold" style={{ color: "#0B4E93" }}>{title}</div>
        {sub && <div className="text-[13px] text-ink-70 mt-0.5 truncate">{sub}</div>}
        {body && <div className={`text-[12.5px] mt-0.5 ${flagged ? "text-crimson font-medium" : "text-ink-70"}`}>{body}</div>}
      </div>
    </div>
  );
}

function RevealCard({ state }: { state: CaseState }) {
  return (
    <div className="mt-3 rounded-card border border-crimson/25 bg-white overflow-hidden crimsonflash shadow-card">
      <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-crimson border-b border-crimson/15 bg-crimson-pale flex items-center gap-1.5"><Scales size={13} weight="fill" /> Conflict of interest — the money trail</div>
      <div className="p-3"><div className="h-[300px] -mx-1"><MoneyGraph hypotheses={state.hypotheses} reveal={state.reveal} findings={state.findings} /></div>
        <div className="mono text-[12px] text-crimson mt-1.5 px-1">⚠ {state.reveal!.label}</div></div>
    </div>
  );
}

function VerdictCard({ state }: { state: CaseState }) {
  const f = state.findings[0];
  const total = state.findings.reduce((s, x) => { const m = x.statement.replace(/,/g, "").match(/(\d{5,})/); return s + (m ? parseInt(m[1]) : 0); }, 0);
  const cleared = state.hypotheses.filter(h => h.status === "cleared").length;
  return (
    <div className="mt-3 rounded-card border border-crimson/25 bg-white overflow-hidden shadow-card scalein">
      <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-crimson border-b border-crimson/15 bg-crimson-pale flex items-center gap-1.5"><ShieldCheck size={13} weight="fill" /> Verdict</div>
      <div className="p-4">
        <div className="flex items-baseline gap-3">
          <div className="mono text-[27px] font-semibold text-crimson leading-none tracking-tight">${total.toLocaleString()}</div>
          <div className="text-[12.5px] text-ink-50">at risk · {Math.round((f.confidence ?? 0) * 100)}% confidence · {cleared} cleared</div>
        </div>
        <div className="text-[14.5px] leading-relaxed text-ink mt-2.5">{f.statement}</div>
        <div className="mt-3 space-y-1.5">{f.evidence.slice(0, 4).map((e: any, i: number) => <div key={i} className="text-[13px] text-ink-70 flex gap-2"><span className="text-crimson mt-px">▸</span><span>{e.claim} <span className="mono text-[12px] text-ice bg-ice-pale rounded px-1 py-px">{(e.doc_ids ?? [e.verified_by]).filter(Boolean).join(", ")}</span></span></div>)}</div>
      </div>
    </div>
  );
}

const fmt = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : p);
function Avatar() { return <div className="shrink-0 mt-0.5"><LogoMark size={30} /></div>; }
function UserBubble({ text }: { text: string }) { return <div className="mt-7 flex justify-end"><div className="max-w-[78%] bg-cream border border-hairline text-ink rounded-[16px] rounded-br-[5px] px-4 py-2.5 text-[14.5px] leading-relaxed">{text}</div></div>; }
function PhaseLabel({ phase }: { phase: string }) { const label = phase[0].toUpperCase() + phase.slice(1); return <div className="flex items-center gap-2.5 mt-4 mb-1"><span className="mono text-[10.5px] font-semibold text-ink-30 uppercase tracking-[0.14em]">{label}</span><div className="flex-1 h-px bg-line" /></div>; }
function DocChip({ id, note }: { id: string; note?: string }) { return <span className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-chip px-2.5 py-1 text-[12px] font-medium shadow-card" title={note}><span className="mono text-[8px] font-bold text-ice bg-ice-pale rounded px-1 py-px">DOC</span>{id}</span>; }
