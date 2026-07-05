"use client";
/** Shared streaming-UI primitives for the VERITAS run thread. */
import type { ReactNode } from "react";
import { MagnifyingGlass, ShieldCheck } from "@phosphor-icons/react";

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const SCHEME_LABEL: Record<string, string> = {
  shell_company: "shell company",
  ghost_employee: "ghost employee",
  duplicate_payment: "duplicate payment",
  threshold_evasion: "threshold evasion",
  expense_fraud: "expense fraud",
  kickback: "kickback",
  other: "anomaly",
};

export const fmt = (n?: number) => (n ?? 0).toLocaleString("en-US");

/** Step glyphs in the stack's brand hues — Vultr blue for retrieval,
 *  NVIDIA green for the Nemotron fleet + review panel. */
export function VultrFavicon({ size = 16 }: { size?: number }) {
  return <MagnifyingGlass size={size} weight="bold" style={{ color: "#0B69C7", display: "block" }} />;
}
export function NvidiaFavicon({ size = 16 }: { size?: number }) {
  return <ShieldCheck size={size} weight="fill" style={{ color: "#76B900", display: "block" }} />;
}

/** A white-framed brand chip (favicon inside a hairline square). */
export function BrandBadge({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-[5px] bg-white border border-hairline shrink-0" style={{ width: size, height: size, padding: 2 }}>
      {children}
    </span>
  );
}

/** A clickable [DOC-id] citation chip → opens the real source document. */
export function DocChip({ id, score, onOpen, inline }: { id: string; score?: number; onOpen: (id: string) => void; inline?: boolean }) {
  return (
    <button onClick={() => onOpen(id)} title="open the source document"
      className={`inline-flex items-center gap-1.5 bg-ice-pale border border-ice/20 rounded-chip px-2 py-0.5 text-[12px] font-medium text-ice hover:bg-ice hover:text-white transition-colors ${inline ? "mx-0.5 align-middle" : ""}`}>
      <span className="mono text-[8px] font-bold opacity-70">DOC</span>{id}{score != null && score > 0 ? <span className="mono text-[10px] opacity-70">{score}</span> : null}
    </button>
  );
}

/** Section divider label. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 pt-1.5">
      <span className="mono text-[10.5px] font-semibold text-ink-30 uppercase tracking-[0.14em]">{children}</span>
      <div className="flex-1 h-px bg-line" />
    </div>
  );
}

/** Render [DOC-ID] citations inside answer prose as clickable chips. */
export function renderCited(text: string, onOpen: (id: string) => void) {
  const parts = text.split(/\[([A-Za-z][A-Za-z0-9_\-]{1,40})\]/g);
  return parts.map((p, i) => (i % 2 === 1 ? <DocChip key={i} id={p} onOpen={onOpen} inline /> : <span key={i}>{p}</span>));
}
