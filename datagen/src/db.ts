/** SQLite build via node:sqlite (built into Node 22 — no native deps).
 *  One DB per company. Read-only views are the agent's query surface. */
import { DatabaseSync } from "node:sqlite";
import type { Txn } from "./ledger.js";
import type { Vendor, Employee } from "./world.js";

export function buildDb(path: string, txns: Txn[], vendors: Vendor[], employees: Employee[]) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE ledger (txn_id TEXT PRIMARY KEY, date TEXT, amount REAL, vendor_id TEXT, account TEXT, memo TEXT, approved_by TEXT, doc_id TEXT, po TEXT);
    CREATE TABLE vendors (vendor_id TEXT PRIMARY KEY, name TEXT, address TEXT, tax_id TEXT, bank_account TEXT, onboarded TEXT, category TEXT);
    CREATE TABLE employees (employee_id TEXT PRIMARY KEY, name TEXT, role TEXT, home_address TEXT, joined TEXT);
    CREATE VIEW vw_ledger AS SELECT * FROM ledger;
    CREATE VIEW vw_vendors AS SELECT vendor_id, name, tax_id, onboarded, category FROM vendors; -- address NOT in SQL surface: cross_reference is the only path to the match (the tool earns its moment)
    CREATE VIEW vw_employees AS SELECT employee_id, name, role, joined FROM employees;
    CREATE VIEW vw_payments AS SELECT txn_id, date, amount, vendor_id, approved_by FROM ledger WHERE vendor_id IS NOT NULL;
    CREATE VIEW vw_approvals AS SELECT approved_by, vendor_id, COUNT(*) n, SUM(amount) total FROM ledger WHERE vendor_id IS NOT NULL GROUP BY approved_by, vendor_id;
  `);
  const it = db.prepare("INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?,?)");
  db.exec("BEGIN");
  for (const t of txns) it.run(t.txnId, t.date, t.amount, t.vendorId, t.account, t.memo, t.approvedBy, t.docId, t.po);
  const iv = db.prepare("INSERT INTO vendors VALUES (?,?,?,?,?,?,?)");
  for (const v of vendors) iv.run(v.id, v.name, v.address, v.taxId, v.bankAccount, v.onboarded, v.category);
  const ie = db.prepare("INSERT INTO employees VALUES (?,?,?,?,?)");
  for (const e of employees) ie.run(e.id, e.name, e.role, e.homeAddress, e.joined);
  db.exec("COMMIT");
  db.close();
}
