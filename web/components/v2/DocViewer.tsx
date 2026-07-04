"use client";
import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
/** Opens a REAL source document — the proof a citation points to. */
export function DocViewer({ docId, onClose, fetchDoc }: { docId: string; onClose: () => void; fetchDoc: (id: string) => Promise<{ docId: string; type: string; text: string } | null> }) {
  const [doc, setDoc] = useState<{ docId: string; type: string; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let live = true; setLoading(true); fetchDoc(docId).then(d => { if (live) { setDoc(d); setLoading(false); } }); return () => { live = false; }; }, [docId]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/25 flex justify-center overflow-y-auto py-10 fadein" onClick={onClose}>
      <div className="bg-white w-[720px] max-w-[92vw] rounded-card shadow-lift h-fit border border-hairline scalein" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line">
          <span className="mono text-[11px] font-bold text-ice bg-ice-pale rounded px-1.5 py-0.5">DOC</span>
          <span className="font-semibold text-[14px]">{docId}</span>
          {doc && <span className="text-[12px] text-ink-50">· {doc.type.replace(/_/g, " ")}</span>}
          <button onClick={onClose} className="ml-auto text-ink-50 hover:text-ink"><X size={18} /></button>
        </div>
        <div className="p-5">
          {loading ? <div className="text-ink-50 text-sm py-8 text-center">opening the source document…</div>
            : doc ? <pre className="mono text-[12.5px] leading-relaxed text-ink whitespace-pre-wrap overflow-x-auto">{doc.text}</pre>
            : <div className="text-ink-50 text-sm py-8 text-center">document not found</div>}
        </div>
      </div>
    </div>
  );
}
