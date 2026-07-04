"use client";
import { useState, useEffect } from "react";
import { LogoMark } from "./Logo";

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [screen, setScreen] = useState(0);
  const [n1, setN1] = useState(0); const [n2, setN2] = useState(0);
  useEffect(() => { const t = setTimeout(() => setScreen(1), 2600); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (screen !== 1) return;
    let a = 0, b = 0; const iv = setInterval(() => { a = Math.min(5, a + 0.25); b = Math.min(3, b + 0.15); setN1(a); setN2(b); if (a >= 5 && b >= 3) clearInterval(iv); }, 22);
    return () => clearInterval(iv);
  }, [screen]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper">
      <button onClick={onDone} className="absolute top-6 right-8 text-sm text-ink-60 hover:text-ink">Skip →</button>
      {screen === 0 ? (
        <div className="text-center fadeup">
          <div className="flex justify-center mb-6"><LogoMark size={88} /></div>
          <div className="serif" style={{ fontSize: 40, fontWeight: 500, letterSpacing: "0.14em" }}>VERITAS</div>
          <div className="serif italic text-ink-60 mt-2" style={{ fontSize: 18 }}>The AI Forensic Auditor</div>
        </div>
      ) : (
        <div className="text-center fadeup max-w-3xl px-8">
          <h1 className="serif" style={{ fontSize: 68, fontWeight: 400, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
            Companies lose <span className="text-crimson" style={{ fontWeight: 500 }}>{n1.toFixed(0)}%</span> of revenue to fraud.
            <br />Audits catch <span style={{ fontWeight: 500 }}>{n2.toFixed(0)}%</span> of it.
          </h1>
          <p className="mt-5 text-lg text-ink-60">VERITAS reads <span className="serif italic">everything</span> — then investigates what it finds.</p>
          <button onClick={onDone} className="mt-9 bg-ink text-paper font-semibold px-7 py-4 rounded-control border-[1.5px] border-ink hover:opacity-90 transition-opacity">Open a case →</button>
        </div>
      )}
    </div>
  );
}
