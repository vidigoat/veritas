/** Record a full investigation to fixtures/demo-run.json for demo-mode replay. */
import { runCase } from "./orchestrator.js";
import { ENGAGEMENT } from "./prompts.js";
import { join } from "node:path";
import { ROOT } from "./env.js";
import { writeFileSync, mkdirSync } from "node:fs";
const gen = runCase(join(ROOT, "datagen/data/out/meridian"), ENGAGEMENT);
const evs: any[] = [];
while (true) { const { value, done } = await gen.next(); if (done) break; evs.push(value); }
mkdirSync(join(ROOT, "server/fixtures"), { recursive: true });
writeFileSync(join(ROOT, "server/fixtures/demo-run.json"), JSON.stringify(evs));
console.log(`recorded ${evs.length} events · reveal: ${evs.some(e => e.type === "reveal")} · findings: ${evs.filter(e => e.type === "finding_filed").length}`);
process.exit(0);
