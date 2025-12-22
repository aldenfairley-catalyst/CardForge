/// <reference types="vitest" />

import { describe, expect, it } from "vitest";
import nodeRegistry from "../src/assets/nodeRegistry.json";
import { makeDefaultCard } from "../src/lib/graph";
import { compileAbilityGraph } from "../src/lib/graphIR/compiler";
import { validateGraph } from "../src/lib/graphIR/validateGraph";
import { PinKind, type Graph } from "../src/lib/graphIR/types";
import { materializePins } from "../src/lib/nodes/registry";

type AbilityGraphFixture = { card: any; ability: any };

function makeAbilityFixture(): AbilityGraphFixture {
  const card = makeDefaultCard();
  const ability = card.components.find((c: any) => c.componentType === "ABILITY") as any;
  return { card, ability };
}

function baseGraph(): Graph {
  return { graphVersion: "CJ-GRAPH-1.0", id: "g", label: "test", nodes: [], edges: [] };
}

describe("nodeRegistry.json integrity", () => {
  const registry = nodeRegistry as any;

  it("has unique nodeTypes", () => {
    const nodeTypes = registry.nodes.map((n: any) => n.nodeType);
    expect(new Set(nodeTypes).size).toBe(nodeTypes.length);
  });

  it("materializes unique pin ids per node", () => {
    registry.nodes.forEach((node: any) => {
      const config = node.nodeType === "IF" ? { elseIfCount: 3 } : {};
      const pins = materializePins(node.nodeType, config);
      const ids = pins.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});

describe("graph validation rules", () => {
  it("flags multiple control edges from the same output", () => {
    const { ability } = makeAbilityFixture();
    const graph: Graph = {
      ...baseGraph(),
      nodes: [
        { id: "start", nodeType: "EXEC_START", position: { x: 0, y: 0 }, config: {} },
        { id: "a", nodeType: "SHOW_TEXT", position: { x: 200, y: 0 }, config: { text: "A" } },
        { id: "b", nodeType: "SHOW_TEXT", position: { x: 420, y: -80 }, config: { text: "B" } },
        { id: "c", nodeType: "SHOW_TEXT", position: { x: 420, y: 80 }, config: { text: "C" } }
      ],
      edges: [
        { id: "e-start", edgeKind: PinKind.CONTROL, from: { nodeId: "start", pinId: "execOut" }, to: { nodeId: "a", pinId: "execIn" } },
        { id: "e-ab", edgeKind: PinKind.CONTROL, from: { nodeId: "a", pinId: "execOut" }, to: { nodeId: "b", pinId: "execIn" } },
        { id: "e-ac", edgeKind: PinKind.CONTROL, from: { nodeId: "a", pinId: "execOut" }, to: { nodeId: "c", pinId: "execIn" } }
      ]
    };

    const issues = validateGraph(graph, ability);
    const errors = issues.filter((i) => i.severity === "ERROR").map((i) => i.code);
    expect(errors).toContain("MULTIPLE_EXEC_OUT");
  });

  it("detects control cycles", () => {
    const { ability } = makeAbilityFixture();
    const graph: Graph = {
      ...baseGraph(),
      nodes: [
        { id: "start", nodeType: "EXEC_START", position: { x: 0, y: 0 }, config: {} },
        { id: "a", nodeType: "SHOW_TEXT", position: { x: 200, y: 0 }, config: { text: "A" } },
        { id: "b", nodeType: "SHOW_TEXT", position: { x: 420, y: 0 }, config: { text: "B" } }
      ],
      edges: [
        { id: "e-start", edgeKind: PinKind.CONTROL, from: { nodeId: "start", pinId: "execOut" }, to: { nodeId: "a", pinId: "execIn" } },
        { id: "e-ab", edgeKind: PinKind.CONTROL, from: { nodeId: "a", pinId: "execOut" }, to: { nodeId: "b", pinId: "execIn" } },
        { id: "e-ba", edgeKind: PinKind.CONTROL, from: { nodeId: "b", pinId: "execOut" }, to: { nodeId: "a", pinId: "execIn" } }
      ]
    };

    const issues = validateGraph(graph, ability);
    const errors = issues.filter((i) => i.severity === "ERROR").map((i) => i.code);
    expect(errors).toContain("CONTROL_CYCLE");
  });
});

describe("graph compilation", () => {
  it("compiles Start → ShowText into canonical steps", () => {
    const { ability, card } = makeAbilityFixture();
    const graph: Graph = {
      ...baseGraph(),
      nodes: [
        { id: "start", nodeType: "EXEC_START", position: { x: 0, y: 0 }, config: {} },
        { id: "show", nodeType: "SHOW_TEXT", position: { x: 160, y: 0 }, config: { text: "Hello" } }
      ],
      edges: [
        { id: "e-start-show", edgeKind: PinKind.CONTROL, from: { nodeId: "start", pinId: "execOut" }, to: { nodeId: "show", pinId: "execIn" } }
      ]
    };

    const { steps, issues } = compileAbilityGraph({ graph, ability, card });
    expect(issues.filter((i) => i.severity === "ERROR")).toHaveLength(0);
    expect(steps).toEqual([{ type: "SHOW_TEXT", text: "Hello" }]);
  });

  it("compiles Start → IF with ELSEIF branch", () => {
    const { ability, card } = makeAbilityFixture();
    const graph: Graph = {
      ...baseGraph(),
      nodes: [
        { id: "start", nodeType: "EXEC_START", position: { x: 0, y: 0 }, config: {} },
        { id: "trueCond", nodeType: "CONST_BOOL", position: { x: 0, y: 120 }, config: { value: true } },
        { id: "falseCond", nodeType: "CONST_BOOL", position: { x: 0, y: 220 }, config: { value: false } },
        { id: "if", nodeType: "IF", position: { x: 200, y: 0 }, config: { elseIfCount: 1 } },
        { id: "thenNode", nodeType: "SHOW_TEXT", position: { x: 420, y: -60 }, config: { text: "Then" } },
        { id: "elseIfNode", nodeType: "SHOW_TEXT", position: { x: 420, y: 40 }, config: { text: "ElseIf" } },
        { id: "elseNode", nodeType: "SHOW_TEXT", position: { x: 420, y: 140 }, config: { text: "Else" } }
      ],
      edges: [
        { id: "e-start-if", edgeKind: PinKind.CONTROL, from: { nodeId: "start", pinId: "execOut" }, to: { nodeId: "if", pinId: "execIn" } },
        { id: "e-cond-true", edgeKind: PinKind.DATA, from: { nodeId: "trueCond", pinId: "out" }, to: { nodeId: "if", pinId: "ifCondIn" } },
        { id: "e-cond-false", edgeKind: PinKind.DATA, from: { nodeId: "falseCond", pinId: "out" }, to: { nodeId: "if", pinId: "elseIfCondIn_0" } },
        { id: "e-then", edgeKind: PinKind.CONTROL, from: { nodeId: "if", pinId: "thenExecOut" }, to: { nodeId: "thenNode", pinId: "execIn" } },
        { id: "e-elseif", edgeKind: PinKind.CONTROL, from: { nodeId: "if", pinId: "elseIfExecOut_0" }, to: { nodeId: "elseIfNode", pinId: "execIn" } },
        { id: "e-else", edgeKind: PinKind.CONTROL, from: { nodeId: "if", pinId: "elseExecOut" }, to: { nodeId: "elseNode", pinId: "execIn" } }
      ]
    };

    const { steps, issues } = compileAbilityGraph({ graph, ability, card });
    expect(issues.filter((i) => i.severity === "ERROR")).toHaveLength(0);
    expect(steps).toEqual([
      {
        type: "IF_ELSE",
        condition: { type: "CONST_BOOL", value: true },
        then: [{ type: "SHOW_TEXT", text: "Then" }],
        elseIf: [{ condition: { type: "CONST_BOOL", value: false }, then: [{ type: "SHOW_TEXT", text: "ElseIf" }] }],
        else: [{ type: "SHOW_TEXT", text: "Else" }]
      }
    ]);
  });
});
