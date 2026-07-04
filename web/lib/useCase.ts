"use client";
/**
 * useCase — SSE reducer (Titan pattern). Events → typed view-model.
 * Supports live runs (/api/case/:id/events) and demo replay (/api/demo/events).
 * Refresh-proof: reconnect resumes from ?after= on the live path.
 */
import { useReducer, useRef, useCallback } from "react";

export interface Step { stepId: string; title: string; icon: string; reasoning: string; tools: ToolEvt[]; docs: DocChip[]; entities: EntChip[]; live: boolean }
export interface ToolEvt { tool: string; argsSummary: string; mono: string; model: string; summary?: string; flagged?: boolean; ms?: number; done: boolean }
export interface DocChip { docId: string; note: string }
export interface EntChip { entityId: string; kind: string; name: string }
export interface Hyp { hypId: string; statement: string; status: string; confidence: number; evidenceFor: number; nextProbe?: string }
export interface GNode { id: string; kind: string; name: string; totalUsd?: number; state: string }
export interface GEdge { id: string; from: string; to: string; kind: string; amountUsd?: number; label?: string; state: string }
export interface Finding { id: string; class: string; statement: string; evidence: any[]; confidence: number; unresolved: any[]; recommendedActions: string[] }

export interface PhaseBlock { phase: string; index: number; of: number; title: string; steps: Step[]; done: boolean; summary?: string; toolCalls?: number; seconds?: number }

export interface CaseState {
  brief?: string; corpus?: any; ingest?: { indexed: number; total: number };
  phases: PhaseBlock[]; hypotheses: Hyp[]; nodes: GNode[]; edges: GEdge[];
  reveal?: { vendorId: string; employeeId: string; label: string };
  findings: Finding[]; approval?: { action: string; target: string; reason: string }; approved?: boolean;
  usage?: { usd: number; inTokens: number; outTokens: number }; reportReady?: boolean;
  closed?: { findings: number; totalUsd: number; confidence: number; elapsedS: number };
  status: "idle" | "running" | "done" | "error"; error?: string;
}
const init: CaseState = { phases: [], hypotheses: [], nodes: [], edges: [], findings: [], status: "idle" };

