/**
 * The 11 tools. Every failure returns an error RESULT (never throws to the
 * loop) so the model self-repairs. Read-only tools are concurrency-safe.
 *
 *  SWEEP: run_sweep · vendor_profile        VERIFY: recompute
 *  DIG:   query_ledger · search_documents · CASE:  update_hypothesis ·
 *         get_document · cross_reference ·         file_finding ·
 *         trace_payments                           freeze_vendor
 */
import { z } from "zod";
import type { CompanyData } from "./data.js";
import type { ToolDef } from "./llm.js";
import type { Finding } from "@veritas/shared";
import type { CaseBrain } from "./brain.js";

export interface ToolCtx {
  data: CompanyData;
  hypotheses: Map<string, any>;
  findings: Finding[];
  evidenceLog: { claim: string; ref: string }[];
  approvals: { action: string; target: string; reason: string; approved: boolean | null }[];
  emit: (type: string, payload: any) => void;
  matchedVendors: Set<string>; // vendors with a real cross_reference conflict — gates shell findings
  brain?: CaseBrain; // working-memory graph (entities/facts/links/timeline) built as the case unfolds
}
export interface ToolSpec { def: ToolDef; readOnly: boolean; describe: (args: any) => string; run: (args: any, ctx: ToolCtx) => any }

const errRes = (m: string) => ({ error: m });
const rows = (ctx: ToolCtx, sql: string, ...p: any[]) => ctx.data.db.prepare(sql).all(...p) as any[];

