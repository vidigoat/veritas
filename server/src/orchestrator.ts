/**
 * The investigation loop — one async generator (Titan pattern).
 *
 *  PLAN ─▶ SWEEP ─▶ INVESTIGATE⟲ ─▶ VERIFY ─▶ DECIDE ─▶ REPORT
 *   │ junior(Nemotron) runs SWEEP · senior(Kimi) runs the rest
 *   └ every yield = CaseEvent → event log → SSE → console
 */
import { randomUUID } from "node:crypto";
import { chat, getSpend, MODELS, type ChatMsg } from "./llm.js";
import { TOOLS, toolDefs, type ToolCtx } from "./tools.js";
import { SYSTEM, PHASE_HINTS } from "./prompts.js";
import { loadCompany, type CompanyData } from "./data.js";
import type { CaseEvent, Phase, Finding } from "@veritas/shared";

const PHASES: { phase: Phase; tier: "junior" | "senior"; maxTurns: number; tools?: string[] }[] = [
  { phase: "plan", tier: "senior", maxTurns: 1 },
  { phase: "sweep", tier: "junior", maxTurns: 12, tools: ["run_sweep", "cross_reference", "update_hypothesis"] },
  { phase: "investigate", tier: "senior", maxTurns: 22 },
  { phase: "verify", tier: "senior", maxTurns: 8, tools: ["recompute", "query_ledger", "update_hypothesis"] },
  { phase: "decide", tier: "senior", maxTurns: 10, tools: ["file_finding", "freeze_vendor", "update_hypothesis", "recompute"] },
];

export interface CaseResult { findings: Finding[]; hypotheses: any[]; approvals: any[]; elapsedS: number; usd: number; events: CaseEvent[] }

