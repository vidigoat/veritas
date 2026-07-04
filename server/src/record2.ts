/** Record a genuine v2 run to web/public/demo-v2.json for the bulletproof demo replay. */
import { runCorpus } from "./orchestrator2.js";
import { join } from "node:path";
import { ROOT } from "./env.js";
import { writeFileSync } from "node:fs";
const dir = process.argv[2] ?? join(ROOT, "datagen/data/out/corpus");
const gen = runCorpus(dir);
const evs: any[] = [];
let last = Date.now();
while (true) {
  const { value, done } = await gen.next();
  if (done) break;
  // clamp inter-event gaps so the replay never has a dead 30s pause (fleet waves)
  const now = value.ts;
  evs.push(value);
  last = now;
}
// re-space: compress long gaps to <= 2.5s so the replay stays lively
let t = evs[0]?.ts ?? 0;
for (let i = 1; i < evs.length; i++) { const gap = Math.min(evs[i].ts - evs[i - 1].ts, 2500); t += gap; evs[i] = { ...evs[i], ts: t }; }
writeFileSync(join(ROOT, "web/public/demo-v2.json"), JSON.stringify(evs));
const findings = evs.filter(e => e.type === "finding").length;
const drones = evs.filter(e => e.type === "drone_done").length;
console.log(`recorded ${evs.length} events → web/public/demo-v2.json · ${drones} drones · ${findings} findings`);
process.exit(0);
