/**
 * REDUCE STAGE — multi-scheme detection over the extracted facts.
 *
 *  Pure, deterministic analysis on the Store the fleet built FROM the documents.
 *  Nothing is scripted: these are computations on real extracted data — if you
 *  upload clean books, every detector returns nothing. Each scheme has its own
 *  detector, grounded in the fraud KB's detection signals.
 */
import type { Store } from "./extract.js";
import type { Anomaly, SchemeClass } from "./contracts.js";

const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const money = (n: number) => Math.round(n).toLocaleString();
let seq = 0; const aid = () => `A-${++seq}`;

export function detectAnomalies(store: Store): Anomaly[] {
  seq = 0;
  const out: Anomaly[] = [
    ...detectShellCompanies(store),
    ...detectGhostEmployees(store),
    ...detectDuplicatePayments(store),
    ...detectThresholdEvasion(store),
  ];
  // strongest first
  return out.sort((a, b) => b.strength - a.strength);
}

/** SHELL COMPANY — a vendor whose registered address (or bank) matches an employee's. */
function detectShellCompanies(store: Store): Anomaly[] {
  const out: Anomaly[] = [];
  const empByAddr = new Map<string, { id: string; name: string; doc: string }>();
  const empByBank = new Map<string, { id: string; name: string; doc: string }>();
  for (const e of store.employees.values()) {
    const id = e.empId || e.name;
    if (e.address) empByAddr.set(norm(e.address), { id, name: e.name, doc: e.sourceDoc });
    if (e.bankAccount) empByBank.set(norm(e.bankAccount), { id, name: e.name, doc: e.sourceDoc });
  }
  for (const v of store.vendors.values()) {
    const vid = v.vendorId || v.name;
    const addrHit = v.address ? empByAddr.get(norm(v.address)) : undefined;
    const bankHit = v.bankAccount ? empByBank.get(norm(v.bankAccount)) : undefined;
    const hit = addrHit ?? bankHit; if (!hit) continue;
    const field = addrHit ? "registered address" : "bank account";
    const txns = store.txns.filter(t => (t.vendorId && t.vendorId === v.vendorId) || norm(t.vendor) === norm(v.name));
    const total = txns.reduce((s, t) => s + t.amount, 0);
    const approvers = new Set(txns.map(t => t.approver).filter(Boolean));
    const poCoverage = txns.length ? txns.filter(t => t.po).length / txns.length : 0;
    let strength = 0.72;
    if (v.taxId === undefined || /missing|none|not provided/i.test(v.taxId ?? "")) strength += 0.08;
    if (approvers.size === 1) strength += 0.08;
    if (poCoverage === 0) strength += 0.06;
    out.push({
      id: aid(), scheme: "shell_company",
      title: `${v.name} (${vid}) shares a ${field} with employee ${hit.name} (${hit.id})`,
      subjectIds: [vid, hit.id], amount: total,
      proofDocs: [v.sourceDoc, hit.doc].filter(Boolean),
      detail: `${v.name} and ${hit.name} share the exact ${field}. ${txns.length} invoices totalling ${money(total)}${approvers.size === 1 ? `, all approved by ${[...approvers][0]}` : ""}, ${Math.round(poCoverage * 100)}% PO coverage${v.taxId === undefined ? ", no tax ID" : ""}.`,
      strength: Math.min(strength, 0.95),
    });
  }
  return out;
}

/** GHOST EMPLOYEE — two employees drawing pay to the SAME bank account. */
function detectGhostEmployees(store: Store): Anomaly[] {
  const out: Anomaly[] = [];
  const byBank = new Map<string, { id: string; name: string; e: any }[]>();
  const emps = [...store.employees.values()];
  // also fold payroll bank accounts in (payroll may carry the account)
  for (const e of emps) if (e.bankAccount) {
    const k = norm(e.bankAccount); (byBank.get(k) ?? byBank.set(k, []).get(k)!).push({ id: e.empId || e.name, name: e.name, e });
  }
  for (const p of store.payroll) if (p.bankAccount) {
    const k = norm(p.bankAccount); const arr = byBank.get(k) ?? byBank.set(k, []).get(k)!;
    if (!arr.some(x => norm(x.name) === norm(p.name))) arr.push({ id: p.empId || p.name, name: p.name, e: { salary: p.amount, sourceDoc: p.sourceDoc } });
  }
  for (const [, group] of byBank) {
    if (group.length < 2) continue;
    // the ghost = the one with the thinnest footprint (recent join / generic / no email)
    const scored = group.map(g => ({ ...g, foot: footprint(g.e) })).sort((a, b) => a.foot - b.foot);
    const ghost = scored[0], real = scored[scored.length - 1];
    const total = store.payroll.filter(p => norm(p.name) === norm(ghost.name)).reduce((s, p) => s + p.amount, 0) || (ghost.e.salary ?? 0);
    out.push({
      id: aid(), scheme: "ghost_employee",
      title: `${ghost.name} (${ghost.id}) is paid to the same bank account as ${real.name} (${real.id})`,
      subjectIds: [ghost.id, real.id], amount: total,
      proofDocs: [ghost.e.sourceDoc, real.e.sourceDoc].filter(Boolean),
      detail: `Two employees draw salary to one identical bank account. ${ghost.name} has the thinner footprint (recent join / no other records) — a likely ghost employee whose pay is diverted to ${real.name}. ${money(total)} in payroll.`,
      strength: 0.82,
    });
  }
  return out;
}
const footprint = (e: any) => (e.email ? 2 : 0) + (e.manager ? 1 : 0) + (e.joined && new Date(e.joined) < new Date("2025-06-01") ? 2 : 0) + (e.role && !/general|assistant|associate/i.test(e.role) ? 1 : 0);