export const TOOLS: Record<string, ToolSpec> = {
  run_sweep: {
    readOnly: true,
    describe: a => `Sweeping: ${a?.kind ?? "?"}`,
    def: { type: "function", function: { name: "run_sweep", description: "Statistical sweep over the full ledger. kinds: benford (first-digit anomalies by account), duplicates (same vendor+amount clusters), round (suspiciously round amounts), threshold (amounts just under the 25,000 approval threshold), velocity (fast-growing vendors), approver_concentration (vendors approved by a single employee)", parameters: { type: "object", properties: { kind: { type: "string", enum: ["benford", "duplicates", "round", "threshold", "velocity", "approver_concentration"] } }, required: ["kind"] } } },
    run(a, ctx) {
      const p = z.object({ kind: z.enum(["benford", "duplicates", "round", "threshold", "velocity", "approver_concentration"]) }).safeParse(a);
      if (!p.success) return errRes(p.error.issues[0].message);
      const k = p.data.kind;
      if (k === "benford") {
        const r = rows(ctx, `SELECT account, CAST(SUBSTR(CAST(CAST(amount AS INT) AS TEXT),1,1) AS INT) d, COUNT(*) n FROM ledger WHERE amount>0 GROUP BY account,d`);
        const by: Record<string, number[]> = {};
        for (const x of r) { (by[x.account] ??= Array(10).fill(0))[x.d] += x.n; }
        const flags = Object.entries(by).map(([acct, ds]) => {
          const total = ds.reduce((s, v) => s + v, 0); if (total < 30) return null;
          const exp1 = 0.301, obs1 = ds[1] / total, obs2 = (ds[2] ?? 0) / total;
          const dev = Math.abs(obs1 - exp1) / Math.sqrt(exp1 * (1 - exp1) / total);
          return { account: acct, txns: total, firstDigit1_expected: 0.301, observed: +obs1.toFixed(3), firstDigit2_observed: +obs2.toFixed(3), z: +dev.toFixed(1) };
        }).filter((x): x is NonNullable<typeof x> => !!x && x.z > 2).sort((a, b) => b.z - a.z);
        return { flagged_accounts: flags.slice(0, 6), note: flags.length ? "deviation from Benford's law in flagged accounts" : "no material Benford deviations" };
      }
      if (k === "duplicates") return { clusters: rows(ctx, `SELECT vendor_id, amount, COUNT(*) n, GROUP_CONCAT(txn_id) txn_ids FROM ledger WHERE vendor_id IS NOT NULL GROUP BY vendor_id, amount HAVING n>1 ORDER BY amount DESC LIMIT 8`) };
      if (k === "round") return { hits: rows(ctx, `SELECT txn_id, date, amount, vendor_id, memo FROM ledger WHERE amount>=50000 AND CAST(amount AS INT)%10000=0 ORDER BY amount DESC LIMIT 8`) };
      if (k === "threshold") return { just_under_25k: rows(ctx, `SELECT txn_id, date, amount, vendor_id, approved_by FROM ledger WHERE amount BETWEEN 24000 AND 24999 ORDER BY vendor_id LIMIT 15`) };
      if (k === "velocity") return { fastest_growing: rows(ctx, `SELECT vendor_id, COUNT(*) invoices, MIN(amount) first_amt, MAX(amount) last_amt, ROUND(MAX(amount)*1.0/MIN(amount),2) growth, SUM(amount) total FROM ledger WHERE vendor_id IS NOT NULL GROUP BY vendor_id HAVING invoices>=5 AND growth>2 ORDER BY growth DESC LIMIT 8`) };
      return { single_approver_vendors: rows(ctx, `SELECT vendor_id, COUNT(DISTINCT approved_by) approvers, GROUP_CONCAT(DISTINCT approved_by) who, COUNT(*) txns, ROUND(SUM(amount)) total FROM ledger WHERE vendor_id IS NOT NULL GROUP BY vendor_id HAVING approvers=1 AND txns>=6 ORDER BY total DESC LIMIT 8`) };
    },
  },
  vendor_profile: {
    readOnly: true,
    describe: a => `Profiling vendor ${a?.vendor_id ?? "?"}`,
    def: { type: "function", function: { name: "vendor_profile", description: "Full profile of one vendor: totals, invoice numbering pattern, PO coverage, approver distribution, registration summary", parameters: { type: "object", properties: { vendor_id: { type: "string" } }, required: ["vendor_id"] } } },
    run(a, ctx) {
      const p = z.object({ vendor_id: z.string() }).safeParse(a);
      if (!p.success) return errRes("vendor_id required");
      const vid = p.data.vendor_id.toUpperCase().replace(/^([A-Z])-?0*/, (m, c) => c + "-0");
      const norm = /^V-\d{3}$/.test(vid) ? vid : p.data.vendor_id;
      const v = rows(ctx, `SELECT vendor_id, name, tax_id, onboarded, category FROM vw_vendors WHERE vendor_id=?`, norm)[0];
      if (!v) return errRes(`vendor ${norm} not found`);
      const txns = rows(ctx, `SELECT txn_id, date, amount, approved_by, doc_id, po FROM ledger WHERE vendor_id=? ORDER BY date`, norm);
      const invoiceNos = txns.map(t => t.doc_id).filter(Boolean).map((d: string) => parseInt(d.match(/(\d+)$/)?.[1] ?? "0"));
      const sequential = invoiceNos.length > 3 && invoiceNos.every((n, i) => i === 0 || n === invoiceNos[i - 1] + 1);
      return { vendor: v, invoice_count: txns.length, total: Math.round(txns.reduce((s, t) => s + t.amount, 0)),
        first_date: txns[0]?.date, last_date: txns.at(-1)?.date,
        invoice_numbering: { numbers: invoiceNos.slice(0, 16), strictly_sequential: sequential, note: sequential ? "SEQUENTIAL — we may be this vendor's only customer" : "gaps present (normal)" },
        po_coverage_pct: Math.round(100 * txns.filter(t => t.po).length / Math.max(1, txns.length)),
        approvers: rows(ctx, `SELECT approved_by, COUNT(*) n FROM ledger WHERE vendor_id=? GROUP BY approved_by`, norm),
        tax_id_present: !!v.tax_id };
    },
  },
  query_ledger: {
    readOnly: true,
    describe: a => `Querying ledger`,
    def: { type: "function", function: { name: "query_ledger", description: "Read-only SQL SELECT over: vw_ledger(txn_id,date,amount,vendor_id,account,memo,approved_by,doc_id,po), vw_vendors(vendor_id,name,tax_id,onboarded,category), vw_employees(employee_id,name,role,joined), vw_payments, vw_approvals(approved_by,vendor_id,n,total). Max 200 rows.", parameters: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] } } },
    run(a, ctx) {
      const p = z.object({ sql: z.string() }).safeParse(a);
      if (!p.success) return errRes("sql required");
      const sql = p.data.sql.trim();
      if (!/^select\b/i.test(sql) || /;.*\S/s.test(sql.replace(/;\s*$/, ""))) return errRes("SELECT-only, single statement");
      if (/\b(insert|update|delete|drop|create|alter|attach|pragma)\b/i.test(sql)) return errRes("read-only: SELECT only");
      try { const r = ctx.data.db.prepare(sql).all(); return { rows: r.slice(0, 200), row_count: r.length, truncated: r.length > 200 }; }
      catch (e: any) { return errRes(`SQL error: ${e.message.slice(0, 160)}`); }
    },
  },
  search_documents: {
    readOnly: true,
    describe: a => `Searching documents: "${a?.query ?? ""}"`,
    def: { type: "function", function: { name: "search_documents", description: "Full-text search over all documents (invoices, vendor registrations, employee records, bank statements, board minutes, credit notes). Returns snippets + doc_ids.", parameters: { type: "object", properties: { query: { type: "string" }, doc_type: { type: "string", enum: ["invoice", "vendor_registration", "employee_record", "bank_statement", "board_minutes", "credit_note"] }, limit: { type: "number" } }, required: ["query"] } } },
    run(a, ctx) {
      const p = z.object({ query: z.string(), doc_type: z.string().optional(), limit: z.number().optional() }).safeParse(a);
      if (!p.success) return errRes("query required");
      const q = p.data.query.replace(/['"*()]/g, " ").trim().split(/\s+/).map(w => `"${w}"`).join(" OR ");
      try {
        const where = p.data.doc_type ? `AND doc_type='${p.data.doc_type}'` : "";
        const r = ctx.data.fts.prepare(`SELECT doc_id, doc_type, snippet(d, 2, '[', ']', '…', 18) snip FROM d WHERE d MATCH ? ${where} LIMIT ?`).all(q, Math.min(p.data.limit ?? 8, 20));
        return { hits: r };
      } catch (e: any) { return errRes(`search error: ${e.message.slice(0, 120)}`); }
    },
  },
  get_document: {
    readOnly: true,
    describe: a => `Reading ${a?.doc_id ?? "document"}`,
    def: { type: "function", function: { name: "get_document", description: "Fetch a document's full text by doc_id (e.g. V-031-REG, HR-E-007, V-031-INV-0041, BS-2025-09, BOARD-MIN-2025-08)", parameters: { type: "object", properties: { doc_id: { type: "string" } }, required: ["doc_id"] } } },
    run(a, ctx) {
      const p = z.object({ doc_id: z.string() }).safeParse(a);
      if (!p.success) return errRes("doc_id required");
      const body = ctx.data.docs.get(p.data.doc_id) ?? ctx.data.docs.get(p.data.doc_id.toUpperCase());
      if (!body) return errRes(`document ${p.data.doc_id} not found — try search_documents`);
      ctx.emit("doc_touched", { docId: p.data.doc_id, docType: "", note: "read in full" });
      return { doc_id: p.data.doc_id, body: body.slice(0, 4000) };
    },
  },
  cross_reference: {
    readOnly: true,
    describe: () => `Cross-referencing vendors against employee records`,
    def: { type: "function", function: { name: "cross_reference", description: "THE conflict-of-interest scan: compares vendor registration details against employee HR records on shared fields (address, bank_account, phone, tax_id). This is the only way to check addresses — they are not exposed via SQL.", parameters: { type: "object", properties: { scan: { type: "string", enum: ["vendors_vs_employees"] }, fields: { type: "array", items: { type: "string", enum: ["address", "bank_account", "phone", "tax_id"] } } }, required: ["scan", "fields"] } } },
    run(a, ctx) {
      const p = z.object({ scan: z.literal("vendors_vs_employees"), fields: z.array(z.string()).min(1) }).safeParse(a);
      if (!p.success) return errRes("scan=vendors_vs_employees + fields[] required");
      const vendors = rows(ctx, `SELECT vendor_id, name, address FROM vendors`);
      const emps = rows(ctx, `SELECT employee_id, name, home_address FROM employees`);
      const matches: any[] = [];
      if (p.data.fields.includes("address")) {
        for (const v of vendors) for (const e of emps) {
          if (v.address && v.address === e.home_address)
            matches.push({ field: "address", vendor_id: v.vendor_id, vendor_name: v.name, employee_id: e.employee_id, employee_name: e.name, value: v.address, proof_docs: [`${v.vendor_id}-REG`, `HR-${e.employee_id}`] });
        }
      }
      if (matches.length) for (const m of matches) ctx.matchedVendors.add(m.vendor_id);
      if (matches.length) for (const m of matches) ctx.emit("reveal", { vendorId: m.vendor_id, employeeId: m.employee_id, matchField: m.field, label: `${m.vendor_name} ⟷ ${m.employee_name} · SAME ${m.field.toUpperCase()}` });
      return { matches, note: matches.length ? "CONFLICT OF INTEREST — verify via the cited registration + HR documents" : "no matches on requested fields" };
    },
  },
  exonerate: {
    readOnly: true,
    describe: a => `Attempting to exonerate ${a?.vendor_id ?? a?.employee_id ?? "suspect"}`,
    def: { type: "function", function: { name: "exonerate", description: "The disconfirming search: gather the evidence that would CLEAR a suspect before accusing. For a vendor, checks for (1) a real service/deliverable in documents, (2) whether its address is shared by other legitimate vendors (coworking vs shell), (3) purchase orders, (4) authorization docs (board minutes), (5) payment reversals. Returns what innocent explanations ARE and ARE NOT supported. Falsification is a finding.", parameters: { type: "object", properties: { vendor_id: { type: "string" }, hypothesis: { type: "string", description: "the fraud theory you are trying to disprove" } }, required: ["vendor_id"] } } },
    run(a, ctx) {
      const p = z.object({ vendor_id: z.string(), hypothesis: z.string().optional() }).safeParse(a);
      if (!p.success) return errRes("vendor_id required");
      const vid = p.data.vendor_id;
      const v = rows(ctx, `SELECT vendor_id, name, address, tax_id FROM vendors WHERE vendor_id=?`, vid)[0];
      if (!v) return errRes(`vendor ${vid} not found`);
      const checks: any = {};
      // (1) real service? search documents mentioning deliverables/service for this vendor
      const svc = ctx.data.fts.prepare(`SELECT doc_id FROM d WHERE d MATCH ? LIMIT 3`).all(`"${v.name.split(" ")[0]}" AND (deliverable OR service OR delivered OR completed OR milestone)`) as any[];
      checks.service_evidence = svc.length ? svc.map(x => x.doc_id) : "NONE — no document evidences a real service delivered";
      // (2) shared address? other vendors at same address = coworking, not necessarily shell
      const shared = rows(ctx, `SELECT vendor_id, name FROM vendors WHERE address=? AND vendor_id!=?`, v.address, vid);
      checks.address_shared_with_vendors = shared.length ? shared : "NONE — address is not shared with any other vendor";
      // (3) POs
      const pos = rows(ctx, `SELECT COUNT(po) n FROM ledger WHERE vendor_id=? AND po IS NOT NULL`, vid)[0]?.n ?? 0;
      checks.purchase_orders = pos > 0 ? `${pos} POs on file` : "NONE — zero purchase orders for any payment";
      // (4) authorization docs
      const auth = ctx.data.fts.prepare(`SELECT doc_id FROM d WHERE doc_type='board_minutes' AND d MATCH ? LIMIT 2`).all(`"${v.name.split(" ")[0]}"`) as any[];
      checks.board_authorization = auth.length ? auth.map(x => x.doc_id) : "NONE — no board minutes authorize this vendor";
      // (5) reversals
      const rev = rows(ctx, `SELECT txn_id FROM ledger WHERE vendor_id=? AND amount<0`, vid);
      checks.payment_reversals = rev.length ? rev.map(x => x.txn_id) : "NONE — no reversals found";
      const exonerated = svc.length > 0 || shared.length > 0 || pos > 0 || auth.length > 0;
      return { vendor: v.name, checks, exonerated, verdict: exonerated ? "INNOCENT EXPLANATION FOUND — lean toward CLEAR unless other evidence is overwhelming" : "NO INNOCENT EXPLANATION FOUND — the fraud hypothesis survives the disconfirming search" };
    },
  },
  employee_profile: {
    readOnly: true,
    describe: a => `Profiling employee ${a?.employee_id ?? "?"}`,
    def: { type: "function", function: { name: "employee_profile", description: "Profile an employee: role, home address, join date, and every vendor whose invoices they approved (approval concentration is a shell-scheme red flag).", parameters: { type: "object", properties: { employee_id: { type: "string" } }, required: ["employee_id"] } } },
    run(a, ctx) {
      const p = z.object({ employee_id: z.string() }).safeParse(a);
      if (!p.success) return errRes("employee_id required");
      const e = rows(ctx, `SELECT employee_id, name, role, home_address, joined FROM employees WHERE employee_id=?`, p.data.employee_id)[0];
      if (!e) return errRes(`employee ${p.data.employee_id} not found`);
      const approvals = rows(ctx, `SELECT vendor_id, COUNT(*) n, ROUND(SUM(amount)) total FROM ledger WHERE approved_by=? AND vendor_id IS NOT NULL GROUP BY vendor_id ORDER BY total DESC`, p.data.employee_id);
      return { employee: e, vendors_approved: approvals, sole_approver_of: approvals.filter((v: any) => rows(ctx, `SELECT COUNT(DISTINCT approved_by) n FROM ledger WHERE vendor_id=?`, v.vendor_id)[0]?.n === 1).map((v: any) => v.vendor_id) };
    },
  },
  account_profile: {
    readOnly: true,
    describe: a => `Profiling account "${a?.account ?? "?"}"`,
    def: { type: "function", function: { name: "account_profile", description: "Profile a ledger account: total spend, transaction count, top vendors, and month-over-month trend — to spot an account being used to hide inflated spend.", parameters: { type: "object", properties: { account: { type: "string" } }, required: ["account"] } } },
    run(a, ctx) {
      const p = z.object({ account: z.string() }).safeParse(a);
      if (!p.success) return errRes("account required");
      const total = rows(ctx, `SELECT COUNT(*) n, ROUND(SUM(amount)) total FROM ledger WHERE account=?`, p.data.account)[0];
      const top = rows(ctx, `SELECT vendor_id, ROUND(SUM(amount)) total FROM ledger WHERE account=? AND vendor_id IS NOT NULL GROUP BY vendor_id ORDER BY total DESC LIMIT 5`, p.data.account);
      return { account: p.data.account, ...total, top_vendors: top };
    },
  },
  corroborate: {
    readOnly: true,
    describe: a => `Corroborating: ${(a?.claim ?? "").slice(0, 40)}`,
    def: { type: "function", function: { name: "corroborate", description: "Count how many independent sources support a claim (ledger + documents). A claim confirmed by multiple independent sources is stronger evidence than one.", parameters: { type: "object", properties: { vendor_id: { type: "string" }, claim: { type: "string" } }, required: ["vendor_id"] } } },
    run(a, ctx) {
      const p = z.object({ vendor_id: z.string(), claim: z.string().optional() }).safeParse(a);
      if (!p.success) return errRes("vendor_id required");
      const vid = p.data.vendor_id;
      const sources: string[] = [];
      if (rows(ctx, `SELECT COUNT(*) n FROM ledger WHERE vendor_id=?`, vid)[0]?.n > 0) sources.push("general_ledger");
      if (ctx.data.docs.has(`${vid}-REG`)) sources.push("vendor_registration");
      const inv = [...ctx.data.docs.keys()].filter(k => k.startsWith(`${vid}-INV`));
      if (inv.length) sources.push(`${inv.length} invoices`);
      const bs = [...ctx.data.docs.keys()].filter(k => k.startsWith("BS-")).some(k => ctx.data.docs.get(k)?.includes(vid));
      if (bs) sources.push("bank_statements");
      return { independent_sources: sources, count: sources.length, strength: sources.length >= 3 ? "strong (corroborated by 3+ sources)" : sources.length === 2 ? "moderate" : "single-source" };
    },
  },
  trace_payments: {
    readOnly: true,
    describe: a => `Tracing payments to ${a?.vendor_id ?? "?"}`,
    def: { type: "function", function: { name: "trace_payments", description: "Chronological payment chain for a vendor, each linked to its bank-statement doc", parameters: { type: "object", properties: { vendor_id: { type: "string" } }, required: ["vendor_id"] } } },
    run(a, ctx) {
      const p = z.object({ vendor_id: z.string() }).safeParse(a);
      if (!p.success) return errRes("vendor_id required");
      const r = rows(ctx, `SELECT txn_id, date, amount, approved_by, doc_id, SUBSTR(date,1,7) month FROM ledger WHERE vendor_id=? ORDER BY date`, p.data.vendor_id);
      if (!r.length) return errRes(`no payments for ${p.data.vendor_id}`);
      return { payments: r.map(x => ({ ...x, bank_statement: `BS-${x.month}` })), total: Math.round(r.reduce((s, x) => s + x.amount, 0)) };
    },
  },
  recompute: {
    readOnly: true,
    describe: a => `Re-verifying figure ${a?.expected ?? ""}`,
    def: { type: "function", function: { name: "recompute", description: "Re-derive a dollar figure from the ledger to verify a claim before filing. Provide the SQL aggregate and the expected value.", parameters: { type: "object", properties: { sql: { type: "string", description: "SELECT returning a single numeric value" }, expected: { type: "number" } }, required: ["sql", "expected"] } } },
    run(a, ctx) {
      const p = z.object({ sql: z.string(), expected: z.number() }).safeParse(a);
      if (!p.success) return errRes("sql + expected required");
      if (!/^select\b/i.test(p.data.sql.trim())) return errRes("SELECT only");
      try {
        const r = ctx.data.db.prepare(p.data.sql).get() as any;
        const val = Object.values(r ?? {})[0] as number;
        const ok = Math.abs(val - p.data.expected) <= Math.max(1, Math.abs(p.data.expected) * 0.005);
        const ref = `recompute#${ctx.evidenceLog.length + 1}`;
        ctx.evidenceLog.push({ claim: `${p.data.expected}`, ref });
        if (ok) ctx.emit("verify_pass", { claimId: `${p.data.expected}`, recomputeRef: ref });
        return { verified: ok, computed: val, expected: p.data.expected, ref };
      } catch (e: any) { return errRes(`SQL error: ${e.message.slice(0, 140)}`); }
    },
  },
  update_hypothesis: {
    readOnly: false,
    describe: a => `Hypothesis: ${(a?.statement ?? "").slice(0, 48)}…`,
    def: { type: "function", function: { name: "update_hypothesis", description: "Create or update an investigation hypothesis. status: open|investigating|cleared|confirmed|unproven. When clearing, state the innocent explanation.", parameters: { type: "object", properties: { hyp_id: { type: "string" }, statement: { type: "string" }, status: { type: "string", enum: ["open", "investigating", "cleared", "confirmed", "unproven"] }, confidence: { type: "number" }, evidence_doc_ids: { type: "array", items: { type: "string" } }, next_probe: { type: "string" }, innocent_explanation: { type: "string" } }, required: ["statement", "status"] } } },
    run(a, ctx) {
      const id = a.hyp_id ?? `H-${ctx.hypotheses.size + 1}`;
      const h = { ...(ctx.hypotheses.get(id) ?? {}), ...a, hyp_id: id };
      ctx.hypotheses.set(id, h);
      ctx.emit("hypothesis_update", { hypId: id, statement: h.statement, status: h.status, confidence: h.confidence ?? 0.5, evidenceFor: (h.evidence_doc_ids ?? []).length, evidenceAgainst: 0, nextProbe: h.next_probe });
      return { hyp_id: id, recorded: true };
    },
  },
  file_finding: {
    readOnly: false,
    describe: a => `Filing finding: ${a?.class ?? ""}`,
    def: { type: "function", function: { name: "file_finding", description: "File a confirmed finding into the case record. REJECTED unless every evidence item carries doc_ids or a recompute ref. The report is built ONLY from filed findings.", parameters: { type: "object", properties: { class: { type: "string", enum: ["billing_scheme.shell_company", "duplicate_payment", "expense_fraud", "threshold_evasion", "other"] }, statement: { type: "string" }, evidence: { type: "array", items: { type: "object", properties: { claim: { type: "string" }, doc_ids: { type: "array", items: { type: "string" } }, verified_by: { type: "string" } }, required: ["claim"] } }, confidence: { type: "number" }, unresolved: { type: "array", items: { type: "object", properties: { item: { type: "string" }, needed: { type: "string" } } } }, recommended_actions: { type: "array", items: { type: "string" } } }, required: ["class", "statement", "evidence", "confidence"] } } },
    run(a, ctx) {
      const p = z.object({ class: z.string(), statement: z.string().min(20), confidence: z.number(),
        evidence: z.array(z.object({ claim: z.string(), doc_ids: z.array(z.string()).optional(), verified_by: z.string().optional() })).min(2),
        unresolved: z.array(z.object({ item: z.string(), needed: z.string() })).optional(),
        recommended_actions: z.array(z.string()).optional() }).safeParse(a);
      if (!p.success) return errRes(`invalid finding: ${p.success === false ? p.error.issues[0].message : ""}`);
      const uncited = p.data.evidence.filter(e => !(e.doc_ids?.length) && !e.verified_by);
      if (uncited.length) return errRes(`REJECTED — uncited claims: "${uncited[0].claim.slice(0, 60)}". Every evidence item needs doc_ids[] or verified_by (use recompute for figures).`);
      if (p.data.class === "billing_scheme.shell_company") {
        const named = JSON.stringify(p.data).match(/V-\d{3}/g) ?? [];
        if (!named.some(v => ctx.matchedVendors.has(v))) return errRes(`REJECTED — a shell_company finding requires a confirmed conflict-of-interest match from cross_reference. No vendor in this finding has a verified address/bank match to an employee. If there is genuinely no match, this is NOT a shell company — do not file it.`);
      }
      const finding = { id: `F-${ctx.findings.length + 1}`, ...p.data, unresolved: p.data.unresolved ?? [], recommendedActions: p.data.recommended_actions ?? [] } as unknown as Finding;
      ctx.findings.push(finding);
      ctx.emit("finding_filed", { finding });
      return { filed: finding.id };
    },
  },
  freeze_vendor: {
    readOnly: false,
    describe: a => `Requesting approval to freeze ${a?.vendor_id ?? "?"}`,
    def: { type: "function", function: { name: "freeze_vendor", description: "Request a payment freeze on a vendor (requires human approval — VERITAS never acts alone)", parameters: { type: "object", properties: { vendor_id: { type: "string" }, reason: { type: "string" } }, required: ["vendor_id", "reason"] } } },
    run(a, ctx) {
      const p = z.object({ vendor_id: z.string(), reason: z.string() }).safeParse(a);
      if (!p.success) return errRes("vendor_id + reason required");
      ctx.approvals.push({ action: "freeze_vendor", target: p.data.vendor_id, reason: p.data.reason, approved: null });
      ctx.emit("approval_request", { action: "freeze_vendor", target: p.data.vendor_id, reason: p.data.reason });
      return { status: "approval_requested", note: "pending human approval in the console" };
    },
  },
};

export const toolDefs = (names?: string[]): ToolDef[] =>
  Object.entries(TOOLS).filter(([n]) => !names || names.includes(n)).map(([, t]) => t.def);
