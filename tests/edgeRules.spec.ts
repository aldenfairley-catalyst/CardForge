/// <reference types="vitest" />

import { describe, expect, it } from "vitest";
import { validateConnect } from "../src/lib/graphIR/edgeRules";
import { PinKind, type GraphEdge, type GraphNode, type NodeDefinition } from "../src/lib/graphIR/types";
import { getDefaultConfig, getRegistry } from "../src/lib/nodes/registry";

function node(nodeType: string, id: string): GraphNode {
  return { id, nodeType, position: { x: 0, y: 0 }, config: getDefaultConfig(nodeType) };
}

function registerTempNodes(defs: NodeDefinition[]) {
  const registry = getRegistry();
  defs.forEach((def) => registry.nodes.push(def));
  return () => {
    defs.forEach((def) => {
      const idx = registry.nodes.findIndex((n) => n.nodeType === def.nodeType);
      if (idx >= 0) registry.nodes.splice(idx, 1);
    });
  };
}

describe("validateConnect rules", () => {
  it("rejects control → data kind mismatch", () => {
    const nodes = [node("EXEC_START", "start"), node("IF", "if1")];
    const edges: GraphEdge[] = [];
    const res = validateConnect({
      nodes,
      edges,
      sourceNodeId: "start",
      sourcePinId: "execOut",
      targetNodeId: "if1",
      targetPinId: "ifCondIn"
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("KIND_MISMATCH");
  });

  it("rejects data type mismatch", () => {
    const nodes = [node("CONST_NUMBER", "num"), node("IF", "if1")];
    const edges: GraphEdge[] = [];
    const res = validateConnect({
      nodes,
      edges,
      sourceNodeId: "num",
      sourcePinId: "out",
      targetNodeId: "if1",
      targetPinId: "ifCondIn"
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("DATA_TYPE_MISMATCH");
  });

  it("accepts boolean data connection", () => {
    const nodes = [node("CONST_BOOL", "bool"), node("IF", "if1")];
    const edges: GraphEdge[] = [];
    const res = validateConnect({
      nodes,
      edges,
      sourceNodeId: "bool",
      sourcePinId: "out",
      targetNodeId: "if1",
      targetPinId: "ifCondIn"
    });
    expect(res.ok).toBe(true);
  });

  it("enforces multiplicity on target pin", () => {
    const nodes = [node("CONST_BOOL", "b1"), node("CONST_BOOL", "b2"), node("IF", "if1")];
    const first = validateConnect({
      nodes,
      edges: [],
      sourceNodeId: "b1",
      sourcePinId: "out",
      targetNodeId: "if1",
      targetPinId: "ifCondIn"
    });
    expect(first.ok).toBe(true);
    const edges: GraphEdge[] = first.ok ? [first.edge] : [];
    const second = validateConnect({
      nodes,
      edges,
      sourceNodeId: "b2",
      sourcePinId: "out",
      targetNodeId: "if1",
      targetPinId: "ifCondIn"
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("TARGET_AT_MAX");
  });

  it("treats missing dataType as any for DATA edges", () => {
    const cleanup = registerTempNodes([
      {
        nodeType: "ANY_SOURCE",
        label: "Any Source",
        category: "Test",
        description: "",
        configSchema: { type: "object", properties: {} },
        pins: { static: [{ id: "out", label: "Any", kind: PinKind.DATA, direction: "OUT", group: "Value" }] },
        compile: { kind: "VALUE_EXPR", exprType: "TEST_ANY" }
      },
      {
        nodeType: "BOOL_SINK",
        label: "Bool Sink",
        category: "Test",
        description: "",
        configSchema: { type: "object", properties: {} },
        pins: {
          static: [{ id: "in", label: "Bool", kind: PinKind.DATA, direction: "IN", group: "Value", dataType: "boolean" }]
        },
        compile: { kind: "VALUE_EXPR", exprType: "TEST_BOOL" }
      }
    ]);

    try {
      const nodes: GraphNode[] = [
        { id: "a", nodeType: "ANY_SOURCE", position: { x: 0, y: 0 }, config: {} },
        { id: "b", nodeType: "BOOL_SINK", position: { x: 0, y: 0 }, config: {} }
      ];
      const edges: GraphEdge[] = [];
      const res = validateConnect({
        nodes,
        edges,
        sourceNodeId: "a",
        sourcePinId: "out",
        targetNodeId: "b",
        targetPinId: "in"
      });
      expect(res.ok).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("rejects cycles for CONTROL edges", () => {
    const nodes = [node("SHOW_TEXT", "a"), node("SHOW_TEXT", "b")];
    const edges: GraphEdge[] = [
      {
        id: "e1",
        edgeKind: PinKind.CONTROL,
        from: { nodeId: "a", pinId: "execOut" },
        to: { nodeId: "b", pinId: "execIn" }
      }
    ];
    const res = validateConnect({
      nodes,
      edges,
      sourceNodeId: "b",
      sourcePinId: "execOut",
      targetNodeId: "a",
      targetPinId: "execIn"
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CONTROL_CYCLE");
  });

  it("rejects duplicate connections", () => {
    const nodes = [node("CONST_BOOL", "b1"), node("IF", "if1")];
    const edges: GraphEdge[] = [
      {
        id: "e1",
        edgeKind: PinKind.DATA,
        dataType: "boolean",
        from: { nodeId: "b1", pinId: "out" },
        to: { nodeId: "if1", pinId: "ifCondIn" }
      }
    ];
    const res = validateConnect({
      nodes,
      edges,
      sourceNodeId: "b1",
      sourcePinId: "out",
      targetNodeId: "if1",
      targetPinId: "ifCondIn"
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("DUPLICATE");
  });

  it("rejects IN → IN connections", () => {
    const nodes = [node("IF", "if1"), node("SHOW_TEXT", "text")];
    const edges: GraphEdge[] = [];
    const res = validateConnect({
      nodes,
      edges,
      sourceNodeId: "if1",
      sourcePinId: "ifCondIn",
      targetNodeId: "text",
      targetPinId: "execIn"
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("SOURCE_NOT_OUT");
  });

  it("rejects OUT → OUT connections", () => {
    const nodes = [node("EXEC_START", "start"), node("SHOW_TEXT", "text")];
    const edges: GraphEdge[] = [];
    const res = validateConnect({
      nodes,
      edges,
      sourceNodeId: "start",
      sourcePinId: "execOut",
      targetNodeId: "text",
      targetPinId: "execOut"
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TARGET_NOT_IN");
  });

  it("rejects unknown pins with clear codes", () => {
    const nodes = [node("EXEC_START", "start"), node("IF", "if1")];
    const edges: GraphEdge[] = [];
    const res = validateConnect({
      nodes,
      edges,
      sourceNodeId: "start",
      sourcePinId: "missingPin",
      targetNodeId: "if1",
      targetPinId: "ifCondIn"
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("SOURCE_PIN_MISSING");
  });
});
