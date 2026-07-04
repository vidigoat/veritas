import { runCase } from "../../server/src/orchestrator.js";
import { ENGAGEMENT } from "../../server/src/prompts.js";
import { score } from "./score.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const outFile = process.argv[3];
const gen = runCase(dir, ENGAGEMENT);
let res: any; while (true) { const { value, done } = await gen.next(); if (done) { res = value; break; } }
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const s = score(res, manifest);
const out = { dir, score: s, findings: res.findings.length, elapsedS: res.elapsedS, usd: res.usd };
if (outFile) { mkdirSync(join(outFile, ".."), { recursive: true }); writeFileSync(outFile, JSON.stringify(out, null, 1)); }
console.log(JSON.stringify(out));
process.exit(0);
