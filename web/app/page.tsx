"use client";
import { useState, useRef } from "react";
import { useCase } from "@/lib/useCase";
import { Onboarding } from "@/components/Onboarding";
import { Composer } from "@/components/Composer";
import { ChatThread, type FollowMsg } from "@/components/ChatThread";
import { Report } from "@/components/Report";
import { LogoMark } from "@/components/Logo";
import { Lock, Scroll } from "@phosphor-icons/react";

const API = (typeof window !== "undefined" && (window as any).__VERITAS_API__) || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";
const ENGAGEMENT = "Examine Meridian Traders Pvt Ltd — a full forensic audit of the FY 2025-26 books. Investigate every irregularity to a verdict and quantify any loss.";
const STARTERS = ["Audit Meridian Traders' books for fraud", "Find any billing scheme in FY 2025-26", "Examine these books and cite every finding"];

export default function Home() {
  const { state, startDemo, startLive, approve, caseId } = useCase();
  const [onboard, setOnboard] = useState(true);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const [followups, setFollowups] = useState<FollowMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const liveMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("live");
  const engagementRef = useRef(ENGAGEMENT);

  const begin = (text?: string) => {
    if (started) return;
    engagementRef.current = text?.trim() || ENGAGEMENT;
    setStarted(true); setInput("");
    liveMode ? startLive() : startDemo(3);
  };

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setInput(""); setBusy(true);
    setFollowups(m => [...m, { role: "user", text: q, tools: [] }, { role: "veritas", text: "", tools: [], live: true }]);
    const set = (fn: (t: string) => string) => setFollowups(m => { const c = [...m]; c[c.length - 1].text = fn(c[c.length - 1].text); return c; });
    try {
      if (!liveMode || !caseId.current) {
        const canned = CANNED[q] ?? "In a live examination I answer this from the case evidence with citations. Try it locally against a running investigation.";
        for (let i = 1; i <= canned.length; i += 2) { set(() => canned.slice(0, i)); await new Promise(r => setTimeout(r, 11)); }
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

  if (onboard) return <Onboarding onDone={() => setOnboard(false)} />;

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* top bar */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-line shrink-0">
        <LogoMark size={26} /><span className="font-display font-medium tracking-[0.06em] text-[16px]">VERITAS</span>
        <div className="ml-auto flex items-center gap-2.5">
          {state.approval && !state.approved && <button onClick={approve} className="flex items-center gap-1.5 bg-crimson text-white font-medium text-[12.5px] px-3 py-1.5 rounded-control hover:opacity-90"><Lock size={13} weight="duotone" /> Approve freeze: {state.approval.target}</button>}
          {state.approved && <span className="text-nvidia font-semibold text-[12.5px]">✓ {state.approval?.target} frozen</span>}
          {state.reportReady && <button onClick={() => setShowReport(true)} className="flex items-center gap-1.5 bg-ink text-white font-medium text-[12.5px] px-3 py-1.5 rounded-control hover:bg-fire transition-colors"><Scroll size={13} weight="duotone" /> Report</button>}
          <div className="mono text-[11px] text-ink-50 bg-cream border border-line px-2.5 h-7 flex items-center rounded-control">{state.usage ? `$${state.usage.usd.toFixed(3)}` : "Vultr"}</div>
        </div>
      </div>

      {!started ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-[660px] text-center fadeup">
            <div className="flex justify-center mb-6"><LogoMark size={58} /></div>
            <h1 className="font-display font-medium tracking-[-0.02em] text-[40px] leading-[1.08]">The AI Forensic Auditor</h1>
            <p className="text-ink-70 mt-3 text-[16.5px] leading-relaxed max-w-[520px] mx-auto">Point it at a company’s books. It reads every document, chases every anomaly, and tells you — with citations — where the money went.</p>
            <div className="mt-7"><Composer value={input} onChange={setInput} onSubmit={onSubmit} placeholder="Ask VERITAS to audit a company’s books…" autoFocus hint="↵ to send" /></div>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {STARTERS.map(s => <button key={s} onClick={() => begin(s)} className="text-[13px] text-ink-70 bg-white border border-hairline rounded-full px-3.5 py-1.5 hover:border-ink/25 hover:text-ink transition-colors">{s}</button>)}
            </div>
            <div className="mono text-[11px] text-ink-30 mt-8">Retrieval on VultronRetriever · reasoning on Vultr Serverless Inference</div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto"><ChatThread state={state} followups={followups} engagement={engagementRef.current} /></div>
          <div className="border-t border-line bg-white shrink-0">
            <div className="mx-auto max-w-[720px] px-5 py-3.5">
              <Composer value={input} onChange={setInput} onSubmit={onSubmit} disabled={!canAsk || busy} placeholder={canAsk ? "Ask a follow-up — interrogate the case…" : "VERITAS is examining the books…"} />
            </div>
          </div>
        </>
      )}
      {showReport && <Report state={state} onClose={() => setShowReport(false)} />}
    </div>
  );
}

const CANNED: Record<string, string> = {
  "How do you know Apex Supplies is a shell company?": "Apex Supplies (V-031) shares the **exact registered address** of employee E-007 (Vikram Kulkarni): 245 LBS Marg, Mumbai 400050 — documented in both the vendor registration (**V-031-REG**) and his HR record (**HR-E-007**). VultronRetriever surfaced that registration page even though ‘shell company’ never appears on it. Kulkarni approved **all 14 invoices** himself, totalling **$332,087**, with **0% purchase-order coverage** and no tax ID. That combination is a textbook ACFE shell-company billing scheme.",
  "Could the $250,000 payment be fraud?": "No — I cleared it. The $250,000 to V-020 was a **round-number capital purchase**, a classic red flag, but it is fully supported: a purchase order (**PO-77001**) and authorization in the **August board minutes (BOARD-MIN-2025-08)**. Legitimate, on the record. Flagging it would have been crying wolf.",
  "Show me the total paid to V-031.": "**$332,087** across **14 invoices**, all booked to Professional Services and all approved by E-007. I recomputed the figure directly from the ledger rather than trusting any single document.",
};
