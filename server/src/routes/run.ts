import { Router } from "express";
import type { DbContext } from "../db";

type RunGraphEdge = {
  edgeKind: string;
  from: { nodeId: string; pinId: string };
  to: { nodeId: string; pinId: string };
};

type RunGraph = {
  id: string;
  nodes: Array<{ id: string; nodeType?: string }>;
  edges: RunGraphEdge[];
};

function requireToken(req: any): boolean {
  const expected = process.env.CJ_AGENT_TOKEN;
  if (!expected) return true;
  const header = String(req.headers?.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : header.trim();
  return token === expected;
}

function buildControlAdjacency(graph: RunGraph) {
  const adj: Record<string, string[]> = {};
  (graph.edges ?? []).forEach((edge: RunGraphEdge) => {
    if (edge.edgeKind !== "CONTROL") return;
    if (!adj[edge.from.nodeId]) adj[edge.from.nodeId] = [];
    adj[edge.from.nodeId].push(edge.to.nodeId);
  });
  return adj;
}

function reachableFrom(graph: RunGraph, startId: string) {
  const adj = buildControlAdjacency(graph);
  const visited = new Set<string>();
  const order: string[] = [];
  const stack = [startId];
  while (stack.length) {
    const cur = stack.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    order.push(cur);
    (adj[cur] ?? []).forEach((next) => {
      if (!visited.has(next)) stack.push(next);
    });
  }
  return order;
}

export function createRunRouter(getDb: () => DbContext) {
  const router = Router();

  router.post("/", (req, res) => {
    if (!requireToken(req)) return res.status(401).json({ error: "Unauthorized" });
    const { db } = getDb();
    const body = req.body ?? {};
    const graphId = body.graphId;
    const mode = body.mode ?? "RUN_FROM_START";
    const startNodeId = body.startNodeId;
    const context = body.context ?? {};

    if (!graphId) return res.status(400).json({ error: "graphId is required" });
    const row = db.prepare("SELECT * FROM graphs WHERE id = ?").get(graphId) as any;
    if (!row) return res.status(404).json({ error: "Graph not found" });
    const graph: RunGraph = typeof row.json === "string" ? JSON.parse(row.json) : row.json;

    const startNode =
      mode === "RUN_FROM_NODE" && startNodeId
        ? startNodeId
        : graph.nodes.find((n: any) => n.nodeType === "EXEC_START")?.id ?? graph.nodes[0]?.id;
    if (!startNode) return res.status(400).json({ error: "Graph is empty" });

    const executionOrder = reachableFrom(graph, startNode);
    const runLog = executionOrder.map((nodeId) => ({ nodeId, status: "OK" as const }));

    res.json({
      graphId,
      mode,
      startNodeId: startNode,
      context,
      runLog,
      outputs: {}
    });
  });

  return router;
}
