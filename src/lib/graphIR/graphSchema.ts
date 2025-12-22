import schemaJson from "../../assets/graphSchema.json";
import schemaUrl from "../../assets/graphSchema.json?url";
import type { ValidationIssue } from "../schemas";
import type { ForgeProject, Graph } from "./types";

export const forgeProjectSchema = schemaJson as any;
export const forgeProjectSchemaVersion: string = String(
  (forgeProjectSchema?.properties?.schemaVersion?.const as string | undefined) ?? "CJ-FORGE-PROJECT-1.0"
);
export const forgeProjectProjectVersion: string = String(
  (forgeProjectSchema?.properties?.projectVersion?.const as string | undefined) ?? forgeProjectSchemaVersion
);
const graphVersionSpec = forgeProjectSchema?.definitions?.Graph?.properties?.graphVersion ?? {};
const graphVersionEnum = Array.isArray((graphVersionSpec as any)?.enum)
  ? ((graphVersionSpec as any).enum as Array<string>).map(String)
  : null;
export const forgeGraphSupportedVersions: string[] =
  graphVersionEnum?.length && graphVersionEnum.every((v) => typeof v === "string")
    ? graphVersionEnum
    : [String((graphVersionSpec as any)?.const ?? "CJ-GRAPH-1.0")];
export const forgeGraphVersion: string = forgeGraphSupportedVersions[forgeGraphSupportedVersions.length - 1];
export const forgeProjectSchemaUrl = `${schemaUrl}${schemaUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(
  forgeProjectSchemaVersion
)}`;

type ValidationResult = { project?: ForgeProject; issues: ValidationIssue[] };

type Path = string | undefined;

function push(
  issues: ValidationIssue[],
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  path?: Path
) {
  issues.push({ severity, code, message, path });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateGraphShape(graph: any, path: Path): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(graph)) {
    push(issues, "ERROR", "GRAPH_SHAPE", "Graph must be an object", path);
    return issues;
  }

  const graphPath = path ? `${path}.graphVersion` : "graphVersion";
  if (!forgeGraphSupportedVersions.includes(graph.graphVersion)) {
    push(issues, "ERROR", "GRAPH_VERSION", `graphVersion must be one of ${forgeGraphSupportedVersions.join(", ")}.`, graphPath);
  } else if (graph.graphVersion !== forgeGraphVersion) {
    push(issues, "WARN", "GRAPH_VERSION_OLD", `graphVersion should be '${forgeGraphVersion}' for new graphs.`, graphPath);
  }

  if (typeof graph.id !== "string" || !graph.id.trim()) {
    push(issues, "ERROR", "GRAPH_ID", "Graph id must be a non-empty string", path ? `${path}.id` : "id");
  }

  if (!Array.isArray(graph.nodes)) {
    push(issues, "ERROR", "GRAPH_NODES", "Graph.nodes must be an array", path ? `${path}.nodes` : "nodes");
  } else {
    graph.nodes.forEach((node: any, idx: number) => {
      const nodePath = path ? `${path}.nodes[${idx}]` : `nodes[${idx}]`;
      if (!isRecord(node)) {
        push(issues, "ERROR", "NODE_SHAPE", "Node must be an object", nodePath);
        return;
      }
      if (typeof node.id !== "string" || !node.id.trim()) {
        push(issues, "ERROR", "NODE_ID", "Node id must be a non-empty string", `${nodePath}.id`);
      }
      if (typeof node.nodeType !== "string" || !node.nodeType.trim()) {
        push(issues, "ERROR", "NODE_TYPE", "nodeType must be a non-empty string", `${nodePath}.nodeType`);
      }
      if (!isRecord(node.position)) {
        push(issues, "ERROR", "NODE_POSITION", "position must be an object", `${nodePath}.position`);
      } else {
        if (typeof (node.position as any).x !== "number") {
          push(issues, "ERROR", "NODE_POSITION_X", "position.x must be a number", `${nodePath}.position.x`);
        }
        if (typeof (node.position as any).y !== "number") {
          push(issues, "ERROR", "NODE_POSITION_Y", "position.y must be a number", `${nodePath}.position.y`);
        }
      }
      if (!isRecord(node.config)) {
        push(issues, "ERROR", "NODE_CONFIG", "config must be an object", `${nodePath}.config`);
      }
    });
  }

  if (!Array.isArray(graph.edges)) {
    push(issues, "ERROR", "GRAPH_EDGES", "Graph.edges must be an array", path ? `${path}.edges` : "edges");
  } else {
    graph.edges.forEach((edge: any, idx: number) => {
      const edgePath = path ? `${path}.edges[${idx}]` : `edges[${idx}]`;
      if (!isRecord(edge)) {
        push(issues, "ERROR", "EDGE_SHAPE", "Edge must be an object", edgePath);
        return;
      }
      if (typeof edge.id !== "string" || !edge.id.trim()) {
        push(issues, "ERROR", "EDGE_ID", "Edge id must be a non-empty string", `${edgePath}.id`);
      }
      if (edge.edgeKind !== "CONTROL" && edge.edgeKind !== "DATA") {
        push(issues, "ERROR", "EDGE_KIND", "edgeKind must be CONTROL or DATA", `${edgePath}.edgeKind`);
      }
      const from = edge.from;
      if (!isRecord(from)) {
        push(issues, "ERROR", "EDGE_FROM", "from must be an object", `${edgePath}.from`);
      } else {
        if (typeof from.nodeId !== "string" || !from.nodeId.trim()) {
          push(issues, "ERROR", "EDGE_FROM_NODE", "from.nodeId must be a non-empty string", `${edgePath}.from.nodeId`);
        }
        if (typeof from.pinId !== "string" || !from.pinId.trim()) {
          push(issues, "ERROR", "EDGE_FROM_PIN", "from.pinId must be a non-empty string", `${edgePath}.from.pinId`);
        }
      }
      const to = edge.to;
      if (!isRecord(to)) {
        push(issues, "ERROR", "EDGE_TO", "to must be an object", `${edgePath}.to`);
      } else {
        if (typeof to.nodeId !== "string" || !to.nodeId.trim()) {
          push(issues, "ERROR", "EDGE_TO_NODE", "to.nodeId must be a non-empty string", `${edgePath}.to.nodeId`);
        }
        if (typeof to.pinId !== "string" || !to.pinId.trim()) {
          push(issues, "ERROR", "EDGE_TO_PIN", "to.pinId must be a non-empty string", `${edgePath}.to.pinId`);
        }
      }
    });
  }

  return issues;
}