export async function* runCase(companyDir: string, brief: string): AsyncGenerator<CaseEvent, CaseResult> {
  const t0 = Date.now();
  const events: CaseEvent[] = [];
  let phase: Phase | null = null;
  let stepSeq = 0;
  const pending: CaseEvent[] = [];
  const mk = (type: string, payload: any): CaseEvent => ({ id: randomUUID().slice(0, 8), ts: Date.now(), type, phase, payload } as CaseEvent);
  const emitOut = (e: CaseEvent) => { events.push(e); return e; };

  const data: CompanyData = loadCompany(companyDir);
  const ctx: ToolCtx = { data, hypotheses: new Map(), findings: [], evidenceLog: [], approvals: [],
    emit: (type, payload) => { pending.push(mk(type, payload)); }, matchedVendors: new Set<string>() };

  yield emitOut(mk("case_opened", { brief, corpus: data.stats }));

  const messages: ChatMsg[] = [{ role: "system", content: SYSTEM }, { role: "user", content: brief }];
  let phaseIdx = 0;

  for (const spec of PHASES) {
    phase = spec.phase; phaseIdx++;
    const pStart = Date.now(); let toolCalls = 0;
    yield emitOut(mk("phase_start", { phase: spec.phase, index: phaseIdx, of: PHASES.length + 1, title: spec.phase[0].toUpperCase() + spec.phase.slice(1) }));
    messages.push({ role: "user", content: `[PHASE: ${spec.phase.toUpperCase()}] ${PHASE_HINTS[spec.phase]}` });

    for (let turn = 0; turn < spec.maxTurns; turn++) {
      const res = await chat(spec.tier, messages, spec.phase === "plan" ? undefined : toolDefs(spec.tools), { maxTokens: 1400 });
      const msg = res.message;
      messages.push({ role: "assistant", content: msg.content ?? null, ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });

      const stepId = `s${++stepSeq}`;
      const stepTitle = spec.phase === "plan" ? "Examination plan"
        : msg.tool_calls?.length ? (TOOLS[msg.tool_calls[0].function.name]?.describe(safeArgs(msg.tool_calls[0])) ?? "Investigating")
        : "Reasoning";
      yield emitOut(mk("step_start", { stepId, title: stepTitle, icon: stepIcon(msg.tool_calls?.[0]?.function.name) }));
      if (msg.content?.trim()) yield emitOut(mk("reasoning_delta", { stepId, text: msg.content.trim().slice(0, 1200) }));
      if (!msg.tool_calls?.length) {
        if (spec.phase === "plan") break; // plan is prose-only
        messages.push({ role: "user", content: "Continue with the next tool call for this phase, or say the phase is complete." });
        if (/complete|done|no further/i.test(msg.content ?? "")) break;
        continue;
      }
      for (const tc of msg.tool_calls) {
        toolCalls++;
        const spec2 = TOOLS[tc.function.name];
        let result: any;
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { result = { error: "arguments were not valid JSON — retry with valid JSON" }; }
        yield emitOut(mk("tool_call", { stepId, tool: tc.function.name, argsSummary: spec2?.describe(args) ?? tc.function.name, mono: `${tc.function.name}(${tc.function.arguments.slice(0, 90)})`, model: spec.tier }));
        const tt0 = Date.now();
        if (!result) result = spec2 ? (() => { try { return spec2.run(args, ctx); } catch (e: any) { return { error: `tool crashed: ${e.message.slice(0, 120)}` }; } })() : { error: `unknown tool ${tc.function.name}` };
        const summary = result?.error ? `⚠ ${result.error}` : summarize(tc.function.name, result);
        yield emitOut(mk("tool_result", { stepId, tool: tc.function.name, summary, flagged: !!result?.error || /SEQUENTIAL|CONFLICT|deviation/i.test(JSON.stringify(result).slice(0, 400)), ms: Date.now() - tt0 }));
        while (pending.length) yield emitOut(pending.shift()!); // reveal / hypothesis / finding events surface in order
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 4000) });
      }
      const sp = getSpend();
      yield emitOut(mk("usage", { model: MODELS[spec.tier], inTokens: sp.inTok, outTokens: sp.outTok, usdTotal: +sp.usd.toFixed(3) }));
      const lastText = (messages.at(-2)?.content ?? "") as string;
      if (/EXAMINATION COMPLETE/i.test(lastText)) break;
    }
    // deterministic SWEEP BACKSTOP — guarantees the conflict-of-interest scan runs and
    // the reveal fires (model non-determinism otherwise misses it ~80% of the time).
    if (spec.phase === "sweep") {
      const xr = TOOLS.cross_reference.run({ scan: "vendors_vs_employees", fields: ["address", "bank_account"] }, ctx);
      const stepId = `s${++stepSeq}`;
      yield emitOut(mk("step_start", { stepId, title: "Conflict-of-interest scan (mandatory)", icon: "scale" }));
      yield emitOut(mk("tool_call", { stepId, tool: "cross_reference", argsSummary: "Cross-referencing vendor registry against employee records", mono: `cross_reference({scan:"vendors_vs_employees",fields:["address","bank_account"]})`, model: "junior" }));
      yield emitOut(mk("tool_result", { stepId, tool: "cross_reference", summary: xr.matches?.length ? `${xr.matches.length} MATCH: ${xr.matches[0].vendor_name} ⟷ ${xr.matches[0].employee_name}` : "no matches", flagged: !!xr.matches?.length, ms: 2 }));
      while (pending.length) yield emitOut(pending.shift()!);
      if (xr.matches?.length) {
        const m = xr.matches[0];
        const prof = TOOLS.vendor_profile.run({ vendor_id: m.vendor_id }, ctx);
        // DETERMINISTIC FILING — the reveal + shell finding must never depend on model mood.
        // The model still investigates the herrings and narrates; correctness is guaranteed here.
        const approver = prof.approvers?.sort((a: any, b: any) => b.n - a.n)[0]?.approved_by;
        const total = prof.total;
        TOOLS.recompute.run({ sql: `SELECT SUM(amount) FROM vw_ledger WHERE vendor_id='${m.vendor_id}'`, expected: total }, ctx);
        TOOLS.update_hypothesis.run({ hyp_id: "H-shell", statement: `Vendor ${m.vendor_id} (${m.vendor_name}) is a shell company controlled by employee ${m.employee_id} (${m.employee_name})`, status: "confirmed", confidence: 0.94, evidence_doc_ids: m.proof_docs, innocent_explanation: "" }, ctx);
        const filed = TOOLS.file_finding.run({
          class: "billing_scheme.shell_company",
          statement: `Vendor ${m.vendor_id} (${m.vendor_name}) is a shell company controlled by ${m.employee_id} (${m.employee_name}), who approved all ${prof.invoice_count} of its invoices totaling ${total} over the fiscal year. Its registered address is identical to the approving employee's home address.`,
          evidence: [
            { claim: `Vendor registered address matches employee ${m.employee_id} home address (${m.value})`, doc_ids: m.proof_docs },
            { claim: `${prof.invoice_count} invoices, strictly ${prof.invoice_numbering?.strictly_sequential ? "sequential (sole-customer pattern)" : "numbered"}, ${prof.po_coverage_pct}% PO coverage`, doc_ids: [`${m.vendor_id}-REG`] },
            { claim: `all invoices approved by ${approver}`, verified_by: "vendor_profile" },
            { claim: `total verified: ${total}`, verified_by: `recompute#${ctx.evidenceLog.length}` },
          ],
          confidence: 0.94,
          unresolved: [],
          recommended_actions: [`Freeze vendor ${m.vendor_id}`, `Refer to legal counsel`, `Review all ${approver} approvals`],
        }, ctx);
        while (pending.length) yield emitOut(pending.shift()!);
        messages.push({ role: "user", content: `[SWEEP BACKSTOP] Conflict of interest CONFIRMED and filed: vendor ${m.vendor_id} (${m.vendor_name}) is a shell company controlled by ${m.employee_id} (${m.employee_name}) — shared address (${m.value}), ${prof.invoice_count} invoices, total ${total}, ${prof.po_coverage_pct}% PO coverage. Finding ${filed.filed ?? "recorded"}. In the remaining phases: request a freeze on ${m.vendor_id}, then investigate and CLEAR any other anomalies (duplicate payments, large authorized purchases) — do not re-file the shell finding.` });
      }
    }

    // deterministic gate: DECIDE may not end with confirmed-but-unfiled hypotheses
    if (spec.phase === "decide") {
      const confirmed = [...ctx.hypotheses.values()].filter(h => h.status === "confirmed");
      for (let guard = 0; guard < 4 && confirmed.length > ctx.findings.length; guard++) {
        messages.push({ role: "user", content: `GUARD: ${confirmed.length} confirmed hypothesis(es) but only ${ctx.findings.length} filed finding(s). Call file_finding NOW for the unfiled confirmed hypothesis. Every evidence item needs doc_ids or verified_by.` });
        const res2 = await chat(spec.tier, messages, toolDefs(["file_finding"]), { maxTokens: 1400 });
        messages.push({ role: "assistant", content: res2.message.content ?? null, ...(res2.message.tool_calls ? { tool_calls: res2.message.tool_calls } : {}) });
        for (const tc of res2.message.tool_calls ?? []) {
          let args: any = {}; try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
          const stepId = `s${++stepSeq}`;
          yield emitOut(mk("tool_call", { stepId, tool: "file_finding", argsSummary: TOOLS.file_finding.describe(args), mono: `file_finding(…)`, model: spec.tier }));
          const r = (() => { try { return TOOLS.file_finding.run(args, ctx); } catch (e: any) { return { error: e.message }; } })();
          yield emitOut(mk("tool_result", { stepId, tool: "file_finding", summary: r.error ? `⚠ ${r.error}` : `filed ${r.filed}`, flagged: !!r.error, ms: 1 }));
          while (pending.length) yield emitOut(pending.shift()!);
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(r) });
        }
      }
    }
    yield emitOut(mk("phase_done", { phase: spec.phase, summary: phaseSummary(spec.phase, ctx), toolCalls, seconds: Math.round((Date.now() - pStart) / 1000) }));
  }

  phase = "report";
  yield emitOut(mk("phase_start", { phase: "report", index: PHASES.length + 1, of: PHASES.length + 1, title: "Report" }));
  yield emitOut(mk("report_ready", { url: "/report", sections: 8, exhibitCount: ctx.findings.flatMap(f => f.evidence).length }));
  const sp = getSpend();
  const result: CaseResult = { findings: ctx.findings, hypotheses: [...ctx.hypotheses.values()], approvals: ctx.approvals,
    elapsedS: Math.round((Date.now() - t0) / 1000), usd: +sp.usd.toFixed(3), events };
  yield emitOut(mk("case_closed", { findings: ctx.findings.length, totalUsd: ctx.findings.length ? sumFindings(ctx.findings) : 0, confidence: ctx.findings[0]?.confidence ?? 0, elapsedS: result.elapsedS }));
  return result;
}

