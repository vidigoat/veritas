import { answerQuestion } from "./qa.js";
import { loadCompany } from "./data.js";
import { join } from "node:path";
import { ROOT } from "./env.js";
const data = loadCompany(join(ROOT, "datagen/data/out/meridian"));
const findings = [{ id: "F-1", class: "billing_scheme.shell_company", statement: "Vendor V-031 (Apex Supplies) is a shell company controlled by employee E-007 (Vikram Kulkarni), 14 invoices totaling 332087.", confidence: 0.94, evidence: [] }];
const hypotheses = [{ status: "cleared", statement: "V-020 $250,000 CAPEX — board authorized, PO-backed" }];
const questions = ["How do you know Apex Supplies is a shell company?", "Could the $250,000 payment to V-020 be fraud?", "Show me the total paid to V-031."];
for (const q of questions) {
  console.log(`\n\x1b[1mQ: ${q}\x1b[0m`);
  process.stdout.write("A: ");
  for await (const ev of answerQuestion(data, { findings, hypotheses }, q)) {
    if (ev.type === "answer_tool") process.stdout.write(`\x1b[90m[${ev.payload.summary}]\x1b[0m `);
    if (ev.type === "answer_delta") process.stdout.write(ev.payload.text);
  }
  console.log();
}
process.exit(0);
