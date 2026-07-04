"use client";
import { useMemo } from "react";
import ReactFlow, { Background, type Node, type Edge, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import type { Hyp } from "@/lib/useCase";

/** Builds the graph from hypotheses + reveal (no separate graph events needed for the demo). */
export function MoneyGraph({ hypotheses, reveal, findings }: { hypotheses: Hyp[]; reveal?: any; findings: any[] }) {
  const { nodes, edges } = useMemo(() => {
    const confirmed = findings.some(f => f.class?.includes("shell"));
    const nodes: Node[] = [
      { id: "V-031", position: { x: 60, y: 40 }, data: { label: "🏢 Apex Supplies" }, style: nodeStyle(reveal ? "confirmed" : hypotheses.some(h => /apex|V-031/i.test(h.statement)) ? "investigating" : "default") },
      { id: "E-007", position: { x: 60, y: 220 }, data: { label: "👤 R. Mehta" }, style: nodeStyle(reveal ? "confirmed" : "default") },
      { id: "MER", position: { x: 340, y: 130 }, data: { label: "🏛 Meridian Traders" }, style: nodeStyle("default") },
    ];
    const edges: Edge[] = [
      { id: "e1", source: "MER", target: "V-031", label: "$332,087 · 14 invoices", animated: !!reveal, style: { stroke: reveal ? "#C4322E" : "#1A1A1A", strokeWidth: 2 }, labelStyle: { fontFamily: "JetBrains Mono", fontSize: 11 }, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e2", source: "E-007", target: "V-031", label: "approves all 14", style: { stroke: "#C77D28", strokeWidth: 1.5, strokeDasharray: "4 4" }, labelStyle: { fontFamily: "JetBrains Mono", fontSize: 10 } },
    ];
    if (reveal) edges.push({ id: "reveal", source: "E-007", target: "V-031", label: "⚠ SAME ADDRESS", style: { stroke: "#C4322E", strokeWidth: 2.5 }, labelStyle: { fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: 700, fill: "#C4322E" }, type: "straight" });
    return { nodes, edges };
  }, [hypotheses, reveal, findings]);
  return (
    <div className="h-full w-full">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} panOnDrag={false}>
        <Background gap={22} color="#E6E4D4" />
      </ReactFlow>
      {!reveal && hypotheses.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-ink-30 text-sm pointer-events-none">Entities appear as VERITAS investigates</div>}
    </div>
  );
}
function nodeStyle(state: string): React.CSSProperties {
  const c = state === "confirmed" ? "#C4322E" : state === "investigating" ? "#C77D28" : "#1A1A1A";
  return { background: "#fff", border: `1.5px solid ${c}`, borderRadius: 12, padding: "10px 14px", fontFamily: "Figtree", fontWeight: 600, fontSize: 13, color: c, boxShadow: state === "confirmed" ? "0 0 0 4px rgba(196,50,46,0.12)" : "none" };
}
