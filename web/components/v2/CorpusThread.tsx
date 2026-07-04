"use client";
import { useEffect, useRef } from "react";
import { Books, Scales, ShieldCheck, Buildings, User, FileText, MagnifyingGlass, Bank } from "@phosphor-icons/react";
import type { CorpusState } from "@/lib/useCorpus";
import { LogoMark } from "../Logo";
import { Swarm } from "./Swarm";

const SCHEME_LABEL: Record<string, string> = { shell_company: "Shell company", ghost_employee: "Ghost employee", duplicate_payment: "Duplicate payment", threshold_evasion: "Threshold evasion", expense_fraud: "Expense fraud", kickback: "Kickback", other: "Anomaly" };

export function CorpusThread({ state, engagement, onOpenDoc }: { state: CorpusState; engagement: string; onOpenDoc: (id: string) => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = endRef.current?.parentElement; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 260) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state]);
  const running = state.status === "running";

  return (
    <div className="mx-auto w-full max-w-[740px] px-5 pt-8 pb-40">
      <UserBubble text={engagement} />
      <div className="mt-7 flex gap-3.5">
        <Avatar />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="text-[15.5px] leading-relaxed text-ink">I'll read every document in these books, extract the facts myself, cross-reference the entities, and work each anomaly to a verdict — with an independent Nemotron panel on every finding. Watch.</div>

          {/* INGEST */}
          {state.corpus && <Label>Ingest</Label>}
          {state.corpus && <div className="text-[15px] text-ink"><b>{state.corpus.total.toLocaleString()} documents</b> loaded — {Object.entries(state.corpus.stats).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(" · ")}.</div>}

          {/* MAP — the drone fleet */}
          {state.fleet.shards > 0 && <><Label>Read</Label><Swarm shards={state.fleet.shards} done={state.fleet.done} drones={state.fleet.drones} facts={state.fleet.facts} corpusTotal={state.corpus?.total} /></>}
          {state.fleet.facts != null && <div className="text-[15px] text-ink">The fleet reconstructed the books from the documents: <b>{state.fleet.vendors} vendors</b>, <b>{state.fleet.employees} employees</b>, <b>{state.fleet.txns} transactions</b> — {state.fleet.facts} facts, cited to source.</div>}

          {/* REDUCE — anomalies + reveal */}
          {state.anomalies.length > 0 && <Label>Cross-reference</Label>}
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

          {/* INVESTIGATE — per-anomaly deep dive */}
          {state.steps.length > 0 && <Label>Investigate</Label>}
          {state.steps.map(st => (
            <div key={st.stepId} className="fadeup space-y-2">
              {st.texts.map((t, i) => <div key={i} className="text-[15px] leading-relaxed text-ink">{t}</div>)}
              {st.retrieval && (
                <div className="flex items-start gap-2.5 border rounded-card px-3.5 py-2.5 max-w-[600px] bg-ice-pale" style={{ borderColor: "#BBD9F3" }}>
                  <div className="w-7 h-7 rounded-control flex items-center justify-center shrink-0 mt-px" style={{ background: "#0B69C7" }}><Books size={14} weight="duotone" color="#fff" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold" style={{ color: "#0B4E93" }}>{st.retrieval.model} · surfaced the source pages</div>
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">{st.retrieval.surfaced.map(d => <DocChip key={d.docId} id={d.docId} score={d.score} onOpen={onOpenDoc} />)}</div>
                  </div>
                </div>
              )}
              {st.panel && <PanelCard panel={st.panel} />}
            </div>
          ))}

          {/* FINDINGS + VERDICT */}
          {state.findings.map(f => <FindingCard key={f.id} f={f} onOpenDoc={onOpenDoc} />)}
          {state.verdict && state.findings.length > 0 && <VerdictCard state={state} />}
          {state.verdict && state.findings.length === 0 && <div className="mt-3 rounded-card border border-nvidia/30 bg-nvidia-pale px-4 py-3 text-[15px]"><b>No material findings.</b> Every anomaly cleared — the books present no evidence of fraud. VERITAS does not cry wolf.</div>}

          {running && <div className="flex items-center gap-1.5 pt-1"><span className="tdot" /><span className="tdot" style={{ animationDelay: ".16s" }} /><span className="tdot" style={{ animationDelay: ".32s" }} /></div>}
        </div>
      </div>
      <div ref={endRef} />
    </div>
  );
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
            {panel.votes ? <span className={`mono text-[11px] mt-px ${v.upheld ? "text-nvidia" : "text-crimson"}`}>{v.upheld ? "✓" : "✗"}</span> : <span className="w-2.5 h-2.5 rounded-full border-2 animate-spin mt-0.5" style={{ borderColor: "#D6EBB0", borderTopColor: "#76B900" }} />}
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
      <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-crimson border-b border-crimson/15 bg-crimson-pale flex items-center gap-1.5"><ShieldCheck size={13} weight="fill" /> {SCHEME_LABEL[f.scheme] ?? "Finding"} · {f.id}</div>
      <div className="p-4">
        <div className="flex items-baseline gap-3"><div className="mono text-[24px] font-semibold text-crimson leading-none">€{Math.round(f.amount).toLocaleString()}</div><div className="text-[12.5px] text-ink-50">at risk · {Math.round((f.confidence ?? 0) * 100)}% confidence</div></div>
        <div className="text-[14.5px] leading-relaxed text-ink mt-2.5">{f.statement}</div>
        <div className="mt-3 space-y-1.5">{(f.evidence ?? []).slice(0, 5).map((e: any, i: number) => <div key={i} className="text-[13px] text-ink-70 flex gap-2"><span className="text-crimson mt-px">▸</span><span>{e.claim} {(e.doc_ids ?? e.docIds ?? []).map((d: string) => <DocChip key={d} id={d} onOpen={onOpenDoc} inline />)}</span></div>)}</div>
      </div>
    </div>
  );
}

