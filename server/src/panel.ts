/**
 * THE NEMOTRON ADJUDICATION PANEL — the independent second (and third) examiner.
 *
 *  No finding is filed on one model's say-so. Every confirmed finding faces a
 *  PANEL of independent NVIDIA Nemotron examiners, each attacking it from a
 *  different angle — correctness, the innocent explanation, and evidentiary
 *  sufficiency. A finding stands only if the panel upholds it (majority). This
 *  is a genuine second opinion and a structural false-accusation guard, and it
 *  is what makes VERITAS's verdicts defensible. All on Vultr Serverless Inference.
 */
import { chat } from "./llm.js";
import { extractJson } from "./agents.js";

export interface PanelVote { lens: string; upheld: boolean; abstained?: boolean; confidence: number; reasoning: string }
export interface PanelVerdict { upheld: boolean; votes: PanelVote[]; model: string; reasoning: string }

const LENSES: { lens: string; system: string }[] = [
  { lens: "correctness", system: "You are an independent forensic reviewer. Check ONLY whether the finding's evidence is internally consistent and correctly supports the claim: do the cited documents actually establish what is asserted (e.g. is the shared address really identical, are the figures recomputed)? Uphold if the evidence is sound; refute if a claim is unsupported or the numbers don't hold." },
  { lens: "innocent explanation", system: "You are an independent forensic reviewer whose job is to EXONERATE. Try hard to find a plausible, specific innocent explanation the examiner missed — a shared coworking address, a legitimate delivered service, paperwork filed elsewhere, a timing artifact, a data-entry error. Refute the finding ONLY if you can name a concrete innocent explanation; otherwise uphold." },
  { lens: "sufficiency", system: "You are an independent forensic reviewer weighing whether the proof is strong enough to ACCUSE, not merely suspicious. A conflict of interest plus missing controls is strong; a lone statistical oddity is not. Uphold only if a reasonable examiner would file this; refute if it is merely a lead." },
];

const RUBRIC = `Respond with ONLY one JSON object: {"upheld": true|false, "confidence": 0.0-1.0, "reasoning": "one sentence"}.
Calibration for shell-company / billing schemes: a vendor whose registered address is IDENTICAL to an employee's home address, with no purchase orders, a single approver, and no tax ID, is a textbook ACFE shell scheme — UPHOLD unless you can name a specific innocent explanation the evidence does not already rule out.`;

/** Run the full Nemotron panel on a finding. Parallel, fail-open per reviewer. */
export async function nemotronPanel(finding: { statement: string; scheme?: string; evidence?: any[]; confidence?: number }): Promise<PanelVerdict> {
  const evidenceText = (finding.evidence ?? []).map((e: any) => `- ${e.claim} [${(e.doc_ids ?? e.docIds ?? []).join(", ")}]`).join("\n");
  const user = `FINDING UNDER REVIEW\nClass: ${finding.scheme ?? "fraud"}\nStatement: ${finding.statement}\nConfidence asserted: ${finding.confidence ?? "—"}\nEvidence:\n${evidenceText}\n\n${RUBRIC}`;
  const votes = await Promise.all(LENSES.map(async ({ lens, system }): Promise<PanelVote> => {
    try {
      const res = await chat("judge", [{ role: "system", content: system }, { role: "user", content: user }], undefined, { maxTokens: 400, noThink: true });
      const raw = (res.message.content ?? (res.message as any).reasoning ?? "").toString();
      const j = extractJson<any>(raw) ?? parseLoose(raw);
      if (j.abstained) return { lens, upheld: false, abstained: true, confidence: 0, reasoning: "unparseable review — ABSTAINED" };
      return { lens, upheld: j.upheld !== false, confidence: clamp(j.confidence ?? 0.75), reasoning: String(j.reasoning ?? raw).replace(/\s+/g, " ").slice(0, 200) };
    } catch { return { lens, upheld: false, abstained: true, confidence: 0, reasoning: "reviewer unreachable — ABSTAINED (an abstention never upholds an accusation)" }; }
  }));
  // fail-SAFE: abstentions count for neither side. Upholding requires a majority
  // of the reviewers who actually answered, and at least one real vote.
  const answered = votes.filter(v => !v.abstained);
  const up = answered.filter(v => v.upheld).length;
  const upheld = answered.length > 0 && up * 2 > answered.length;
  const lead = answered.find(v => v.upheld === upheld) ?? votes[0];
  return { upheld, votes, model: "nvidia/Nemotron-Cascade-2-30B-A3B", reasoning: `${up}/${answered.length} examiners upheld${votes.length !== answered.length ? ` (${votes.length - answered.length} abstained)` : ""} — ${lead.reasoning}` };
}

const clamp = (n: number) => Math.max(0, Math.min(1, Number(n) || 0));
function parseLoose(raw: string) {
  const m = raw.match(/"?upheld"?\s*[:=]\s*(true|false)/i);
  // fail-SAFE: an explicit true/false counts; anything garbled is an abstention —
  // a reviewer who cannot be understood never upholds an accusation.
  if (!m) return { abstained: true };
  return { upheld: m[1].toLowerCase() === "true", confidence: 0.7, reasoning: raw };
}
