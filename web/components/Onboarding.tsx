"use client";
import { useState, useEffect } from "react";
import { LogoMark } from "./Logo";

/** A brief, premium intro: brand moment → the stat that hooks → into the chat. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [beat, setBeat] = useState(0);
  const [n1, setN1] = useState(0), [n2, setN2] = useState(0);
  useEffect(() => {
    if (beat !== 1) return;
    let a = 0, b = 0; const iv = setInterval(() => { a = Math.min(5, a + 0.2); b = Math.min(3, b + 0.12); setN1(a); setN2(b); if (a >= 5 && b >= 3) clearInterval(iv); }, 24);
    return () => clearInterval(iv);
  }, [beat]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white px-6">
      <button onClick={() => onDone()} className="absolute top-6 right-7 text-[13px] text-ink-50 hover:text-ink transition-colors">Skip →</button>
      {beat === 0 ? (
        <div className="text-center scalein">
          <div className="flex justify-center mb-7"><LogoMark size={76} /></div>
          <div className="font-display font-medium text-[34px] tracking-[0.12em]">VERITAS</div>
          <div className="font-display italic text-ink-50 mt-1.5 text-[17px]">The AI Forensic Auditor</div>
          <button onClick={() => setBeat(1)} className="group mt-9 inline-flex items-center gap-2 bg-ink text-white font-medium text-[15px] px-7 py-3.5 rounded-control hover:bg-fire transition-colors">
            Next <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      ) : (
        <div className="text-center max-w-2xl fadeup">
          <h1 className="font-display font-medium tracking-[-0.02em] leading-[1.08]" style={{ fontSize: "clamp(38px, 6vw, 62px)" }}>
            Companies lose <span className="text-crimson">{n1.toFixed(0)}%</span> of revenue to fraud.
            <br />Audits catch <span className="text-ink">{n2.toFixed(0)}%</span> of it.
          </h1>
          <p className="mt-5 text-[17px] text-ink-70">VERITAS reads all your company books — then finds the fraud.</p>
          <button onClick={() => onDone()} className="group mt-9 inline-flex items-center gap-2 bg-ink text-white font-medium text-[15px] px-7 py-3.5 rounded-control hover:bg-fire transition-colors">
            Try it <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
