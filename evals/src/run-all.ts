/** Parallel eval fleet — each company in its own child process. Scoreboard at the end. */
import { spawn } from "node:child_process";
import { readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fleet = join(here, "../../datagen/data/out/fleet");
if (!existsSync(fleet)) { console.error("fleet missing — run: pnpm --filter datagen generate -- --fleet"); process.exit(1); }
const companies = readdirSync(fleet).filter(d => !d.startsWith("."));
mkdirSync(join(here, "../results"), { recursive: true });
console.log(`running ${companies.length} companies in parallel…`);
const runs = companies.map(c => new Promise<any>((resolve) => {
  const p = spawn("npx", ["tsx", join(here, "run-one.ts"), join(fleet, c), join(here, `../results/${c}.json`)], { stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; p.stdout.on("data", d => out += d); let err = ""; p.stderr.on("data", d => err += d);
  p.on("close", () => { try { resolve({ c, ...JSON.parse(out.trim().split("\n").at(-1)!) }); } catch { resolve({ c, error: err.slice(-200) || "no output" }); } });
}));
const results = await Promise.all(runs);
console.log("\n════════ EVAL SCOREBOARD ════════");
let pass = 0, hard = 0;
for (const r of results.sort((a, b) => (a.c > b.c ? 1 : -1))) {
  if (r.error) { console.log(`✗ ${r.c}: ERROR ${r.error.slice(0, 80)}`); continue; }
  const s = r.score;
  const ok = s.total >= 80 && !s.hardFail; pass += ok ? 1 : 0; hard += s.hardFail ? 1 : 0;
  console.log(`${ok ? "✓" : "✗"} ${r.c}: ${s.total}/100 ${s.hardFail ? `HARD FAIL: ${s.hardFail}` : ""} ${s.notes?.length ? "· " + s.notes.join("; ") : ""} · ${r.elapsedS}s · $${r.usd}`);
}
console.log(`\nPASS: ${pass}/${results.length} · hard fails: ${hard}`);
