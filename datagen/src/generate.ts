/**
 * Meridian generator — one command, one company (or the full eval fleet).
 *
 *   config ──▶ world (vendors/employees) ──▶ ledger (+scheme +herrings)
 *          ──▶ docs/ (invoices, registrations, HR, statements, minutes)
 *          ──▶ books.db (sqlite + views)   ──▶ manifest.json (evals only)
 *
 * Usage: tsx src/generate.ts [--seed 4471] [--out ../data/meridian] [--no-scheme] [--fleet]
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { makeRng } from "./rng.js";
import { makeEmployees, makeVendors } from "./world.js";
import { buildLedger, FY_MONTHS } from "./ledger.js";
import { renderInvoice, renderVendorRegistration, renderEmployeeFile, renderBankStatementMonth, renderBoardMinutes, renderCreditNote } from "./render.js";
import { buildDb } from "./db.js";

function generateCompany(seed: number, out: string, opts: { scheme: boolean; herrings: boolean }) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "docs"), { recursive: true });
  const rng = makeRng(seed);
  const employees = makeEmployees(rng);
  const vendors = makeVendors(rng); // 46 honest vendors: V-001..V-046 minus V-031 slot handled below

  // Rebuild vendor list so V-031 is THE shell (when scheme on) — controlled by E-007
  const e007 = employees[6]; // index 6 → E-007, Procurement Manager by role table order
  const shell = { id: "V-031", name: "Apex Supplies", address: e007.homeAddress, taxId: null,
    bankAccount: `XX${rng.int(100000, 999999)}`, onboarded: "2025-04-15", category: "Professional Services" };
  const allVendors = vendors.filter(v => v.id !== "V-031");
  if (opts.scheme) allVendors.push(shell);
  else allVendors.push({ ...shell, name: "Apex Supplies", address: "77 LBS Marg, Thane 400601", taxId: `27${rng.int(10000,99999)}${rng.int(10000,99999)}C` });
  allVendors.sort((a, b) => a.id.localeCompare(b.id));

  const { txns, scheme, herrings } = buildLedger(rng, allVendors, employees, opts);

  // documents
  const byId = new Map(allVendors.map(v => [v.id, v]));
  let docCount = 0;
  for (const t of txns) {
    if (!t.docId || !t.vendorId || t.docId.startsWith("CR-")) continue;
    const v = byId.get(t.vendorId)!;
    writeFileSync(join(out, "docs", `${t.docId}.txt`), renderInvoice(t, v, rng)); docCount++;
  }
  for (const v of allVendors) { writeFileSync(join(out, "docs", `${v.id}-REG.txt`), renderVendorRegistration(v)); docCount++; }
  for (const e of employees) { writeFileSync(join(out, "docs", `HR-${e.id}.txt`), renderEmployeeFile(e)); docCount++; }
  for (const m of FY_MONTHS) { writeFileSync(join(out, "docs", `BS-${m}.txt`), renderBankStatementMonth(m, txns)); docCount++; }
  if (opts.herrings) {
    writeFileSync(join(out, "docs", `BOARD-MIN-2025-08.txt`), renderBoardMinutes()); docCount++;
    const h1 = herrings.find(h => h.kind === "duplicate_payment_reversed");
    if (h1) {
      const dup = txns.find(t => t.txnId === h1.txnIds[0])!;
      writeFileSync(join(out, "docs", `CR-${dup.txnId}.txt`), renderCreditNote(dup.txnId, dup.amount, byId.get(dup.vendorId!)?.name ?? "vendor")); docCount++;
    }
  }
  buildDb(join(out, "books.db"), txns, allVendors, employees);
  writeFileSync(join(out, "manifest.json"), JSON.stringify({
    seed,
    scheme: scheme ? { type: "shell_company", vendorId: scheme.vendorId, employeeId: scheme.employeeId,
      totalUsd: scheme.totalUsd, txnIds: scheme.txnIds, proofDocIds: [`V-031-REG`, `HR-E-007`] } : null,
    herrings,
  }, null, 2));
  console.log(`✓ seed=${seed} → ${out}: ${txns.length} txns · ${docCount} docs · ${allVendors.length} vendors · scheme=${opts.scheme}`);
}

const args = process.argv.slice(2);
const get = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const seed = parseInt(get("--seed", "4471"));
const out = get("--out", "data/out/meridian");

if (args.includes("--fleet")) {
  // eval fleet: 8 scheme variants + 2 clean companies
  for (let i = 0; i < 8; i++) generateCompany(1000 + i * 137, `data/out/fleet/company-${i + 1}`, { scheme: true, herrings: true });
  generateCompany(9001, "data/out/fleet/clean-1", { scheme: false, herrings: true });
  generateCompany(9002, "data/out/fleet/clean-2", { scheme: false, herrings: false });
} else {
  generateCompany(seed, out, { scheme: !args.includes("--no-scheme"), herrings: true });
}
