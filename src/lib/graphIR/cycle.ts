import { PinKind, type GraphEdge } from "./types";

/**
 * Determine whether adding the provided edge would introduce a CONTROL cycle.
 * DATA edges currently do not participate in cycle detection (MVP policy).
 */
export function wouldCreateCycle(_nodes: { id: string }[], edges: GraphEdge[], newEdge: GraphEdge): boolean {
  if (newEdge.edgeKind !== PinKind.CONTROL) return false;

  const adj = new Map<string, string[]>();
  const addEdge = (edge: GraphEdge) => {
    if (edge.edgeKind !== PinKind.CONTROL) return;
    const list = adj.get(edge.from.nodeId) ?? [];
    list.push(edge.to.nodeId);
    adj.set(edge.from.nodeId, list);
  };

  edges.forEach(addEdge);
  addEdge(newEdge);

  const start = newEdge.from.nodeId;
  const target = newEdge.to.nodeId;

  const queue = [target];
  const seen = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (cur === start) return true;
    (adj.get(cur) ?? []).forEach((next) => queue.push(next));
  }

  return false;
}
