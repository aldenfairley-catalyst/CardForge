import type { Edge } from "reactflow";
import type { GraphEdge, PinDefinition } from "./types";

function buildRemovedPinSet(oldPins: PinDefinition[], newPins: PinDefinition[]) {
  const oldIds = new Set(oldPins.map((p) => p.id));
  const newIds = new Set(newPins.map((p) => p.id));
  const removed = new Set<string>();
  oldIds.forEach((id) => {
    if (!newIds.has(id)) removed.add(id);
  });
  return removed;
}

export function reconcileGraphEdgesAfterPinChange(nodeId: string, oldPins: PinDefinition[], newPins: PinDefinition[], edges: GraphEdge[]) {
  const removed = buildRemovedPinSet(oldPins, newPins);
  if (!removed.size) return edges;
  return edges.filter((edge) => {
    const fromInvolves = edge.from.nodeId === nodeId;
    const toInvolves = edge.to.nodeId === nodeId;
    if (!fromInvolves && !toInvolves) return true;
    if (fromInvolves && removed.has(edge.from.pinId)) return false;
    if (toInvolves && removed.has(edge.to.pinId)) return false;
    return true;
  });
}

export function reconcileReactFlowEdgesAfterPinChange(
  nodeId: string,
  oldPins: PinDefinition[],
  newPins: PinDefinition[],
  edges: Edge[]
) {
  const removed = buildRemovedPinSet(oldPins, newPins);
  if (!removed.size) return edges;
  return edges.filter((edge) => {
    const fromInvolves = edge.source === nodeId;
    const toInvolves = edge.target === nodeId;
    if (!fromInvolves && !toInvolves) return true;
    if (fromInvolves && edge.sourceHandle && removed.has(edge.sourceHandle)) return false;
    if (toInvolves && edge.targetHandle && removed.has(edge.targetHandle)) return false;
    return true;
  });
}

function buildRemovedIds(oldPinIds: string[], newPinIds: string[]) {
  const removed = new Set<string>();
  const oldSet = new Set(oldPinIds);
  const newSet = new Set(newPinIds);
  oldSet.forEach((id) => {
    if (!newSet.has(id)) removed.add(id);
  });
  return removed;
}

function isReactFlowEdge(edge: any): edge is Edge {
  return edge && typeof edge === "object" && "source" in edge && "target" in edge;
}

export function reconcileEdgesForPinRemoval(nodeId: string, oldPinIds: string[], newPinIds: string[], edges: Array<Edge | GraphEdge>) {
  const removed = buildRemovedIds(oldPinIds, newPinIds);
  if (!removed.size) return edges;

  return edges.filter((edge) => {
    if (isReactFlowEdge(edge)) {
      if (edge.source === nodeId && edge.sourceHandle && removed.has(edge.sourceHandle)) return false;
      if (edge.target === nodeId && edge.targetHandle && removed.has(edge.targetHandle)) return false;
      return true;
    }

    const graphEdge = edge as GraphEdge;
    if (graphEdge.from?.nodeId === nodeId && removed.has(graphEdge.from.pinId)) return false;
    if (graphEdge.to?.nodeId === nodeId && removed.has(graphEdge.to.pinId)) return false;
    return true;
  });
}
