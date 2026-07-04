/**
 * Offline correctness test — no LLM calls.
 * Ingests the bundled demo corpus, runs the parser store + detection,
 * and asserts the planted ground truth is found (and nothing explodes).
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import { ROOT } from "./env.js";
import { ingestDir } from "./ingest.js";
import { parserStore } from "./extract.js";
import { detectAnomalies } from "./detect.js";

const dir = join(ROOT, "datagen/data/out/corpus");
if (!existsSync(dir)) {
  console.error(`✗ demo corpus missing at ${dir} — run: pnpm --filter @veritas/datagen generate`);
  process.exit(1);
}

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

const corpus = ingestDir(dir);
check("ingest reads the corpus", corpus.total > 500, `${corpus.total} docs`);

const store = parserStore(corpus);
check("parser extracts vendors", store.vendors.size >= 30, `${store.vendors.size} vendors`);
check("parser extracts employees", store.employees.size >= 10, `${store.employees.size} employees`);
check("parser extracts transactions", store.txns.length >= 500, `${store.txns.length} txns`);

const anomalies = detectAnomalies(store);
check("detection finds anomalies", anomalies.length > 0, `${anomalies.length} anomalies`);

const shell = anomalies.find(a => a.scheme === "shell_company");
check("shell company detected", !!shell, shell ? `${shell.title} · €${Math.round(shell.amount ?? 0).toLocaleString("en-US")}` : "not found");
check("shell has proof docs", !!shell && shell.proofDocs.length >= 2, shell?.proofDocs.join(", "));
check("shell is dispositive (strength ≥ 0.7)", !!shell && shell.strength >= 0.7, shell ? String(shell.strength) : "");

process.exit(failed ? 1 : 0);
