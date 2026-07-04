import { ingestDir } from "./ingest.js";
import { extractCorpus } from "./extract.js";
import { detectAnomalies } from "./detect.js";
import { CaseBrain } from "./brain.js";
const dir = process.argv[2] ?? "../datagen/data/out/corpus";
const t0 = Date.now();
const corpus = ingestDir(dir);
console.log(`INGEST: ${corpus.total} docs`, corpus.stats);
const brain = new CaseBrain();
let started = 0, done = 0, nShards = 0;
const { store, shards, facts } = await extractCorpus(corpus, {
  brain, concurrency: 5,
  onFleet: n => { nShards = n; console.log(`FLEET: ${n} Nemotron drones dispatched`); },
  onDrone: (i, dc, found) => { done++; if (done % 5 === 0 || done === nShards) process.stdout.write(`  drones done ${done} (last read ${dc} docs → ${found} facts)\n`); },
});
console.log(`EXTRACT: ${facts} facts — ${store.vendors.size} vendors · ${store.employees.size} employees · ${store.txns.length} txns · ${store.payments.length} payments · ${store.payroll.length} payroll lines`);
const anoms = detectAnomalies(store);
console.log(`\nDETECT: ${anoms.length} anomalies`);
for (const a of anoms.slice(0, 8)) console.log(`  [${a.scheme}] ${a.title}  · strength ${a.strength.toFixed(2)} · ${a.amount ? "$" + Math.round(a.amount).toLocaleString() : ""} · proof ${a.proofDocs.join(", ")}`);
console.log(`\n── ground-truth check ──`);
const shell = anoms.find(a => a.scheme === "shell_company" && a.subjectIds.some(x => /031/.test(x)));
const ghost = anoms.find(a => a.scheme === "ghost_employee");
const dup = anoms.find(a => a.scheme === "duplicate_payment" && a.amount > 0);
console.log(`shell V-031 detected: ${!!shell}${shell ? " ($" + Math.round(shell.amount).toLocaleString() + ")" : ""}`);
console.log(`ghost employee detected: ${!!ghost}`);
console.log(`un-reversed duplicate detected: ${!!dup}`);
console.log(`\nelapsed ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(0);
