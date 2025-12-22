/// <reference types="vitest" />

import { describe, expect, it } from "vitest";
import { materializePins } from "../src/lib/nodes/registry";
import { reconcileGraphEdgesAfterPinChange } from "../src/lib/graphIR/reconcile";
import { PinKind, type GraphEdge } from "../src/lib/graphIR/types";

describe("dynamic IF pins", () => {
  it("materializes ELSEIF pins based on elseIfCount", () => {
    const pins0 = materializePins("IF", { elseIfCount: 0 });
    const ids0 = pins0.map((p) => p.id);
    expect(ids0).not.toContain("elseIfCondIn_0");

    const pins2 = materializePins("IF", { elseIfCount: 2 });
    const ids2 = pins2.map((p) => p.id);
    expect(ids2).toContain("elseIfCondIn_0");
    expect(ids2).toContain("elseIfExecOut_0");
    expect(ids2).toContain("elseIfCondIn_1");
    expect(ids2).toContain("elseIfExecOut_1");
  });
});

describe("edge reconciliation", () => {
  it("removes edges that point to removed pins", () => {
    const oldPins = materializePins("IF", { elseIfCount: 2 });
    const newPins = materializePins("IF", { elseIfCount: 1 });

    const edges: GraphEdge[] = [
      { id: "e1", edgeKind: PinKind.CONTROL, from: { nodeId: "n1", pinId: "execIn" }, to: { nodeId: "n2", pinId: "execIn" } },
      { id: "e2", edgeKind: PinKind.DATA, from: { nodeId: "n3", pinId: "value" }, to: { nodeId: "n1", pinId: "elseIfCondIn_1" } },
      { id: "e3", edgeKind: PinKind.CONTROL, from: { nodeId: "n1", pinId: "elseIfExecOut_1" }, to: { nodeId: "n4", pinId: "execIn" } }
    ];

    const reconciled = reconcileGraphEdgesAfterPinChange("n1", oldPins, newPins, edges);
    const ids = reconciled.map((e) => e.id);
    expect(ids).toContain("e1");
    expect(ids).not.toContain("e2");
    expect(ids).not.toContain("e3");
  });
});
