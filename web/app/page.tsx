"use client";
import { useState, useEffect } from "react";
import { useCase } from "@/lib/useCase";
import { Wordmark } from "@/components/Logo";
import { Onboarding } from "@/components/Onboarding";
import { Timeline } from "@/components/Timeline";
import { MoneyGraph } from "@/components/MoneyGraph";
import { Evidence } from "@/components/Evidence";
import { VerdictBar } from "@/components/Verdict";
import { Report } from "@/components/Report";

const CONNECTORS = ["QuickBooks", "NetSuite", "Stripe", "Gmail", "SAP"];

export default function Home() {
  const { state, startDemo, startLive, approve, caseId } = useCase();
  const [onboard, setOnboard] = useState(true);
  const [tab, setTab] = useState<"graph" | "evidence">("graph");
  const [showReport, setShowReport] = useState(false);
  const [elapsed, setElapsed] = useState("00:00");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (state.status !== "running") return;
    const t0 = Date.now(); const iv = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); setElapsed(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`); }, 1000);
    return () => clearInterval(iv);
  }, [state.status]);
  useEffect(() => { if (state.reveal) setTab("graph"); }, [state.reveal]);

  const isStaticDeploy = typeof window !== "undefined" && !window.location.hostname.includes("localhost");
  const begin = (mode: "demo" | "live") => { setStarted(true); (mode === "demo" || isStaticDeploy) ? startDemo(3) : startLive(); };

  if (onboard) return <Onboarding onDone={() => setOnboard(false)} />;

  return (
    <div className="h-screen flex flex-col bg-paper">
      {/* top bar */}
      <div className="flex items-center gap-4 px-7 py-3.5 border-b border-line bg-panel">
        <Wordmark size={18} />
        {state.corpus && <div className="text-[13px] text-ink-60 border-l border-line pl-4">Meridian Traders Pvt Ltd <span className="text-ink-30">· routine annual examination</span></div>}
        <div className="ml-auto mono text-xs text-ink-60 bg-[#FAFAF5] border border-line px-3 py-1.5 rounded-lg">
          {state.usage ? `$${state.usage.usd.toFixed(3)} · ${((state.usage.inTokens + state.usage.outTokens) / 1000).toFixed(0)}k tokens` : "Kimi K2.6 + Nemotron"}
        </div>
      </div>

      {!started ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-xl fadeup">
            <div className="serif text-3xl font-medium mb-2">Open a case</div>
            <p className="text-ink-60 mb-8">Drop a company's books and VERITAS runs a full forensic examination.</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <button onClick={() => begin("demo")} className="col-span-3 bg-panel border-[1.5px] border-ink rounded-card p-5 hover:bg-[#FAFAF5] transition-colors text-left">
                <div className="font-semibold flex items-center gap-2">📁 Meridian Traders books <span className="mono text-[11px] bg-green-t text-green px-2 py-0.5 rounded ml-auto">READY</span></div>
                <div className="text-sm text-ink-60 mt-1">2,263 transactions · 2,304 documents · 46 vendors · 18 employees</div>
              </button>
              {CONNECTORS.map(c => <div key={c} className="bg-[#FAFAF5] border border-line rounded-control p-3 text-sm text-ink-30 text-center">{c}<div className="text-[10px] mt-0.5">enterprise rollout</div></div>)}
            </div>
            <button onClick={() => begin("demo")} className="bg-ink text-paper font-semibold px-8 py-3.5 rounded-control">Begin examination →</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 flex min-h-0">
            {/* timeline — the star */}
            <div className="flex-1 min-w-0 border-r border-line">
              <Timeline phases={state.phases} elapsed={elapsed} />
            </div>
            {/* right panel */}
            <div className="w-[44%] flex flex-col">
              <div className="flex border-b border-line px-4 pt-3 gap-1">
                {(["graph", "evidence"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-semibold rounded-t-lg ${tab === t ? "text-ink border-b-2 border-ink" : "text-ink-60"}`}>{t === "graph" ? "Money graph" : "Evidence"}</button>
                ))}
              </div>
              <div className="flex-1 min-h-0 relative">
                {tab === "graph" ? <MoneyGraph hypotheses={state.hypotheses} reveal={state.reveal} findings={state.findings} /> : <Evidence findings={state.findings} />}
              </div>
              {/* facecam-safe corner reserved bottom-right */}
            </div>
          </div>
          <VerdictBar state={state} onApprove={approve} onReport={() => setShowReport(true)} />
        </>
      )}
      {showReport && <Report state={state} onClose={() => setShowReport(false)} />}
    </div>
  );
}
