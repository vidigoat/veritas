/**
 * SHARED CONTRACTS — the integration backbone for VERITAS v2.
 * Every module (ingest, extract, detect, orchestrator, UI) builds to these types.
 * Change here = change everywhere; this is the single source of truth.
 */

// ── Ingested corpus ──────────────────────────────────────────────────────────
export type DocType = "invoice" | "vendor_registration" | "employee_record" | "bank_statement"
  | "payroll" | "purchase_order" | "board_minutes" | "credit_note" | "ledger" | "other";
export interface Doc { docId: string; filename: string; type: DocType; text: string }
export interface Corpus { docs: Map<string, Doc>; order: string[]; stats: Record<string, number>; total: number }

// ── Extraction output (what a subagent returns after reading a shard) ─────────
export interface ExtractVendor { name: string; vendorId?: string; address?: string; taxId?: string; bankAccount?: string; category?: string; onboarded?: string; sourceDoc: string }
export interface ExtractEmployee { name: string; empId?: string; role?: string; address?: string; bankAccount?: string; salary?: number; joined?: string; email?: string; manager?: string; sourceDoc: string }
export interface ExtractTxn { amount: number; date?: string; vendor?: string; vendorId?: string; invoiceNo?: string; account?: string; memo?: string; po?: string | null; approver?: string; sourceDoc: string }
export interface ExtractPayment { amount: number; date?: string; description?: string; direction: "debit" | "credit"; sourceDoc: string }
export interface ExtractPayroll { empId?: string; name: string; amount: number; bankAccount?: string; month?: string; sourceDoc: string }
export interface Extracted {
  vendors: ExtractVendor[]; employees: ExtractEmployee[]; transactions: ExtractTxn[];
  payments: ExtractPayment[]; payroll: ExtractPayroll[]; flags: string[];
}
export const emptyExtracted = (): Extracted => ({ vendors: [], employees: [], transactions: [], payments: [], payroll: [], flags: [] });

// ── Detection output ─────────────────────────────────────────────────────────
export type SchemeClass = "shell_company" | "ghost_employee" | "duplicate_payment"
  | "threshold_evasion" | "expense_fraud" | "kickback" | "other";
export interface Anomaly {
  id: string; scheme: SchemeClass; title: string; subjectIds: string[];
  amount?: number; proofDocs: string[]; detail: string; strength: number; // 0..1 prior
}
export interface EvidenceItem { claim: string; docIds?: string[]; verifiedBy?: string }
export interface Finding {
  id: string; scheme: SchemeClass; statement: string; amount: number;
  evidence: EvidenceItem[]; confidence: number; verdict: "confirmed" | "cleared" | "unproven";
  recommendedActions: string[]; nemotron?: { upheld: boolean; reasoning: string; model: string };
}

// ── Streaming event vocabulary (SSE → UI) ────────────────────────────────────
export type Phase = "ingest" | "plan" | "map" | "reduce" | "investigate" | "verify" | "report";
export interface CaseEvent { id: string; ts: number; type: string; phase: Phase | null; payload: any }
// event types the UI understands:
//  corpus_loaded {stats,total} · fleet_start {shards,model} · drone_start {i,docs} · drone_done {i,found}
//  brain_update {entities,facts,links} · anomaly {anomaly} · reveal {label,subjectIds}
//  reasoning {stepId,text} · retrieval {model,query,surfaced} · tool {name,summary}
//  nemotron_verify {finding, upheld, reasoning} · finding {finding} · verdict {total,confidence}
//  phase {phase,index,of} · usage {model,usd} · doc_opened · done {findings,usd,elapsedS}
