"use client";
import { useState, useRef, useEffect } from "react";
import { useCorpus } from "@/lib/useCorpus";
import { Onboarding } from "@/components/Onboarding";
import { Composer } from "@/components/Composer";
import { CorpusThread } from "@/components/v2/CorpusThread";
import { DocViewer } from "@/components/v2/DocViewer";
import { LogoMark } from "@/components/Logo";
import { StackProvider } from "@/components/v2/stream/kit";

export default function Home() {
  const { state, upload, runLive, resume, ask, openDoc, approve } = useCorpus();
  const [onboard, setOnboard] = useState(true);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ total: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // stack-neutral by default; "?stack=1" or the header toggle reveals model names
  const [stack, setStack] = useState(false);
  useEffect(() => {
    try {
      const url = new URLSearchParams(location.search).get("stack");
      if (url != null) { const on = url !== "0"; setStack(on); localStorage.setItem("veritas-stack", on ? "1" : "0"); }
      else setStack(localStorage.getItem("veritas-stack") === "1");
    } catch {}
  }, []);
  const toggleStack = () => setStack(s => { try { localStorage.setItem("veritas-stack", s ? "0" : "1"); } catch {} return !s; });

  // refresh-proof: reattach to an in-flight examination instead of losing it
  useEffect(() => {
    let inflight = false;
    try { inflight = !!sessionStorage.getItem("veritas-case"); } catch {}
    if (!inflight) return;
    resume().then(ok => { if (ok) { setOnboard(false); setStarted(true); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setNotice(null);
    const arr = Array.from(files).filter(f => /\.(txt|csv|md|tsv|log)$/i.test(f.name) && !/manifest\.json$/i.test(f.name));
    if (!arr.length) { setUploading(false); setNotice("That folder had no readable documents (.txt / .csv / .md) — pick the folder that contains the books."); return; }
    const res = await upload(arr);
    setUploading(false);
    if (res && "error" in res) { setNotice(res.error); return; }
    if (res && res.total > 0) setUploaded({ total: res.total });
    else setNotice("That folder had no readable documents — pick the folder that contains the books.");
  }

  // send from the landing composer: needs an attached folder; the text is the engagement brief
  const submit = () => {
    if (!started) {
      if (!uploaded) { fileRef.current?.click(); return; }   // no folder yet → open the picker
      setStarted(true); runLive(undefined, input.trim() || undefined); setInput("");
      return;
    }
    const q = input.trim(); if (!q || state.status !== "done") return;   // interrogate after the run
    setInput(""); ask(q);
  };
  const canAsk = state.status === "done";

  if (onboard) return <Onboarding onDone={() => setOnboard(false)} />;

  return (
    <StackProvider value={stack}>
    <div className="h-dvh flex flex-col bg-white">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-line shrink-0">
        <LogoMark size={26} /><span className="font-display font-medium tracking-[0.06em] text-[16px]">VERITAS</span>
        {started && state.phase && state.status === "running" && (
          <span className="mono text-[11px] text-ink-50 ml-3">{state.phase.index}/{state.phase.of} · {state.phase.title}</span>
        )}
        <div className="ml-auto flex items-center gap-2.5">
          <button onClick={toggleStack} title={stack ? "hide the model stack" : "show the model stack"}
            className={`mono text-[11px] border px-2.5 h-7 flex items-center rounded-control transition-colors ${stack ? "text-white bg-ink border-ink" : "text-ink-50 bg-cream border-line hover:text-ink"}`}>
            stack
          </button>
          <div className="mono text-[11px] text-ink-50 bg-cream border border-line px-2.5 h-7 flex items-center rounded-control">{state.usage ? `$${state.usage.usd.toFixed(3)}` : "Vultr"}</div>
        </div>
      </div>

      {!started ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-[620px] text-center fadeup">
            <div className="flex justify-center mb-6"><LogoMark size={58} /></div>
            <h1 className="font-display font-medium tracking-[-0.02em] text-[40px] leading-[1.08]">The AI Forensic Auditor</h1>
            <p className="text-ink-70 mt-3 text-[16.5px] leading-relaxed max-w-[520px] mx-auto">Attach a company&rsquo;s books and ask. VERITAS reads every document, works out whose company it is, cross-references the entities, and tells you &mdash; with citations &mdash; where the money went.</p>

            <div className="mt-8 text-left">
              <Composer
                value={input} onChange={setInput} onSubmit={submit} autoFocus hint="↵ to send"
                onAttach={() => fileRef.current?.click()}
                attached={!!uploaded}
                attachLabel={uploading ? "reading…" : uploaded ? `${uploaded.total} documents` : "Attach folder"}
                placeholder={uploaded ? "Ask VERITAS to audit these books — e.g. “audit my company, please”" : "Attach your company’s folder, then ask…"}
              />
              <input ref={fileRef} type="file" multiple {...({ webkitdirectory: "", directory: "" } as any)} className="hidden" onChange={e => onFiles(e.target.files)} />
              {notice && <p className="text-[12.5px] text-crimson mt-2.5 px-1">{notice}</p>}
              <p className="text-[12.5px] text-ink-40 mt-2.5 px-1">Attach the folder of files &mdash; invoices, bank statements, payroll, HR records (text, CSV, or markdown). It reads them for real and cites every finding.</p>
            </div>
            {/* no books handy? one click runs the bundled 1,090-document company, live */}
            <button onClick={() => { setStarted(true); runLive(); }}
              className="group mt-6 inline-flex items-center gap-2 text-[13.5px] font-medium text-ink border border-line rounded-control px-4 py-2.5 hover:border-ink transition-colors">
              No books handy? <span className="font-semibold">Audit the sample company</span>
              <span className="text-ink-50 font-normal">&mdash; 1,090 documents, live</span>
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </button>
            <div className="mono text-[11px] text-ink-30 mt-6">Nemotron drone-fleet reads &middot; VultronRetriever retrieves &middot; Nemotron panel judges &mdash; all on Vultr</div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto" data-scroller><CorpusThread state={state} onOpenDoc={setOpenId} onAsk={q => { if (canAsk) ask(q); }} onApprove={approve} /></div>
          <div className="border-t border-line bg-white shrink-0"><div className="mx-auto max-w-[740px] px-5 py-3.5">
            <Composer value={input} onChange={setInput} onSubmit={submit} disabled={!canAsk} placeholder={canAsk ? "Interrogate the case — “how do you know it’s a shell?”" : "VERITAS is examining the books…"} />
          </div></div>
        </>
      )}
      {openId && <DocViewer docId={openId} onClose={() => setOpenId(null)} fetchDoc={openDoc} />}
    </div>
    </StackProvider>
  );
}
