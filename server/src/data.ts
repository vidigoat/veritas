/**
 * Data layer — one company's books.
 *   books.db (node:sqlite, read-only)  +  docs/ → FTS5 index (built at load)
 */
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CompanyData {
  db: DatabaseSync;           // opened READ-ONLY
  fts: DatabaseSync;          // in-memory FTS5 over docs
  docs: Map<string, string>;  // docId → full text
  stats: { docs: number; txns: number; vendors: number; employees: number };
}

export function loadCompany(dir: string): CompanyData {
  const db = new DatabaseSync(join(dir, "books.db"), { readOnly: true });
  const docs = new Map<string, string>();
  const fts = new DatabaseSync(":memory:");
  fts.exec(`CREATE VIRTUAL TABLE d USING fts5(doc_id, doc_type, body)`);
  const ins = fts.prepare("INSERT INTO d VALUES (?,?,?)");
  fts.exec("BEGIN");
  for (const f of readdirSync(join(dir, "docs"))) {
    if (!f.endsWith(".txt")) continue;
    const docId = f.replace(/\.txt$/, "");
    const body = readFileSync(join(dir, "docs", f), "utf8");
    docs.set(docId, body);
    const type = docId.startsWith("HR-") ? "employee_record" : docId.includes("-REG") ? "vendor_registration"
      : docId.startsWith("BS-") ? "bank_statement" : docId.startsWith("BOARD") ? "board_minutes"
      : docId.startsWith("CR-") ? "credit_note" : "invoice";
    ins.run(docId, type, body);
  }
  fts.exec("COMMIT");
  const one = (sql: string) => (db.prepare(sql).get() as any)?.n ?? 0;
  return { db, fts, docs, stats: {
    docs: docs.size, txns: one("SELECT COUNT(*) n FROM ledger"),
    vendors: one("SELECT COUNT(*) n FROM vendors"), employees: one("SELECT COUNT(*) n FROM employees") } };
}
