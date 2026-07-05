"use client";
import { motion } from "framer-motion";
import { NvidiaFavicon, useStack } from "./stream/kit";
/** The reading fleet — one tile per reader, lighting up as each finishes its shard. */
export function Swarm({ shards, done, drones, facts }: { shards: number; done: number; drones: { i: number; found: number }[]; facts?: number; corpusTotal?: number }) {
  const stack = useStack();
  const doneSet = new Map(drones.map(d => [d.i, d.found]));
  const tiles = Array.from({ length: Math.max(shards, 1) }, (_, i) => i);
  const cols = Math.min(Math.max(shards, 1), 24);
  const running = done < shards;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="rounded-card border border-hairline bg-cream/60 p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center justify-center rounded-[5px] bg-white border border-hairline shrink-0" style={{ width: 18, height: 18, padding: 2 }}><NvidiaFavicon size={13} /></span>
        {running && <span className="w-2 h-2 rounded-full pulse shrink-0" style={{ background: "#76B900" }} />}
        <span className="text-[13px] font-semibold text-ink">{stack ? "Nemotron drone fleet" : "The reading fleet"}</span>
        <span className="text-[12.5px] text-ink-50">— {shards} drones reading document shards in parallel</span>
        <span className="mono text-[12px] text-ink-50 ml-auto">{done}/{shards}{facts ? ` · ${facts} facts` : ""}</span>
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tiles.map(i => {
          const d = doneSet.has(i);
          return (
            <motion.div key={i} title={d ? `${doneSet.get(i)} facts` : "reading…"} className="rounded-[3px]"
              animate={{ background: d ? "#76B900" : "#DCE9F6", opacity: d ? 1 : 0.55, scale: d ? [1.12, 1] : 1 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} style={{ aspectRatio: "1" }} />
          );
        })}
      </div>
    </motion.div>
  );
}
