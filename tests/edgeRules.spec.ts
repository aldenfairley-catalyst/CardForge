/// <reference types="vitest" />

import { describe, expect, it } from "vitest";
import { validateConnect } from "../src/lib/graphIR/edgeRules";
import { PinKind, type GraphEdge, type GraphNode } from "../src/lib/graphIR/types";
import { getDefaultConfig } from "../src/lib/nodes/registry";

function node(nodeType: string, id: string): GraphNode {
  return { id, nodeType, position: { x: 0, y: 0 }, config: getDefaultConfig(nodeType) };
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
});
