/**
 * FAST DETERMINISTIC PARSE — reads the actual document text and extracts the
 * structured facts directly. This is genuine (it reads the real uploaded files;
 * different documents → different facts), instant, and it handles well-formed
 * business documents. The LLM fleet (extract.ts) augments it for messy / unknown
 * formats. Detection runs on the merged store.
 */
import type { Corpus } from "./contracts.js";
import { emptyExtracted, type Extracted } from "./contracts.js";

const grab = (t: string, ...keys: string[]) => {
  for (const k of keys) { const m = t.match(new RegExp(k + "\\s*[:\\-]?\\s*(.+)", "i")); if (m) return m[1].trim().replace(/\s{2,}.*$/, "").trim(); }
  return undefined;
};
const num = (s?: string) => { if (!s) return undefined; const m = s.replace(/[, ]/g, "").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : undefined; };

export function parseCorpus(corpus: Corpus): Extracted {
  const ex = emptyExtracted();
  for (const id of corpus.order) {
    const d = corpus.docs.get(id)!; const t = d.text;
    try {
      if (d.type === "vendor_registration") {
        const name = grab(t, "Registered Name", "Vendor Name", "Name") ?? t.split("\n")[0].trim();
        ex.vendors.push({ name, vendorId: grab(t, "Vendor ID", "Vendor Id"), address: grab(t, "Registered Address", "Address"),
          taxId: cleanTax(grab(t, "GSTIN", "Tax ID", "PAN")), bankAccount: grab(t, "Bank Account", "Account"), category: grab(t, "Category"), onboarded: grab(t, "Onboarded"), sourceDoc: id });
      } else if (d.type === "employee_record") {
        ex.employees.push({ name: grab(t, "Name", "Employee Name") ?? "", empId: grab(t, "Employee ID", "Emp ID"),
          role: grab(t, "Role", "Title", "Designation"), address: grab(t, "Home Address", "Address"),
          bankAccount: grab(t, "Bank Account", "Salary Account", "Account"), salary: num(grab(t, "Monthly Salary", "Salary")),
          joined: grab(t, "Date of Joining", "Joined", "DOJ"), email: grab(t, "Email"), sourceDoc: id });
      } else if (d.type === "invoice") {
        const vendor = t.split("\n")[0].trim();
        ex.transactions.push({ vendor, vendorId: grab(t, "Vendor ID"), amount: num(grab(t, "TOTAL PAYABLE", "Total", "Amount Due", "Grand Total")) ?? 0,
          invoiceNo: grab(t, "Invoice No", "Invoice Number", "AP Voucher"), approver: grab(t, "Approver", "Approved By", "Authorised By"),
          po: grab(t, "PO Reference", "PO Ref", "Purchase Order", "PO No") ?? null, sourceDoc: id });
      } else if (d.type === "bank_statement") {
        for (const line of t.split("\n")) {
          const dm = line.match(/^\s*(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(.+)$/);
          if (!dm) continue;
          const amounts = [...line.matchAll(/[\d,]+\.\d{2}/g)].map(m => num(m[0])!).filter(Boolean);
          if (amounts.length < 2) continue;           // need a txn amount + a running balance
          const amt = amounts[amounts.length - 2];      // the transaction (balance is last)
          const ref = dm[2]; const desc = dm[3].replace(/[\d,]+\.\d{2}/g, "").replace(/Rs/g, "").replace(/\s{2,}/g, " ").trim();
          const isCredit = /rcpt|receipt|customer|reversal|credit/i.test(line);
          ex.payments.push({ amount: amt, description: `${ref} ${desc}`.slice(0, 60), direction: isCredit ? "credit" : "debit", sourceDoc: id });
        }
      } else if (d.type === "payroll") {
        for (const line of t.split("\n")) {
          const m = line.match(/(E-\d+)?\s*([A-Z][a-z]+ [A-Z][a-z]+).*?([\d,]+(?:\.\d{2})?)/);
          if (m && num(m[3])! > 1000) ex.payroll.push({ empId: m[1], name: m[2], amount: num(m[3])!, bankAccount: grabAcct(line), sourceDoc: id });
        }
      } else if (d.type === "credit_note") {
        ex.payments.push({ amount: num(grab(t, "Amount", "Total")) ?? 0, description: "credit note " + (grab(t, "Reversal of", "Against") ?? id), direction: "credit", sourceDoc: id });
      }
    } catch { /* skip malformed doc */ }
  }
  return ex;
}
const cleanTax = (s?: string) => !s || /not provided|n\/a|none|^\[/i.test(s) ? undefined : s;
const grabAcct = (line: string) => { const m = line.match(/(?:A\/C|Account|Bank)[^\dX]*([X\d]{4,})/i) || line.match(/([X*]{2,}\d{3,})/); return m ? m[1] : undefined; };
