"use client";
import { useState, useRef, useEffect } from "react";
import { useCorpus } from "@/lib/useCorpus";
import { Onboarding } from "@/components/Onboarding";
import { Composer } from "@/components/Composer";
import { CorpusThread } from "@/components/v2/CorpusThread";
import { DocViewer } from "@/components/v2/DocViewer";
import { LogoMark } from "@/components/Logo";
import { FolderOpen } from "@phosphor-icons/react";

export default function Home() {
  const { state, upload, runLive, runReplay, resume, ask, openDoc, approve } = useCorpus();
  const [onboard, setOnboard] = useState(true);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ total: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [emptyPick, setEmptyPick] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // refresh-proof: reattach to an in-flight examination instead of losing it
  useEffect(() => {
    let inflight = false;
    try { inflight = !!sessionStorage.getItem("veritas-case"); } catch {}
    if (!inflight) return;
    resume().then(ok => { if (ok) { setOnboard(false); setStarted(true); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [uploadErr, setUploadErr] = useState<string | null>(null);
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setEmptyPick(false); setUploadErr(null);
    const arr = Array.from(files).filter(f => /\.(txt|csv|md|tsv|log)$/i.test(f.name) && !/manifest\.json$/i.test(f.name));
    if (!arr.length) { setUploading(false); setEmptyPick(true); return; }
    const res = await upload(arr);
    setUploading(false);
    if (res && "error" in res) { setUploadErr(res.error); return; }
    if (res && res.total > 0) setUploaded({ total: res.total });
    else setEmptyPick(true);
  }
  const beginLive = () => { setStarted(true); runLive(); };
  const canAsk = state.status === "done" && !state.replay;
  const submit = () => { const q = input.trim(); if (!q || !canAsk) return; setInput(""); ask(q); };

  if (onboard) return <Onboarding onDone={() => setOnboard(false)} />;

  return (
    <div className="h-dvh flex flex-col bg-white">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-line shrink-0">
        <LogoMark size={26} /><span className="font-display font-medium tracking-[0.06em] text-[16px]">VERITAS</span>
        {started && state.phase && state.status === "running" && (
          <span className="mono text-[11px] text-ink-50 ml-3">{state.phase.index}/{state.phase.of} · {state.phase.title}</span>
        )}
        <div className="ml-auto flex items-center gap-2.5">
          {state.replay && <span className="mono text-[11px] text-ink-50 bg-cream border border-line px-2.5 h-7 flex items-center rounded-control">recorded replay</span>}
          <div className="mono text-[11px] text-ink-50 bg-cream border border-line px-2.5 h-7 flex items-center rounded-control">{state.usage ? `$${state.usage.usd.toFixed(3)}` : "Vultr"}</div>
        </div>
      </div>

      {!started ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-[680px] text-center fadeup">
            <div className="flex justify-center mb-6"><LogoMark size={58} /></div>
            <h1 className="font-display font-medium tracking-[-0.02em] text-[40px] leading-[1.08]">The AI Forensic Auditor</h1>
            <p className="text-ink-70 mt-3 text-[16.5px] leading-relaxed max-w-[540px] mx-auto">Upload a company&rsquo;s books. VERITAS reads every document, works out whose company it is, cross-references the entities, and tells you &mdash; with citations &mdash; where the money went.</p>

            {uploaded ? (
              <div className="mt-8 flex flex-col items-center gap-3">
                <div className="inline-flex items-center gap-2 bg-ice-pale border border-ice/20 rounded-control px-4 py-2.5 text-[14px]"><FolderOpen size={16} weight="duotone" className="text-ice" /><b>{uploaded.total} documents</b> loaded &amp; ready</div>
                <button onClick={beginLive} className="bg-ink text-white font-medium text-[15px] px-7 py-3.5 rounded-control hover:bg-fire transition-colors">Begin examination &rarr;</button>
                <button onClick={() => setUploaded(null)} className="text-[12.5px] text-ink-50 hover:text-ink">choose a different folder</button>
              </div>
            ) : (
              <div className="mt-8 flex flex-col items-center gap-3">
                <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 bg-ink text-white font-medium text-[15px] px-7 py-3.5 rounded-control hover:bg-fire transition-colors">
                  <FolderOpen size={18} weight="duotone" /> {uploading ? "reading the folder…" : "Upload a company’s books"}
                </button>
                <span className="text-[12.5px] text-ink-50 max-w-[440px]">Pick the folder of files &mdash; invoices, bank statements, payroll, HR records as text, CSV, or markdown exports (PDF OCR is on the roadmap). It reads them for real and cites every finding.</span>
                {emptyPick && <span className="text-[12.5px] text-crimson">That folder had no readable documents (.txt / .csv / .md) &mdash; pick the folder that contains the books.</span>}
                {uploadErr && <span className="text-[12.5px] text-crimson">{uploadErr}</span>}
                <input ref={fileRef} type="file" multiple {...({ webkitdirectory: "", directory: "" } as any)} className="hidden" onChange={e => onFiles(e.target.files)} />
                <div className="flex items-center gap-3 mt-2">
                  <div className="h-px w-16 bg-line" /><span className="text-[11.5px] text-ink-30">or</span><div className="h-px w-16 bg-line" />
                </div>
                <button onClick={beginLive} className="text-[13.5px] font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink transition-colors">
                  Examine the demo company &mdash; 1,090 documents, live
                </button>
              </div>
            )}
            <div className="mono text-[11px] text-ink-30 mt-8">Nemotron drone-fleet reads &middot; VultronRetriever retrieves &middot; Nemotron panel judges &mdash; all on Vultr</div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto" data-scroller><CorpusThread state={state} onOpenDoc={setOpenId} onAsk={q => { if (canAsk) ask(q); }} onApprove={approve} /></div>
          <div className="border-t border-line bg-white shrink-0"><div className="mx-auto max-w-[740px] px-5 py-3.5">
            <Composer value={input} onChange={setInput} onSubmit={submit} disabled={!canAsk} placeholder={canAsk ? "Interrogate the case — “how do you know it’s a shell?”" : state.replay ? "This is the recorded replay — run live to interrogate the case" : "VERITAS is examining the books…"} />
          </div></div>
        </>
      )}
      {openId && <DocViewer docId={openId} onClose={() => setOpenId(null)} fetchDoc={openDoc} />}
    </div>
  );
}
