import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envMap: Record<string, string> = {};
try {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) envMap[m[1]] = m[2];
  }
} catch { /* .env optional if real env vars set */ }
export const env = (k: string, d?: string) => process.env[k] ?? envMap[k] ?? d ?? "";
export const ROOT = root;
