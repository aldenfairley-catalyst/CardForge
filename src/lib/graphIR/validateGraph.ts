import { arePinsCompatible, getNodeDef, materializePins } from "../nodes/registry";
import type { ValidationIssue } from "../schemas";
import type { AbilityComponent } from "../types";
import { PinKind, type Graph, type GraphEdge, type GraphNode, type PinDefinition } from "./types";

type PinIndex = Map<string, PinDefinition[]>;
type NodeIndex = Map<string, GraphNode>;

function push(
  issues: ValidationIssue[],
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  path?: string
) {
  issues.push({ severity, code, message, path });
}

function findPin(node: GraphNode | undefined, pinId: string): PinDefinition | undefined {
  if (!node) return undefined;
  return materializePins(node.nodeType, node.config).find((p) => p.id === pinId);
}

function buildPinIndex(graph: Graph): PinIndex {
  const pinIndex: PinIndex = new Map();
  graph.nodes.forEach((node) => {
    pinIndex.set(node.id, materializePins(node.nodeType, node.config));
  });
  return pinIndex;
}

function buildNodeIndex(graph: Graph): NodeIndex {
  const nodeIndex: NodeIndex = new Map();
  graph.nodes.forEach((n) => nodeIndex.set(n.id, n));
  return nodeIndex;
}

function isPinConnected(graph: Graph, nodeId: string, pin: PinDefinition) {
  return graph.edges.some((e) => {
    if (e.edgeKind !== pin.kind) return false;
    if (pin.direction === "IN") return e.to.nodeId === nodeId && e.to.pinId === pin.id;
    return e.from.nodeId === nodeId && e.from.pinId === pin.id;
  });
}

function addControlAdjacency(
  edge: GraphEdge,
  adj: Map<string, string[]>,
  controlIncoming: Map<string, GraphEdge[]>
) {
  if (edge.edgeKind !== PinKind.CONTROL) return;
  if (!adj.has(edge.from.nodeId)) adj.set(edge.from.nodeId, []);
  adj.get(edge.from.nodeId)!.push(edge.to.nodeId);

  const arr = controlIncoming.get(edge.to.nodeId) ?? [];
  arr.push(edge);
  controlIncoming.set(edge.to.nodeId, arr);
}

