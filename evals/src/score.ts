/** Scores one CaseResult against the company's manifest. 100 pts; false accusation = 0 (hard fail). */
import type { Manifest } from "@veritas/shared";

export function score(result: any, manifest: Manifest) {
  const out = { detection: 0, perpetrator: 0, amount: 0, citations: 0, herrings: 0, honesty: 0, runtime: 0, total: 0, hardFail: false as boolean | string, notes: [] as string[] };
  const findings = result.findings ?? [];
  const fJson = JSON.stringify(findings);
  const clearedJson = JSON.stringify((result.hypotheses ?? []).filter((h: any) => h.status === "cleared"));

  if (manifest.scheme) {
    const f = findings.find((f: any) => f.class?.includes(manifest.scheme!.type));
    if (f) out.detection = 30; else out.notes.push("scheme NOT detected");
    if (fJson.includes(manifest.scheme.vendorId) && fJson.includes(manifest.scheme.employeeId)) out.perpetrator = 15;
    const amt = manifest.scheme.totalUsd;
    if (new RegExp(String(Math.round(amt)).slice(0, 4)).test(fJson.replace(/,/g, ""))) out.amount = 10;
    else out.notes.push(`amount ${amt} not found in findings`);
  } else {
    // clean company: ANY fraud finding = false accusation
    if (findings.length > 0) { out.hardFail = `false accusation on clean books: ${findings[0]?.statement?.slice(0, 80)}`; }
    else out.detection = 55; // clean pass gets detection+perp+amount budget
  }
  // citations: every evidence item cited
  const allEv = findings.flatMap((f: any) => f.evidence ?? []);
  out.citations = allEv.length && allEv.every((e: any) => (e.doc_ids?.length || e.verified_by)) ? 15 : (allEv.length ? 5 : (manifest.scheme ? 0 : 15));
  // herrings cleared, not accused
  let hOk = 0;
  for (const h of manifest.herrings) {
    const accused = findings.some((f: any) => h.txnIds.some(t => JSON.stringify(f).includes(t)) && !/revers|control|clear|authoriz/i.test(f.statement ?? ""));
    if (accused) { out.hardFail = `herring accused as fraud: ${h.kind}`; continue; }
    if (clearedJson.includes(h.txnIds[0]) || new RegExp(h.kind.split("_")[0], "i").test(clearedJson) || /revers|board|authoriz/i.test(clearedJson)) hOk++;
  }
  out.herrings = Math.round(10 * hOk / Math.max(1, manifest.herrings.length));
  out.honesty = findings.every((f: any) => f.confidence <= 1 && (f.confidence >= 0.5 || (f.unresolved?.length))) ? 10 : 5;
  out.runtime = (result.elapsedS ?? 999) <= 300 ? 5 : 0;
  out.total = out.hardFail ? 0 : out.detection + out.perpetrator + out.amount + out.citations + out.herrings + out.honesty + out.runtime;
  return out;
}
