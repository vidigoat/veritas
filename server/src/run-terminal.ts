/** Terminal e2e run — the GO-2 gate: cold books → does it find V-031/E-007? */
import { runCase } from "./orchestrator.js";
import { ENGAGEMENT } from "./prompts.js";
import { join } from "node:path";
import { ROOT } from "./env.js";

const dir = process.argv[2] ?? join(ROOT, "datagen/data/out/meridian");
const gen = runCase(dir, ENGAGEMENT);
let res: any;
while (true) {
  const { value, done } = await gen.next();
  if (done) { res = value; break; }
  const e = value as any;
  const p = e.payload;
  if (e.type === "phase_start") console.log(`\n━━ PHASE ${p.index}/${p.of}: ${p.title.toUpperCase()} ━━`);
  else if (e.type === "reasoning_delta") console.log(`  💭 ${p.text.slice(0, 220).replace(/\n+/g, " ")}`);
  else if (e.type === "tool_call") console.log(`  🔧 [${p.model}] ${p.mono}`);
  else if (e.type === "tool_result") console.log(`     ↳ ${p.summary.slice(0, 160)}`);
  else if (e.type === "reveal") console.log(`  🚨 REVEAL: ${p.label}`);
  else if (e.type === "hypothesis_update") console.log(`  📌 ${p.hypId} [${p.status}] ${String(p.statement).slice(0, 90)}`);
  else if (e.type === "finding_filed") console.log(`  ⚖️  FINDING FILED: ${p.finding.class} — ${String(p.finding.statement).slice(0, 100)}`);
  else if (e.type === "approval_request") console.log(`  🧊 APPROVAL REQUESTED: freeze ${p.target}`);
  else if (e.type === "case_closed") console.log(`\n══ CASE CLOSED: ${p.findings} findings · ~${p.totalUsd} · ${p.elapsedS}s ══`);
}
console.log("\n──── VERDICT vs GROUND TRUTH ────");
const f = res.findings.find((f: any) => f.class === "billing_scheme.shell_company");
const okVendor = JSON.stringify(res.findings).includes("V-031");
const okEmp = JSON.stringify(res.findings).includes("E-007");
console.log(`shell finding filed: ${!!f} · names V-031: ${okVendor} · names E-007: ${okEmp} · spend: $${res.usd}`);
process.exit(f && okVendor && okEmp ? 0 : 1);
