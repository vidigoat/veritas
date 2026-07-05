/**
 * VERITAS server — Hono + SSE. Genuine document-scale forensic runs.
 *
 *   POST /api/v2/upload             upload a folder of a company's books -> caseId
 *   POST /api/v2/run                start a genuine examination (streams events)
 *   GET  /api/v2/run/:id/events     SSE event log from ?after=N, then live
 *   GET  /api/v2/run/:id/report     the compiled, cited examination report
 *   POST /api/v2/run/:id/approve    approve a freeze — recorded with a receipt
 *   POST /api/v2/ask/:caseId        interrogate the case — live retrieval + streamed answer
 *   GET  /api/v2/corpus/:caseId     browse the case file
 *   GET  /api/v2/doc/:caseId/:docId open one real source document
 *   GET  /api/health · *            serves the static console (web/out) when present
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { env, ROOT } from "./env.js";
import { join } from "node:path";
import { readFileSync, existsSync, mkdirSync, writeFileSync as wf } from "node:fs";
import type { CaseEvent } from "@veritas/shared";
import { runCorpus } from "./orchestrator2.js";
import { answerCorpusQuestion } from "./qa2.js";
import { ingestDir } from "./ingest.js";

const app = new Hono();
app.use("*", cors());
const sseHeaders = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*" };
function sseStream(getEvents: () => CaseEvent[], isDone: () => boolean, after = 0) {
  let i = after; let closed = false;
  return new ReadableStream({
    start(ctrl) {
      const enc = new TextEncoder();
      const safe = (s: string) => { try { ctrl.enqueue(enc.encode(s)); return true; } catch { closed = true; return false; } };
      const tick = () => {
        if (closed) return;
        const evs = getEvents();
        while (i < evs.length) if (!safe(`id: ${i}\ndata: ${JSON.stringify(evs[i++])}\n\n`)) return;
        if (isDone() && i >= getEvents().length) { safe(`data: {"type":"__done"}\n\n`); try { ctrl.close(); } catch {} return; }
        setTimeout(tick, 120);
      };
      tick();
    },
    cancel() { closed = true; },
  });
}

// ── VERITAS v2 — genuine document-scale runs ────────────────────────────────
interface V2Run { id: string; events: CaseEvent[]; done: boolean; result?: any; dir: string }
const v2runs = new Map<string, V2Run>();
app.get("/api/health", c => c.json({ ok: true, runs: v2runs.size }));
const UPLOADS = join(ROOT, "server/uploads");
const DEMO_CORPUS = join(ROOT, "datagen/data/out/corpus");

// corpora are immutable once uploaded — ingest each directory once, then reuse
const corpusCache = new Map<string, ReturnType<typeof ingestDir>>();
const getCorpus = (dir: string) => {
  let c = corpusCache.get(dir);
  if (!c) { c = ingestDir(dir); corpusCache.set(dir, c); if (corpusCache.size > 24) corpusCache.delete(corpusCache.keys().next().value!); }
  return c;
};

// upload a folder of a company's books → returns caseId + corpus stats
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB of books is plenty for a demo VM
app.post("/api/v2/upload", async c => {
  const len = parseInt(c.req.header("content-length") ?? "0") || 0;
  if (len > MAX_UPLOAD_BYTES) return c.json({ error: "upload too large (50 MB max)" }, 413);
  const body = await c.req.json().catch(() => ({} as any));
  const files: { name: string; text?: string; base64?: string }[] = body.files ?? [];
  if (!files.length) return c.json({ error: "no files" }, 400);
  const id = Math.random().toString(36).slice(2, 8);
  const dir = join(UPLOADS, id);
  try { mkdirSync(dir, { recursive: true }); } catch {}
  let written = 0;
  for (const f of files.slice(0, 5000)) {
    const text = f.text ?? (f.base64 ? Buffer.from(f.base64, "base64").toString("utf8") : "");
    written += text.length;
    if (written > MAX_UPLOAD_BYTES) break;
    const name = f.name.replace(/[^\w.\-]/g, "_");
    if (!name || name === "." || name === "..") continue;
    try { wf(join(dir, name), text); } catch {}
  }
  const corpus = ingestDir(dir);
  return c.json({ caseId: id, stats: corpus.stats, total: corpus.total });
});

// start a genuine run (over an uploaded caseId, or the bundled demo corpus).
// Guarded: bounded concurrency + a small per-IP hourly budget (each run costs real inference).
const ipRuns = new Map<string, number[]>();
app.post("/api/v2/run", async c => {
  const live = [...v2runs.values()].filter(r => !r.done).length;
  if (live >= 3) return c.json({ error: "the engine is at capacity — try again in a minute" }, 429);
  // key on the SOCKET address (the VM serves :8787 directly — XFF would be spoofable)
  const ip = (c.env as any)?.incoming?.socket?.remoteAddress
    || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const hist = (ipRuns.get(ip) ?? []).filter(t => Date.now() - t < 3600_000);
  if (hist.length >= 12) return c.json({ error: "hourly examination limit reached for this address" }, 429);
  hist.push(Date.now()); ipRuns.set(ip, hist);
  const body = await c.req.json().catch(() => ({} as any));
  const dir = body.caseId && existsSync(join(UPLOADS, body.caseId)) ? join(UPLOADS, body.caseId) : DEMO_CORPUS;
  const id = Math.random().toString(36).slice(2, 8);
  const run: V2Run = { id, events: [], done: false, dir };
  v2runs.set(id, run);
  (async () => {
    const gen = runCorpus(dir, typeof body.brief === "string" && body.brief.trim() ? body.brief.trim().slice(0, 400) : undefined);
    try { while (true) { const { value, done } = await gen.next(); if (done) { run.result = value; break; } run.events.push(value); } }
    catch (e: any) { run.events.push({ id: "err", ts: Date.now(), type: "error", phase: null, payload: { message: e.message } } as any); }
    run.done = true;
  })();
  return c.json({ caseId: id });
});

app.get("/api/v2/run/:id/events", c => {
  const run = v2runs.get(c.req.param("id"));
  if (!run) return c.json({ error: "run not found" }, 404);
  const after = Math.max(0, parseInt(c.req.query("after") ?? "0") || 0);
  return new Response(sseStream(() => run.events, () => run.done, after), { headers: sseHeaders });
});

// list the corpus (for the browsable case file)
app.get("/api/v2/corpus/:caseId", c => {
  const cid = c.req.param("caseId");
  const dir = v2runs.get(cid)?.dir ?? (cid === "demo" ? DEMO_CORPUS : join(UPLOADS, cid));
  if (!existsSync(dir)) return c.json({ error: "not found" }, 404);
  const corpus = getCorpus(dir);
  return c.json({ stats: corpus.stats, total: corpus.total, docs: corpus.order.map(id => { const d = corpus.docs.get(id)!; return { docId: d.docId, filename: d.filename, type: d.type, preview: d.text.slice(0, 120) }; }) });
});

// fetch one real document (clickable citations open this)
app.get("/api/v2/doc/:caseId/:docId", c => {
  const cid = c.req.param("caseId"); const did = c.req.param("docId");
  const dir = v2runs.get(cid)?.dir ?? (cid === "demo" ? DEMO_CORPUS : join(UPLOADS, cid));
  if (!existsSync(dir)) return c.json({ error: "not found" }, 404);
  const corpus = getCorpus(dir);
  const d = corpus.docs.get(did) ?? corpus.docs.get(did.toUpperCase());
  if (!d) return c.json({ error: "doc not found" }, 404);
  return c.json({ docId: d.docId, filename: d.filename, type: d.type, text: d.text });
});

// the compiled examination report — the artifact an audit committee walks away with
app.get("/api/v2/run/:id/report", c => {
  const run = v2runs.get(c.req.param("id"));
  if (!run) return c.json({ error: "run not found" }, 404);
  if (!run.result) return c.json({ error: "examination still in progress" }, 425);
  const r = run.result;
  const company = (run.events.find(e => e.type === "corpus_loaded")?.payload as any)?.company;
  return c.json({ company, findings: r.findings, cleared: r.cleared, corpus: r.corpus, usd: r.usd, elapsedS: r.elapsedS });
});

// approve a freeze — the human-in-the-loop action, recorded with a receipt
app.post("/api/v2/run/:id/approve", async c => {
  const run = v2runs.get(c.req.param("id"));
  if (!run) return c.json({ error: "run not found" }, 404);
  const body = await c.req.json().catch(() => ({} as any));
  const target = String(body.target ?? "").slice(0, 40) || "unknown";
  const receiptId = `FRZ-${Date.now().toString(36).toUpperCase()}`;
  run.events.push({ id: `ap-${receiptId}`, ts: Date.now(), type: "action_executed", phase: "report", payload: { action: "freeze_vendor", target, receiptId } } as any);
  return c.json({ ok: true, receiptId, target });
});

// INTERROGATE the case — a live, retrieval-grounded, streaming answer
app.post("/api/v2/ask/:caseId", async c => {
  const run = v2runs.get(c.req.param("caseId"));
  if (!run) return c.json({ error: "run not found" }, 404);
  const body = await c.req.json().catch(() => ({} as any));
  const question = String(body.question ?? "").slice(0, 500).trim();
  if (!question) return c.json({ error: "question required" }, 400);
  const corpus = getCorpus(run.dir);
  const findings = run.result?.findings ?? run.events.filter(e => e.type === "finding").map((e: any) => e.payload.finding);
  const cleared = run.result?.cleared ?? run.events.filter(e => e.type === "cleared").map((e: any) => e.payload.anomaly);
  const company = (run.events.find(e => e.type === "corpus_loaded")?.payload as any)?.company;
  return new Response(new ReadableStream({
    async start(ctrl) {
      const enc = new TextEncoder(); let closed = false;
      const safe = (s: string) => { try { ctrl.enqueue(enc.encode(s)); } catch { closed = true; } };
      try {
        for await (const ev of answerCorpusQuestion(corpus, { findings, cleared, company }, question)) {
          if (closed) break;
          safe(`data: ${JSON.stringify(ev)}\n\n`);
        }
      } catch { safe(`data: ${JSON.stringify({ type: "answer_delta", payload: { text: "I hit an error answering that." } })}\n\n`); }
      safe(`data: {"type":"__done"}\n\n`); try { ctrl.close(); } catch {}
    },
    cancel() {},
  }), { headers: sseHeaders });
});

// ── static console — if web/out exists, this VM serves the whole product at "/" ──
const WEB_OUT = join(ROOT, "web/out");
if (existsSync(WEB_OUT)) {
  const MIME: Record<string, string> = { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml", json: "application/json", png: "image/png", ico: "image/x-icon", txt: "text/plain", woff2: "font/woff2" };
  app.get("*", c => {
    const raw = c.req.path === "/" ? "/index.html" : c.req.path;
    const safe = raw.replace(/\.\./g, "");
    let fp = join(WEB_OUT, safe);
    if (!existsSync(fp)) fp = join(WEB_OUT, "index.html"); // SPA fallback
    const ext = fp.split(".").pop() ?? "html";
    return new Response(readFileSync(fp), { headers: { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": safe.startsWith("/_next/") ? "public, max-age=31536000, immutable" : "no-cache" } });
  });
}

const PORT = parseInt(env("PORT", "8787"));
serve({ fetch: app.fetch, port: PORT }, i => console.log(`VERITAS server → http://localhost:${i.port}`));
