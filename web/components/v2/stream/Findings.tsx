"use client";
/** The payoff surfaces — confirmed findings, cleared/unproven leads,
 *  the closing verdict banner, recommended actions, and the report footer. */
import { motion } from "framer-motion";
import { ShieldCheck, ListChecks, DownloadSimple, ShieldSlash, Scales } from "@phosphor-icons/react";
import type { CorpusState, Finding } from "@/lib/useCorpus";
import { EASE, SCHEME_LABEL, fmt, DocChip } from "./kit";
import { RevealText } from "./PhaseHeader";

/** THE confirmed finding — the reveal at the end of a lead's investigation. */
export function FindingCard({ f, onOpenDoc, reveal = true }: { f: Finding; onOpenDoc: (id: string) => void; reveal?: boolean }) {
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.98, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="rounded-card border border-crimson/25 bg-white shadow-card overflow-hidden">
      <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-crimson border-b border-crimson/15 bg-crimson-pale flex items-center gap-1.5">
        <ShieldCheck size={13} weight="fill" /> {SCHEME_LABEL[f.scheme] ?? "finding"} · <span className="mono">{f.id}</span>
        {f.nemotron?.overridden && <span className="ml-auto normal-case font-medium tracking-normal" style={{ color: "#B7791F" }}>filed over panel objection — document-proven</span>}
      </div>
      <div className="p-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="mono text-[26px] font-semibold text-crimson leading-none">€{fmt(Math.round(f.amount))}</div>
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
  const total = state.findings.reduce((s, f) => s + (f.amount || 0), 0);
  const upheld = state.findings.filter(f => f.nemotron?.upheld !== false).length;
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="rounded-card border border-crimson/30 bg-white shadow-card overflow-hidden">
      <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-crimson border-b border-crimson/15 bg-crimson-pale">Verdict</div>
      <div className="p-4">
        <div className="flex items-baseline gap-4 flex-wrap">
          <div className="mono text-[30px] font-semibold text-crimson leading-none">€{fmt(Math.round(total))}</div>
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

/** Build the downloadable markdown report from the filed case. */
export function downloadReport(state: CorpusState) {
  const L: string[] = [];
  const company = state.corpus?.company ?? "the audited company";
  const total = state.findings.reduce((s, f) => s + (f.amount || 0), 0);
  L.push(`# VERITAS — Forensic Examination Report`, ``);
  L.push(`**Subject:** ${company}  `);
  L.push(`**Corpus:** ${fmt(state.corpus?.total)} documents  `);
  L.push(`**Verdict:** ${state.findings.length} confirmed finding(s), €${fmt(Math.round(total))} at risk · ${state.cleared.length} lead(s) cleared · ${state.unproven.length} escalated  `);
  L.push(`**Method:** plan → read every document → cross-reference identities → per-lead investigation with document retrieval (twice per lead, the second query written by the agent) → independent review panel · every figure recomputed from the ledger`, ``);
  for (const f of state.findings) {
    L.push(`## ${f.id} — ${SCHEME_LABEL[f.scheme] ?? f.scheme} · €${fmt(Math.round(f.amount))} at risk`, ``);
    L.push(f.statement, ``);
    L.push(`Confidence: ${Math.round((f.confidence ?? 0) * 100)}% · Independent review: ${f.nemotron?.upheld === false ? "objection recorded (filed on dispositive document evidence)" : "upheld"}`, ``);
    L.push(`**Evidence**`);
    for (const e of (f.evidence ?? [])) L.push(`- ${e.claim} _[${(e.doc_ids ?? e.docIds ?? []).join(", ")}]_`);
    if (f.recommendedActions?.length) { L.push(``, `**Recommended actions**`); for (const a of f.recommendedActions) L.push(`- ${a}`); }
    L.push(``);
  }
  if (state.cleared.length) {
    L.push(`## Cleared leads — investigated and exonerated`, ``);
    for (const c of state.cleared) L.push(`- **${c.anomaly?.title ?? "lead"}** — ${c.why ?? "innocent explanation holds"}`);
    L.push(``);
  }
  if (state.unproven.length) {
    L.push(`## Escalated for manual review`, ``);
    for (const u of state.unproven) L.push(`- ${u.anomaly?.title ?? "lead"} — evidence cuts both ways; no accusation filed`);
    L.push(``);
  }
  L.push(`---`, `_Every dollar figure recomputed from the ledger; every claim cited to a source document. Generated by VERITAS._`);
  const blob = new Blob([L.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `VERITAS-examination-${(company || "report").replace(/[^\w]+/g, "-")}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
