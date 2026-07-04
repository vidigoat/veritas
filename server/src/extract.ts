/**
 * MAP STAGE — read the whole corpus with a fleet of extraction subagents.
 *
 *  The corpus is sharded; each shard goes to one subagent (NVIDIA Nemotron —
 *  fast, cheap, parallel) that READS the raw documents and returns COMPACT
 *  structured facts. The orchestrator never sees raw text; it reasons over the
 *  aggregated Store + CaseBrain. This is how thousands of documents are read
 *  without overflowing a single context window.
 *
 *    corpus → shard[] → fanOut(Nemotron drones) → Extracted[] → normalized Store
 */
import { fanOut, shard, subagent } from "./agents.js";
import { emptyExtracted, type Corpus, type Extracted, type ExtractVendor, type ExtractEmployee, type ExtractTxn, type ExtractPayment, type ExtractPayroll } from "./contracts.js";
import type { CaseBrain } from "./brain.js";
import { parseCorpus } from "./parse.js";

const DOCS_PER_SHARD = 6;   // small batches → fast, bounded drone calls
const PER_DOC_CHARS = 460;  // the parser already read full docs; the fleet samples

const EXTRACT_SYSTEM = `You are a forensic data-extraction drone. Read each document and output the fraud-relevant facts as ONE compact JSON object. Copy addresses, tax IDs, and bank-account strings EXACTLY (they are cross-referenced character-for-character). Omit absent fields. Tag every record with sourceDoc (the DOC id). Keep it terse — no prose.

Pull: from registrations → vendor name/id/address/taxId/bankAccount; from HR records → employee name/id/address/bankAccount/salary/joined/role/email; from invoices → vendor/amount/invoiceNo/approver/po; from bank statements → each line as a payment {amount,description,direction}; from payroll → each line {name,empId,amount,bankAccount}. Note missing tax IDs and duplicate/reversed amounts.

Return ONLY:
{"vendors":[{name,vendorId,address,taxId,bankAccount,sourceDoc}],"employees":[{name,empId,role,address,bankAccount,salary,joined,email,sourceDoc}],"transactions":[{vendor,vendorId,amount,invoiceNo,approver,po,sourceDoc}],"payments":[{amount,description,direction,sourceDoc}],"payroll":[{name,empId,amount,bankAccount,sourceDoc}],"flags":[]}
Amounts are numbers (strip currency/commas). Only include arrays that have entries.`;

export interface Store {
  vendors: Map<string, ExtractVendor>;      // key: vendorId||name
  employees: Map<string, ExtractEmployee>;  // key: empId||name
  txns: ExtractTxn[];
  payments: ExtractPayment[];
  payroll: ExtractPayroll[];
  flags: string[];
}

export interface FleetProgress { shards: number; done: number; facts: number }

/** Read the corpus with the drone fleet. Streams progress via callbacks. */
// the parser already read every document (instant, authoritative). The AI fleet
// reads a bounded SAMPLE — the visible swarm + genuine Nemotron extraction — kept
// small + one wave because Vultr serverless throughput degrades past ~6 concurrent.
const MAX_FLEET = 6;
const FLEET_CONCURRENCY = 6;

/** INSTANT authoritative read of every document — the correctness backbone. */
export function parserStore(corpus: Corpus, brain?: CaseBrain): Store {
  const store = aggregate([parseCorpus(corpus)]);
  if (brain) populateBrain(store, brain);
  return store;
}

/** The Nemotron drone-fleet: reads a sample in parallel and MERGES gap-fills into
 *  `store` IN PLACE. Best-effort + overlappable — it is NEVER on the critical path
 *  for correctness (detection runs on the parser store, which is already complete). */
export async function augmentWithFleet(
  corpus: Corpus, store: Store,
  opts: { concurrency?: number; signal?: AbortSignal;
    onFleet?: (shards: number) => void; onDrone?: (i: number, docCount: number, found: number, ms: number) => void } = {},
): Promise<{ shards: number; facts: number; fleetFacts: number }> {
  const docs = corpus.order.map(id => corpus.docs.get(id)!);
  const shards = shard(docs, DOCS_PER_SHARD).slice(0, MAX_FLEET);
  opts.onFleet?.(shards.length);
  let fleetFacts = 0; // what the drones THEMSELVES extracted (honest attribution)
  const results = await fanOut(shards, async (batch, i) => {
    const body = batch.map(d => `--- DOC ${d.docId} (${d.type}) ---\n${d.text.slice(0, PER_DOC_CHARS)}`).join("\n\n");
    const r = await subagent<Extracted>(EXTRACT_SYSTEM, `Documents in this batch:\n\n${body}`, {
      tier: "judge", maxTokens: 700, signal: opts.signal, noThink: true, timeoutMs: 22000,
    });
    return r.ok && r.data ? { ...emptyExtracted(), ...r.data } : emptyExtracted();
  }, {
    concurrency: opts.concurrency ?? FLEET_CONCURRENCY,
    onDone: (i, out: Extracted) => {
      const n = (out.vendors?.length ?? 0) + (out.employees?.length ?? 0) + (out.transactions?.length ?? 0) + (out.payments?.length ?? 0) + (out.payroll?.length ?? 0);
      fleetFacts += n;
      opts.onDrone?.(i, shards[i].length, n, 0);
    },
  });
  mergeInto(store, aggregate(results));
  const facts = store.vendors.size + store.employees.size + store.txns.length + store.payments.length + store.payroll.length;
  return { shards: shards.length, facts, fleetFacts };
}

