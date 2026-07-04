"use client";
import { useState, useRef, useEffect } from "react";
import { PaperPlaneRight, Sparkle } from "@phosphor-icons/react";

const API = (typeof window !== "undefined" && (window as any).__VERITAS_API__) || "http://localhost:8787";
const SUGGESTED = ["How do you know Apex Supplies is a shell company?", "Could the $250,000 payment be fraud?", "Show me the total paid to V-031."];

interface Msg { role: "user" | "veritas"; text: string; tools: string[]; live?: boolean }

export function CaseChat({ caseId, staticMode }: { caseId: string | null; staticMode?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setInput(""); setBusy(true);
    setMsgs(m => [...m, { role: "user", text: q, tools: [] }, { role: "veritas", text: "", tools: [], live: true }]);
    if (staticMode || !caseId) {
      // static demo: canned but real answers from the recorded case
      const canned = CANNED[q] ?? "In the full app I answer this live from the case evidence — try it locally with a running investigation.";
      await typeOut(canned, setMsgs);
      setBusy(false); return;
    }
    try {
      const r = await fetch(`${API}/api/case/${caseId}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const reader = r.body!.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try { const ev = JSON.parse(line.slice(6));
            if (ev.type === "__done") continue;
            setMsgs(m => { const c = [...m]; const last = c[c.length - 1];
              if (ev.type === "answer_tool") last.tools = [...last.tools, ev.payload.summary];
              if (ev.type === "answer_delta") last.text = ev.payload.text;
              return c; });
          } catch {}
        }
      }
    } catch { setMsgs(m => { const c = [...m]; c[c.length - 1].text = "Connection error."; return c; }); }
    setMsgs(m => { const c = [...m]; if (c.length) c[c.length - 1].live = false; return c; });
    setBusy(false);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {msgs.length === 0 && (
          <div className="text-center mt-8">
            <Sparkle size={28} weight="duotone" className="text-gold mx-auto mb-3" />
            <div className="serif text-lg">Interrogate the case</div>
            <div className="text-ink-60 text-sm mt-1 mb-5">Ask VERITAS anything — it answers from the evidence.</div>
            <div className="space-y-2">{SUGGESTED.map(s => <button key={s} onClick={() => ask(s)} className="block w-full text-left text-[13.5px] bg-[#FAFAF5] border border-line rounded-control px-3 py-2.5 hover:border-ink transition-colors">{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            {m.role === "user" ? (
              <div className="inline-block bg-ink text-paper rounded-2xl rounded-tr-sm px-4 py-2.5 text-[14.5px] max-w-[85%]">{m.text}</div>
            ) : (
              <div className="max-w-[92%]">
                {m.tools.length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{m.tools.map((t, j) => <span key={j} className="mono text-[11px] bg-gold-t text-[#8a6d15] px-2 py-0.5 rounded">{t}</span>)}</div>}
                <div className={`text-[14.5px] leading-relaxed ${m.live && !m.text ? "text-ink-30" : ""}`} dangerouslySetInnerHTML={{ __html: fmt(m.text) || (m.live ? "thinking…" : "") }} />
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="p-4 border-t border-line">
        <div className="flex items-center gap-2 bg-panel border-[1.5px] border-ink rounded-2xl px-4 py-2.5">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && ask(input)} placeholder="Ask about the case…" className="flex-1 bg-transparent outline-none text-[14.5px]" disabled={busy} />
          <button onClick={() => ask(input)} disabled={busy || !input.trim()} className="w-9 h-9 rounded-full bg-ink text-paper flex items-center justify-center disabled:opacity-30"><PaperPlaneRight size={16} weight="fill" /></button>
        </div>
      </div>
    </div>
  );
}
function fmt(t: string) { return t.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, '<code class="mono text-[13px] bg-[#FAFAF5] px-1 rounded">$1</code>'); }
async function typeOut(text: string, setMsgs: any) {
  for (let i = 0; i <= text.length; i += 3) { await new Promise(r => setTimeout(r, 12)); setMsgs((m: Msg[]) => { const c = [...m]; c[c.length - 1].text = text.slice(0, i); return c; }); }
  setMsgs((m: Msg[]) => { const c = [...m]; c[c.length - 1].live = false; return c; });
}
const CANNED: Record<string, string> = {
  "How do you know Apex Supplies is a shell company?": "Apex Supplies shares the exact registered address of employee E-007 (Vikram Kulkarni): **245 LBS Marg, Mumbai 400050**, documented in both the vendor registration (**V-031-REG**) and his HR record (**HR-E-007**). Kulkarni approved **all 14 invoices** himself, totaling **$332,087**, with **0% purchase-order coverage** and no tax ID. That combination is a textbook ACFE shell scheme.",
  "Could the $250,000 payment be fraud?": "No — I investigated it and cleared it. The **$250,000** payment to Falcon Systems (V-020) is a packaging-line capital expenditure that was **authorized in the August board minutes** (BOARD-MIN-2025-08) and backed by **PO-77001**. A large round number alone is not fraud; the authorization trail makes this legitimate.",
  "Show me the total paid to V-031.": "The total paid to V-031 (Apex Supplies) is **$332,087**, confirmed by a direct ledger query summing all 14 invoices. Every one was approved by the same employee whose home address the vendor is registered at.",
};
