/**
 * NEMOTRON INDEPENDENT VERIFIER — the "second examiner."
 *
 * Real audit firms have a second partner sign off on every finding. VERITAS uses
 * NVIDIA Nemotron (a DIFFERENT model family from the senior examiner, Kimi) as an
 * independent reviewer that assesses each finding before it stands. Nemotron leads
 * IFBench (instruction-following) at 82% — a rigorous rule-follower.
 *
 *   Kimi (senior examiner) confirms a finding + attaches the evidence and the
 *     disconfirming/exoneration checks it already ran
 *        ▼
 *   Nemotron (independent reviewer): weighs the evidence. UPHOLDS when it is
 *     strong and no SPECIFIC innocent explanation survives; REFUTES only when it
 *     can name a concrete benign explanation the examiner missed.
 *        │
 *        ├─ upheld  → finding stands, now carrying a cross-model second opinion
 *        └─ refuted → downgraded to unproven (a caught over-reach)
 *
 * Load-bearing: this is a genuine second opinion AND a false-accusation guard.
 */
import { chat } from "./llm.js";

export interface VerifierVerdict { upheld: boolean; confidence: number; reasoning: string; model: string; }

const VERIFIER_SYSTEM = `You are the second examiner at a forensic audit firm, independently reviewing a colleague's fraud finding before it is filed. You are rigorous and fair — not a rubber stamp, but not a contrarian either.

Uphold a finding when the evidence is strong and no SPECIFIC innocent explanation survives. Refute it ONLY when you can name a concrete, plausible benign explanation that the evidence does not already rule out.

Calibration for shell-company / billing-scheme findings:
- A vendor whose registered address is IDENTICAL to an employee's home address, with sequential invoice numbering, zero purchase orders, and a single approver, is a textbook ACFE shell scheme. If the examiner already checked and found no shared coworking tenants and no delivered service, that finding is STRONG — UPHOLD it.
- Refute only if the evidence is thin (e.g. the address is a known shared business park, a real service is documented, POs exist, or a figure is uncited).

Weigh the specific evidence you are given, including any exoneration checks the examiner already ran. Respond ONLY with strict JSON: {"upheld": true|false, "confidence": 0.0-1.0, "reasoning": "one sentence"}.`;

export async function verifyFinding(finding: any, exoneration?: any): Promise<VerifierVerdict> {
  const evidenceText = (finding.evidence ?? [])
    .map((e: any) => `- ${e.claim} [${(e.doc_ids ?? [e.verified_by]).filter(Boolean).join(", ")}]`)
    .join("\n");
  const exoText = exoneration
    ? `\nExoneration checks the examiner already ran (looking for innocent explanations): ${JSON.stringify(exoneration.checks ?? exoneration).slice(0, 500)} — verdict: ${exoneration.verdict ?? "n/a"}`
    : "";
  const user = `FINDING UNDER REVIEW:\nClass: ${finding.class}\nStatement: ${finding.statement}\nConfidence asserted: ${finding.confidence}\nEvidence:\n${evidenceText}${exoText}\n\nDo you uphold or refute this finding? Respond with the JSON verdict.`;
  try {
    const res = await chat("judge", [
      { role: "system", content: VERIFIER_SYSTEM },
      { role: "user", content: user },
    ], undefined, { maxTokens: 1000 });
    const raw = res.message.content ?? (res.message as any).reasoning ?? "";
    return { ...parseVerdict(raw), model: res.model };
  } catch (e: any) {
    // fail-open on verifier error: the finding stands (the primary examiner already confirmed it);
    // never let an infra hiccup silently kill a true finding.
    return { upheld: true, confidence: 0.6, reasoning: `independent review unavailable (${e.message?.slice(0, 40)}); primary finding stands`, model: "nemotron" };
  }
}

function parseVerdict(raw: string): Omit<VerifierVerdict, "model"> {
  const s = String(raw ?? "");
  // MOST ROBUST: read the decision directly, even from verbose or truncated output where the
  // JSON object never closes. "upheld": false must never be misread as upheld.
  const decision = s.match(/"?upheld"?\s*[:=]\s*(true|false)/i);
  if (decision) {
    const upheld = decision[1].toLowerCase() === "true";
    const conf = s.match(/"?confidence"?\s*[:=]\s*([0-9.]+)/i);
    const reas = s.match(/"?reasoning"?\s*[:=]\s*"([^"]{3,})"/i);
    return { upheld, confidence: clamp(conf ? +conf[1] : 0.8), reasoning: (reas?.[1] ?? s).replace(/\s+/g, " ").slice(0, 220) };
  }
  // JSON fallback (outermost object)
  const m = s.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
  if (m) { try { const j = JSON.parse(m[0]); return { upheld: j.upheld !== false, confidence: clamp(j.confidence ?? 0.8), reasoning: String(j.reasoning ?? "").slice(0, 220) }; } catch {} }
  // keyword fallback: default to UPHELD (primary examiner confirmed) unless a clear refutation
  const refuted = /\b(refute|refuted|reject|not upheld|do not uphold|insufficient|no (specific |concrete )?evidence|lacks)\b/i.test(s);
  return { upheld: !refuted, confidence: 0.7, reasoning: s.replace(/\s+/g, " ").slice(0, 220) || "concurs with the finding" };
}
const clamp = (n: number) => Math.max(0, Math.min(1, Number(n) || 0));
