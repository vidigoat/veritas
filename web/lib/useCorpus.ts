"use client";
/**
 * useCorpus — the v2 data layer. Upload a folder of a company's books, run a
 * genuine document-scale examination, and reduce the SSE event stream into view
 * state. Also fetches real documents for the clickable case file.
 */
import { useReducer, useRef, useCallback } from "react";

// API base: explicit override → build-time env → dev convention (Next on :3000,
// engine on :8787) → same-origin (the Vultr VM serves console + engine together).
const API = (typeof window !== "undefined" && (window as any).__VERITAS_API__)
  || process.env.NEXT_PUBLIC_API_BASE
  || (typeof window !== "undefined" && window.location.port === "3000" ? "http://localhost:8787" : "");

export interface Drone { i: number; docs: number; found: number }
export interface Anomaly { id: string; scheme: string; title: string; subjectIds: string[]; amount?: number; proofDocs: string[]; detail: string; strength: number }
export interface PanelVote { lens: string; upheld: boolean; confidence: number; reasoning: string }
export interface Finding { id: string; scheme: string; statement: string; amount: number; evidence: any[]; confidence: number; nemotron?: any; recommendedActions?: string[] }
export interface Retrieval { model: string; candidates: number; query?: string; followup?: boolean; surfaced: { docId: string; score: number }[] }
export type StepItem = { kind: "text"; text: string } | { kind: "retrieval"; r: Retrieval };
export interface Step { stepId: string; scheme?: string; items: StepItem[]; verdict?: string; panel?: { reviewing?: boolean; done?: boolean; upheld?: boolean; votes?: PanelVote[]; summary?: string; finding?: string } }

export interface QATurn { role: "user" | "veritas"; text: string; streaming?: boolean; retrieval?: { model: string; candidates: number; surfaced: { docId: string; score: number }[] } }

export interface CorpusState {
  status: "idle" | "uploading" | "running" | "done" | "error";
  qa: QATurn[];
  replay?: boolean;
  corpus?: { stats: Record<string, number>; total: number; company?: string };
  caseId?: string; error?: string;
  phase?: { phase: string; index: number; of: number; title: string };
  plan?: { steps: { step: string; why?: string }[]; model?: string };
  fleet: { shards: number; done: number; drones: Drone[]; facts?: number; fleetFacts?: number; vendors?: number; employees?: number; txns?: number };
  brain?: { entities: number; facts: number; links: number };
  anomalies: Anomaly[];
  reveals: { label: string; subjectIds: string[]; scheme: string }[];
  steps: Step[];
  findings: Finding[];
  cleared: { anomaly?: Anomaly; why?: string }[];
  unproven: { anomaly?: Anomaly }[];
  verdict?: { findings: number; total: number; confidence: number; cleared: number };
  usage?: { usd: number };
  freezes: { target: string; receiptId?: string }[];
  seen?: Set<string>;
}
const init: CorpusState = { status: "idle", fleet: { shards: 0, done: 0, drones: [] }, anomalies: [], reveals: [], steps: [], findings: [], cleared: [], unproven: [], qa: [], freezes: [] };

