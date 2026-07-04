// GO-0 model bake-off — tests every catalog contender on VERITAS tool schemas.
// Measures: native tool-call support, valid-call rate, arg correctness, latency.
// Decides: senior examiner (investigation), junior examiner (triage/sweep), judge.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => l.split(/=(.*)/s).slice(0, 2)));
const KEY = env.VULTR_INFERENCE_API_KEY;
const URL_ = 'https://api.vultrinference.com/v1/chat/completions';

const MODELS = [
  'moonshotai/Kimi-K2.6',
  'deepseek-ai/DeepSeek-V4-Flash',
  'nvidia/Nemotron-Cascade-2-30B-A3B',
  'nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-BF16',
  'MiniMaxAI/MiniMax-M2.7',
  'zai-org/GLM-5.2-FP8',
];

const TOOLS = [
  { type: 'function', function: { name: 'run_sweep', description: 'Run a statistical sweep over the ledger. kinds: benford, duplicates, round, weekend, threshold, velocity', parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['benford','duplicates','round','weekend','threshold','velocity'] }, scope: { type: 'string', description: 'account scope, e.g. expenses or all' } }, required: ['kind'] } } },
  { type: 'function', function: { name: 'vendor_profile', description: 'Profile a vendor: totals, invoice cadence, numbering, PO coverage, approvers', parameters: { type: 'object', properties: { vendor_id: { type: 'string' } }, required: ['vendor_id'] } } },
  { type: 'function', function: { name: 'cross_reference', description: 'Cross-reference entities on shared fields to find hidden connections', parameters: { type: 'object', properties: { scan: { type: 'string', enum: ['vendors_vs_employees'] }, fields: { type: 'array', items: { type: 'string', enum: ['address','bank_account','phone','tax_id'] } } }, required: ['scan','fields'] } } },
  { type: 'function', function: { name: 'query_ledger', description: 'Run a read-only SQL SELECT over views vw_ledger(txn_id,date,amount,vendor_id,account,approved_by), vw_vendors(vendor_id,name,address)', parameters: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } } },
];

const SYS = 'You are VERITAS, a forensic audit agent. Use the provided tools. Call exactly one tool per turn when a tool is needed.';
const TASKS = [
  { id: 'T1-simple', messages: [{ role: 'user', content: 'Begin the examination with a Benford digit analysis over expense accounts.' }], expect: c => c?.name === 'run_sweep' && JSON.parse(c.arguments).kind === 'benford' },
  { id: 'T2-choice', messages: [{ role: 'user', content: 'Vendor V-031 has strictly sequential invoice numbers and zero purchase orders. Get its full profile.' }], expect: c => c?.name === 'vendor_profile' && /V-?031/i.test(JSON.parse(c.arguments).vendor_id) },
  { id: 'T3-chain', messages: [
      { role: 'user', content: 'Investigate whether any vendor is secretly controlled by an employee.' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'vendor_profile', arguments: '{"vendor_id":"V-031"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{"vendor_id":"V-031","invoice_count":14,"sequential_numbering":true,"po_coverage_pct":0,"approvers":[{"employee_id":"E-007","count":14}]}' },
      { role: 'user', content: 'Continue the investigation with the most incisive next step.' }],
    expect: c => c?.name === 'cross_reference' && JSON.parse(c.arguments).fields?.length > 0 },
  { id: 'T4-sql', messages: [{ role: 'user', content: 'Sum the total amount paid to vendor V-031, using the ledger.' }], expect: c => c?.name === 'query_ledger' && /select/i.test(JSON.parse(c.arguments).sql) && /V-?031/i.test(JSON.parse(c.arguments).sql) },
];

async function call(model, messages, useTools = true) {
  const t0 = Date.now();
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYS }, ...messages], ...(useTools ? { tools: TOOLS } : {}), temperature: 0.1, max_tokens: 600 }) });
  const ms = Date.now() - t0;
  if (!r.ok) return { err: `HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`, ms };
  const j = await r.json();
  const msg = j.choices?.[0]?.message ?? {};
  return { tc: msg.tool_calls?.[0]?.function, content: msg.content, reasoning: msg.reasoning, ms, usage: j.usage };
}

const results = {};
for (const model of MODELS) {
  results[model] = { pass: 0, total: 0, lat: [], errs: [], noTools: false };
  for (const task of TASKS) {
    results[model].total++;
    try {
      const res = await call(model, task.messages);
      if (res.err) { results[model].errs.push(`${task.id}: ${res.err}`); continue; }
      results[model].lat.push(res.ms);
      if (!res.tc) { results[model].errs.push(`${task.id}: NO tool_call (content: ${String(res.content ?? res.reasoning ?? '').slice(0, 60)})`); continue; }
      try { if (task.expect(res.tc)) results[model].pass++; else results[model].errs.push(`${task.id}: wrong call ${res.tc.name}(${res.tc.arguments.slice(0, 80)})`); }
      catch (e) { results[model].errs.push(`${task.id}: bad args JSON`); }
    } catch (e) { results[model].errs.push(`${task.id}: ${e.message.slice(0, 80)}`); }
  }
}

console.log('\n════════ BAKE-OFF RESULTS ════════');
for (const [m, r] of Object.entries(results)) {
  const p50 = r.lat.sort((a, b) => a - b)[Math.floor(r.lat.length / 2)] ?? '—';
  console.log(`\n${m}\n  score ${r.pass}/${r.total} · p50 ${p50}ms`);
  r.errs.forEach(e => console.log(`  ⚠ ${e}`));
}
