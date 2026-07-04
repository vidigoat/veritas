/**
 * SSE event vocabulary — THE contract between orchestrator and console.
 *
 *   orchestrator ──emits──▶ event log ──replays──▶ SSE ──▶ console reducer
 *
 * The console renders ONLY from these events (replayable by design:
 * fixtures/demo-run.json is just a recorded array of them).
 */
export type Phase = "plan" | "sweep" | "investigate" | "verify" | "decide" | "report";

export type CaseEvent =
  | Ev<"case_opened", { brief: string; corpus: CorpusStats }>
  | Ev<"ingest_progress", { indexed: number; total: number }>
  | Ev<"phase_start", { phase: Phase; index: number; of: number; title: string }>
  | Ev<"step_start", { stepId: string; title: string; icon: string }>
  | Ev<"reasoning_delta", { stepId: string; text: string }>
  | Ev<"tool_call", { stepId: string; tool: string; argsSummary: string; mono: string; model: ModelTier }>
  | Ev<"tool_result", { stepId: string; tool: string; summary: string; flagged?: boolean; ms: number }>
  | Ev<"doc_touched", { stepId: string; docId: string; docType: string; note: string }>
  | Ev<"entity_touched", { stepId: string; entityId: string; kind: "vendor" | "employee" | "account"; name: string }>
  | Ev<"hypothesis_update", { hypId: string; statement: string; status: HypStatus; confidence: number; evidenceFor: number; evidenceAgainst: number; nextProbe?: string }>
  | Ev<"graph_update", { nodes: GraphNode[]; edges: GraphEdge[]; focus?: string }>
  | Ev<"reveal", { vendorId: string; employeeId: string; matchField: string; label: string }>
  | Ev<"finding_filed", { finding: unknown }>
  | Ev<"verify_pass", { claimId: string; recomputeRef: string }>
  | Ev<"phase_done", { phase: Phase; summary: string; toolCalls: number; seconds: number }>
  | Ev<"approval_request", { action: "freeze_vendor"; target: string; reason: string }>
  | Ev<"action_executed", { action: string; target: string; receiptId: string }>
  | Ev<"report_ready", { url: string; sections: number; exhibitCount: number }>
  | Ev<"usage", { model: string; inTokens: number; outTokens: number; usdTotal: number }>
  | Ev<"case_closed", { findings: number; totalUsd: number; confidence: number; elapsedS: number }>
  | Ev<"error", { message: string; recoverable: boolean }>;

export type Ev<T extends string, P> = { id: string; ts: number; type: T; phase: Phase | null; payload: P };
export type HypStatus = "open" | "investigating" | "cleared" | "confirmed" | "unproven";
export type ModelTier = "senior" | "junior" | "judge" | "drone";
export interface CorpusStats { docs: number; txns: number; vendors: number; employees: number }
export interface GraphNode { id: string; kind: "vendor" | "employee" | "account"; name: string; totalUsd?: number; state: "default" | "investigating" | "cleared" | "confirmed" }
export interface GraphEdge { id: string; from: string; to: string; kind: "payment" | "approval" | "match"; amountUsd?: number; label?: string; state: "default" | "investigating" | "confirmed" }