export function validateForgeProject(raw: any): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(raw)) {
    push(issues, "ERROR", "PROJECT_SHAPE", "Project JSON must be an object.");
    return { issues };
  }

  if (raw.schemaVersion !== forgeProjectSchemaVersion) {
    push(
      issues,
      "ERROR",
      "PROJECT_SCHEMA_VERSION",
      `schemaVersion must be '${forgeProjectSchemaVersion}'.`,
      "schemaVersion"
    );
  }

  if (raw.projectVersion && raw.projectVersion !== forgeProjectProjectVersion) {
    push(
      issues,
      "WARN",
      "PROJECT_VERSION_MISMATCH",
      `projectVersion should be '${forgeProjectProjectVersion}'.`,
      "projectVersion"
    );
  }

  if (typeof raw.cardSchemaVersion !== "string" || !raw.cardSchemaVersion.trim()) {
    push(issues, "ERROR", "CARD_SCHEMA_VERSION", "cardSchemaVersion is required.", "cardSchemaVersion");
  }

  if (!isRecord(raw.card)) {
    push(issues, "ERROR", "CARD_SHAPE", "card must be an object.", "card");
  }

  if (!isRecord(raw.graphs)) {
    push(issues, "ERROR", "GRAPHS_SHAPE", "graphs must be an object map.", "graphs");
  } else {
    Object.entries(raw.graphs).forEach(([graphId, graph]) => {
      const graphIssues = validateGraphShape(graph, `graphs.${graphId}`);
      issues.push(...graphIssues);
    });
  }

  const hasErrors = issues.some((i) => i.severity === "ERROR");
  if (hasErrors) return { issues };

  const project: ForgeProject = {
    ...(raw as ForgeProject),
    schemaVersion: forgeProjectSchemaVersion as ForgeProject["schemaVersion"],
    projectVersion: forgeProjectProjectVersion as ForgeProject["projectVersion"],
    cardSchemaVersion: (raw.cardSchemaVersion as ForgeProject["cardSchemaVersion"]) ?? undefined,
    graphs: (raw.graphs ?? {}) as Record<string, Graph>
  };

  return { project, issues };
}