function detectControlCycles(startId: string, adj: Map<string, string[]>, issues: ValidationIssue[]) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cycleFound = false;

  const dfs = (nodeId: string) => {
    if (cycleFound) return;
    if (visiting.has(nodeId)) {
      cycleFound = true;
      if (!issues.some((i) => i.code === "CONTROL_CYCLE")) {
        push(issues, "ERROR", "CONTROL_CYCLE", "Control flow contains a cycle.", `nodes.${nodeId}`);
      }
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    (adj.get(nodeId) ?? []).forEach((next) => dfs(next));
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  dfs(startId);
}

function detectAnyControlCycle(adj: Map<string, string[]>, issues: ValidationIssue[]) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let reported = false;

  const dfs = (nodeId: string) => {
    if (reported) return;
    if (visiting.has(nodeId)) {
      reported = true;
      if (!issues.some((i) => i.code === "CONTROL_CYCLE")) {
        push(issues, "ERROR", "CONTROL_CYCLE", "Control flow contains a cycle.", `nodes.${nodeId}`);
      }
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    (adj.get(nodeId) ?? []).forEach((next) => dfs(next));
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  Array.from(adj.keys()).forEach((nodeId) => dfs(nodeId));
}

function computeReachable(startId: string, adj: Map<string, string[]>): Set<string> {
  const reachable = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    (adj.get(cur) ?? []).forEach((next) => {
      if (!reachable.has(next)) queue.push(next);
    });
  }
  return reachable;
}

function nodeProducesOutputs(node: GraphNode): Set<string> {
  const outputs = new Set<string>();
  const saveAs = typeof node.config?.saveAs === "string" ? node.config.saveAs.trim() : "";
  if (saveAs) outputs.add(saveAs);
  return outputs;
}

function buildAvailableOutputs(
  graph: Graph,
  controlIncoming: Map<string, GraphEdge[]>
): Map<string, Set<string>> {
  const produced = new Map<string, Set<string>>();
  graph.nodes.forEach((n) => produced.set(n.id, nodeProducesOutputs(n)));

  const available = new Map<string, Set<string>>();
  graph.nodes.forEach((n) => available.set(n.id, new Set()));

  let changed = true;
  while (changed) {
    changed = false;
    graph.nodes.forEach((node) => {
      const acc = new Set<string>();
      const incoming = controlIncoming.get(node.id) ?? [];
      incoming.forEach((edge) => {
        const fromAvail = available.get(edge.from.nodeId) ?? new Set<string>();
        const fromProduced = produced.get(edge.from.nodeId) ?? new Set<string>();
        fromAvail.forEach((v) => acc.add(v));
        fromProduced.forEach((v) => acc.add(v));
      });

      const target = available.get(node.id)!;
      const before = target.size;
      acc.forEach((v) => target.add(v));
      if (target.size !== before) changed = true;
    });
  }

  return available;
}

export function validateGraph(
  graph: Graph,
  ability?: AbilityComponent | null
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIndex = buildNodeIndex(graph);
  const pinIndex = buildPinIndex(graph);
  const controlAdj = new Map<string, string[]>();
  const controlIncoming = new Map<string, GraphEdge[]>();
  const controlOutCounts = new Map<string, number>();

  graph.edges.forEach((edge) => addControlAdjacency(edge, controlAdj, controlIncoming));

  graph.nodes.forEach((node, idx) => {
    const def = getNodeDef(node.nodeType);
    if (!def) {
      push(issues, "ERROR", "UNKNOWN_NODE", `Unknown nodeType '${node.nodeType}'`, `nodes[${idx}].nodeType`);
      return;
    }

    const pins = pinIndex.get(node.id) ?? [];
    pins.forEach((pin) => {
      if (!pin.required) return;
      const connected = isPinConnected(graph, node.id, pin);
      if (!connected && pin.defaultValue === undefined) {
        push(
          issues,
          "ERROR",
          "REQUIRED_PIN",
          `Pin '${pin.id}' on ${node.nodeType} is required but not connected`,
          `nodes[${idx}].pins.${pin.id}`
        );
      }
    });
  });

  graph.edges.forEach((edge, idx) => {
    const fromNode = nodeIndex.get(edge.from.nodeId);
    const toNode = nodeIndex.get(edge.to.nodeId);
    if (!fromNode || !toNode) {
      push(issues, "ERROR", "EDGE_NODE_MISSING", "Edge references missing node", `edges[${idx}]`);
      return;
    }
    const outPin = findPin(fromNode, edge.from.pinId);
    const inPin = findPin(toNode, edge.to.pinId);
    if (!outPin || !inPin) {
      push(issues, "ERROR", "EDGE_PIN_MISSING", "Edge references missing pin", `edges[${idx}]`);
      return;
    }

    if (outPin.direction !== "OUT") {
      push(issues, "ERROR", "PIN_DIRECTION", "Edge source pin must be an OUT pin.", `edges[${idx}].from.pinId`);
    }
    if (inPin.direction !== "IN") {
      push(issues, "ERROR", "PIN_DIRECTION", "Edge target pin must be an IN pin.", `edges[${idx}].to.pinId`);
    }

    if (edge.edgeKind !== outPin.kind || edge.edgeKind !== inPin.kind) {
      push(issues, "ERROR", "EDGE_KIND_INCORRECT", "edgeKind does not match pin kinds", `edges[${idx}]`);
    }

    if (!arePinsCompatible(outPin, inPin)) {
      push(
        issues,
        "ERROR",
        "PIN_COMPATIBILITY",
        `Pins '${outPin.id}' → '${inPin.id}' are not compatible (kind/direction/dataType).`,
        `edges[${idx}]`
      );
    }

    if (edge.edgeKind === PinKind.CONTROL && outPin?.direction === "OUT") {
      const key = `${edge.from.nodeId}::${edge.from.pinId}`;
      controlOutCounts.set(key, (controlOutCounts.get(key) ?? 0) + 1);
    }
  });

  controlOutCounts.forEach((count, key) => {
    if (count <= 1) return;
    const [nodeId, pinId] = key.split("::");
    push(
      issues,
      "ERROR",
      "MULTIPLE_EXEC_OUT",
      `Control output pin '${pinId}' on node '${nodeId}' has multiple outgoing edges.`,
      `nodes.${nodeId}.pins.${pinId}`
    );
  });

  detectAnyControlCycle(controlAdj, issues);

  const start = graph.nodes.find((n) => n.nodeType === "EXEC_START");
  if (!start) {
    push(issues, "ERROR", "MISSING_START", "Graph requires EXEC_START node");
  } else {
    const execPin = (pinIndex.get(start.id) ?? []).find((p) => p.id === "execOut");
    const hasExecOut = graph.edges.some(
      (e) => e.edgeKind === PinKind.CONTROL && e.from.nodeId === start.id && e.from.pinId === execPin?.id
    );
    if (!hasExecOut) {
      push(issues, "ERROR", "START_UNCONNECTED", "EXEC_START.execOut must connect to another control pin");
    }

    detectControlCycles(start.id, controlAdj, issues);

    const reachable = computeReachable(start.id, controlAdj);
    if (reachable.size <= 1) {
      push(issues, "ERROR", "NO_EXECUTION_PATH", "No reachable execution path from EXEC_START.");
    }

    graph.nodes.forEach((node, idx) => {
      if (!reachable.has(node.id)) {
        push(issues, "WARN", "UNREACHABLE_NODE", `Node '${node.nodeType}' is not reachable from EXEC_START.`, `nodes[${idx}]`);
      }
    });
  }

  // Reference validation (profiles, saveAs/ref)
  const availableOutputs = buildAvailableOutputs(graph, controlIncoming);
  const abilityProfiles = new Set((ability?.targetingProfiles ?? []).map((p) => p?.id).filter(Boolean) as string[]);

  graph.nodes.forEach((node, idx) => {
    if (node.nodeType === "SELECT_TARGETS") {
      const profileId = node.config?.profileId;
      if (typeof profileId !== "string" || !profileId.trim()) {
        push(issues, "ERROR", "SELECT_TARGETS_PROFILE", "SELECT_TARGETS.profileId is required.", `nodes[${idx}].config.profileId`);
      } else if (!abilityProfiles.has(profileId.trim())) {
        push(
          issues,
          "ERROR",
          "SELECT_TARGETS_PROFILE_MISSING",
          `SELECT_TARGETS.profileId '${profileId}' does not exist in ability.targetingProfiles[].id`,
          `nodes[${idx}].config.profileId`
        );
      }
    }

    if (node.nodeType === "FOR_EACH_TARGET") {
      const ref = node.config?.targetSet?.ref;
      if (typeof ref !== "string" || !ref.trim()) {
        push(issues, "ERROR", "FOR_EACH_TARGET_REF", "FOR_EACH_TARGET.targetSet.ref is required.", `nodes[${idx}].config.targetSet.ref`);
      } else {
        const available = availableOutputs.get(node.id) ?? new Set<string>();
        if (!available.has(ref.trim())) {
          push(
            issues,
            "WARN",
            "FOR_EACH_TARGET_REF_UNKNOWN",
            `FOR_EACH_TARGET.targetSet.ref '${ref}' does not match any prior saveAs output in this graph path.`,
            `nodes[${idx}].config.targetSet.ref`
          );
        }
      }
    }
  });

  return issues;
}