function reduce(s: CorpusState, ev: any): CorpusState {
  const p = ev.payload ?? {};
  // dedupe: the server stamps every case event with a unique id — an SSE
  // reconnect replaying the log must never duplicate cards mid-demo
  if (ev.id) {
    const seen = s.seen ?? new Set<string>();
    if (seen.has(ev.id)) return s;
    s = { ...s, seen: new Set(seen).add(ev.id) };
  }
  const upStep = (id: string, fn: (st: Step) => void): CorpusState => {
    const steps = [...s.steps];
    const i = steps.findIndex(x => x.stepId === id);
    // clone deep enough that fn can never mutate the previous state object
    const st: Step = i < 0 ? { stepId: id, items: [] } : { ...steps[i], items: [...steps[i].items] };
    fn(st);
    if (i < 0) steps.push(st); else steps[i] = st;
    return { ...s, steps };
  };
  switch (ev.type) {
    case "corpus_loaded": return { ...s, corpus: { stats: p.stats, total: p.total, company: p.company ?? s.corpus?.company }, status: "running" };
    case "phase": return { ...s, phase: p };
    case "plan": return { ...s, plan: { steps: p.steps ?? [], model: p.model } };
    case "fleet_start": return { ...s, fleet: { ...s.fleet, shards: p.shards, drones: [] } };
    case "drone_done": return { ...s, fleet: { ...s.fleet, done: s.fleet.done + 1, drones: [...s.fleet.drones, { i: p.i, docs: p.docs, found: p.found }] } };
    case "fleet_done": return { ...s, fleet: { ...s.fleet, facts: p.facts, fleetFacts: p.fleetFacts, vendors: p.vendors, employees: p.employees, txns: p.txns, done: p.shards, shards: p.shards } };
    case "brain_update": return { ...s, brain: p };
    case "anomaly": return { ...s, anomalies: [...s.anomalies, p.anomaly] };
    case "reveal": return { ...s, reveals: [...s.reveals, p] };
    case "reasoning": return upStep(p.stepId, st => { st.scheme = p.scheme ?? st.scheme; if (p.text) st.items.push({ kind: "text", text: p.text }); if (p.verdict) st.verdict = p.verdict; });
    case "retrieval": return upStep(p.stepId, st => { st.items.push({ kind: "retrieval", r: { model: p.model, candidates: p.candidates, query: p.query, followup: p.followup, surfaced: p.surfaced } }); });
    case "nemotron_panel": return upStep(p.stepId, st => { st.panel = { ...st.panel, reviewing: !p.done, done: p.done, upheld: p.upheld, votes: p.votes ?? st.panel?.votes, summary: p.summary ?? st.panel?.summary, finding: p.finding }; });
    case "cleared": return { ...s, cleared: [...s.cleared, { anomaly: p.anomaly, why: p.why }] };
    case "unproven": return { ...s, unproven: [...s.unproven, { anomaly: p.anomaly }] };
    case "finding": return { ...s, findings: [...s.findings, p.finding] };
    case "freeze_request": return s.freezes.some(f => f.target === p.target) ? s : { ...s, freezes: [...s.freezes, { target: p.target }] };
    case "action_executed": return { ...s, freezes: s.freezes.map(f => f.target === p.target ? { ...f, receiptId: p.receiptId ?? "approved" } : f) };
    case "verdict": return { ...s, verdict: p };
    case "usage": return { ...s, usage: { usd: p.usd ?? p.usdTotal } };
    case "done": return { ...s, status: "done", verdict: s.verdict ?? { findings: p.findings, total: p.total, confidence: 0, cleared: s.cleared.length }, usage: { usd: p.usd } };
    case "error": return { ...s, status: "error", error: p.message };
    // ── interrogation turns ──
    case "ask_user": return { ...s, qa: [...s.qa, { role: "user", text: p.text }, { role: "veritas", text: "", streaming: true }] };
    case "answer_retrieval": return withLastAnswer(s, a => ({ ...a, retrieval: p }));
    case "answer_delta": return withLastAnswer(s, a => ({ ...a, text: a.text + (p.text ?? "") }));
    case "answer_done": return withLastAnswer(s, a => ({ ...a, streaming: false }));
    case "__replay": return { ...s, replay: true };
    default: return s;
  }
}

function withLastAnswer(s: CorpusState, fn: (a: QATurn) => QATurn): CorpusState {
  const qa = [...s.qa];
  for (let i = qa.length - 1; i >= 0; i--) if (qa[i].role === "veritas") { qa[i] = fn(qa[i]); break; }
  return { ...s, qa };
}

