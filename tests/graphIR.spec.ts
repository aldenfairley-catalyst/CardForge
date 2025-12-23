/// <reference types="vitest" />

import { describe, expect, it } from "vitest";
import { makeDefaultCard } from "../src/lib/graph";
import { compileAbilityGraph } from "../src/lib/graphIR/compiler";
import { PinKind, type Graph } from "../src/lib/graphIR/types";
import { getRegistry, materializePins } from "../src/lib/nodes/registry";
import { validateGraph } from "../src/lib/graphIR/validateGraph";

describe("nodeRegistry integrity", () => {
  const registry = getRegistry();

  it("has unique node types", () => {
    const types = registry.nodes.map((n) => n.nodeType);
    expect(new Set(types).size).toBe(types.length);
  });

  it("ensures pins are unique per node", () => {
    registry.nodes.forEach((node) => {
      const pins = materializePins(node.nodeType, {});
      const ids = pins.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it("IF node declares elseIfCount for dynamic pins", () => {
    const ifNode = registry.nodes.find((n) => n.nodeType === "IF");
    expect(ifNode?.configSchema?.properties?.elseIfCount).toBeDefined();
    expect(ifNode?.pins?.dynamic?.kind).toBe("ELSEIF_PINS");
  });
});

describe("graph compile pipeline", () => {
  function baseGraph(): Graph {
    return { graphVersion: "CJ-GRAPH-1.1", id: "g", label: "test", nodes: [], edges: [] };
  }

  it("compiles Start → Show Text", () => {
    const card = makeDefaultCard();
    const ability = card.components.find((c: any) => c.componentType === "ABILITY") as any;
    const graph: Graph = {
      ...baseGraph(),
      nodes: [
        { id: "start", nodeType: "EXEC_START", position: { x: 0, y: 0 }, config: {} },
        { id: "show", nodeType: "SHOW_TEXT", position: { x: 150, y: 0 }, config: { text: "Hello" } }
      ],
      edges: [
        { id: "e1", edgeKind: PinKind.CONTROL, from: { nodeId: "start", pinId: "execOut" }, to: { nodeId: "show", pinId: "execIn" } }
      ]
    };

    const { steps, issues } = compileAbilityGraph({ graph, ability, card });
    expect(issues.filter((i) => i.severity === "ERROR")).toHaveLength(0);
    expect(steps).toEqual([{ type: "SHOW_TEXT", text: "Hello" }]);
  });

  it("compiles IF with else-if branches and const bool conditions", () => {
    const card = makeDefaultCard();
    const ability = card.components.find((c: any) => c.componentType === "ABILITY") as any;
    const graph: Graph = {
      ...baseGraph(),
      nodes: [
        { id: "start", nodeType: "EXEC_START", position: { x: 0, y: 0 }, config: {} },
        { id: "condTrue", nodeType: "CONST_BOOL", position: { x: 0, y: 120 }, config: { value: true } },
        { id: "condFalse", nodeType: "CONST_BOOL", position: { x: 0, y: 220 }, config: { value: false } },
        { id: "if", nodeType: "IF", position: { x: 200, y: 0 }, config: { elseIfCount: 1 } },
        { id: "then", nodeType: "SHOW_TEXT", position: { x: 420, y: -60 }, config: { text: "Then branch" } },
        { id: "elseif", nodeType: "SHOW_TEXT", position: { x: 420, y: 40 }, config: { text: "ElseIf branch" } },
        { id: "else", nodeType: "SHOW_TEXT", position: { x: 420, y: 140 }, config: { text: "Else branch" } }
      ],
      edges: [
        { id: "e1", edgeKind: PinKind.CONTROL, from: { nodeId: "start", pinId: "execOut" }, to: { nodeId: "if", pinId: "execIn" } },
        { id: "e2", edgeKind: PinKind.DATA, from: { nodeId: "condTrue", pinId: "out" }, to: { nodeId: "if", pinId: "ifCondIn" } },
        { id: "e3", edgeKind: PinKind.DATA, from: { nodeId: "condFalse", pinId: "out" }, to: { nodeId: "if", pinId: "elseIfCondIn_0" } },
        { id: "e4", edgeKind: PinKind.CONTROL, from: { nodeId: "if", pinId: "thenExecOut" }, to: { nodeId: "then", pinId: "execIn" } },
        { id: "e5", edgeKind: PinKind.CONTROL, from: { nodeId: "if", pinId: "elseIfExecOut_0" }, to: { nodeId: "elseif", pinId: "execIn" } },
        { id: "e6", edgeKind: PinKind.CONTROL, from: { nodeId: "if", pinId: "elseExecOut" }, to: { nodeId: "else", pinId: "execIn" } }
      ]
    };

    const { steps, issues } = compileAbilityGraph({ graph, ability, card });
    expect(issues.filter((i) => i.severity === "ERROR")).toHaveLength(0);
    expect(steps[0]).toEqual({
      type: "IF_ELSE",
      condition: { type: "CONST_BOOL", value: true },
      then: [{ type: "SHOW_TEXT", text: "Then branch" }],
      elseIf: [{ condition: { type: "CONST_BOOL", value: false }, then: [{ type: "SHOW_TEXT", text: "ElseIf branch" }] }],
      else: [{ type: "SHOW_TEXT", text: "Else branch" }]
    });
  });
});

describe("graph validation rules", () => {
  function buildAbility() {
    const card = makeDefaultCard();
    return { ability: card.components.find((c: any) => c.componentType === "ABILITY") as any, card };
  }

  it("allows control fan-out when maxConnections allows it", () => {
    const { ability, card } = buildAbility();
    const graph: Graph = {
      graphVersion: "CJ-GRAPH-1.1",
      id: "g",
      label: "multi",
      nodes: [
        { id: "start", nodeType: "EXEC_START", position: { x: 0, y: 0 }, config: {} },
        { id: "showA", nodeType: "SHOW_TEXT", position: { x: 200, y: 0 }, config: { text: "A" } },
        { id: "showB", nodeType: "SHOW_TEXT", position: { x: 400, y: -80 }, config: { text: "B" } },
        { id: "showC", nodeType: "SHOW_TEXT", position: { x: 400, y: 80 }, config: { text: "C" } }
      ],
      edges: [
        { id: "e1", edgeKind: PinKind.CONTROL, from: { nodeId: "start", pinId: "execOut" }, to: { nodeId: "showA", pinId: "execIn" } },
        { id: "e2", edgeKind: PinKind.CONTROL, from: { nodeId: "showA", pinId: "execOut" }, to: { nodeId: "showB", pinId: "execIn" } },
        { id: "e3", edgeKind: PinKind.CONTROL, from: { nodeId: "showA", pinId: "execOut" }, to: { nodeId: "showC", pinId: "execIn" } }
      ]
    };

    const issues = validateGraph(graph, ability);
    const errorCodes = issues.filter((i) => i.severity === "ERROR").map((i) => i.code);
    expect(errorCodes).not.toContain("SOURCE_AT_MAX");
    expect(errorCodes).not.toContain("TARGET_AT_MAX");

    const { steps } = compileAbilityGraph({ graph, ability, card });
    expect(steps.length).toBeGreaterThan(0);
  });

  it("rejects missing required IF condition connections during compilation", () => {
    const { ability, card } = buildAbility();
    const graph: Graph = {
      graphVersion: "CJ-GRAPH-1.1",
      id: "g",
      label: "missing-cond",
      nodes: [
        { id: "start", nodeType: "EXEC_START", position: { x: 0, y: 0 }, config: {} },
        { id: "if", nodeType: "IF", position: { x: 200, y: 0 }, config: { elseIfCount: 1 } },
        { id: "then", nodeType: "SHOW_TEXT", position: { x: 400, y: 0 }, config: { text: "Then" } }
      ],
      edges: [
        { id: "e1", edgeKind: PinKind.CONTROL, from: { nodeId: "start", pinId: "execOut" }, to: { nodeId: "if", pinId: "execIn" } },
        { id: "e2", edgeKind: PinKind.CONTROL, from: { nodeId: "if", pinId: "thenExecOut" }, to: { nodeId: "then", pinId: "execIn" } }
      ]
    };

    const { issues, steps } = compileAbilityGraph({ graph, ability, card });
    const errorCodes = issues.filter((i) => i.severity === "ERROR").map((i) => i.code);
    expect(errorCodes).toContain("REQUIRED_PIN");
    expect(steps).toEqual((ability as any).execution?.steps ?? []);
  });

  it("flags missing required config fields per node schema", () => {
    const { ability } = buildAbility();
    const graph: Graph = {
      graphVersion: "CJ-GRAPH-1.1",
      id: "g",
      label: "missing-config",
      nodes: [
        { id: "start", nodeType: "EXEC_START", position: { x: 0, y: 0 }, config: {} },
        { id: "show", nodeType: "SHOW_TEXT", position: { x: 200, y: 0 }, config: {} }
      ],
      edges: [
        { id: "e1", edgeKind: PinKind.CONTROL, from: { nodeId: "start", pinId: "execOut" }, to: { nodeId: "show", pinId: "execIn" } }
      ]
    };

    const issues = validateGraph(graph, ability);
    const errorCodes = issues.filter((i) => i.severity === "ERROR").map((i) => i.code);
    expect(errorCodes).toContain("CONFIG_REQUIRED");
  });
});
