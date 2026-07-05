"use client";
/**
 * PhaseHeader — the live "what is VERITAS doing right now" pulse.
 * A breathing fire dot + a present-participle phase word that crossfades
 * between phases, with a plain-English detail line. Never a frozen spinner.
 */
import { motion, AnimatePresence } from "framer-motion";
import { EASE } from "./kit";

// map the engine's phase titles → a friendly present participle
const WORD: Record<string, string> = {
  Ingest: "Reading",
  Plan: "Planning",
  Read: "Reading",
  "Cross-reference": "Cross-referencing",
  "Investigate + Verify": "Investigating",
  Report: "Reporting",
};

export function PhaseHeader({ title, detail }: { title: string; detail?: string | null }) {
  const word = WORD[title] ?? title;
  return (
    <div className="flex items-center gap-2.5 py-0.5">
      {/* breathing dot */}
      <span className="relative flex items-center justify-center shrink-0" style={{ width: 10, height: 10 }}>
        <motion.span aria-hidden className="absolute rounded-full" style={{ width: 10, height: 10, background: "#EA580C" }}
          animate={{ scale: [1, 2.3, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 1.9, ease: "easeInOut", repeat: Infinity }} />
        <span className="rounded-full" style={{ width: 7, height: 7, background: "#EA580C" }} />
      </span>
      <div className="flex items-baseline gap-2 min-w-0">
        <AnimatePresence mode="wait">
          <motion.span key={word} className="phase-shimmer"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.26, ease: EASE }}
            style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-0.01em" }}>{word}</motion.span>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {detail ? (
            <motion.span key={detail} className="truncate text-ink-50"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
              style={{ fontSize: 13.5, letterSpacing: "-0.005em" }}>{detail}</motion.span>
          ) : null}
        </AnimatePresence>
      </div>
      <style>{`
        .phase-shimmer{background:linear-gradient(100deg,#8A8A82 30%,#111 50%,#8A8A82 70%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:phaseSweep 2.4s linear infinite}
        @keyframes phaseSweep{0%{background-position:180% 0}100%{background-position:-80% 0}}
        @media(prefers-reduced-motion:reduce){.phase-shimmer{animation:none;color:#111}}
      `}</style>
    </div>
  );
}

/** Word-stagger reveal — the model "delivering" a paragraph (verdict / finding). */
export function RevealText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const words = text.split(/(\s+)/);
  return (
    <motion.p className={className} style={{ maxWidth: "64ch", ...style }} initial="hidden" animate="show"
      variants={{ show: { transition: { staggerChildren: 0.01 } } }}>
      {words.map((w, i) => (
        <motion.span key={i} variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }} transition={{ duration: 0.25, ease: EASE }}>{w}</motion.span>
      ))}
    </motion.p>
  );
}
