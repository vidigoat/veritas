/**
 * CASE Q&A RESPONDER — interrogate a completed investigation.
 *
 * The judge/user asks a follow-up question. The responder (Kimi) answers from
 * the SAME tools + the case's findings/hypotheses, citing evidence. This is the
 * proof that VERITAS is a real agent, not a scripted demo: you can ask it
 * anything about the case and it reasons over the real data to answer.
 *
 *   question + case (data + findings + hypotheses)
 *        ▼  Kimi with read tools (query_ledger, get_document, cross_reference,
 *           vendor_profile, trace_payments, exonerate)
 *        ▼  streamed, cited answer
 */
import { chat, type ChatMsg } from "./llm.js";
import { TOOLS, toolDefs, type ToolCtx } from "./tools.js";
import type { CompanyData } from "./data.js";

const QA_SYSTEM = `You are VERITAS, answering follow-up questions about a fraud examination you just completed. You have the case's findings, cleared items, and full access to the books through tools.

Answer precisely and honestly, grounded in the evidence:
- Use tools (query_ledger, get_document, vendor_profile, cross_reference, trace_payments, exonerate) to pull the specific evidence that answers the question.
- Cite doc_ids or figures. Never invent a number — pull it from the ledger.
- If asked "are you sure" or "how do you know", walk through the specific evidence.
- If asked whether something could be innocent, run the disconfirming search (exonerate) and report what you find honestly — if there IS an innocent explanation, say so.
- Be concise: 2-4 sentences plus the evidence. You examine records, not people.

Call at most 2-3 tools, then give your answer as plain text.`;

export async function* answerQuestion(
  data: CompanyData,
  caseSummary: { findings: any[]; hypotheses: any[] },
  question: string,
): AsyncGenerator<{ type: string; payload: any }> {
  const ctx: ToolCtx = {
    data, hypotheses: new Map(), findings: [...caseSummary.findings], evidenceLog: [], approvals: [],
    emit: () => {}, matchedVendors: new Set(),
  };
  const findingsCtx = caseSummary.findings.map(f => `FINDING ${f.id}: ${f.statement} (confidence ${f.confidence})`).join("\n");
  const clearedCtx = caseSummary.hypotheses.filter(h => h.status === "cleared").map(h => `CLEARED: ${h.statement}`).join("\n");
  const messages: ChatMsg[] = [
    { role: "system", content: QA_SYSTEM },
    { role: "user", content: `CASE SUMMARY:\n${findingsCtx || "No fraud findings."}\n${clearedCtx}\n\nQUESTION: ${question}` },
  ];
  const readTools = ["query_ledger", "get_document", "vendor_profile", "cross_reference", "trace_payments", "exonerate", "search_documents"];
  for (let turn = 0; turn < 5; turn++) {
    const res = await chat("senior", messages, toolDefs(readTools), { maxTokens: 900 });
    const msg = res.message;
    messages.push({ role: "assistant", content: msg.content ?? null, ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });
    if (msg.content?.trim()) yield { type: "answer_delta", payload: { text: msg.content.trim() } };
    if (!msg.tool_calls?.length) { yield { type: "answer_done", payload: {} }; return; }
    for (const tc of msg.tool_calls) {
      let args: any = {}; try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
      const spec = TOOLS[tc.function.name];
      yield { type: "answer_tool", payload: { tool: tc.function.name, summary: spec?.describe(args) ?? tc.function.name } };
      const r = (() => { try { return spec ? spec.run(args, ctx) : { error: "unknown tool" }; } catch (e: any) { return { error: e.message }; } })();
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(r).slice(0, 2500) });
    }
  }
  // ran out of tool turns without a final answer — force a text answer now
  const final = await chat("senior", [...messages, { role: "user", content: "Now give your final answer in plain text, 2-4 sentences with the evidence. No more tools." }], undefined, { maxTokens: 700 });
  if (final.message.content?.trim()) yield { type: "answer_delta", payload: { text: final.message.content.trim() } };
  yield { type: "answer_done", payload: {} };
}
