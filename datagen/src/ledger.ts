/**
 * Ledger + THE PLANTED SCHEME + red herrings.
 *
 *  honest business (≈95% of txns)
 *    ├─ vendor invoices: organic amounts, PO-backed, varied approvers
 *    ├─ payroll / rent / utilities: monthly rhythm
 *  PLANTED (ACFE-canonical shell company):
 *    └─ V-031 "Apex Supplies" ← controlled by E-007 (Procurement Manager)
 *       14 sequential invoices · no POs · single approver · growing amounts
 *       some just under the ₹/$25,000 approval threshold
 *       vendor.address === E-007.homeAddress  ← THE REVEAL
 *  HERRINGS (must be CLEARED, not accused):
 *    ├─ H1: duplicate payment to a legit vendor, REVERSED 3 days later
 *    └─ H2: $250,000 round CAPEX with PO + board-minute authorization
 */
import type { Rng } from "./rng.js";
import type { Employee, Vendor } from "./world.js";

export interface Txn {
  txnId: string; date: string; amount: number; vendorId: string | null;
  account: string; memo: string; approvedBy: string; docId: string | null; po: string | null;
}
export interface SchemeSpec { vendorId: string; employeeId: string; txnIds: string[]; totalUsd: number }

const FY_MONTHS = ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];
const day = (rng: Rng) => String(rng.int(1, 28)).padStart(2, "0");

export function buildLedger(rng: Rng, vendors: Vendor[], employees: Employee[], opts: { scheme: boolean; herrings: boolean }) {
  const txns: Txn[] = [];
  const approvers = employees.filter(e => /Manager|Controller|Head/.test(e.role));
  let t = 0, inv = 0;
  const nextTxn = () => `TXN-${String(++t).padStart(5, "0")}`;
  const nextInv = (v: Vendor) => `${v.id}-INV-${String(++inv).padStart(4, "0")}`;

  // honest vendor activity (the shell vendor gets NONE — its only activity is the scheme)
  for (const v of vendors) {
    if (opts.scheme && v.id === "V-031") continue;
    const monthly = rng.int(2, 9);
    for (const m of FY_MONTHS) {
      for (let k = 0; k < monthly; k++) {
        if (rng.chance(0.25)) continue;
        const amount = rng.amount(800, 24000);
        txns.push({ txnId: nextTxn(), date: `${m}-${day(rng)}`, amount, vendorId: v.id, account: v.category,
          memo: `${v.name} — ${v.category.toLowerCase()}`, approvedBy: rng.pick(approvers).id,
          docId: nextInv(v), po: rng.chance(0.88) ? `PO-${rng.int(10000, 99999)}` : null });
      }
    }
  }
  // payroll / rent / utilities rhythm
  for (const m of FY_MONTHS) {
    txns.push({ txnId: nextTxn(), date: `${m}-28`, amount: rng.amount(180000, 220000), vendorId: null, account: "Payroll", memo: "Monthly payroll", approvedBy: "E-003", docId: null, po: null });
    txns.push({ txnId: nextTxn(), date: `${m}-05`, amount: 42000, vendorId: null, account: "Rent", memo: "Warehouse + office rent", approvedBy: "E-003", docId: null, po: null });
    txns.push({ txnId: nextTxn(), date: `${m}-${day(rng)}`, amount: rng.amount(6000, 14000), vendorId: null, account: "Utilities", memo: "Electricity + water", approvedBy: "E-003", docId: null, po: null });
  }

  let scheme: SchemeSpec | null = null;
  const herrings: { kind: string; txnIds: string[]; clearingDocIds: string[]; explanation: string }[] = [];

  if (opts.scheme) {
    // THE SHELL COMPANY — 14 invoices over 11 months, strictly sequential OWN numbering
    const ids: string[] = [];
    let amt = 9000;
    let seq = 40; // Apex invoice numbers start at 0041 — sole-customer tell
    let total = 0;
    for (let i = 0; i < 14; i++) {
      const m = FY_MONTHS[Math.min(1 + Math.floor(i * 0.78), FY_MONTHS.length - 1)];
      amt = i > 0 && rng.chance(0.35) ? rng.pick([24500, 24800, 24950]) : Math.round(amt * (1 + 0.06 + rng.next() * 0.05));
      if (amt > 24999) amt = rng.pick([24500, 24800, 24950]);
      const txnId = nextTxn();
      ids.push(txnId); total += amt;
      txns.push({ txnId, date: `${m}-${day(rng)}`, amount: amt, vendorId: "V-031", account: "Professional Services",
        memo: "Apex Supplies — consulting & procurement support", approvedBy: "E-007",
        docId: `V-031-INV-${String(++seq).padStart(4, "0")}`, po: null });
    }
    scheme = { vendorId: "V-031", employeeId: "E-007", txnIds: ids, totalUsd: Math.round(total) };
  }
  if (opts.herrings) {
    // H1 — duplicate payment + reversal 3 days later
    const dup = txns.find(x => x.vendorId === "V-012" && x.amount > 5000) ?? txns.find(x => x.vendorId)!;
    const dupId = nextTxn();
    txns.push({ ...dup, txnId: dupId, date: dup.date, memo: dup.memo + " (duplicate entry)", docId: dup.docId });
    const revId = nextTxn();
    const revDate = dup.date.slice(0, 8) + String(Math.min(28, parseInt(dup.date.slice(8)) + 3)).padStart(2, "0");
    txns.push({ txnId: revId, date: revDate, amount: -dup.amount, vendorId: dup.vendorId, account: dup.account,
      memo: `Reversal of duplicate payment ${dupId}`, approvedBy: "E-003", docId: `CR-${dupId}`, po: null });
    herrings.push({ kind: "duplicate_payment_reversed", txnIds: [dupId, revId], clearingDocIds: [`CR-${dupId}`],
      explanation: "Duplicate entry was caught and reversed 3 days later — accounting correction, not fraud." });
    // H2 — big round CAPEX, fully authorized
    const capexId = nextTxn();
    txns.push({ txnId: capexId, date: "2025-09-15", amount: 250000, vendorId: "V-020", account: "Equipment",
      memo: "Packaging line upgrade — board approved", approvedBy: "E-004", docId: "V-020-INV-CAPEX-01", po: "PO-77001" });
    herrings.push({ kind: "round_capex_authorized", txnIds: [capexId], clearingDocIds: ["BOARD-MIN-2025-08", "PO-77001"],
      explanation: "Large round amount, but fully PO-backed and authorized in the August board minutes." });
  }
  txns.sort((a, b) => a.date.localeCompare(b.date) || a.txnId.localeCompare(b.txnId));
  return { txns, scheme, herrings };
}
export { FY_MONTHS };
