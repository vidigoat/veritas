"use client";
import { useState, useRef, useEffect } from "react";
import { useCase } from "@/lib/useCase";
import { ChatThread, type FollowMsg } from "@/components/ChatThread";
import { Report } from "@/components/Report";
import { ArrowUp, Lock, Scroll } from "@phosphor-icons/react";

const API = (typeof window !== "undefined" && (window as any).__VERITAS_API__) || "http://localhost:8787";
const ENGAGEMENT = "Examine Meridian Traders Pvt Ltd — a full forensic audit of the FY 2025-26 books. Investigate every irregularity to a verdict and quantify any loss.";
const STARTERS = ["Audit Meridian Traders' books for fraud", "Find any billing scheme in FY 2025-26", "Examine these books and cite every finding"];

export default function Home() {
  const { state, startDemo, startLive, approve, caseId } = useCase();
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const [followups, setFollowups] = useState<FollowMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const isStaticDeploy = typeof window !== "undefined" && !window.location.hostname.includes("localhost");
  const liveMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("live");
  const engagementRef = useRef(ENGAGEMENT);

  const begin = (text?: string) => {
    if (started) return;
    engagementRef.current = text?.trim() || ENGAGEMENT;
    setStarted(true); setInput("");
    liveMode ? startLive() : startDemo(3);   // fixture replay by default (deploy is static); ?live=1 hits the backend
  };

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setInput(""); setBusy(true);
    setFollowups(m => [...m, { role: "user", text: q, tools: [] }, { role: "veritas", text: "", tools: [], live: true }]);
    const set = (fn: (t: string) => string) => setFollowups(m => { const c = [...m]; const last = c[c.length - 1]; last.text = fn(last.text); return c; });
    try {
      if (!liveMode || !caseId.current) {
        const canned = CANNED[q] ?? "In a live examination I answer this from the case evidence with citations. Try it locally against a running investigation.";
        for (let i = 1; i <= canned.length; i += 2) { set(() => canned.slice(0, i)); await new Promise(r => setTimeout(r, 12)); }
      } else {
        const r = await fetch(`${API}/api/case/${caseId.current}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
        const reader = r.body!.getReader(); const dec = new TextDecoder(); let buf = "";
        while (true) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
          for (const line of buf.split("\n\n")) { const mm = line.match(/^data: (.*)$/m); if (!mm) continue; try { const ev = JSON.parse(mm[1]); if (ev.type === "answer_delta") set(t => t + ev.payload.text); } catch {} }
          buf = buf.slice(buf.lastIndexOf("\n\n") + 2); }
      }
    } finally { setFollowups(m => { const c = [...m]; c[c.length - 1].live = false; return c; }); setBusy(false); }
  }

  const canAsk = state.status === "done";
  const onSubmit = () => { if (!started) begin(input); else if (canAsk) ask(input); };

  return (
    <div className="h-screen flex flex-col bg-paper">
      <TopBar state={state} onReport={() => setShowReport(true)} onApprove={approve} />

      {!started ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-[680px] text-center fadeup">
            <div className="flex justify-center mb-5"><Logo size={64} /></div>
            <h1 className="serif text-[38px] leading-[1.1] font-medium">The AI Forensic Auditor</h1>
            <p className="text-ink-60 mt-3 text-[16px]">Point it at a company's books. It reads every document, chases every anomaly, and tells you — with citations — where the money went.</p>
            <Composer value={input} onChange={setInput} onSubmit={onSubmit} placeholder="Ask VERITAS to audit a company's books…" autoFocus />
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {STARTERS.map(s => <button key={s} onClick={() => begin(s)} className="text-[13px] text-ink-60 bg-panel border border-line rounded-full px-3.5 py-1.5 hover:border-ink/30 transition-colors">{s}</button>)}
            </div>
            <div className="mono text-[11px] text-ink-30 mt-6">Retrieval on VultronRetriever · reasoning on Vultr Serverless Inference</div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto"><ChatThread state={state} followups={followups} engagement={engagementRef.current} /></div>
          <div className="border-t border-line bg-paper/80 backdrop-blur">
            <div className="mx-auto max-w-[760px] px-5 py-3">
              <Composer value={input} onChange={setInput} onSubmit={onSubmit} disabled={!canAsk || busy} placeholder={canAsk ? "Ask a follow-up — interrogate the case…" : "VERITAS is examining the books…"} />
            </div>
          </div>
        </>
      )}
      {showReport && <Report state={state} onClose={() => setShowReport(false)} />}
    </div>
  );
}

function TopBar({ state, onReport, onApprove }: { state: any; onReport: () => void; onApprove: () => void }) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-line bg-panel/60">
      <Logo size={22} /><span className="serif font-medium tracking-[0.14em] text-[17px]">VERITAS</span>
      <div className="ml-auto flex items-center gap-2.5">
        {state.approval && !state.approved && <button onClick={onApprove} className="flex items-center gap-1.5 bg-crimson text-white font-semibold text-[12.5px] px-3 py-1.5 rounded-control"><Lock size={13} weight="duotone" /> Approve freeze: {state.approval.target}</button>}
        {state.approved && <span className="text-green font-semibold text-[12.5px]">✓ {state.approval?.target} frozen</span>}
        {state.reportReady && <button onClick={onReport} className="flex items-center gap-1.5 bg-ink text-paper font-semibold text-[12.5px] px-3 py-1.5 rounded-control"><Scroll size={13} weight="duotone" /> Report</button>}
        <div className="mono text-[11px] text-ink-60 bg-[#FAFAF5] border border-line px-2.5 py-1.5 rounded-lg">{state.usage ? `$${state.usage.usd.toFixed(3)}` : "Vultr"}</div>
      </div>
    </div>
  );
}

function Composer({ value, onChange, onSubmit, placeholder, disabled, autoFocus }: { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; disabled?: boolean; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  return (
    <div className={`flex items-end gap-2 bg-panel border rounded-[18px] px-4 py-2.5 mt-6 shadow-sm transition-colors ${disabled ? "border-line opacity-70" : "border-ink/15 focus-within:border-ink/40"}`}>
      <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
        rows={1} placeholder={placeholder} className="flex-1 resize-none bg-transparent outline-none text-[15px] py-1.5 max-h-32 placeholder:text-ink-30" style={{ minHeight: 24 }} />
      <button onClick={onSubmit} disabled={disabled && !value} className="w-9 h-9 rounded-full bg-ink text-paper flex items-center justify-center shrink-0 disabled:opacity-30 hover:opacity-90"><ArrowUp size={17} weight="bold" /></button>
    </div>
  );
}

function Logo({ size = 32 }: { size?: number }) {
  return <div style={{ width: size, height: size }} className="rounded-[26%] shrink-0 flex items-center justify-center" ><svg width={size} height={size} viewBox="0 0 240 240"><rect width="240" height="240" rx="48" fill="#2F5EA8" /><g transform="translate(8,17) scale(1.75)" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round"><path d="M 60 62 C 52 62 46 56 46 48 C 46 38 55 30 66 30 C 80 30 90 42 90 57 C 90 76 74 90 55 90 C 32 90 15 71 15 47 C 15 19 39 -2 68 0" /></g></svg></div>;
}

const CANNED: Record<string, string> = {
  "How do you know Apex Supplies is a shell company?": "Apex Supplies (V-031) shares the **exact registered address** of employee E-007 (Vikram Kulkarni): 245 LBS Marg, Mumbai 400050 — documented in both the vendor registration (**V-031-REG**) and his HR record (**HR-E-007**). VultronRetriever surfaced that registration page even though 'shell company' never appears on it. Kulkarni approved **all 14 invoices** himself, totalling **$332,087**, with **0% purchase-order coverage** and no tax ID. That combination is a textbook ACFE shell-company billing scheme.",
  "Could the $250,000 payment be fraud?": "No — I cleared it. The $250,000 to V-020 was a **round-number capital purchase**, which is a classic red flag, but it is fully supported: a purchase order (**PO-77001**) and authorization in the **August board minutes (BOARD-MIN-2025-08)**. Legitimate, on the record. Flagging it would have been crying wolf.",
  "Show me the total paid to V-031.": "**$332,087** across **14 invoices**, all booked to Professional Services and all approved by E-007. I recomputed the figure directly from the ledger rather than trusting any single document.",
};
