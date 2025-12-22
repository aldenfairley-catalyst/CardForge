import { v4 as uuidv4 } from "uuid";
import type { AbilityComponent, CardEntity, Condition, Expression, Step } from "../types";
import { arePinsCompatible, materializePins } from "../nodes/registry";
import { validateGraph } from "./validateGraph";
import { PinKind, type Graph, type GraphEdge, type GraphNode, type PinDefinition } from "./types";

type CompileCtx = {
  graph: Graph;
  ability: AbilityComponent;
  card: CardEntity;
  visited: Set<string>;
  nodeIndex: Map<string, GraphNode>;
  issues: ReturnType<typeof validateGraph>;
};

function findEdgesFrom(ctx: CompileCtx, nodeId: string, pinId: string, kind: PinKind) {
  return ctx.graph.edges.filter((e) => e.edgeKind === kind && e.from.nodeId === nodeId && e.from.pinId === pinId);
}

function findEdgesTo(ctx: CompileCtx, nodeId: string, pinId: string, kind: PinKind) {
  return ctx.graph.edges.filter((e) => e.edgeKind === kind && e.to.nodeId === nodeId && e.to.pinId === pinId);
}

function compileConditionFromPin(ctx: CompileCtx, nodeId: string, pinId: string): Condition | null {
  const incoming = findEdgesTo(ctx, nodeId, pinId, PinKind.DATA);
  if (!incoming.length) return null;
  const edge = incoming[0];
  const sourceNode = ctx.nodeIndex.get(edge.from.nodeId);
  if (!sourceNode) return null;

  if (sourceNode.nodeType === "CONST_BOOL") {
    return { type: "CONST_BOOL", value: Boolean(sourceNode.config?.value ?? true) } as any;
  }

  return null;
}

function compileExpressionFromPin(ctx: CompileCtx, nodeId: string, pinId: string): Expression | null {
  const incoming = findEdgesTo(ctx, nodeId, pinId, PinKind.DATA);
  if (!incoming.length) return null;
  const edge = incoming[0];
  const sourceNode = ctx.nodeIndex.get(edge.from.nodeId);
  if (!sourceNode) return null;

  if (sourceNode.nodeType === "CONST_NUMBER") {
    return { type: "CONST_NUMBER", value: Number(sourceNode.config?.value ?? 0) } as any;
  }

  return null;
}

function compileNode(ctx: CompileCtx, node: GraphNode): Step[] {
  if (ctx.visited.has(node.id)) return [];
  ctx.visited.add(node.id);

  if (node.nodeType === "SHOW_TEXT") {
    const step: Step = { type: "SHOW_TEXT", text: String(node.config?.text ?? "") } as any;
    const outEdges = findEdgesFrom(ctx, node.id, "execOut", PinKind.CONTROL);
    const nextSteps = outEdges.flatMap((e) => {
      const nextNode = ctx.nodeIndex.get(e.to.nodeId);
      return nextNode ? compileNode(ctx, nextNode) : [];
    });
    return [step, ...nextSteps];
  }

  if (node.nodeType === "IF") {
    const condition = compileConditionFromPin(ctx, node.id, "ifCondIn") ?? { type: "ALWAYS" };

    const thenEdge = findEdgesFrom(ctx, node.id, "thenExecOut", PinKind.CONTROL)[0];
    const elseEdge = findEdgesFrom(ctx, node.id, "elseExecOut", PinKind.CONTROL)[0];

    const elseIfPins = materializePins(node.nodeType, node.config).filter((p) => p.id.startsWith("elseIfExecOut_"));

    const thenSteps =
      thenEdge && ctx.nodeIndex.get(thenEdge.to.nodeId) ? compileNode(ctx, ctx.nodeIndex.get(thenEdge.to.nodeId)!) : [];
    const elseSteps =
      elseEdge && ctx.nodeIndex.get(elseEdge.to.nodeId) ? compileNode(ctx, ctx.nodeIndex.get(elseEdge.to.nodeId)!) : [];

    const elseIf = elseIfPins.map((pin) => {
      const idx = pin.id.split("_")[1];
      const condPinId = `elseIfCondIn_${idx}`;
      const cond = compileConditionFromPin(ctx, node.id, condPinId) ?? { type: "ALWAYS" };
      const branchEdge = findEdgesFrom(ctx, node.id, pin.id, PinKind.CONTROL)[0];
      const branchSteps =
        branchEdge && ctx.nodeIndex.get(branchEdge.to.nodeId) ? compileNode(ctx, ctx.nodeIndex.get(branchEdge.to.nodeId)!) : [];
      return { condition: cond, then: branchSteps };
    });

    const step: Step = {
      type: "IF_ELSE",
      condition,
      then: thenSteps,
      elseIf,
      else: elseSteps
    } as any;

    const outEdges = findEdgesFrom(ctx, node.id, "execOut", PinKind.CONTROL);
    const nextSteps = outEdges.flatMap((e) => {
      const nextNode = ctx.nodeIndex.get(e.to.nodeId);
      return nextNode ? compileNode(ctx, nextNode) : [];
    });

    return [step, ...nextSteps];
  }

  const outPin = materializePins(node.nodeType, node.config).find((p) => p.direction === "OUT" && p.kind === PinKind.CONTROL);
  if (outPin) {
    const edges = findEdgesFrom(ctx, node.id, outPin.id, PinKind.CONTROL);
    return edges.flatMap((e) => {
      const nextNode = ctx.nodeIndex.get(e.to.nodeId);
      return nextNode ? compileNode(ctx, nextNode) : [];
    });
  }

  return [];
}

export function compileAbilityGraph({
  graph,
  ability,
  card
}: {
  graph: Graph;
  ability: AbilityComponent;
  card: CardEntity;
}): { steps: Step[]; issues: ReturnType<typeof validateGraph> } {
  const issues = validateGraph(graph, ability);
  const nodeIndex = new Map<string, GraphNode>();
  graph.nodes.forEach((n) => nodeIndex.set(n.id, n));

  const start = graph.nodes.find((n) => n.nodeType === "EXEC_START");
  if (!start) return { steps: [], issues };

  const ctx: CompileCtx = { graph, ability, card, visited: new Set(), nodeIndex, issues };

  // Follow execOut edges
  const execPins = materializePins(start.nodeType, start.config).filter((p) => p.direction === "OUT");
  const steps = execPins.flatMap((pin) => {
    const edges = findEdgesFrom(ctx, start.id, pin.id, PinKind.CONTROL);
    return edges.flatMap((e) => {
      const nextNode = nodeIndex.get(e.to.nodeId);
      return nextNode ? compileNode(ctx, nextNode) : [];
    });
  });

  return { steps, issues };
}