function VerdictCard({ state }: { state: CorpusState }) {
  const total = state.findings.reduce((s, f) => s + (f.amount || 0), 0);
  return (
    <div className="mt-3 rounded-card border border-crimson/30 bg-white shadow-card scalein">
      <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-crimson border-b border-crimson/15 bg-crimson-pale">Verdict</div>
      <div className="p-4 flex items-baseline gap-4">
        <div className="mono text-[28px] font-semibold text-crimson leading-none">€{Math.round(total).toLocaleString()}</div>
        <div className="text-[13px] text-ink-50">total at risk · {state.findings.length} finding{state.findings.length !== 1 ? "s" : ""} · {state.cleared.length} cleared · each upheld by the Nemotron panel</div>
      </div>
    </div>
  );
}

function Avatar() { return <div className="shrink-0 mt-0.5"><LogoMark size={30} /></div>; }
function UserBubble({ text }: { text: string }) { return <div className="flex justify-end"><div className="max-w-[80%] bg-cream border border-hairline text-ink rounded-[16px] rounded-br-[5px] px-4 py-2.5 text-[14.5px] leading-relaxed">{text}</div></div>; }
function Label({ children }: { children: React.ReactNode }) { return <div className="flex items-center gap-2.5 pt-2"><span className="mono text-[10.5px] font-semibold text-ink-30 uppercase tracking-[0.14em]">{children}</span><div className="flex-1 h-px bg-line" /></div>; }
function DocChip({ id, score, onOpen, inline }: { id: string; score?: number; onOpen: (id: string) => void; inline?: boolean }) {
  return <button onClick={() => onOpen(id)} className={`inline-flex items-center gap-1.5 bg-ice-pale border border-ice/20 rounded-chip px-2 py-0.5 text-[12px] font-medium text-ice hover:bg-ice hover:text-white transition-colors ${inline ? "mx-0.5 align-middle" : ""}`} title="open the source document">
    <span className="mono text-[8px] font-bold opacity-70">DOC</span>{id}{score != null && <span className="mono text-[10px] opacity-70">{score}</span>}</button>;
}
