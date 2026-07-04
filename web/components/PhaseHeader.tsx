"use client";
import { Brain, Coffee, Hammer, ForkKnife } from "@phosphor-icons/react";
const VERB: Record<string, { word: string; Icon: any }> = {
  plan: { word: "Thinking", Icon: Brain }, sweep: { word: "Working", Icon: Hammer },
  investigate: { word: "Cooking", Icon: ForkKnife }, verify: { word: "Brewing", Icon: Coffee },
  decide: { word: "Working", Icon: Hammer }, report: { word: "Brewing", Icon: Coffee },
};
export function PhaseHeader({ phase, index, of, title, elapsed }: { phase: string; index: number; of: number; title: string; elapsed: string }) {
  const v = VERB[phase] ?? VERB.plan; const { Icon } = v;
  return (
    <div className="flex items-center gap-3 mb-1">
      <Icon size={19} weight="duotone" className="text-amber" />
      <span className="shimmer font-semibold">{v.word}</span>
      <span className="text-ink-60 text-sm">— Phase {index}/{of} · {title}</span>
      <span className="mono text-xs text-ink-30 ml-auto">{elapsed}</span>
    </div>
  );
}
