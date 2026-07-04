"use client";
/**
 * useCorpus — the v2 data layer. Upload a folder of a company's books, run a
 * genuine document-scale examination, and reduce the SSE event stream into view
 * state. Also fetches real documents for the clickable case file.
 */
import { useReducer, useRef, useCallback } from "react";

const API = (typeof window !== "undefined" && (window as any).__VERITAS_API__) || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

export interface Drone { i: number; docs: number; found: number }
export interface Anomaly { id: string; scheme: string; title: string; subjectIds: string[]; amount?: number; proofDocs: string[]; detail: string; strength: number }
export interface PanelVote { lens: string; upheld: boolean; confidence: number; reasoning: string }
export interface Finding { id: string; scheme: string; statement: string; amount: number; evidence: any[]; confidence: number; nemotron?: any; recommendedActions?: string[] }
export interface Step { stepId: string; scheme?: string; texts: string[]; verdict?: string; retrieval?: { model: string; candidates: number; surfaced: { docId: string; score: number }[] }; panel?: { reviewing?: boolean; done?: boolean; upheld?: boolean; votes?: PanelVote[]; summary?: string; finding?: string } }

export interface CorpusState {
  status: "idle" | "uploading" | "running" | "done" | "error";
  corpus?: { stats: Record<string, number>; total: number };
  caseId?: string; error?: string;
  phase?: { phase: string; index: number; of: number; title: string };
  fleet: { shards: number; done: number; drones: Drone[]; facts?: number; vendors?: number; employees?: number; txns?: number };
  brain?: { entities: number; facts: number; links: number };
  anomalies: Anomaly[];
  reveal?: { label: string; subjectIds: string[]; scheme: string };
  steps: Step[];
  findings: Finding[];
  cleared: { anomaly?: Anomaly; why?: string }[];
  verdict?: { findings: number; total: number; confidence: number; cleared: number };
  usage?: { usd: number };
  freeze?: { target: string }; approved?: boolean;
}
const init: CorpusState = { status: "idle", fleet: { shards: 0, done: 0, drones: [] }, anomalies: [], steps: [], findings: [], cleared: [] };

function reduce(s: CorpusState, ev: any): CorpusState {
  const p = ev.payload ?? {};
  const upStep = (id: string, fn: (st: Step) => void): CorpusState => {
    const steps = [...s.steps]; let st = steps.find(x => x.stepId === id);
    if (!st) { st = { stepId: id, texts: [] }; steps.push(st); } else { st = { ...st }; steps[steps.indexOf(steps.find(x => x.stepId === id)!)] = st; }
    fn(st); return { ...s, steps };
  };
  switch (ev.type) {
    case "corpus_loaded": return { ...s, corpus: { stats: p.stats, total: p.total }, status: "running" };
    case "phase": return { ...s, phase: p };
    case "fleet_start": return { ...s, fleet: { ...s.fleet, shards: p.shards, drones: [] } };
    case "drone_done": return { ...s, fleet: { ...s.fleet, done: s.fleet.done + 1, drones: [...s.fleet.drones, { i: p.i, docs: p.docs, found: p.found }] } };
    case "fleet_done": return { ...s, fleet: { ...s.fleet, facts: p.facts, vendors: p.vendors, employees: p.employees, txns: p.txns, done: p.shards, shards: p.shards } };
    case "brain_update": return { ...s, brain: p };
    case "anomaly": return { ...s, anomalies: [...s.anomalies, p.anomaly] };
    case "reveal": return { ...s, reveal: p };
    case "reasoning": return upStep(p.stepId, st => { st.scheme = p.scheme ?? st.scheme; if (p.text) st.texts.push(p.text); if (p.verdict) st.verdict = p.verdict; });
    case "retrieval": return upStep(p.stepId, st => { st.retrieval = { model: p.model, candidates: p.candidates, surfaced: p.surfaced }; });
    case "nemotron_panel": return upStep(p.stepId, st => { st.panel = { ...st.panel, reviewing: !p.done, done: p.done, upheld: p.upheld, votes: p.votes ?? st.panel?.votes, summary: p.summary ?? st.panel?.summary, finding: p.finding }; });
    case "cleared": return { ...s, cleared: [...s.cleared, { anomaly: p.anomaly, why: p.why }] };
    case "finding": return { ...s, findings: [...s.findings, p.finding] };
    case "freeze_request": return { ...s, freeze: { target: p.target } };
    case "action_executed": return { ...s, approved: true };
    case "verdict": return { ...s, verdict: p };
    case "usage": return { ...s, usage: { usd: p.usd ?? p.usdTotal } };
    case "done": return { ...s, status: "done", verdict: s.verdict ?? { findings: p.findings, total: p.total, confidence: 0, cleared: s.cleared.length }, usage: { usd: p.usd } };
    case "error": return { ...s, status: "error", error: p.message };
    default: return s;
  }
}

