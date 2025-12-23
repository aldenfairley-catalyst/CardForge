import { v4 as uuidv4 } from "uuid";
import { materializePins } from "../nodes/registry";
import { wouldCreateCycle } from "./cycle";
import { PinKind, type GraphEdge, type GraphNode, type PinDefinition } from "./types";

export type ValidateConnectParams = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  sourceNodeId: string;
  sourcePinId: string;
  targetNodeId: string;
  targetPinId: string;
};

type Ok = { ok: true; edge: GraphEdge };
type Err = { ok: false; reason: string; code: string };

function findPin(nodes: GraphNode[], nodeId: string, pinId: string): PinDefinition | undefined {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return undefined;
  return materializePins(node.nodeType, node.config).find((p) => p.id === pinId);
}

function pinMaxConnections(pin?: PinDefinition): number {
  if (!pin || pin.direction !== "IN") return 0;
  if (typeof pin.maxConnections === "number" && pin.maxConnections >= 0) return pin.maxConnections;
  if (pin.multi) return Infinity;
  return 1;
}

function dataTypesCompatible(source?: PinDefinition, target?: PinDefinition) {
  const s = source?.dataType ?? "any";
  const t = target?.dataType ?? "any";
  if (s === "any" || t === "any") return true;
  if (s === t) return true;
  return false;
}

export function validateConnect(params: ValidateConnectParams): Ok | Err {
  const { nodes, edges, sourceNodeId, sourcePinId, targetNodeId, targetPinId } = params;

  const sourcePin = findPin(nodes, sourceNodeId, sourcePinId);
  const targetPin = findPin(nodes, targetNodeId, targetPinId);

  if (!sourcePin) {
    return {
      ok: false,
      reason: `Source pin '${sourcePinId}' was not found on node '${sourceNodeId}'.`,
      code: "SOURCE_PIN_MISSING"
    };
  }
  if (!targetPin) {
    return {
      ok: false,
      reason: `Target pin '${targetPinId}' was not found on node '${targetNodeId}'.`,
      code: "TARGET_PIN_MISSING"
    };
  }

  if (sourcePin.direction !== "OUT") {
    return {
      ok: false,
      reason: `Cannot start from an ${sourcePin.direction} pin. Only OUT pins can be sources.`,
      code: "SOURCE_NOT_OUT"
    };
  }
  if (targetPin.direction !== "IN") {
    return { ok: false, reason: `Target must be an IN pin (found ${targetPin.direction}).`, code: "TARGET_NOT_IN" };
  }

  if (sourceNodeId === targetNodeId) {
    return { ok: false, reason: "Self-connections are not allowed.", code: "SELF_EDGE" };
  }

  if (sourcePin.kind !== targetPin.kind) {
    return {
      ok: false,
      reason: `Cannot connect ${sourcePin.kind} → ${targetPin.kind}.`,
      code: "KIND_MISMATCH"
    };
  }

  if (sourcePin.kind === PinKind.DATA && !dataTypesCompatible(sourcePin, targetPin)) {
    const s = sourcePin.dataType ?? "any";
    const t = targetPin.dataType ?? "any";
    return { ok: false, reason: `Type mismatch: cannot connect DATA(${s}) → DATA(${t})`, code: "DATA_TYPE_MISMATCH" };
  }

  const edgeKind = sourcePin.kind;
  const duplicate = edges.some(
    (e) =>
      e.from.nodeId === sourceNodeId &&
      e.from.pinId === sourcePinId &&
      e.to.nodeId === targetNodeId &&
      e.to.pinId === targetPinId &&
      e.edgeKind === edgeKind
  );
  if (duplicate) {
    return { ok: false, reason: "This connection already exists.", code: "DUPLICATE" };
  }

  const incomingToTarget = edges.filter(
    (e) => e.to.nodeId === targetNodeId && e.to.pinId === targetPinId && e.edgeKind === edgeKind
  );
  const maxIn = pinMaxConnections(targetPin);
  if (maxIn !== Infinity && incomingToTarget.length >= maxIn) {
    const maxLabel = maxIn === 1 ? "1" : String(maxIn);
    return { ok: false, reason: `Pin already connected (max ${maxLabel}). Set pin.multi=true to allow more.`, code: "TARGET_AT_MAX" };
  }

  const edge: GraphEdge = {
    id: uuidv4(),
    edgeKind,
    dataType: edgeKind === PinKind.DATA ? sourcePin.dataType ?? targetPin.dataType : undefined,
    from: { nodeId: sourceNodeId, pinId: sourcePinId },
    to: { nodeId: targetNodeId, pinId: targetPinId },
    createdAt: new Date().toISOString()
  };

  if (edge.edgeKind === PinKind.CONTROL && wouldCreateCycle(nodes, edges, edge)) {
    return { ok: false, reason: "Would create a CONTROL cycle (not allowed).", code: "CONTROL_CYCLE" };
  }

  return { ok: true, edge };
}
