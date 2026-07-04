/**
 * V2 EVALS — the shipped pipeline (orchestrator2.runCorpus), two companies:
 *
 *   1. SCHEME books — the bundled 1,090-doc corpus with three planted schemes
 *      and two red herrings. PASS = shell + ghost + duplicate all CONFIRMED,
 *      the reversed duplicate NOT filed, zero false accusations.
 *   2. CLEAN books — the same corpus with the three fraud proofs surgically
 *      removed. PASS = ZERO findings filed. VERITAS does not cry wolf.
 *
 * Live: every reasoning step runs on Vultr Serverless Inference (~$0.03 total).
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCorpus } from "../../server/src/orchestrator2.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCHEME_DIR = join(ROOT, "datagen/data/out/corpus");
const CLEAN_DIR = join(ROOT, "datagen/data/out/corpus-clean");

if (!existsSync(SCHEME_DIR)) { console.error("✗ demo corpus missing — run: pnpm --filter @veritas/datagen corpus"); process.exit(1); }

// ── build the clean variant: remove the three planted proofs ────────────────
rmSync(CLEAN_DIR, { recursive: true, force: true });
cpSync(SCHEME_DIR, CLEAN_DIR, { recursive: true });
const patch = (f: string, from: string | RegExp, to: string) => {
  const p = join(CLEAN_DIR, f);
  writeFileSync(p, readFileSync(p, "utf8").replace(from, to));
};
// shell: the vendor no longer shares the employee's home address
patch("VENDOR-V031-registration.txt", /Registered Address\s*:.*$/m, "Registered Address : 88 Rue de Rivoli, Paris 75004");
// ghost: the second employee has their own bank account — in the HR record AND
// every payroll register that lists them (the detector reads both)
patch("HR-E015-record.txt", /A\/C \*{4}\d{4}/, "A/C ****9182");
for (const m of ["2026-01", "2026-02", "2026-03"]) {
  const p = join(CLEAN_DIR, `PAYROLL-${m}.txt`);
  if (!existsSync(p)) continue;
  const lines = readFileSync(p, "utf8").split("\n").map(l => l.includes("Deepak Verma") ? l.replace(/\*{4}\d{4}/, "****9182") : l);
  writeFileSync(p, lines.join("\n"));
}
// duplicate: only one payment of the pair remains
{
  const p = join(CLEAN_DIR, "BANK-STMT-2025-11.txt");
  const lines = readFileSync(p, "utf8").split("\n");
  const i = lines.findIndex(l => l.includes("INV-2025-0554"));
  const j = lines.findIndex((l, k) => k > i && l.includes("INV-2025-0554"));
  if (j > 0) lines.splice(j, 1);
  writeFileSync(p, lines.join("\n"));
}

async function run(dir: string) {
  const gen = runCorpus(dir);
  while (true) { const { value, done } = await gen.next(); if (done) return value; }
}

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failed++; };

console.log("── SCHEME books (3 planted schemes + 2 herrings) ──");
const s = await run(SCHEME_DIR);
const schemes = new Set(s.findings.map((f: any) => f.scheme));
check("shell company confirmed", schemes.has("shell_company"));
check("ghost employee confirmed", schemes.has("ghost_employee"));
check("un-reversed duplicate confirmed", schemes.has("duplicate_payment"));
check("no over-filing (≤3 findings)", s.findings.length <= 3, `${s.findings.length} findings`);
check("reversed-duplicate herring not filed", !s.findings.some((f: any) => Math.round(f.amount) === 54200), `${s.cleared.length} cleared`);
check("all findings cite evidence", s.findings.every((f: any) => f.evidence?.length > 0));
console.log(`  €${Math.round(s.findings.reduce((t: number, f: any) => t + f.amount, 0)).toLocaleString("en-US")} at risk · ${s.elapsedS}s · $${s.usd}`);

console.log("\n── CLEAN books (proofs removed — must file NOTHING) ──");
const c = await run(CLEAN_DIR);
check("zero findings on clean books", c.findings.length === 0, `${c.findings.length} filed`);
console.log(`  ${c.elapsedS}s · $${c.usd}`);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL GREEN — no fraud invented, no fraud missed.");
process.exit(failed ? 1 : 0);
