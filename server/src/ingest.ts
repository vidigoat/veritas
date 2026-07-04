/**
 * INGEST — turn an uploaded folder of a company's books into a typed Corpus.
 *
 * Pipeline:
 *   dir / files ──▶ read bytes ──▶ parse to plain text ──▶ classifyDoc ──▶ Doc
 *                                                                   │
 *                                                                   ▼
 *                                                    Corpus { docs, order, stats, total }
 *
 * Design rules:
 *   • Dependency-light: PDF is decoded with a built-in, synchronous, zero-dep
 *     extractor (node:zlib). No hard 3rd-party dep can break `pnpm install`.
 *   • Never throw on one bad file — skip it, keep the rest.
 *   • Fast on 400+ files (single sync pass, no network, no async fan-out).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { inflateSync, inflateRawSync } from "node:zlib";
import type { Corpus, Doc, DocType } from "./contracts.js";

// ── Which files are documents we care about ──────────────────────────────────
const DOC_EXTS = new Set([".txt", ".md", ".csv", ".tsv", ".log", ".pdf", ".docx", ".json", ""]);
const SKIP_NAMES = new Set(["manifest.json", "package.json", "books.db", ".ds_store"]);

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

function isDocFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (isHidden(lower)) return false;
  if (SKIP_NAMES.has(lower)) return false;
  const ext = extname(lower);
  return DOC_EXTS.has(ext);
}

// ── docId = filename without extension ───────────────────────────────────────
function toDocId(filename: string): string {
  const b = basename(filename);
  const ext = extname(b);
  return ext ? b.slice(0, -ext.length) : b;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PARSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal, dependency-free PDF text extractor.
 * Decompresses FlateDecode streams (node:zlib) and pulls text out of the
 * (…)Tj / […]TJ / (…)' / (…)" content-stream operators. Best-effort — good
 * enough to classify + extract from machine-generated PDFs; scanned/OCR PDFs
 * yield "" and are surfaced as needing OCR by the caller (empty text Doc).
 */
function parsePdfText(buf: Buffer): string {
  let out = "";
  try {
    // Locate every `stream … endstream` block and try to inflate it.
    const bytes = buf;
    const streamKw = Buffer.from("stream");
    const endKw = Buffer.from("endstream");
    let i = 0;
    const chunks: string[] = [];
    while (i < bytes.length) {
      const s = bytes.indexOf(streamKw, i);
      if (s < 0) break;
      let dataStart = s + streamKw.length;
      // skip the EOL after `stream` (\r\n or \n)
      if (bytes[dataStart] === 0x0d) dataStart++;
      if (bytes[dataStart] === 0x0a) dataStart++;
      const e = bytes.indexOf(endKw, dataStart);
      if (e < 0) break;
      let dataEnd = e;
      // trim trailing EOL before endstream
      if (bytes[dataEnd - 1] === 0x0a) dataEnd--;
      if (bytes[dataEnd - 1] === 0x0d) dataEnd--;
      const raw = bytes.subarray(dataStart, dataEnd);
      let decoded: Buffer | null = null;
      try { decoded = inflateSync(raw); } catch {
        try { decoded = inflateRawSync(raw); } catch { decoded = null; }
      }
      if (decoded) chunks.push(decoded.toString("latin1"));
      else chunks.push(raw.toString("latin1")); // maybe already uncompressed text
      i = e + endKw.length;
    }
    const content = chunks.join("\n") || bytes.toString("latin1");
    out = extractPdfStrings(content);
  } catch {
    out = "";
  }
  return out.trim();
}

/** Pull display strings from a decoded PDF content stream. */
function extractPdfStrings(content: string): string {
  const pieces: string[] = [];
  // (string) Tj   |   (string) '   |   (string) "
  const tjRe = /\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|")/g;
  let m: RegExpExecArray | null;
  while ((m = tjRe.exec(content)) !== null) pieces.push(unescapePdf(m[1]));
  // [ (a) -250 (b) ] TJ   — array show with kerning
  const arrRe = /\[((?:[^\[\]]|\\.)*)\]\s*TJ/g;
  while ((m = arrRe.exec(content)) !== null) {
    const inner = m[1];
    const strRe = /\(((?:\\.|[^\\()])*)\)/g;
    let s: RegExpExecArray | null;
    let line = "";
    while ((s = strRe.exec(inner)) !== null) line += unescapePdf(s[1]);
    if (line) pieces.push(line);
  }
  return pieces.join("\n");
}