/** DUPLICATE PAYMENT — the same amount paid to the same party twice, close in time. */
function detectDuplicatePayments(store: Store): Anomaly[] {
  const out: Anomaly[] = [];
  const debits = store.payments.filter(p => p.direction === "debit");
  const seen = new Map<string, typeof debits>();
  for (const p of debits) {
    // a genuine duplicate is the SAME invoice paid twice — key on the invoice ref.
    // recurring categories (rent, payroll, utilities, receipts) legitimately repeat monthly → skip.
    const desc = p.description ?? "";
    if (/\b(rent|payroll|salary|util|electric|receipt|rcpt|opening|interest|emi|loan|gst|tax)\b/i.test(desc)) continue;
    const ref = desc.match(/\b(INV|BILL|PO|TXN)[-\/]?[\w-]+/i)?.[0];
    if (!ref) continue;                                   // only invoice-referenced debits are duplicate candidates
    const key = `${Math.round(p.amount)}|${ref.toUpperCase()}`;
    (seen.get(key) ?? seen.set(key, []).get(key)!).push(p);
  }
  for (const [, grp] of seen) {
    if (grp.length < 2) continue;
    // reversed? a matching credit of the same amount clears it (herring, not fraud)
    const reversed = store.payments.some(c => c.direction === "credit" && Math.round(c.amount) === Math.round(grp[0].amount));
    out.push({
      id: aid(), scheme: "duplicate_payment",
      title: `${money(grp[0].amount)} paid ${grp.length}× — ${grp[0].description?.slice(0, 40) ?? "same payee"}`,
      subjectIds: [], amount: reversed ? 0 : grp[0].amount,
      proofDocs: [...new Set(grp.map(g => g.sourceDoc))],
      detail: reversed
        ? `A duplicate payment of ${money(grp[0].amount)} — but a matching credit note reverses it. Likely a caught accounting error, not a loss. Verify the reversal.`
        : `The same ${money(grp[0].amount)} payment appears ${grp.length} times with no reversing credit note. A likely duplicate-payment loss.`,
      strength: reversed ? 0.35 : 0.7,
    });
  }
  return out;
}

/** THRESHOLD EVASION — a vendor with several invoices hugging just under an approval limit. */
function detectThresholdEvasion(store: Store): Anomaly[] {
  const out: Anomaly[] = [];
  const THRESHOLDS = [25000, 50000, 100000];
  const byVendor = new Map<string, { amount: number; doc: string }[]>();
  for (const t of store.txns) { const k = t.vendorId || norm(t.vendor); if (!k) continue; (byVendor.get(k) ?? byVendor.set(k, []).get(k)!).push({ amount: t.amount, doc: t.sourceDoc }); }
  for (const [vk, list] of byVendor) {
    for (const th of THRESHOLDS) {
      const near = list.filter(x => x.amount >= th * 0.9 && x.amount < th);
      if (near.length >= 3) {
        out.push({ id: aid(), scheme: "threshold_evasion", title: `${near.length} invoices just under the ${money(th)} approval limit (${vk})`,
          subjectIds: [vk], amount: near.reduce((s, x) => s + x.amount, 0), proofDocs: near.slice(0, 3).map(x => x.doc),
          detail: `Vendor ${vk} has ${near.length} invoices between ${money(th * 0.9)} and ${money(th)} — a pattern consistent with structuring payments to stay below the ${money(th)} approval threshold.`, strength: 0.55 });
        break;
      }
    }
  }
  return out;
}