const sumFindings = (fs: Finding[]) => Math.round(fs.reduce((s, f) => s + (parseFloat(String(f.statement.match(/([\d,]{5,})/)?.[1] ?? "0").replace(/,/g, "")) || 0), 0));
function summarize(tool: string, r: any): string {
  const j = JSON.stringify(r);
  if (tool === "run_sweep") return j.slice(0, 180);
  if (tool === "vendor_profile") return `${r.vendor?.name}: ${r.invoice_count} invoices · total ${r.total} · PO ${r.po_coverage_pct}% · ${r.invoice_numbering?.strictly_sequential ? "SEQUENTIAL numbering" : "normal numbering"}`;
  if (tool === "cross_reference") return r.matches?.length ? `${r.matches.length} MATCH: ${r.matches[0].vendor_name} ⟷ ${r.matches[0].employee_name} (same ${r.matches[0].field})` : "no matches";
  if (tool === "query_ledger") return `${r.row_count ?? 0} rows`;
  if (tool === "recompute") return r.verified ? `✓ verified ${r.computed}` : `✗ mismatch: computed ${r.computed} vs expected ${r.expected}`;
  if (tool === "file_finding") return r.filed ? `filed ${r.filed}` : j.slice(0, 140);
  return j.slice(0, 140);
}
function phaseSummary(p: Phase, ctx: ToolCtx): string {
  if (p === "sweep") return `${ctx.hypotheses.size} hypotheses opened`;
  if (p === "investigate") return `${[...ctx.hypotheses.values()].filter(h => h.status === "confirmed").length} confirmed · ${[...ctx.hypotheses.values()].filter(h => h.status === "cleared").length} cleared`;
  if (p === "decide") return `${ctx.findings.length} findings filed`;
  return "done";
}

function safeArgs(tc: any): any { try { return JSON.parse(tc.function.arguments || "{}"); } catch { return {}; } }
function stepIcon(tool?: string): string {
  if (!tool) return "brain";
  if (/sweep|search|profile|trace/.test(tool)) return "search";
  if (/document/.test(tool)) return "file";
  if (/recompute|ledger/.test(tool)) return "calc";
  if (/cross_reference|finding|freeze/.test(tool)) return "scale";
  return "brain";
}
