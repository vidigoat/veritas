/**
 * VERITAS server — Hono + SSE.
 *
 *   POST /api/case            start investigation (live key required unless localhost)
 *   GET  /api/case/:id/events SSE — replays event log from ?after=N, then live
 *   POST /api/case/:id/approve approve a pending freeze
 *   GET  /api/case/:id/report  compiled report JSON (findings ledger ONLY)
 *   GET  /api/demo/events      SSE replay of the recorded fixture (demo mode)
 *   GET  /api/health
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { runCase } from "./orchestrator.js";
import { ENGAGEMENT } from "./prompts.js";
import { env, ROOT } from "./env.js";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { CaseEvent } from "@veritas/shared";
import { answerQuestion } from "./qa.js";
import { runCorpus } from "./orchestrator2.js";
import { ingestDir, ingestFiles } from "./ingest.js";
import { mkdirSync, writeFileSync as wf } from "node:fs";
import { loadCompany } from "./data.js";

interface Run { id: string; events: CaseEvent[]; done: boolean; result?: any; approve?: () => void }
const runs = new Map<string, Run>();

const app = new Hono();
app.use("*", cors());
app.get("/api/health", c => c.json({ ok: true, runs: runs.size }));

app.post("/api/case", async c => {
  const body = await c.req.json().catch(() => ({}));
  const isLocal = (c.req.header("host") ?? "").startsWith("localhost") || (c.req.header("host") ?? "").startsWith("127.");
  if (!isLocal && env("DEMO_ACCESS_KEY") && body.key !== env("DEMO_ACCESS_KEY")) return c.json({ error: "live runs need ?key — public visitors: use demo mode" }, 403);
  const id = Math.random().toString(36).slice(2, 8);
  const run: Run = { id, events: [], done: false };
  runs.set(id, run);
  (async () => {
    const gen = runCase(body.companyDir ?? join(ROOT, "datagen/data/out/meridian"), body.brief ?? ENGAGEMENT);
    try {
      while (true) { const { value, done } = await gen.next(); if (done) { run.result = value; break; } run.events.push(value); }
    } catch (e: any) { run.events.push({ id: "err", ts: Date.now(), type: "error", phase: null, payload: { message: e.message, recoverable: false } } as any); }
    run.done = true;
  })();
  return c.json({ id });
});

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

app.get("/api/case/:id/events", c => {
  const run = runs.get(c.req.param("id"));
  if (!run) return c.json({ error: "run not found" }, 404);
  const after = parseInt(c.req.query("after") ?? "0");
  return new Response(sseStream(() => run.events, () => run.done, after), { headers: sseHeaders });
});

app.post("/api/case/:id/approve", c => {
  const run = runs.get(c.req.param("id"));
  if (!run) return c.json({ error: "run not found" }, 404);
  run.events.push({ id: "appr", ts: Date.now(), type: "action_executed", phase: "decide", payload: { action: "freeze_vendor", target: "V-031", receiptId: `FRZ-${Date.now().toString(36)}` } } as any);
  return c.json({ ok: true });
});

app.get("/api/case/:id/report", c => {
  const run = runs.get(c.req.param("id"));
  if (!run?.result) return c.json({ error: "not ready" }, 404);
  const r = run.result;
  return c.json({ findings: r.findings, cleared: r.hypotheses.filter((h: any) => h.status === "cleared"), unproven: r.hypotheses.filter((h: any) => h.status === "unproven"), approvals: r.approvals, elapsedS: r.elapsedS, usd: r.usd });
});

// demo mode: replay the recorded fixture with realistic pacing
app.get("/api/demo/events", c => {
  const fp = join(ROOT, "server/fixtures/demo-run.json");
  if (!existsSync(fp)) return c.json({ error: "fixture missing" }, 404);
  const events: CaseEvent[] = JSON.parse(readFileSync(fp, "utf8"));
  let i = 0; const t0 = events[0]?.ts ?? 0; const start = Date.now();
  const speed = parseFloat(c.req.query("speed") ?? "6");
  let closed = false;
  return new Response(new ReadableStream({
    start(ctrl) {
      const enc = new TextEncoder();
      const safe = (s: string) => { try { ctrl.enqueue(enc.encode(s)); return true; } catch { closed = true; return false; } };
      const tick = () => {
        if (closed) return;
        const now = (Date.now() - start) * speed;
        while (i < events.length && (events[i].ts - t0) <= now) if (!safe(`data: ${JSON.stringify(events[i++])}\n\n`)) return;
        if (i >= events.length) { safe(`data: {"type":"__done"}\n\n`); try { ctrl.close(); } catch {} return; }
        setTimeout(tick, 100);
      };
      tick();
    },
    cancel() { closed = true; },
  }), { headers: sseHeaders });
});

// fixture recorder: run once, save events
app.post("/api/record-fixture", async c => {
  const gen = runCase(join(ROOT, "datagen/data/out/meridian"), ENGAGEMENT);
  const evs: CaseEvent[] = [];
  while (true) { const { value, done } = await gen.next(); if (done) break; evs.push(value); }
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(ROOT, "server/fixtures"), { recursive: true });
  writeFileSync(join(ROOT, "server/fixtures/demo-run.json"), JSON.stringify(evs));
  return c.json({ recorded: evs.length });
});


// CASE CHAT — interrogate a completed (or in-progress) investigation
app.post("/api/case/:id/ask", async c => {
  const run = runs.get(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const question = String(body.question ?? "").slice(0, 500);
  if (!question) return c.json({ error: "question required" }, 400);
  const findings = run?.result?.findings ?? run?.events.filter(e => e.type === "finding_filed").map((e: any) => e.payload.finding) ?? [];
  const hypotheses = run?.result?.hypotheses ?? [];
  const data = loadCompany(join(ROOT, "datagen/data/out/meridian"));
  return new Response(new ReadableStream({
    async start(ctrl) {
      const enc = new TextEncoder(); let closed = false;
      const safe = (s: string) => { try { ctrl.enqueue(enc.encode(s)); } catch { closed = true; } };
      try {
        for await (const ev of answerQuestion(data, { findings, hypotheses }, question)) {
          if (closed) break;
          safe(`data: ${JSON.stringify(ev)}\n\n`);
        }
      } catch (e: any) { safe(`data: ${JSON.stringify({ type: "answer_delta", payload: { text: "I hit an error answering that." } })}\n\n`); }
      safe(`data: {"type":"__done"}\n\n`); try { ctrl.close(); } catch {}
    },
    cancel() {},
  }), { headers: sseHeaders });
});

// ── VERITAS v2 — genuine document-scale runs ────────────────────────────────
interface V2Run { id: string; events: CaseEvent[]; done: boolean; result?: any; dir: string }
const v2runs = new Map<string, V2Run>();
const UPLOADS = join(ROOT, "server/uploads");
const DEMO_CORPUS = join(ROOT, "datagen/data/out/corpus");

// upload a folder of a company's books → returns caseId + corpus stats
app.post("/api/v2/upload", async c => {
  const body = await c.req.json().catch(() => ({} as any));
  const files: { name: string; text?: string; base64?: string }[] = body.files ?? [];
  if (!files.length) return c.json({ error: "no files" }, 400);
  const id = Math.random().toString(36).slice(2, 8);
  const dir = join(UPLOADS, id);
  try { mkdirSync(dir, { recursive: true }); } catch {}
  for (const f of files.slice(0, 5000)) {
    const text = f.text ?? (f.base64 ? Buffer.from(f.base64, "base64").toString("utf8") : "");
    try { wf(join(dir, f.name.replace(/[^\w.\-]/g, "_")), text); } catch {}
  }
  const corpus = ingestDir(dir);
  return c.json({ caseId: id, stats: corpus.stats, total: corpus.total });
});

// start a genuine run (over an uploaded caseId, or the bundled demo corpus)
app.post("/api/v2/run", async c => {
  const body = await c.req.json().catch(() => ({} as any));
  const dir = body.caseId && existsSync(join(UPLOADS, body.caseId)) ? join(UPLOADS, body.caseId) : DEMO_CORPUS;
  const id = Math.random().toString(36).slice(2, 8);
  const run: V2Run = { id, events: [], done: false, dir };
  v2runs.set(id, run);
  (async () => {
    const gen = runCorpus(dir);
    try { while (true) { const { value, done } = await gen.next(); if (done) { run.result = value; break; } run.events.push(value); } }
    catch (e: any) { run.events.push({ id: "err", ts: Date.now(), type: "error", phase: null, payload: { message: e.message } } as any); }
    run.done = true;
  })();
  return c.json({ caseId: id });
});

app.get("/api/v2/run/:id/events", c => {
  const run = v2runs.get(c.req.param("id"));
  if (!run) return c.json({ error: "run not found" }, 404);
  const after = parseInt(c.req.query("after") ?? "0");
  return new Response(sseStream(() => run.events, () => run.done, after), { headers: sseHeaders });
});

// list the corpus (for the browsable case file)
app.get("/api/v2/corpus/:caseId", c => {
  const cid = c.req.param("caseId");
  const dir = v2runs.get(cid)?.dir ?? (cid === "demo" ? DEMO_CORPUS : join(UPLOADS, cid));
  if (!existsSync(dir)) return c.json({ error: "not found" }, 404);
  const corpus = ingestDir(dir);
  return c.json({ stats: corpus.stats, total: corpus.total, docs: corpus.order.map(id => { const d = corpus.docs.get(id)!; return { docId: d.docId, filename: d.filename, type: d.type, preview: d.text.slice(0, 120) }; }) });
});

// fetch one real document (clickable citations open this)
app.get("/api/v2/doc/:caseId/:docId", c => {
  const cid = c.req.param("caseId"); const did = c.req.param("docId");
  const dir = v2runs.get(cid)?.dir ?? (cid === "demo" ? DEMO_CORPUS : join(UPLOADS, cid));
  if (!existsSync(dir)) return c.json({ error: "not found" }, 404);
  const corpus = ingestDir(dir);
  const d = corpus.docs.get(did) ?? corpus.docs.get(did.toUpperCase());
  if (!d) return c.json({ error: "doc not found" }, 404);
  return c.json({ docId: d.docId, filename: d.filename, type: d.type, text: d.text });
});

serve({ fetch: app.fetch, port: 8787 }, i => console.log(`VERITAS server → http://localhost:${i.port}`));