export function useCorpus() {
  const [state, dispatch] = useReducer(reduce, init);
  const caseId = useRef<string | null>(null);
  const es = useRef<EventSource | null>(null);

  const consume = useCallback((url: string) => {
    es.current?.close();
    const src = new EventSource(url); es.current = src;
    src.onmessage = e => { try { const ev = JSON.parse(e.data); if (ev.type === "__done") { src.close(); return; } dispatch(ev); } catch {} };
    src.onerror = () => {};
  }, []);

  // upload File[] (or use the bundled demo corpus)
  const upload = useCallback(async (files: File[]): Promise<{ caseId: string; total: number } | null> => {
    dispatch({ type: "corpus_loaded", payload: { stats: {}, total: files.length } } as any);
    const payload = await Promise.all(files.slice(0, 5000).map(async f => ({ name: f.name, text: await f.text().catch(() => "") })));
    const r = await fetch(`${API}/api/v2/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: payload }) }).then(r => r.json()).catch(() => null);
    if (!r?.caseId) return null;
    caseId.current = r.caseId; return { caseId: r.caseId, total: r.total };
  }, []);

  const runLive = useCallback(async (cid?: string) => {
    const r = await fetch(`${API}/api/v2/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: cid ?? caseId.current }) }).then(r => r.json()).catch(() => null);
    if (!r?.caseId) { dispatch({ type: "error", payload: { message: "could not start run" } } as any); return; }
    caseId.current = r.caseId; consume(`${API}/api/v2/run/${r.caseId}/events`);
  }, [consume]);

  // demo replay of a bundled recording (zero backend)
  const runDemo = useCallback(async (speed = 4) => {
    try {
      const evs = await fetch("/demo-v2.json").then(r => r.json());
      es.current?.close();
      const t0 = evs[0]?.ts ?? 0; const start = Date.now(); let i = 0;
      const tick = () => { const now = (Date.now() - start) * speed; while (i < evs.length && (evs[i].ts - t0) <= now) dispatch(evs[i++]); if (i < evs.length) setTimeout(tick, 80); };
      tick();
    } catch { runLive("demo"); }
  }, [runLive]);

  const docBundle = useRef<Record<string, { type: string; text: string }> | null>(null);
  const openDoc = useCallback(async (docId: string): Promise<{ docId: string; type: string; text: string } | null> => {
    // demo mode: read the bundled corpus (no backend needed)
    if (!docBundle.current) { try { docBundle.current = await fetch("/demo-docs.json").then(r => r.json()); } catch { docBundle.current = {}; } }
    const b = docBundle.current?.[docId] ?? docBundle.current?.[docId.toUpperCase()];
    if (b) return { docId, type: b.type, text: b.text };
    const cid = caseId.current ?? "demo";
    return fetch(`${API}/api/v2/doc/${cid}/${encodeURIComponent(docId)}`).then(r => r.ok ? r.json() : null).catch(() => null);
  }, []);
  const approve = useCallback(async () => { dispatch({ type: "action_executed", payload: {} } as any); }, []);

  return { state, upload, runLive, runDemo, openDoc, approve, caseId };
}
