"use client";
import { Lock, Scroll } from "@phosphor-icons/react";
import type { CaseState } from "@/lib/useCase";
export function VerdictBar({ state, onApprove, onReport }: { state: CaseState; onApprove: () => void; onReport: () => void }) {
  if (!state.approval && !state.findings.length) return null;
  const confirmed = state.findings.filter(f => f.class?.includes("shell") || f.class === "expense_fraud").length;
  const cleared = state.hypotheses.filter(h => h.status === "cleared").length;
  const total = state.findings.reduce((s, f) => { const m = f.statement.replace(/,/g, "").match(/(\d{5,})/); return s + (m ? parseInt(m[1]) : 0); }, 0);
  return (
    <div className="fadeup border-t border-line bg-panel px-6 py-4 flex items-center gap-6" style={{ boxShadow: "0 -8px 32px rgba(26,26,26,0.06)" }}>
      <div>
        <div className="mono text-[12px] text-ink-60">{confirmed} CONFIRMED · {cleared} CLEARED</div>
        <div className="mono text-[28px] font-semibold text-crimson leading-tight">${total.toLocaleString()}</div>
      </div>
      <div className="text-[13px] text-ink-60">confidence {Math.round((state.findings[0]?.confidence ?? 0) * 100)}%<br />{state.closed ? `${state.closed.elapsedS}s` : "in progress"}</div>
      <div className="flex-1" />
      {state.approval && !state.approved && (
        <button onClick={onApprove} title="VERITAS never acts alone" className="bg-crimson text-white font-semibold text-[14.5px] px-5 py-3 rounded-control border-[1.5px] border-crimson hover:opacity-90 flex items-center gap-2"><Lock size={16} weight="duotone" /> Approve freeze: {state.approval.target}</button>
      )}
      {state.approved && <span className="text-green font-semibold text-sm">✓ {state.approval?.target} frozen</span>}
      {state.reportReady && <button onClick={onReport} className="bg-ink text-paper font-semibold text-[14.5px] px-5 py-3 rounded-control flex items-center gap-2"><Scroll size={16} weight="duotone" /> Generate report</button>}
    </div>
  );
}
