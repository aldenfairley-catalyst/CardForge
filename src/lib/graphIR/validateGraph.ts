import { materializePins, getNodeDef } from "../nodes/registry";
import type { ValidationIssue } from "../schemas";
import { PinKind, type Graph, type GraphEdge, type GraphNode, type PinDefinition } from "./types";

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

function isControlEdge(edge: GraphEdge) {
  return edge.edgeKind === PinKind.CONTROL;
}

export function validateGraph(graph: Graph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const nodeIndex = new Map<string, GraphNode>();
  graph.nodes.forEach((n) => nodeIndex.set(n.id, n));

  graph.nodes.forEach((node, idx) => {
    const def = getNodeDef(node.nodeType);
    if (!def) {
      push(issues, "ERROR", "UNKNOWN_NODE", `Unknown nodeType '${node.nodeType}'`, `nodes[${idx}].nodeType`);
      return;
    }

    const pins = materializePins(node.nodeType, node.config);
    pins.forEach((pin) => {
      if (pin.required) {
        const connected = graph.edges.some((e) => {
          if (e.edgeKind !== pin.kind) return false;
          if (pin.direction === "IN") return e.to.nodeId === node.id && e.to.pinId === pin.id;
          return e.from.nodeId === node.id && e.from.pinId === pin.id;
        });
        if (!connected && pin.defaultValue === undefined) {
          push(
            issues,
            "ERROR",
            "REQUIRED_PIN",
            `Pin '${pin.id}' on ${node.nodeType} is required but not connected`,
            `nodes[${idx}].pins.${pin.id}`
          );
        }
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

    if (outPin.kind !== inPin.kind) {
      push(
        issues,
        "ERROR",
        "PIN_KIND_MISMATCH",
        `Edge connects ${outPin.kind} to ${inPin.kind}`,
        `edges[${idx}]`
      );
    }

    if (edge.edgeKind !== outPin.kind || edge.edgeKind !== inPin.kind) {
      push(issues, "ERROR", "EDGE_KIND_INCORRECT", "edgeKind does not match pin kinds", `edges[${idx}]`);
    }

    if (edge.edgeKind === PinKind.DATA) {
      if (outPin.dataType && inPin.dataType && outPin.dataType !== inPin.dataType && inPin.dataType !== "json") {
        push(
          issues,
          "ERROR",
          "DATA_TYPE_MISMATCH",
          `Data edge connects ${outPin.dataType} to ${inPin.dataType}`,
          `edges[${idx}]`
        );
      }
    }
  });

  const start = graph.nodes.find((n) => n.nodeType === "EXEC_START");
  if (!start) {
    push(issues, "ERROR", "MISSING_START", "Graph requires EXEC_START node");
  } else {
    const execPin = materializePins(start.nodeType, start.config).find((p) => p.id === "execOut");
    const hasExecOut = graph.edges.some(
      (e) => isControlEdge(e) && e.from.nodeId === start.id && e.from.pinId === execPin?.id
    );
    if (!hasExecOut) {
      push(issues, "ERROR", "START_UNCONNECTED", "EXEC_START.execOut must connect to another control pin");
    }
  }

  if (issues.length === 0) {
    issues.push({ severity: "WARN", code: "OK", message: "No issues." });
  }

  return issues;
}
