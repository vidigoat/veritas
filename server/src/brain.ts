/**
 * CASE BRAIN — the agent's working memory for an investigation.
 *
 * A forensic case accumulates knowledge: entities (vendors, employees, accounts),
 * facts about them (with provenance + confidence), and relationships (approves,
 * paid-by, registered-at, contradicts). The brain is the queryable substrate the
 * investigator writes to as it reasons and the Q&A responder reads from to answer.
 *
 *   entities ──facts(source, confidence)──▶ evidence
 *      │ links (approves | paid_by | registered_at | shares_address | contradicts)
 *      ▼
 *   timeline (append-only — the chain of custody, never pruned)
 *
 * Ported in spirit from Titan's brain (entity/fact/link graph + immutable timeline),
 * scoped to a single case rather than a tenant.
 */

export type EntityKind = "vendor" | "employee" | "account" | "document";
export type LinkKind = "approves" | "paid_by" | "registered_at" | "shares_address" | "controls" | "contradicts" | "corroborates";

export interface Entity { id: string; kind: EntityKind; name: string; props: Record<string, unknown>; }
export interface Fact { entityId: string; key: string; value: string | number; source: string; confidence: number; ts: number; }
export interface Link { from: string; to: string; kind: LinkKind; context: string; }
export interface TimelineEntry { ts: number; entityId?: string; text: string; source: string; }

export class CaseBrain {
  private entities = new Map<string, Entity>();
  private facts: Fact[] = [];
  private links: Link[] = [];
  private timeline: TimelineEntry[] = [];
  private clock = 0;

  upsertEntity(id: string, kind: EntityKind, name: string, props: Record<string, unknown> = {}): Entity {
    const existing = this.entities.get(id);
    const e: Entity = existing
      ? { ...existing, name: name || existing.name, props: { ...existing.props, ...props } }
      : { id, kind, name, props };
    this.entities.set(id, e);
    return e;
  }

  addFact(entityId: string, key: string, value: string | number, source: string, confidence = 0.9) {
    // one current value per (entity, key) — replace, don't accumulate duplicates
    this.facts = this.facts.filter(f => !(f.entityId === entityId && f.key === key));
    this.facts.push({ entityId, key, value, source, confidence, ts: ++this.clock });
  }

  link(from: string, to: string, kind: LinkKind, context = "") {
    if (this.links.some(l => l.from === from && l.to === to && l.kind === kind)) return;
    this.links.push({ from, to, kind, context });
  }

  record(text: string, source: string, entityId?: string) {
    this.timeline.push({ ts: ++this.clock, entityId, text, source });
  }

  // --- reads ---
  getEntity(id: string) { return this.entities.get(id); }
  factsFor(id: string) { return this.facts.filter(f => f.entityId === id); }
  linksFrom(id: string) { return this.links.filter(l => l.from === id); }
  linksTo(id: string) { return this.links.filter(l => l.to === id); }
  neighbors(id: string) {
    return [...this.linksFrom(id).map(l => ({ ...this.entities.get(l.to), via: l.kind })),
            ...this.linksTo(id).map(l => ({ ...this.entities.get(l.from), via: l.kind }))].filter(x => x.id);
  }
  contradictions() { return this.links.filter(l => l.kind === "contradicts"); }
  fullTimeline() { return [...this.timeline].sort((a, b) => a.ts - b.ts); }
  snapshot() {
    return {
      entities: [...this.entities.values()],
      facts: this.facts,
      links: this.links,
      timeline: this.fullTimeline(),
      stats: { entities: this.entities.size, facts: this.facts.length, links: this.links.length, events: this.timeline.length },
    };
  }
  // a compact textual dossier for the Q&A responder's context
  dossier(id: string): string {
    const e = this.entities.get(id); if (!e) return "";
    const facts = this.factsFor(id).map(f => `  ${f.key}: ${f.value} [${f.source}, conf ${f.confidence}]`).join("\n");
    const rels = this.neighbors(id).map(n => `  ${n.via} → ${n.name}`).join("\n");
    return `${e.kind} ${e.id} (${e.name})\nFacts:\n${facts}\nRelationships:\n${rels}`;
  }
}
