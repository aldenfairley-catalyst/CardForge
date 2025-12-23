import { v4 as uuidv4 } from "uuid";
import type { AbilityComponent, CardEntity, Condition, Expression, Step } from "../types";
import { arePinsCompatible, materializePins } from "../nodes/registry";
import { validateGraph } from "./validateGraph";
import { PinKind, type Graph, type GraphEdge, type GraphNode, type GraphSourceMapEntry, type PinDefinition } from "./types";

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

function markStep<T extends Step>(step: T, nodeId: string): T {
  (step as any).__nodeId = nodeId;
  return step;
}

function compileConditionFromPin(ctx: CompileCtx, node: GraphNode, pinId: string): Condition | null {
  const pin = materializePins(node.nodeType, node.config).find((p) => p.id === pinId);
  const incoming = findEdgesTo(ctx, node.id, pinId, PinKind.DATA);
  if (!incoming.length) {
    if (!pin?.required) return { type: "ALWAYS" } as any;
    ctx.issues.push({
      severity: "ERROR",
      code: "MISSING_CONDITION_CONNECTION",
      message: `Condition pin '${pinId}' on ${node.nodeType} must be connected.`,
      path: `nodes.${node.id}.pins.${pinId}`
    });
    return null;
  }
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

type CompiledNode = { steps: Step[]; sourceMap: GraphSourceMapEntry[] };

function compileNode(ctx: CompileCtx, node: GraphNode): CompiledNode {
  if (ctx.visited.has(node.id)) return { steps: [], sourceMap: [] };
  ctx.visited.add(node.id);

  if (node.nodeType === "SHOW_TEXT") {
    const step: Step = markStep({ type: "SHOW_TEXT", text: String(node.config?.text ?? "") } as any, node.id);
    const outEdges = findEdgesFrom(ctx, node.id, "execOut", PinKind.CONTROL);
    const next = outEdges.flatMap((e) => {
      const nextNode = ctx.nodeIndex.get(e.to.nodeId);
      return nextNode ? [compileNode(ctx, nextNode)] : [];
    });
    return {
      steps: [step, ...next.flatMap((n) => n.steps)],
      sourceMap: [{ stepPath: "", nodeId: node.id }, ...next.flatMap((n) => n.sourceMap)]
    };
  }

  if (node.nodeType === "IF") {
    const condition = compileConditionFromPin(ctx, node, "ifCondIn");
    if (!condition) return [];

    const thenEdge = findEdgesFrom(ctx, node.id, "thenExecOut", PinKind.CONTROL)[0];
    const elseEdge = findEdgesFrom(ctx, node.id, "elseExecOut", PinKind.CONTROL)[0];

    const elseIfPins = materializePins(node.nodeType, node.config).filter((p) => p.id.startsWith("elseIfExecOut_"));

    const thenCompiled =
      thenEdge && ctx.nodeIndex.get(thenEdge.to.nodeId) ? compileNode(ctx, ctx.nodeIndex.get(thenEdge.to.nodeId)!) : { steps: [], sourceMap: [] };
    const elseCompiled =
      elseEdge && ctx.nodeIndex.get(elseEdge.to.nodeId) ? compileNode(ctx, ctx.nodeIndex.get(elseEdge.to.nodeId)!) : { steps: [], sourceMap: [] };

    const elseIf = elseIfPins
      .map((pin) => {
        const idx = pin.id.split("_")[1];
        const condPinId = `elseIfCondIn_${idx}`;
        const cond = compileConditionFromPin(ctx, node, condPinId);
        if (!cond) return null;
        const branchEdge = findEdgesFrom(ctx, node.id, pin.id, PinKind.CONTROL)[0];
        const branchCompiled =
          branchEdge && ctx.nodeIndex.get(branchEdge.to.nodeId) ? compileNode(ctx, ctx.nodeIndex.get(branchEdge.to.nodeId)!) : { steps: [], sourceMap: [] };
        return { condition: cond, then: branchCompiled.steps, sourceMap: branchCompiled.sourceMap };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const step: Step = markStep({
      type: "IF_ELSE",
      condition,
      then: thenCompiled.steps,
      elseIf: elseIf.map((entry) => ({ condition: entry.condition, then: entry.then })),
      else: elseCompiled.steps
    } as any, node.id);

    const outEdges = findEdgesFrom(ctx, node.id, "execOut", PinKind.CONTROL);
    const next = outEdges.flatMap((e) => {
      const nextNode = ctx.nodeIndex.get(e.to.nodeId);
      return nextNode ? [compileNode(ctx, nextNode)] : [];
    });

    return {
      steps: [step, ...next.flatMap((n) => n.steps)],
      sourceMap: [
        { stepPath: "", nodeId: node.id },
        ...thenCompiled.sourceMap.map((m) => ({ ...m, stepPath: `then${m.stepPath}` })),
        ...elseIf.flatMap((entry, idx) => entry.sourceMap.map((m) => ({ ...m, stepPath: `elseIf[${idx}].${m.stepPath.replace(/^\./, "")}` }))),
        ...elseCompiled.sourceMap.map((m) => ({ ...m, stepPath: `else${m.stepPath}` })),
        ...next.flatMap((n) => n.sourceMap)
      ]
    };
  }

  if (node.nodeType === "CALL_TOOL") {
    const step: Step = markStep({
      type: "CALL_TOOL",
      toolId: String(node.config?.toolId ?? ""),
      input: node.config?.input ?? {},
      await: node.config?.await ?? true,
      timeoutMs: node.config?.timeoutMs,
      saveAs: node.config?.saveAs
    } as any, node.id);
    const outEdges = findEdgesFrom(ctx, node.id, "execOut", PinKind.CONTROL);
    const next = outEdges.flatMap((e) => {
      const nextNode = ctx.nodeIndex.get(e.to.nodeId);
      return nextNode ? [compileNode(ctx, nextNode)] : [];
    });
    return { steps: [step, ...next.flatMap((n) => n.steps)], sourceMap: [{ stepPath: "", nodeId: node.id }, ...next.flatMap((n) => n.sourceMap)] };
  }

  if (node.nodeType === "REQUIRE") {
    const condition = compileConditionFromPin(ctx, node, "condIn");
    const passEdge = findEdgesFrom(ctx, node.id, "execPass", PinKind.CONTROL)[0];
    const failEdge = findEdgesFrom(ctx, node.id, "execFail", PinKind.CONTROL)[0];
    const passCompiled = passEdge && ctx.nodeIndex.get(passEdge.to.nodeId) ? compileNode(ctx, ctx.nodeIndex.get(passEdge.to.nodeId)!) : { steps: [], sourceMap: [] };
    const failCompiled = failEdge && ctx.nodeIndex.get(failEdge.to.nodeId) ? compileNode(ctx, ctx.nodeIndex.get(failEdge.to.nodeId)!) : { steps: [], sourceMap: [] };
    const step: Step = markStep({
      type: "REQUIRE",
      condition: condition ?? ({ type: "ALWAYS" } as any),
      onFail: failCompiled.steps,
      mode: node.config?.mode ?? "ABORT"
    } as any, node.id);
    return {
      steps: [step, ...passCompiled.steps],
      sourceMap: [
        { stepPath: "", nodeId: node.id },
        ...failCompiled.sourceMap.map((m) => ({ ...m, stepPath: `onFail${m.stepPath}` })),
        ...passCompiled.sourceMap
      ]
    };
  }

  if (node.nodeType === "REGISTER_LISTENER") {
    const when = compileConditionFromPin(ctx, node, "condIn");
    const handlerEdge = findEdgesFrom(ctx, node.id, "execOut", PinKind.CONTROL)[0];
    const handlerCompiled =
      handlerEdge && ctx.nodeIndex.get(handlerEdge.to.nodeId) ? compileNode(ctx, ctx.nodeIndex.get(handlerEdge.to.nodeId)!) : { steps: [], sourceMap: [] };
    const step: Step = markStep({
      type: "REGISTER_LISTENER",
      listenerId: String(node.config?.listenerId ?? ""),
      scope: node.config?.scope ?? "WHILE_EQUIPPED",
      events: Array.isArray(node.config?.events) ? node.config.events : [],
      when: when ?? ({ type: "ALWAYS" } as any),
      then: handlerCompiled.steps
    } as any, node.id);
    return { steps: [step], sourceMap: [{ stepPath: "", nodeId: node.id }, ...handlerCompiled.sourceMap.map((m) => ({ ...m, stepPath: `then${m.stepPath}` }))] };
  }

  const outPin = materializePins(node.nodeType, node.config).find((p) => p.direction === "OUT" && p.kind === PinKind.CONTROL);
  if (outPin) {
    const edges = findEdgesFrom(ctx, node.id, outPin.id, PinKind.CONTROL);
    const next = edges.flatMap((e) => {
      const nextNode = ctx.nodeIndex.get(e.to.nodeId);
      return nextNode ? [compileNode(ctx, nextNode)] : [];
    });
    return { steps: next.flatMap((n) => n.steps), sourceMap: next.flatMap((n) => n.sourceMap) };
  }

  return { steps: [], sourceMap: [] };
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
  const hasErrors = issues.some((i) => i.severity === "ERROR");
  const nodeIndex = new Map<string, GraphNode>();
  graph.nodes.forEach((n) => nodeIndex.set(n.id, n));

  const start = graph.nodes.find((n) => n.nodeType === "EXEC_START");
  if (!start || hasErrors) return { steps: (ability as any).execution?.steps ?? [], issues };

  const ctx: CompileCtx = { graph, ability, card, visited: new Set(), nodeIndex, issues };

  // Follow execOut edges
  const execPins = materializePins(start.nodeType, start.config).filter((p) => p.direction === "OUT");
  const compiled = execPins.flatMap((pin) => {
    const edges = findEdgesFrom(ctx, start.id, pin.id, PinKind.CONTROL);
    return edges.flatMap((e) => {
      const nextNode = nodeIndex.get(e.to.nodeId);
      return nextNode ? [compileNode(ctx, nextNode)] : [];
    });
  });

  if (issues.some((i) => i.severity === "ERROR")) {
    return { steps: (ability as any).execution?.steps ?? [], issues, sourceMap: [] };
  }

  const steps = compiled.flatMap((c) => c.steps);

  // Build source map with stable path strings (e.g., [0], [1].then[0])
  const sourceMap: GraphSourceMapEntry[] = [];
  function walk(arr: Step[], prefix: string) {
    arr.forEach((step, idx) => {
      const path = `${prefix}[${idx}]`;
      const nodeId = (step as any).__nodeId;
      if (nodeId) sourceMap.push({ stepPath: path, nodeId });
      if (nodeId) delete (step as any).__nodeId;

      // Recurse into nested branches for supported step types
      if (step.type === "IF_ELSE") {
        walk((step as any).then ?? [], `${path}.then`);
        ((step as any).elseIf ?? []).forEach((branch: any, i: number) => walk(branch?.then ?? [], `${path}.elseIf[${i}].then`));
        walk((step as any).else ?? [], `${path}.else`);
      }
      if (step.type === "REGISTER_INTERRUPTS") {
        walk((step as any).onInterrupt ?? [], `${path}.onInterrupt`);
      }
      if (step.type === "OPPONENT_SAVE") {
        walk((step as any).onFail ?? [], `${path}.onFail`);
        walk((step as any).onSuccess ?? [], `${path}.onSuccess`);
      }
      if (step.type === "PROPERTY_CONTEST") {
        walk((step as any).onWin ?? [], `${path}.onWin`);
        walk((step as any).onLose ?? [], `${path}.onLose`);
      }
      if (step.type === "REGISTER_LISTENER") {
        walk((step as any).then ?? [], `${path}.then`);
      }
      if (step.type === "REQUIRE") {
        walk((step as any).onFail ?? [], `${path}.onFail`);
      }
    });
  }
  walk(steps, "");

  // strip internal marker
  steps.forEach((s: any) => {
    delete s.__nodeId;
  });

  return { steps, issues, sourceMap };
}