function unescapePdf(s: string): string {
  return s
    .replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b").replace(/\\f/g, "\f")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_x, o) => String.fromCharCode(parseInt(o, 8)));
}

/**
 * Minimal DOCX text extractor: a .docx is a zip; the document body lives in
 * word/document.xml. We locate that entry's deflate stream via the zip local
 * header, inflate it, and strip XML tags. Zero-dep, best-effort. If anything
 * looks off, return "" (skip gracefully).
 */
function parseDocxText(buf: Buffer): string {
  try {
    const needle = Buffer.from("word/document.xml");
    let idx = buf.indexOf(needle);
    while (idx >= 0) {
      // Walk back to the local file header signature PK\x03\x04
      const sig = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), idx);
      if (sig < 0) break;
      const compMethod = buf.readUInt16LE(sig + 8);
      const compSize = buf.readUInt32LE(sig + 18);
      const nameLen = buf.readUInt16LE(sig + 26);
      const extraLen = buf.readUInt16LE(sig + 28);
      const nameStart = sig + 30;
      const name = buf.subarray(nameStart, nameStart + nameLen).toString("latin1");
      if (name === "word/document.xml") {
        const dataStart = nameStart + nameLen + extraLen;
        let xml: string;
        const raw = buf.subarray(dataStart, dataStart + (compSize || buf.length - dataStart));
        if (compMethod === 0) xml = raw.toString("utf8");
        else xml = inflateRawSync(raw).toString("utf8");
        return xmlToText(xml);
      }
      idx = buf.indexOf(needle, idx + 1);
    }
  } catch { /* fall through */ }
  return "";
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/?>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parse raw bytes → plain text based on extension. Never throws. */
function parseBytes(filename: string, buf: Buffer): string {
  const ext = extname(filename).toLowerCase();
  try {
    if (ext === ".pdf") return parsePdfText(buf);
    if (ext === ".docx") return parseDocxText(buf);
    // txt/md/csv/tsv/log/json/no-extension → UTF-8 text
    return buf.toString("utf8");
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Robust DocType classifier using BOTH filename patterns and content.
 * Filename is a strong signal for the demo corpus (INV-…, VENDOR-V…, HR-E…,
 * BANK-STMT-…, PAYROLL-…, PO-…, BOARD-MINUTES-…, CREDIT-NOTE-CR-…). Falls back
 * to content heuristics for arbitrary uploads.
 */
export function classifyDoc(filename: string, text: string): DocType {
  const byName = classifyByFilename(filename);
  if (byName) return byName;
  const byContent = classifyByContent(text);
  if (byContent) return byContent;
  return "other";
}

function classifyByFilename(filename: string): DocType | null {
  const fn = basename(filename).toUpperCase();
  // order matters — most specific / least ambiguous first
  if (/\bBANK[-_ ]?STMT|\bBANK[-_ ]?STATEMENT/.test(fn)) return "bank_statement";
  if (fn.includes("BOARD") && fn.includes("MINUTE")) return "board_minutes";
  if (fn.includes("CREDIT") && fn.includes("NOTE")) return "credit_note";
  if (/^CR[-_]\d/.test(fn) || /\bCREDIT[-_]?NOTE/.test(fn)) return "credit_note";
  if (fn.includes("PAYROLL") || fn.includes("PAYSLIP") || fn.includes("PAY-REGISTER")) return "payroll";
  if (/(^|[^A-Z])VENDOR/.test(fn) || fn.includes("REGISTRATION") || /[-_]REG(\b|[-_])/.test(fn)
      || fn.includes("VENDOR-MASTER") || fn.includes("VENDORMASTER")) return "vendor_registration";
  if (/^HR[-_]/.test(fn) || /(^|[^A-Z])EMPLOYEE/.test(fn) || /^EMP[-_]/.test(fn)) return "employee_record";
  if (/(^|[^A-Z])PO[-_]?\d/.test(fn) || fn.includes("PURCHASE-ORDER") || fn.includes("PURCHASEORDER")) return "purchase_order";
  if (/(^|[^A-Z])(GENERAL[-_ ]?)?LEDGER/.test(fn) || fn.includes("GL-")) return "ledger";
  if (/(^|[^A-Z])INV[-_]?\d/.test(fn) || /(^|[^A-Z])INVOICE/.test(fn)) return "invoice";
  return null;
}

function classifyByContent(text: string): DocType | null {
  if (!text) return null;
  const t = text.toUpperCase();
  const has = (...ss: string[]) => ss.some((s) => t.includes(s));
  // strongest structural markers first
  if (has("VENDOR MASTER", "VENDOR REGISTRATION", "VENDOR ONBOARDING")) return "vendor_registration";
  if (has("EMPLOYEE RECORD", "EMPLOYEE MASTER", "HR CONFIDENTIAL")) return "employee_record";
  if (has("BANK STATEMENT", "STATEMENT OF ACCOUNT")) return "bank_statement";
  if (has("PAYROLL REGISTER", "PAYROLL", "PAYSLIP", "SALARY REGISTER")) return "payroll";
  if (has("PURCHASE ORDER")) return "purchase_order";
  if (t.includes("BOARD") && t.includes("MINUTES")) return "board_minutes";
  if (has("MINUTES OF THE MEETING")) return "board_minutes";
  if (has("CREDIT NOTE")) return "credit_note";
  if (has("GENERAL LEDGER", "LEDGER ACCOUNT", "TRIAL BALANCE")) return "ledger";
  if (has("TAX INVOICE", "INVOICE NO", "INVOICE NUMBER", "PROFORMA INVOICE")) return "invoice";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CORPUS ASSEMBLY
// ─────────────────────────────────────────────────────────────────────────────

function buildCorpus(rawDocs: Doc[]): Corpus {
  const docs = new Map<string, Doc>();
  for (const d of rawDocs) {
    if (!d.docId) continue;
    // de-dupe on docId (last wins); keeps corpus flat
    docs.set(d.docId, d);
  }
  const order = [...docs.keys()].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const stats: Record<string, number> = {};
  for (const id of order) {
    const t = docs.get(id)!.type;
    stats[t] = (stats[t] ?? 0) + 1;
  }
  return { docs, order, stats, total: docs.size };
}

/** Recursively collect document file paths under a directory. */
function walk(dir: string, acc: string[]): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (isHidden(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      walk(full, acc);
    } else if (isDocFile(name)) {
      acc.push(full);
    }
  }
}

/**
 * Read every document file in a directory (recursively; corpus stays flat),
 * skipping manifest.json / hidden / non-document files, and build a Corpus.
 */
export function ingestDir(dir: string): Corpus {
  const paths: string[] = [];
  walk(dir, paths);
  const rawDocs: Doc[] = [];
  for (const p of paths) {
    try {
      const buf = readFileSync(p);
      const filename = basename(p);
      const text = parseBytes(filename, buf);
      const type = classifyDoc(filename, text);
      rawDocs.push({ docId: toDocId(filename), filename, type, text });
    } catch {
      // never throw on a single bad file — skip and continue
      continue;
    }
  }
  return buildCorpus(rawDocs);
}

/** Uploaded-content variant (used by /upload). Accepts text, Buffer, or base64. */
export function ingestFiles(
  files: { name: string; text?: string; buffer?: Buffer; base64?: string }[],
): Corpus {
  const rawDocs: Doc[] = [];
  for (const f of files) {
    try {
      if (!f || !f.name) continue;
      const filename = basename(f.name);
      if (!isDocFile(filename)) continue;
      let text: string;
      if (typeof f.text === "string") {
        text = f.text;
      } else if (f.buffer && Buffer.isBuffer(f.buffer)) {
        text = parseBytes(filename, f.buffer);
      } else if (typeof f.base64 === "string") {
        text = parseBytes(filename, Buffer.from(f.base64, "base64"));
      } else {
        continue;
      }
      const type = classifyDoc(filename, text);
      rawDocs.push({ docId: toDocId(filename), filename, type, text });
    } catch {
      continue;
    }
  }
  return buildCorpus(rawDocs);
}
