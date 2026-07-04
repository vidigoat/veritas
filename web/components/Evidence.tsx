"use client";
import type { Finding } from "@/lib/useCase";
export function Evidence({ findings }: { findings: Finding[] }) {
  const claims = findings.flatMap(f => f.evidence.map((e: any) => ({ ...e, fid: f.id })));
  const cited = claims.filter(c => c.doc_ids?.length || c.verified_by).length;
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mono text-[13px] text-ink-60 mb-4">{claims.length} claims · {cited} cited · {claims.length - cited} uncited</div>
      {claims.length === 0 && <div className="text-ink-30 text-sm text-center mt-16">Evidence collects here as findings are filed</div>}
      {claims.map((c, i) => (
        <div key={i} className="border-b border-line py-3">
          <div className="text-[14px]">{c.claim}</div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {(c.doc_ids ?? []).map((d: string) => <span key={d} className="mono text-[11px] bg-crimson-t text-crimson px-2 py-1 rounded-md">{d}</span>)}
            {c.verified_by && <span className="mono text-[11px] bg-green-t text-green px-2 py-1 rounded-md">✓ {c.verified_by}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
