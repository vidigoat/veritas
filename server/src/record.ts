/** Record a full investigation to fixtures/demo-run.json for demo-mode replay. */
import { runCase } from "./orchestrator.js";
import { ENGAGEMENT } from "./prompts.js";
import { join } from "node:path";
import { ROOT } from "./env.js";
import { writeFileSync, mkdirSync } from "node:fs";
const gen = runCase(join(ROOT, "datagen/data/out/meridian"), ENGAGEMENT);
const evs: any[] = [];
while (true) { const { value, done } = await gen.next(); if (done) break; evs.push(value); }
// Demo polish: let the Nemotron "independent second examiner" UPHELD verdict linger
// on screen (~3.5s) before the finding files and the phase collapses. Without this the
// verdict is visible for ~2ms — the GPU-prize money shot would flash by unseen.
const upheldIdx = evs.findIndex(e => e?.payload?.tool === "nemotron_verify" && e.type === "tool_result");
if (upheldIdx >= 0) { for (let i = upheldIdx + 1; i < evs.length; i++) evs[i].ts += 3500; }
mkdirSync(join(ROOT, "server/fixtures"), { recursive: true });
writeFileSync(join(ROOT, "server/fixtures/demo-run.json"), JSON.stringify(evs));
console.log(`recorded ${evs.length} events · reveal: ${evs.some(e => e.type === "reveal")} · findings: ${evs.filter(e => e.type === "finding_filed").length}`);
process.exit(0);
