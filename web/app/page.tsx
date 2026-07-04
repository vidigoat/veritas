"use client";
import { useState, useRef } from "react";
import { useCorpus } from "@/lib/useCorpus";
import { Onboarding } from "@/components/Onboarding";
import { Composer } from "@/components/Composer";
import { CorpusThread } from "@/components/v2/CorpusThread";
import { DocViewer } from "@/components/v2/DocViewer";
import { LogoMark } from "@/components/Logo";
import { Paperclip, Lock, FolderOpen } from "@phosphor-icons/react";

const ENGAGEMENT_DEMO = "Audit Northwind Trading Co — a full forensic examination of these books. Find any fraud and cite the source documents.";

export default function Home() {
  const { state, upload, runLive, runDemo, openDoc, approve, caseId } = useCorpus();
  const [onboard, setOnboard] = useState(true);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [engagement, setEngagement] = useState(ENGAGEMENT_DEMO);
  const [uploaded, setUploaded] = useState<{ total: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isLocal = typeof window !== "undefined" && window.location.hostname.includes("localhost");

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const arr = Array.from(files).filter(f => /\.(txt|csv|md|pdf|json)$/i.test(f.name) && !/manifest\.json$/i.test(f.name));
    const res = await upload(arr);
    setUploading(false);
    if (res) setUploaded({ total: res.total });
  }

  const beginDemo = (text?: string) => { setEngagement(text?.trim() || ENGAGEMENT_DEMO); setStarted(true); runDemo(4); };
  const beginLive = () => { setStarted(true); runLive(); };
  const onSubmit = () => {
    if (!started) { if (uploaded) beginLive(); else beginDemo(input); return; }
    // (interrogation could go here)
  };
  const canAsk = state.status === "done";

  if (onboard) return <Onboarding onDone={() => setOnboard(false)} />;

  return (
    <div className="h-screen flex flex-col bg-white">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-line shrink-0">
        <LogoMark size={26} /><span className="font-display font-medium tracking-[0.06em] text-[16px]">VERITAS</span>
        <div className="ml-auto flex items-center gap-2.5">
          {state.freeze && !state.approved && <button onClick={approve} className="flex items-center gap-1.5 bg-crimson text-white font-medium text-[12.5px] px-3 py-1.5 rounded-control hover:opacity-90"><Lock size={13} weight="duotone" /> Approve freeze: {state.freeze.target}</button>}
          {state.approved && <span className="text-nvidia font-semibold text-[12.5px]">✓ frozen</span>}
          <div className="mono text-[11px] text-ink-50 bg-cream border border-line px-2.5 h-7 flex items-center rounded-control">{state.usage ? `$${state.usage.usd.toFixed(3)}` : "Vultr"}</div>
        </div>
      </div>

      {!started ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-[680px] text-center fadeup">
            <div className="flex justify-center mb-6"><LogoMark size={58} /></div>
            <h1 className="font-display font-medium tracking-[-0.02em] text-[40px] leading-[1.08]">The AI Forensic Auditor</h1>
            <p className="text-ink-70 mt-3 text-[16.5px] leading-relaxed max-w-[540px] mx-auto">Give it a company’s books. It reads every document, extracts the facts itself, cross-references the entities, and tells you — with citations — where the money went.</p>

            {uploaded ? (
              <div className="mt-7 flex flex-col items-center gap-3">
                <div className="inline-flex items-center gap-2 bg-ice-pale border border-ice/20 rounded-control px-4 py-2.5 text-[14px]"><FolderOpen size={16} weight="duotone" className="text-ice" /><b>{uploaded.total} documents</b> loaded &amp; ready</div>
                <button onClick={beginLive} className="bg-ink text-white font-medium text-[15px] px-7 py-3.5 rounded-control hover:bg-fire transition-colors">Begin examination →</button>
                <button onClick={() => setUploaded(null)} className="text-[12.5px] text-ink-50 hover:text-ink">use different files</button>
              </div>
            ) : (
              <>
                <div className="mt-7"><Composer value={input} onChange={setInput} onSubmit={onSubmit} placeholder={isLocal ? "Ask VERITAS to audit a company’s books…" : "Ask VERITAS to audit these books…"} autoFocus hint="↵ to send" /></div>
                <div className="flex flex-wrap gap-2 justify-center mt-4 items-center">
                  <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 text-[13px] text-ink font-medium bg-white border border-ink/20 rounded-full px-3.5 py-1.5 hover:bg-cream transition-colors">
                    <Paperclip size={14} weight="bold" /> {uploading ? "loading…" : "Add files — audit your own books"}
                  </button>
                  <button onClick={() => beginDemo("Audit Northwind Trading Co for fraud")} className="text-[13px] text-ink-70 bg-white border border-hairline rounded-full px-3.5 py-1.5 hover:border-ink/25 transition-colors">Try the sample company</button>
                </div>
                <input ref={fileRef} type="file" multiple {...({ webkitdirectory: "", directory: "" } as any)} className="hidden" onChange={e => onFiles(e.target.files)} />
              </>
            )}
            <div className="mono text-[11px] text-ink-30 mt-8">Nemotron drone-fleet reads · VultronRetriever retrieves · Nemotron panel judges — all on Vultr</div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto"><CorpusThread state={state} engagement={engagement} onOpenDoc={setOpenId} /></div>
          <div className="border-t border-line bg-white shrink-0"><div className="mx-auto max-w-[740px] px-5 py-3.5">
            <Composer value={input} onChange={setInput} onSubmit={onSubmit} disabled={!canAsk} placeholder={canAsk ? "Ask a follow-up — click any DOC to read the source…" : "VERITAS is examining the books…"} />
          </div></div>
        </>
      )}
      {openId && <DocViewer docId={openId} onClose={() => setOpenId(null)} fetchDoc={openDoc} />}
    </div>
  );
}