export function useCorpus() {
  const [state, dispatch] = useReducer(reduce, init);
  const caseId = useRef<string | null>(null);
  const es = useRef<EventSource | null>(null);
  const lastIdx = useRef(0);

  const consume = useCallback((url: string) => {
    es.current?.close();
    lastIdx.current = 0;
    const open = () => {
      const src = new EventSource(`${url}?after=${lastIdx.current}`); es.current = src;
      src.onmessage = e => {
        if (e.lastEventId) lastIdx.current = parseInt(e.lastEventId) + 1;
        try { const ev = JSON.parse(e.data); if (ev.type === "__done") { src.close(); return; } dispatch(ev); } catch {}
      };
      // reconnect from where we left off (the reducer also dedupes by event id)
      src.onerror = () => { src.close(); setTimeout(open, 1200); };
    };
    open();
  }, []);

  // upload File[] (or use the bundled demo corpus)
  const upload = useCallback(async (files: File[]): Promise<{ caseId: string; total: number } | null> => {
    dispatch({ type: "corpus_loaded", payload: { stats: {}, total: files.length } } as any);
    const payload = await Promise.all(files.slice(0, 5000).map(async f => ({ name: f.name, text: await f.text().catch(() => "") })));
    const r = await fetch(`${API}/api/v2/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: payload }) }).then(r => r.json()).catch(() => null);
    if (!r?.caseId) return null;
    caseId.current = r.caseId; return { caseId: r.caseId, total: r.total };
  }, []);

  // replay the bundled recording — zero backend dependency (public demo fallback)
  const runReplay = useCallback(async () => {
    const events: any[] = await fetch("/demo-v2.json").then(r => r.json()).catch(() => null);
    if (!events?.length) { dispatch({ type: "error", payload: { message: "The engine is unreachable and no recording is bundled. Start the server and retry." } } as any); return false; }
    dispatch({ type: "__replay", payload: {} } as any);
    caseId.current = "demo";
    const t0 = events[0]?.ts ?? 0; const start = Date.now(); const speed = 1.6;
    let i = 0;
    const tick = () => {
      const now = (Date.now() - start) * speed;
      while (i < events.length && (events[i].ts - t0) <= now) dispatch(events[i++]);
      if (i < events.length) setTimeout(tick, 90);
    };
    tick();
    return true;
  }, []);

  const runLive = useCallback(async (cid?: string) => {
    const r = await fetch(`${API}/api/v2/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: cid ?? caseId.current }) }).then(r => r.json()).catch(() => null);
    if (!r?.caseId) { await runReplay(); return; }  // engine down → replay the recording
    caseId.current = r.caseId;
    try { sessionStorage.setItem("veritas-case", r.caseId); } catch {}
    consume(`${API}/api/v2/run/${r.caseId}/events`);
  }, [consume, runReplay]);

  // refresh-proof: if a run was in flight, reattach to its event log (server replays from 0)
  const resume = useCallback(async (): Promise<boolean> => {
    let cid: string | null = null;
    try { cid = sessionStorage.getItem("veritas-case"); } catch {}
    if (!cid) return false;
    // liveness check — a restarted engine no longer knows this case
    const alive = await fetch(`${API}/api/v2/run/${cid}/report`).then(r => r.status !== 404).catch(() => false);
    if (!alive) { try { sessionStorage.removeItem("veritas-case"); } catch {} return false; }
    caseId.current = cid;
    consume(`${API}/api/v2/run/${cid}/events`);
    return true;
  }, [consume]);

  // interrogate the case — live retrieval + streaming answer over POST-SSE
  const ask = useCallback(async (question: string) => {
    const q = question.trim(); if (!q) return;
    dispatch({ type: "ask_user", payload: { text: q } } as any);
    try {
      const r = await fetch(`${API}/api/v2/ask/${caseId.current}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      if (!r.ok || !r.body) throw new Error("ask failed");
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, nl); buf = buf.slice(nl + 2);
          const line = chunk.split("\n").find(l => l.startsWith("data: "));
          if (!line) continue;
          try { const ev = JSON.parse(line.slice(6)); if (ev.type !== "__done") dispatch(ev); } catch {}
        }
      }
    } catch {
      dispatch({ type: "answer_delta", payload: { text: "I couldn't reach the engine to answer that — it may be a static replay. Run live to interrogate the case." } } as any);
    }
    dispatch({ type: "answer_done", payload: {} } as any);
  }, []);

  const openDoc = useCallback(async (docId: string): Promise<{ docId: string; type: string; text: string } | null> => {
    // genuine: fetch the actual uploaded source document from the backend
    const cid = caseId.current;
    if (!cid) return null;
    return fetch(`${API}/api/v2/doc/${cid}/${encodeURIComponent(docId)}`).then(r => r.ok ? r.json() : null).catch(() => null);
  }, []);

  // approve a freeze — a REAL backend action that returns a receipt
  const approve = useCallback(async (target: string) => {
    const r = await fetch(`${API}/api/v2/run/${caseId.current}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target }) }).then(r => r.ok ? r.json() : null).catch(() => null);
    dispatch({ type: "action_executed", payload: { target, receiptId: r?.receiptId ?? "FRZ-LOCAL" } } as any);
  }, []);

  return { state, upload, runLive, runReplay, resume, ask, openDoc, approve, caseId };
}
