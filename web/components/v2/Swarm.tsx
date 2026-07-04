"use client";
/** The drone fleet — one tile per subagent, lighting up as each finishes reading its shard. */
export function Swarm({ shards, done, drones, facts, corpusTotal }: { shards: number; done: number; drones: { i: number; found: number }[]; facts?: number; corpusTotal?: number }) {
  const doneSet = new Map(drones.map(d => [d.i, d.found]));
  const tiles = Array.from({ length: Math.max(shards, 1) }, (_, i) => i);
  const cols = Math.min(Math.max(shards, 1), 24);
  return (
    <div className="mt-3 rounded-card border border-hairline bg-cream/60 p-4 fadeup">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="w-2 h-2 rounded-full bg-ice pulse" />
        <span className="text-[13px] font-semibold text-ink">DeepSeek extraction fleet</span>
        <span className="text-[12.5px] text-ink-50">— {shards} drones reading {corpusTotal ?? "the"} documents in parallel</span>
        <span className="mono text-[12px] text-ink-50 ml-auto">{done}/{shards}{facts ? ` · ${facts} facts` : ""}</span>
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tiles.map(i => {
          const d = doneSet.has(i);
          return <div key={i} className="rounded-[3px] transition-all duration-500" title={d ? `${doneSet.get(i)} facts` : "reading…"}
            style={{ aspectRatio: "1", background: d ? "#76B900" : "#DCE9F6", opacity: d ? 1 : 0.55 }} />;
        })}
      </div>
    </div>
  );
}
