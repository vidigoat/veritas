/** A finding may enter the report ONLY through this shape — every claim cited or recomputed. */
export interface Finding {
  id: string;
  class: "billing_scheme.shell_company" | "duplicate_payment" | "expense_fraud" | "threshold_evasion" | "other";
  statement: string;
  evidence: EvidenceItem[];
  confidence: number; // 0..1 — <0.5 is forced to UNPROVEN
  unresolved: { item: string; needed: string }[];
  recommendedActions: string[];
}
export type EvidenceItem =
  | { claim: string; docIds: string[] }        // cited to source documents
  | { claim: string; verifiedBy: string };     // recompute reference
export interface ClearedLead { hypId: string; statement: string; innocentExplanation: string; docIds: string[] }
