/** E7: same seed → byte-identical manifest. */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
execSync("npx tsx src/generate.ts --seed 777 --out data/tmp/det-a", { stdio: "pipe" });
execSync("npx tsx src/generate.ts --seed 777 --out data/tmp/det-b", { stdio: "pipe" });
const a = readFileSync("data/tmp/det-a/manifest.json", "utf8");
const b = readFileSync("data/tmp/det-b/manifest.json", "utf8");
if (a !== b) { console.error("✗ determinism FAILED"); process.exit(1); }
console.log("✓ determinism: identical manifests for same seed");
