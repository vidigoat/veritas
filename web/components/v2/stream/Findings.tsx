"use client";
/** The payoff surfaces — confirmed findings, cleared/unproven leads,
 *  the closing verdict banner, recommended actions, and the report download. */
import { motion } from "framer-motion";
import { jsPDF } from "jspdf";
import { ShieldCheck, ListChecks, DownloadSimple, ShieldSlash, Scales } from "@phosphor-icons/react";
import type { CorpusState, Finding } from "@/lib/useCorpus";
import { EASE, SCHEME_LABEL, fmt, DocChip } from "./kit";
import { RevealText } from "./PhaseHeader";

/** THE confirmed finding — the reveal at the end of a lead's investigation. */
export function FindingCard({ f, onOpenDoc, reveal = true, cur = "\u20AC" }: { f: Finding; onOpenDoc: (id: string) => void; reveal?: boolean; cur?: string }) {
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.98, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="rounded-card border border-crimson/25 bg-white shadow-card overflow-hidden">
      <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-crimson border-b border-crimson/15 bg-crimson-pale flex items-center gap-1.5">
        <ShieldCheck size={13} weight="fill" /> {SCHEME_LABEL[f.scheme] ?? "finding"} · <span className="mono">{f.id}</span>
        {f.nemotron?.overridden && <span className="ml-auto normal-case font-medium tracking-normal" style={{ color: "#B7791F" }}>filed over panel objection — document-proven</span>}
      </div>
      <div className="p-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="mono text-[26px] font-semibold text-crimson leading-none">{cur}{fmt(Math.round(f.amount))}</div>
          <div className="text-[12.5px] text-ink-50">at risk · {Math.round((f.confidence ?? 0) * 100)}% confidence{f.nemotron?.upheld ? " · upheld by the panel" : ""}</div>
        </div>
        {reveal
          ? <RevealText text={f.statement} className="text-[14.5px] leading-relaxed text-ink mt-3" />
          : <p className="text-[14.5px] leading-relaxed text-ink mt-3" style={{ maxWidth: "64ch" }}>{f.statement}</p>}
        <div className="mt-3 space-y-1.5">
          {(f.evidence ?? []).slice(0, 6).map((e: any, i: number) => (
            <div key={i} className="text-[13px] text-ink-70 flex gap-2">
              <span className="text-crimson mt-px shrink-0">▸</span>
              <span>{e.claim} {(e.doc_ids ?? e.docIds ?? []).map((d: string) => <DocChip key={d} id={d} onOpen={onOpenDoc} inline />)}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/** A cleared lead — the herring, correctly dismissed. Calm, never crimson. */
export function ClearedCard({ title, why }: { title?: string; why?: string }) {
  return (
    <div className="rounded-card border border-nvidia/30 bg-nvidia-pale px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "#4a7300" }}>
        <ShieldSlash size={13} weight="fill" /> Cleared — not fraud
      </div>
      {title && <div className="text-[14px] text-ink mt-1">{title}</div>}
      {why && <div className="text-[13px] text-ink-70 mt-0.5">{why}</div>}
    </div>
  );
}

/** An unproven lead — escalated for manual review, no accusation filed. */
export function UnprovenCard({ title }: { title?: string }) {
  return (
    <div className="rounded-card border border-hairline bg-cream px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-50">
        <Scales size={13} weight="duotone" /> Unproven — escalated for manual review
      </div>
      {title && <div className="text-[14px] text-ink mt-1">{title}</div>}
      <div className="text-[13px] text-ink-70 mt-0.5">The evidence cuts both ways, so VERITAS does not accuse. A human examiner gets the file.</div>
    </div>
  );
}

/** The closing verdict banner — total at risk, findings, cleared, panel tally. */
export function VerdictBanner({ state }: { state: CorpusState }) {
  const cur = state.corpus?.currency ?? "\u20AC";
  const total = state.findings.reduce((s, f) => s + (f.amount || 0), 0);
  const upheld = state.findings.filter(f => f.nemotron?.upheld !== false).length;
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="rounded-card border border-crimson/30 bg-white shadow-card overflow-hidden">
      <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-crimson border-b border-crimson/15 bg-crimson-pale">Verdict</div>
      <div className="p-4">
        <div className="flex items-baseline gap-4 flex-wrap">
          <div className="mono text-[30px] font-semibold text-crimson leading-none">{cur}{fmt(Math.round(total))}</div>
          <div className="text-[13px] text-ink-50">
            at risk · {state.findings.length} finding{state.findings.length !== 1 ? "s" : ""} · {state.cleared.length} cleared{state.unproven.length ? ` · ${state.unproven.length} escalated` : ""} · {upheld}/{state.findings.length} upheld by independent review
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Recommended actions — deduped from every confirmed finding. No approval gate. */
export function RecommendedActions({ findings }: { findings: Finding[] }) {
  const acts = Array.from(new Set(findings.flatMap(f => f.recommendedActions ?? [])));
  if (!acts.length) return null;
  return (
    <div className="rounded-card border border-hairline bg-cream/60 px-4 py-3.5">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink"><ListChecks size={14} weight="duotone" /> Recommended actions</div>
      <ul className="mt-2 space-y-1.5">
        {acts.map((a, i) => <li key={i} className="text-[13.5px] text-ink-70 flex gap-2.5"><span className="text-fire mt-px shrink-0">→</span><span>{a}</span></li>)}
      </ul>
    </div>
  );
}

/** The report footer — the artifact an audit committee walks away with. */
export function DoneFooter({ state, api, caseId }: { state: CorpusState; api?: string; caseId?: string }) {
  return (
    <div className="flex items-center gap-3 flex-wrap pt-1">
      <button onClick={() => downloadReport(state)} className="inline-flex items-center gap-2 bg-ink text-white font-medium text-[13px] px-4 py-2.5 rounded-control hover:bg-fire transition-colors">
        <DownloadSimple size={15} weight="bold" /> Download the cited examination report
      </button>
      {api && caseId && (
        <a href={`${api}/api/v2/run/${caseId}/report`} target="_blank" rel="noreferrer" className="text-[12.5px] text-ice hover:underline underline-offset-2">view server report</a>
      )}
      <span className="text-[12.5px] text-ink-50">
        Examined {fmt(state.corpus?.total)} documents{state.elapsedS != null ? ` in ${state.elapsedS}s` : ""}{state.usage ? ` · $${state.usage.usd.toFixed(3)} of inference` : ""} · every claim cited
      </span>
    </div>
  );
}

/** Build the downloadable examination report as a clean, professional PDF (jsPDF).
 *  A4, helvetica typography, page-break aware — the artifact an audit committee keeps.
 *  Never names any model, vendor, or infrastructure: the report is stack-neutral. */
export function downloadReport(state: CorpusState) {
  const cur = state.corpus?.currency ?? "\u20AC";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 48;                       // margins
  const W = pageW - M * 2;            // content width
  let y = M;                          // running cursor (top of next block)

  const INK = [17, 17, 17], MUT = [120, 120, 114], CRIM = [192, 24, 42], GREEN = [74, 115, 0], ICE = [11, 105, 199];
  const setC = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const ensure = (h: number) => { if (y + h > pageH - M) { doc.addPage(); y = M; } };
  const gap = (h: number) => { y += h; };
  const hr = (shade = 224) => { doc.setDrawColor(shade); doc.setLineWidth(0.7); doc.line(M, y, pageW - M, y); };

  // wrapped text block — advances y, breaks pages, returns nothing
  const write = (text: string, o: { size?: number; color?: number[]; bold?: boolean; italic?: boolean; mono?: boolean; lh?: number; x?: number; w?: number } = {}) => {
    const { size = 11, color = INK, bold = false, italic = false, mono = false, lh = 1.42, x = M, w = W } = o;
    const style = mono ? "normal" : italic ? "italic" : bold ? "bold" : "normal";
    doc.setFont(mono ? "courier" : "helvetica", style);
    doc.setFontSize(size); setC(color);
    const lines = doc.splitTextToSize(text, w) as string[];
    for (const ln of lines) { ensure(size * lh); doc.text(ln, x, y + size * 0.86); y += size * lh; }
  };

  const company = state.corpus?.company ?? "the audited company";
  const total = state.findings.reduce((s, f) => s + (f.amount || 0), 0);
  const clearedN = state.cleared.length;

  // ── 1. Header ──
  doc.setFont("helvetica", "bold"); doc.setFontSize(22); setC(INK);
  doc.text("VERITAS", M, y + 20);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); setC(MUT);
  doc.text("Forensic Examination", M, y + 35);
  y += 50;
  write(`Subject: ${company}`, { size: 13, bold: true });
  gap(9); hr(); gap(17);

  // ── 2. Summary band ──
  write(`${cur}${fmt(Math.round(total))} at risk · ${state.findings.length} finding${state.findings.length !== 1 ? "s" : ""} · ${clearedN} cleared`, { size: 14, bold: true, color: total > 0 ? CRIM : INK });
  gap(4);
  write(`Examined ${fmt(state.corpus?.total)} documents · every figure recomputed from the ledger, every claim cited to a source document.`, { size: 10, color: MUT });
  gap(20);

  // ── 3. Findings — one section each ──
  for (const f of state.findings) {
    ensure(66);
    const scheme = SCHEME_LABEL[f.scheme] ?? f.scheme;
    const title = scheme.charAt(0).toUpperCase() + scheme.slice(1);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); setC(INK);
    doc.text(title, M, y + 11);
    doc.setFontSize(13); setC(CRIM);
    doc.text(`${cur}${fmt(Math.round(f.amount))}`, pageW - M, y + 11, { align: "right" });
    y += 20;
    write(`${Math.round((f.confidence ?? 0) * 100)}% confidence · ${f.id}`, { size: 9, mono: true, color: MUT });
    gap(6);
    write(f.statement, { size: 11, color: INK });
    gap(10);
    write("Evidence", { size: 9.5, bold: true, color: MUT });
    gap(3);
    for (const e of (f.evidence ?? [])) {
      write(`— ${e.claim}`, { size: 10, color: INK, x: M + 10, w: W - 10 });
      const ids = (e.doc_ids ?? e.docIds ?? []).join(", ");
      if (ids) write(ids, { size: 8.5, mono: true, color: ICE, x: M + 22, w: W - 22 });
      gap(3);
    }
    gap(12); hr(238); gap(16);
  }

  // ── 4. Cleared leads ──
  if (state.cleared.length) {
    ensure(40);
    write("Cleared", { size: 12, bold: true, color: GREEN });
    gap(7);
    for (const c of state.cleared) {
      write(`${c.anomaly?.title ?? "Lead"} — ${c.why ?? "innocent explanation holds; no fraud."}`, { size: 10, color: INK });
      gap(5);
    }
    gap(12);
  }

  // ── Escalated (unproven) leads ──
  if (state.unproven.length) {
    ensure(40);
    write("Escalated for manual review", { size: 12, bold: true, color: MUT });
    gap(7);
    for (const u of state.unproven) {
      write(`${u.anomaly?.title ?? "Lead"} — evidence cuts both ways; no accusation filed.`, { size: 10, color: INK });
      gap(5);
    }
    gap(12);
  }

  // ── 5. Recommended actions ──
  const acts = Array.from(new Set(state.findings.flatMap(f => f.recommendedActions ?? [])));
  if (acts.length) {
    ensure(40);
    write("Recommended actions", { size: 12, bold: true, color: INK });
    gap(7);
    for (const a of acts) { write(`•  ${a}`, { size: 10, color: INK, x: M + 4, w: W - 4 }); gap(4); }
    gap(12);
  }

  // ── 6. Footer on the last page ──
  const fy = pageH - 30;
  doc.setDrawColor(228); doc.setLineWidth(0.6); doc.line(M, fy - 12, pageW - M, fy - 12);
  doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); setC(MUT);
  doc.text("Every figure recomputed from the ledger; every claim cited to a source document. Generated by VERITAS.", M, fy);

  const slug = (company || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  doc.save(slug ? `VERITAS-examination-${slug}.pdf` : "VERITAS-examination.pdf");
}
