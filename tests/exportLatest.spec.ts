import { describe, expect, it } from "vitest";
import { makeDefaultCard, makeDefaultGraph, makeDefaultProject } from "../src/lib/graph";
import {
  CARD_LATEST_VERSION,
  FORGE_PROJECT_LATEST_PROJECT_VERSION,
  FORGE_PROJECT_LATEST_SCHEMA_VERSION,
  GRAPH_LATEST_VERSION
} from "../src/lib/versions";

describe("export latest gates", () => {
  it("creates default card at latest version", () => {
    const card = makeDefaultCard();
    expect(card.schemaVersion).toBe(CARD_LATEST_VERSION);
  });

  it("creates default graph at latest version", () => {
    const graph = makeDefaultGraph();
    expect(graph.graphVersion).toBe(GRAPH_LATEST_VERSION);
  });

  it("creates default project with latest versions everywhere", () => {
    const project = makeDefaultProject();
    expect(project.schemaVersion).toBe(FORGE_PROJECT_LATEST_SCHEMA_VERSION);
    expect(project.projectVersion).toBe(FORGE_PROJECT_LATEST_PROJECT_VERSION);
    expect(project.cardSchemaVersion).toBe(CARD_LATEST_VERSION);
    Object.values(project.graphs).forEach((g) => {
      expect(g.graphVersion).toBe(GRAPH_LATEST_VERSION);
    });
  });
});