function reduce(s: CaseState, ev: any): CaseState {
  const p = ev.payload;
  const cur = () => s.phases[s.phases.length - 1];
  const patchStep = (fn: (st: Step) => void): CaseState => {
    const phases = [...s.phases]; const ph = phases[phases.length - 1]; if (!ph) return s;
    ph.steps = [...ph.steps]; const st = ph.steps[ph.steps.length - 1]; if (st) fn(st);
    return { ...s, phases };
  };
  switch (ev.type) {
    case "case_opened": return { ...s, brief: p.brief, corpus: p.corpus, status: "running" };
    case "ingest_progress": return { ...s, ingest: { indexed: p.indexed, total: p.total } };
    case "phase_start": return { ...s, phases: [...s.phases.map(x => ({ ...x, steps: x.steps.map(st => ({ ...st, live: false })) })), { phase: p.phase, index: p.index, of: p.of, title: p.title, steps: [], done: false }] };
    case "phase_done": { const phases = [...s.phases]; const ph = phases.find(x => x.phase === p.phase && !x.done); if (ph) { ph.done = true; ph.summary = p.summary; ph.toolCalls = p.toolCalls; ph.seconds = p.seconds; ph.steps = ph.steps.map(st => ({ ...st, live: false })); } return { ...s, phases }; }
    case "step_start": { const phases = [...s.phases]; const ph = phases[phases.length - 1]; if (!ph) return s; ph.steps = [...ph.steps.map(st => ({ ...st, live: false })), { stepId: p.stepId, title: p.title, icon: p.icon, reasoning: "", tools: [], docs: [], entities: [], live: true }]; return { ...s, phases }; }
    case "reasoning_delta": return patchStep(st => { st.reasoning = p.text; });
    case "tool_call": return patchStep(st => { st.tools.push({ tool: p.tool, argsSummary: p.argsSummary, mono: p.mono, model: p.model, done: false }); });
    case "tool_result": return patchStep(st => { for (let i = st.tools.length - 1; i >= 0; i--) if (st.tools[i].tool === p.tool && !st.tools[i].done) { st.tools[i] = { ...st.tools[i], summary: p.summary, flagged: p.flagged, ms: p.ms, done: true }; break; } });
    case "doc_touched": return patchStep(st => { if (!st.docs.some(d => d.docId === p.docId)) st.docs.push({ docId: p.docId, note: p.note }); });
    case "entity_touched": return patchStep(st => { if (!st.entities.some(e => e.entityId === p.entityId)) st.entities.push({ entityId: p.entityId, kind: p.kind, name: p.name }); });
    case "hypothesis_update": { const h = [...s.hypotheses]; const i = h.findIndex(x => x.hypId === p.hypId); const rec = { hypId: p.hypId, statement: p.statement, status: p.status, confidence: p.confidence, evidenceFor: p.evidenceFor, nextProbe: p.nextProbe }; if (i >= 0) h[i] = rec; else h.push(rec); return { ...s, hypotheses: h }; }
    case "graph_update": return { ...s, nodes: p.nodes ?? s.nodes, edges: p.edges ?? s.edges };
    case "reveal": return { ...s, reveal: { vendorId: p.vendorId, employeeId: p.employeeId, label: p.label } };
    case "finding_filed": return { ...s, findings: [...s.findings, p.finding] };
    case "approval_request": return { ...s, approval: { action: p.action, target: p.target, reason: p.reason } };
    case "action_executed": return { ...s, approved: true };
    case "usage": return { ...s, usage: { usd: p.usdTotal, inTokens: p.inTokens, outTokens: p.outTokens } };
    case "report_ready": return { ...s, reportReady: true };
    case "case_closed": return { ...s, closed: p, status: "done" };
    case "error": return { ...s, status: "error", error: p.message };
    default: return s;
  }
}

const API = (typeof window !== "undefined" && (window as any).__VERITAS_API__) || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

export function useCase() {
  const [state, dispatch] = useReducer(reduce, init);
  const idRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const consume = useCallback((url: string) => {
    esRef.current?.close();
    const es = new EventSource(url); esRef.current = es;
    es.onmessage = e => { try { const ev = JSON.parse(e.data); if (ev.type === "__done") { es.close(); return; } dispatch(ev); } catch {} };
    es.onerror = () => { /* browser auto-reconnects; server replays from last id */ };
  }, []);

  const startDemo = useCallback(async (speed = 6) => {
    // client-side replay of the bundled fixture — zero backend dependency (bulletproof public demo)
    try {
      const evs = await fetch("/demo-run.json").then(r => r.json());
      esRef.current?.close();
      const t0 = evs[0]?.ts ?? 0; const start = Date.now(); let i = 0;
      const tick = () => {
        const now = (Date.now() - start) * speed;
        while (i < evs.length && (evs[i].ts - t0) <= now) dispatch(evs[i++]);
        if (i < evs.length) setTimeout(tick, 90);
      };
      tick();
    } catch { consume(`${API}/api/demo/events?speed=${speed}`); }
  }, [consume]);
  const startLive = useCallback(async (opts: { key?: string; brief?: string } = {}) => {
    const r = await fetch(`${API}/api/case`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(opts) });
    const j = await r.json(); if (j.error) { dispatch({ type: "error", payload: { message: j.error } }); return; }
    idRef.current = j.id; consume(`${API}/api/case/${j.id}/events`);
  }, [consume]);
  const approve = useCallback(async () => { if (idRef.current) await fetch(`${API}/api/case/${idRef.current}/approve`, { method: "POST" }); }, []);

  return { state, startDemo, startLive, approve, caseId: idRef };
}
