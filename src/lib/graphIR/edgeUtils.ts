import type { Graph, GraphEdge, PinDefinition } from "./types";

/**
 * Remove edges that reference pins that no longer exist after a node's pins were re-materialized.
 * This keeps selection stable by only pruning the edges that became invalid.
 */
export function reconcileEdgesAfterPinChange(
  graph: Graph,
  nodeId: string,
  _oldPins: PinDefinition[],
  newPins: PinDefinition[]
): GraphEdge[] {
  const validPinIds = new Set(newPins.map((p) => p.id));

  return graph.edges.filter((edge) => {
    const fromInvolves = edge.from.nodeId === nodeId;
    const toInvolves = edge.to.nodeId === nodeId;
    if (!fromInvolves && !toInvolves) return true;

    if (fromInvolves && !validPinIds.has(edge.from.pinId)) return false;
    if (toInvolves && !validPinIds.has(edge.to.pinId)) return false;
    return true;
  });
}
