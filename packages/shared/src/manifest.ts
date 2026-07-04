/** Ground truth emitted by datagen — consumed ONLY by evals, never shipped to the agent. */
export interface Manifest {
  seed: number;
  scheme: null | {
    type: "shell_company" | "duplicate_payment" | "expense_fraud" | "threshold_evasion";
    vendorId: string;
    employeeId: string;
    totalUsd: number;
    txnIds: string[];
    proofDocIds: string[];
  };
  herrings: { kind: string; txnIds: string[]; clearingDocIds: string[]; explanation: string }[];
}
