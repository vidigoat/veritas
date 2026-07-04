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

serve({ fetch: app.fetch, port: 8787 }, i => console.log(`VERITAS server → http://localhost:${i.port}`));