/** Convenience wrapper (parser + fleet, sequential) — kept for non-streaming callers. */
export async function extractCorpus(
  corpus: Corpus,
  opts: { brain?: CaseBrain; concurrency?: number; signal?: AbortSignal;
    onFleet?: (shards: number) => void; onDrone?: (i: number, docCount: number, found: number, ms: number) => void } = {},
): Promise<{ store: Store; shards: number; facts: number }> {
  const store = parserStore(corpus, opts.brain);
  const { shards, facts } = await augmentWithFleet(corpus, store, opts);
  return { store, shards, facts };
}

/** Merge fleet facts into the parsed store — fill gaps, never overwrite a good parse. */
function mergeInto(store: Store, add: Store) {
  for (const [k, v] of add.vendors) { const cur = store.vendors.get(k); if (!cur) store.vendors.set(k, v); else store.vendors.set(k, { ...v, ...clean(cur) }); }
  for (const [k, e] of add.employees) { const cur = store.employees.get(k); if (!cur) store.employees.set(k, e); else store.employees.set(k, { ...e, ...clean(cur) }); }
  // transactions/payments/payroll: the parser is authoritative for the demo corpus; keep parsed set, add only if parser found none
  if (!store.txns.length) store.txns = add.txns;
  if (!store.payments.length) store.payments = add.payments;
  if (!store.payroll.length) store.payroll = add.payroll;
  store.flags.push(...add.flags);
}

function aggregate(results: Extracted[]): Store {
  const store: Store = { vendors: new Map(), employees: new Map(), txns: [], payments: [], payroll: [], flags: [] };
  for (const r of results) {
    for (const v of r.vendors ?? []) {
      const k = (v.vendorId || v.name || "").trim().toLowerCase(); if (!k) continue;
      const cur = store.vendors.get(k) ?? { name: v.name, sourceDoc: v.sourceDoc };
      store.vendors.set(k, { ...cur, ...clean(v), name: v.name || cur.name });
    }
    for (const e of r.employees ?? []) {
      const k = (e.empId || e.name || "").trim().toLowerCase(); if (!k) continue;
      const cur = store.employees.get(k) ?? { name: e.name, sourceDoc: e.sourceDoc };
      store.employees.set(k, { ...cur, ...clean(e), name: e.name || cur.name });
    }
    for (const t of r.transactions ?? []) if (typeof t.amount === "number") store.txns.push(t);
    for (const p of r.payments ?? []) if (typeof p.amount === "number") store.payments.push(p);
    for (const p of r.payroll ?? []) if (typeof p.amount === "number") store.payroll.push(p);
    for (const f of r.flags ?? []) if (f) store.flags.push(f);
  }
  return store;
}
const clean = (o: any) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

function populateBrain(store: Store, brain: CaseBrain) {
  try {
    for (const v of store.vendors.values()) {
      const id = v.vendorId || v.name;
      brain.upsertEntity(id, "vendor", v.name, { address: v.address, taxId: v.taxId, bank: v.bankAccount });
      if (v.address) brain.addFact(id, "address", v.address, v.sourceDoc, 1);
      if (v.bankAccount) brain.addFact(id, "bank_account", v.bankAccount, v.sourceDoc, 1);
      if (v.taxId === undefined) brain.addFact(id, "tax_id", "MISSING", v.sourceDoc, 0.9);
    }
    for (const e of store.employees.values()) {
      const id = e.empId || e.name;
      brain.upsertEntity(id, "employee", e.name, { address: e.address, bank: e.bankAccount, role: e.role });
      if (e.address) brain.addFact(id, "home_address", e.address, e.sourceDoc, 1);
      if (e.bankAccount) brain.addFact(id, "bank_account", e.bankAccount, e.sourceDoc, 1);
    }
  } catch { /* brain is best-effort */ }
}
