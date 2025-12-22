import type { Edge as ReactFlowEdge, Node as ReactFlowNode } from "reactflow";
import { PinKind, type GraphEdge, type GraphNode } from "./types";

/**
 * Helpers for adapting editor Graph IR (CJ-GRAPH-1.x) to React Flow nodes/edges and back.
 * This keeps the React Flow canvas decoupled from the serialized graph format used in exports.
 */
export function graphNodeToReactFlowNode(node: GraphNode, selectedId?: string): ReactFlowNode {
  return {
    id: node.id,
    type: "genericNode",
    position: node.position,
    data: { nodeType: node.nodeType, config: node.config, pinsCache: node.pinsCache },
    selected: selectedId === node.id
  };
}

export function reactFlowNodeToGraphNode(node: ReactFlowNode): GraphNode {
  return {
    id: node.id,
    nodeType: (node.data as any)?.nodeType ?? "UNKNOWN",
    position: node.position,
    config: (node.data as any)?.config ?? {},
    pinsCache: (node.data as any)?.pinsCache
  };
}

export function graphEdgeToReactFlowEdge(edge: GraphEdge): ReactFlowEdge {
  const label =
    edge.edgeKind === PinKind.DATA && edge.dataType ? `${edge.edgeKind} (${edge.dataType})` : edge.edgeKind;
  return {
    id: edge.id,
    source: edge.from.nodeId,
    target: edge.to.nodeId,
    sourceHandle: edge.from.pinId,
    targetHandle: edge.to.pinId,
    label,
    data: { edgeKind: edge.edgeKind, dataType: edge.dataType, createdAt: edge.createdAt }
  };
}

export function reactFlowEdgeToGraphEdge(edge: ReactFlowEdge): GraphEdge {
  const edgeKind = ((edge.data as any)?.edgeKind as GraphEdge["edgeKind"]) ?? (edge.label as GraphEdge["edgeKind"]) ?? PinKind.CONTROL;
  return {
    id: edge.id,
    edgeKind,
    dataType: (edge.data as any)?.dataType,
    from: { nodeId: edge.source as string, pinId: (edge.sourceHandle as string) ?? "" },
    to: { nodeId: edge.target as string, pinId: (edge.targetHandle as string) ?? "" },
    createdAt: (edge.data as any)?.createdAt
  };
}
