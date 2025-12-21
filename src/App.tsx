import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, Handle, Position } from "reactflow";
import "reactflow/dist/style.css";

import { CardLibraryManager } from "./features/library/CardLibraryManager";
import { DeckBuilder } from "./features/decks/DeckBuilder";
import { ScenarioBuilder } from "./features/scenarios/ScenarioBuilder";

import type { CardEntity, Step, AbilityComponent, ZoneKey, DistanceMetric, TargetingProfile } from "./lib/types";
import { makeDefaultCard, canonicalToGraph, abilitySummary } from "./lib/graph";
import { loadCardJson, saveCardJson, clearSaved } from "./lib/storage";
import { validateCard, type ValidationIssue } from "./lib/schemas";
import { blockRegistry, getStepGroups, isStepTypeAllowed } from "./lib/registry";

import { ExpressionEditor } from "./components/ExpressionEditor";
import { ConditionEditor } from "./components/ConditionEditor";
import { CardPreview } from "./components/CardPreview";

import {
  defaultLibrary,
  exportLibraryJson,
  getLibrarySource,
  importLibraryJson,
  loadLibrary,
  relinkLibraryFromUrl,
  saveLibrary,
  setLibrarySource,
  upsertAbility,
  upsertStep
} from "./lib/repository";

/** ---------------- Utilities ---------------- */
function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function cardFileName(card: CardEntity, suffix: string) {
  const safe = card.name.trim().length ? card.name.trim() : "card";
  return `${safe.replace(/\s+/g, "_").toLowerCase()}_${suffix}.json`;
}

function findAbilityIndexes(card: CardEntity): number[] {
  const out: number[] = [];
  card.components.forEach((c: any, i) => {
    if (c?.componentType === "ABILITY") out.push(i);
  });
  return out;
}

/** Convert any unknown steps into UNKNOWN_STEP so the editor never hard-crashes */
function coerceUnknownSteps(card: any) {
  for (const comp of card.components ?? []) {
    if (comp?.componentType !== "ABILITY") continue;
    if (!comp.execution?.steps) continue;
    comp.execution.steps = comp.execution.steps.map((s: any) => {
      if (!s?.type) return { type: "UNKNOWN_STEP", raw: s };
      if (!isStepTypeAllowed(s.type)) return { type: "UNKNOWN_STEP", raw: s };
      return s;
    });
  }
  return card;
}

/** Minimal in-app migration to keep older exports importable without breaking */
function migrateCardToLatest(raw: any): CardEntity {
  const incoming: any = raw?.projectVersion === "FORGE-1.0" ? raw.card : raw;
  const card = coerceUnknownSteps(incoming ?? {});
  if (!card.schemaVersion) card.schemaVersion = "CJ-1.2";
  if (card.schemaVersion === "CJ-1.0" || card.schemaVersion === "CJ-1.1") {
    // keep permissive; add defaults so new UI/editor paths don’t explode
    card.schemaVersion = "CJ-1.2";
    card.tokenValue = card.tokenValue ?? {};
    card.tags = card.tags ?? [];
    card.attributes = card.attributes ?? [];
    card.subType = card.subType ?? [];
    for (const comp of card.components ?? []) {
      if (comp?.componentType !== "ABILITY") continue;
      comp.cost = comp.cost ?? { ap: 0, tokens: {} };
      comp.targetingProfiles = comp.targetingProfiles ?? [];
      comp.execution = comp.execution ?? { steps: [] };
    }
  }
  return card as CardEntity;
}

/** ---------------- Modal ---------------- */
function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!props.open) return null;
  return (
    <div className="modalBack">
      <div className="panel modal">
        <div className="ph">
          <div className="h2">{props.title}</div>
          <button className="btn" onClick={props.onClose}>
            Close
          </button>
        </div>
        <div className="pb">
          {props.children}
          {props.footer ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>{props.footer}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** ---------------- Error Boundary (so Deck/Scenario view failures show errors) ---------------- */
class ErrorBoundary extends React.Component<{ title: string; children: React.ReactNode }, { err: any }> {
  constructor(props: any) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err: any) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div className="panel" style={{ margin: 12 }}>
          <div className="ph">
            <div className="h2">{this.props.title} crashed</div>
          </div>
          <div className="pb">
            <div className="err">
              <b>Runtime error</b>
              <div className="small">{String(this.state.err?.message ?? this.state.err)}</div>
            </div>
            <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.err?.stack ?? "")}</pre>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

/** ---------------- React Flow node renderers ---------------- */
function AbilityRootNode({ data, selected, card }: any) {
  const ability = card.components[data.abilityIdx] as AbilityComponent | undefined;
  return (
    <div className="node" style={{ borderColor: selected ? "rgba(99,179,255,.6)" : undefined }}>
      <div className="nodeH">
        <div>
          <div className="nodeT">ABILITY_ROOT</div>
          <div className="nodeS">{ability?.name ?? "—"}</div>
        </div>
        <span className="badge">required</span>
      </div>
      <div className="nodeB">{ability ? abilitySummary(ability) : "No ability"}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function MetaNode({ data, selected, card }: any) {
  const ability = card.components[data.abilityIdx] as AbilityComponent | undefined;
  const title = data.kind === "COST" ? "COST" : "TARGETING";
  const desc =
    data.kind === "COST"
      ? `AP: ${ability?.cost?.ap ?? 0}`
      : `${ability?.targetingProfiles?.length ?? 0} profiles`;
  return (
    <div className="node" style={{ borderColor: selected ? "rgba(99,179,255,.6)" : undefined }}>
      <div className="nodeH">
        <div>
          <div className="nodeT">{title}</div>
          <div className="nodeS">{desc}</div>
        </div>
        <span className="badge">select to edit</span>
      </div>
      <div className="nodeB">This is a field group.</div>
      <Handle type="target" position={Position.Left} />
    </div>
  );
}

function ExecNode({ data, selected, card }: any) {
  const ability = card.components[data.abilityIdx] as AbilityComponent | undefined;
  const count = ability?.execution?.steps?.length ?? 0;
  return (
    <div className="node" style={{ borderColor: selected ? "rgba(99,179,255,.6)" : undefined }}>
      <div className="nodeH">
        <div>
          <div className="nodeT">EXECUTION</div>
          <div className="nodeS">{count} steps</div>
        </div>
        <span className="badge">ordered</span>
      </div>
      <div className="nodeB">Steps are nodes below.</div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function StepNode({ data, selected, card }: any) {
  const ability = card.components[data.abilityIdx] as AbilityComponent | undefined;
  const step = ability?.execution?.steps?.[data.stepIdx] as Step | undefined;
  return (
    <div className="node" style={{ borderColor: selected ? "rgba(99,179,255,.6)" : undefined, minWidth: 240 }}>
      <div className="nodeH">
        <div>
          <div className="nodeT">STEP {data.stepIdx + 1}</div>
          <div className="nodeS">{step?.type ?? "—"}</div>
        </div>
        <span className="badge">{step?.type ?? "—"}</span>
      </div>
      <div className="nodeB">{step?.type === "SHOW_TEXT" ? `“${(step as any).text}”` : "Select to edit"}</div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/** ---------------- Main App ---------------- */
type ToolView = "FORGE" | "CATALOG" | "DECKS" | "SCENARIOS";
type UiSelection =
  | null
  | {
      nodeId: string;
      kind: "ABILITY_ROOT" | "COST" | "TARGETING" | "EXEC" | "STEP";
      abilityIdx: number;
      stepIdx?: number;
    };

export default function App() {
  const [tool, setTool] = useState<ToolView>(() => (localStorage.getItem("cj_tool") as ToolView) || "FORGE");
  useEffect(() => localStorage.setItem("cj_tool", tool), [tool]);

  const [card, setCard] = useState<CardEntity>(() => {
    const saved = loadCardJson();
    if (saved) {
      try {
        return migrateCardToLatest(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
    // ensure new defaults don’t crash the newer editor paths
    return migrateCardToLatest(makeDefaultCard());
  });

  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [sel, setSel] = useState<UiSelection>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  // Action Library
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState(() => loadLibrary());
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryUrl, setLibraryUrl] = useState(() => getLibrarySource().url ?? "");

  // Multi-ability
  const abilityIndexes = useMemo(() => findAbilityIndexes(card), [card]);
  const [activeAbilityIdx, setActiveAbilityIdx] = useState<number>(() => {
    const idxs = findAbilityIndexes(migrateCardToLatest(makeDefaultCard()));
    return idxs[0] ?? 0;
  });

  useEffect(() => {
    if (!abilityIndexes.length) return;
    if (!abilityIndexes.includes(activeAbilityIdx)) setActiveAbilityIdx(abilityIndexes[0]);
  }, [abilityIndexes, activeAbilityIdx]);

  useEffect(() => {
    setIssues(validateCard(card));
    saveCardJson(JSON.stringify(card));
  }, [card]);

  useEffect(() => {
    saveLibrary(library);
  }, [library]);

  function getAbilityByIndex(idx: number) {
    const ability = card.components[idx] as any;
    if (!ability || ability.componentType !== "ABILITY") return null;
    return ability as AbilityComponent;
  }
  const ability = getAbilityByIndex(activeAbilityIdx);

  function setAbility(patch: Partial<AbilityComponent>) {
    if (!ability) return;
    setCard({
      ...card,
      components: card.components.map((c: any, i: number) => (i === activeAbilityIdx ? { ...ability, ...patch } : c))
    });
  }

  function setStep(stepIdx: number, patch: any) {
    if (!ability) return;
    const steps = (ability.execution?.steps ?? []).slice();
    steps[stepIdx] = { ...(steps[stepIdx] as any), ...patch };
    setAbility({ execution: { ...(ability.execution ?? {}), steps } } as any);
  }

  function deleteStep(stepIdx: number) {
    if (!ability) return;
    const steps = (ability.execution?.steps ?? []).slice();
    steps.splice(stepIdx, 1);
    setAbility({ execution: { ...(ability.execution ?? {}), steps } } as any);
    setSel(null);
  }

  function moveStep(stepIdx: number, dir: -1 | 1) {
    if (!ability) return;
    const steps = (ability.execution?.steps ?? []).slice();
    const j = stepIdx + dir;
    if (j < 0 || j >= steps.length) return;
    const tmp = steps[stepIdx];
    steps[stepIdx] = steps[j];
    steps[j] = tmp;
    setAbility({ execution: { ...(ability.execution ?? {}), steps } } as any);
  }

  function addStep(stepType: string) {
    if (!ability) return;
    const steps = (ability.execution?.steps ?? []).slice();

    const mk = (): Step => {
      switch (stepType) {
        case "SHOW_TEXT":
          return { type: "SHOW_TEXT", text: "..." } as any;

        case "ROLL_DN":
          return { type: "ROLL_DN", sides: 6, saveAs: "d6" } as any;
        case "ROLL_D6":
          return { type: "ROLL_D6", saveAs: "d6" } as any;
        case "ROLL_D20":
          return { type: "ROLL_D20", saveAs: "d20" } as any;

        case "SET_VARIABLE":
          return { type: "SET_VARIABLE", saveAs: "var", valueExpr: { type: "CONST_NUMBER", value: 1 } } as any;

        case "IF_ELSE":
          return { type: "IF_ELSE", condition: { type: "ALWAYS" }, then: [], elseIf: [], else: [] } as any;

        case "SELECT_TARGETS":
          return {
            type: "SELECT_TARGETS",
            profileId: ability.targetingProfiles?.[0]?.id ?? "primary",
            saveAs: "targets"
          } as any;

        case "FOR_EACH_TARGET":
          return {
            type: "FOR_EACH_TARGET",
            targetSet: { ref: "targets" },
            do: [{ type: "SHOW_TEXT", text: "Per target..." }]
          } as any;

        case "FIND_ADJACENT_ENTITIES":
          return { type: "FIND_ADJACENT_ENTITIES", origin: { type: "ITERATION_TARGET" }, saveAs: "adjacent" } as any;

        case "FIND_ENTITIES_IN_AREA":
          return {
            type: "FIND_ENTITIES_IN_AREA",
            origin: { type: "ITERATION_TARGET" },
            shape: { type: "RADIUS", radius: 1 },
            filter: { excludeSelf: true, allegiance: "ANY" },
            saveAs: "areaTargets"
          } as any;

        case "DEAL_DAMAGE":
          return {
            type: "DEAL_DAMAGE",
            target: { type: "ITERATION_TARGET" },
            amountExpr: { type: "CONST_NUMBER", value: 10 },
            damageType: "PHYSICAL"
          } as any;

        case "HEAL":
          return { type: "HEAL", target: { type: "SELF" }, amountExpr: { type: "CONST_NUMBER", value: 10 } } as any;

        case "APPLY_STATUS":
          return { type: "APPLY_STATUS", target: { type: "ITERATION_TARGET" }, status: "SLOWED", duration: { turns: 1 } } as any;

        case "REMOVE_STATUS":
          return { type: "REMOVE_STATUS", target: { type: "SELF" }, status: "STUNNED" } as any;

        case "SET_ENTITY_STATE":
          return { type: "SET_ENTITY_STATE", target: { type: "SELF" }, key: "caught", valueExpr: { type: "CONST_BOOL", value: true } } as any;

        case "CLEAR_ENTITY_STATE":
          return { type: "CLEAR_ENTITY_STATE", target: { type: "SELF" }, key: "caught" } as any;

        case "NEGATE_DAMAGE":
          return { type: "NEGATE_DAMAGE", reason: "Immunity/Negation" } as any;

        case "REDUCE_DAMAGE":
          return { type: "REDUCE_DAMAGE", amountExpr: { type: "CONST_NUMBER", value: 10 } } as any;

        case "MOVE_ENTITY":
          return { type: "MOVE_ENTITY", target: { type: "SELF" }, to: { mode: "TARGET_POSITION" }, maxTiles: 4 } as any;

        case "PULL_TOWARD":
          return { type: "PULL_TOWARD", target: { type: "TARGET" }, toward: { type: "SELF" }, maxTiles: 4 } as any;

        case "TURN_ENTITY":
          return { type: "TURN_ENTITY", target: { type: "SELF" }, degrees: 180 } as any;

        case "MOVE_VEHICLE":
          return { type: "MOVE_VEHICLE", target: { type: "SELF" }, mode: "FORWARD", tiles: 4, noDiagonal: true, noSideSlip: true } as any;

        case "RAM_COLLISION_RESOLVE":
          return {
            type: "RAM_COLLISION_RESOLVE",
            attacker: { type: "SELF" },
            target: { type: "TARGET" },
            impactDamage: { siege: 50, selfDamage: 20 },
            shockwave: { radius: 1, thresholdStat: "CRD", threshold: 3, status: "PRONE" }
          } as any;

        case "CALC_DISTANCE":
          return { type: "CALC_DISTANCE", metric: "HEX", from: { type: "SELF" }, to: { type: "ITERATION_TARGET" }, saveAs: "distance" } as any;

        case "DRAW_CARDS":
          return { type: "DRAW_CARDS", from: "ACTOR_ACTION_DECK", to: "ACTOR_ACTION_HAND", count: 1, faceUp: false, saveAs: "drawn" } as any;

        case "SEARCH_ZONE":
          return {
            type: "SEARCH_ZONE",
            zone: "ACTOR_ACTION_DISCARD",
            filter: { tags: ["STORM_CLOUD"] },
            takeNExpr: { type: "CONST_NUMBER", value: 1 },
            saveAs: "found"
          } as any;

        case "MOVE_CARDS":
          return { type: "MOVE_CARDS", from: "ACTOR_ACTION_DISCARD", to: "ACTOR_ACTION_HAND", cardsRef: "found" } as any;

        case "SHUFFLE_ZONE":
          return { type: "SHUFFLE_ZONE", zone: "ACTOR_ACTION_DECK" } as any;

        case "PUT_ON_TOP_ORDERED":
          return { type: "PUT_ON_TOP_ORDERED", zone: "ACTOR_ACTION_DECK", cardsRef: "drawn", allowUI: true } as any;

        case "SCHEDULE_STEPS":
          return {
            type: "SCHEDULE_STEPS",
            timing: "START_OF_OPPONENT_NEXT_TURN",
            steps: [{ type: "SHOW_TEXT", text: "Delayed resolution..." }],
            saveTicketAs: "ticket"
          } as any;

        case "SUBSYSTEM_RUN":
          return { type: "SUBSYSTEM_RUN", subsystemId: "STORM_CONVERGENCE", input: { note: "see docs" }, ui: { flowId: "STORM_CONVERGENCE" }, saveAs: "result" } as any;

        case "OPEN_UI_FLOW":
          return { type: "OPEN_UI_FLOW", flowId: "CUSTOM", payload: { note: "open mini-flow UI" }, saveAs: "uiResult" } as any;

        case "WEBHOOK_CALL":
          return { type: "WEBHOOK_CALL", url: "http://localhost:3000/hook", method: "POST", eventName: "event", payload: { hello: "world" } } as any;

        case "AI_REQUEST":
          return {
            type: "AI_REQUEST",
            systemPrompt: "You are a rules assistant. Output strict JSON only.",
            userPrompt: "Given the current card and ability, suggest a balanced damage value.",
            input: { includeCard: true, includeAbility: true, includeStep: false, includeGameState: false },
            outputJsonSchema: { type: "object", properties: { damage: { type: "number" }, note: { type: "string" } }, required: ["damage"] },
            saveAs: "aiResult"
          } as any;

        default:
          return { type: "UNKNOWN_STEP", raw: { type: stepType } } as any;
      }
    };

    steps.push(mk());
    setAbility({ execution: { ...(ability.execution ?? {}), steps } } as any);
  }

  function exportCardJson() {
    const out = { ...card, schemaVersion: "CJ-1.2" } as any;
    download(cardFileName(out, "CJ-1.2"), JSON.stringify(out, null, 2));
  }

  function doImport() {
    setImportError(null);
    try {
      const parsed = migrateCardToLatest(JSON.parse(importText));
      if (!parsed || !String(parsed.schemaVersion || "").startsWith("CJ-")) throw new Error("Expected CJ card JSON (CJ-1.x).");
      setCard(parsed);
      const idxs = findAbilityIndexes(parsed);
      setActiveAbilityIdx(idxs[0] ?? 0);
      setSel(null);
      setImportOpen(false);
      setImportText("");
    } catch (e: any) {
      setImportError(e.message ?? String(e));
    }
  }

  function addAbility() {
    const newAbility: AbilityComponent = {
      componentType: "ABILITY",
      name: "New Ability",
      description: "",
      trigger: "ACTIVE_ACTION",
      cost: { ap: 1, tokens: {} },
      requirements: { type: "ALWAYS" } as any,
      targetingProfiles: [
        {
          id: "primary",
          label: "Primary",
          type: "SINGLE_TARGET",
          origin: "SOURCE",
          range: { base: 4, min: 1, max: 4 },
          lineOfSight: true,
          los: { mode: "HEX_RAYCAST", required: true, blockers: [{ policy: "BLOCK_ALL", tags: ["BARRIER"] }] }
        } as any
      ],
      execution: { steps: [{ type: "SHOW_TEXT", text: "Do something!" } as any] }
    };
    setCard({ ...card, components: [...card.components, newAbility as any] });
    setActiveAbilityIdx(card.components.length);
    setSel(null);
  }

  function removeActiveAbility() {
    if (!ability) return;
    const idxs = findAbilityIndexes(card);
    if (idxs.length <= 1) return;
    const nextComponents = card.components.slice();
    nextComponents.splice(activeAbilityIdx, 1);
    const nextCard = { ...card, components: nextComponents } as CardEntity;
    setCard(nextCard);
    const nextIdxs = findAbilityIndexes(nextCard);
    setActiveAbilityIdx(nextIdxs[0] ?? 0);
    setSel(null);
  }

  // ---------- Action Library helpers ----------
  const selectedStep =
    sel?.kind === "STEP" && ability?.execution?.steps && typeof sel.stepIdx === "number"
      ? (ability.execution.steps[sel.stepIdx] as Step)
      : null;

  function saveActiveAbilityToLibrary() {
    if (!ability) return;
    const id = `${card.id}::${ability.name}`.replace(/\s+/g, "_").toLowerCase();
    const next = upsertAbility(library, { id, name: ability.name, ability });
    setLibrary(next);
  }

  function saveSelectedStepToLibrary() {
    if (!selectedStep) return;
    const id = `${card.id}::step::${selectedStep.type}::${Date.now()}`;
    const next = upsertStep(library, { id, name: selectedStep.type, step: selectedStep });
    setLibrary(next);
  }

  function insertAbilityFromLibrary(libId: string) {
    const entry = library.abilities.find((a) => a.id === libId);
    if (!entry) return;
    setCard({ ...card, components: [...card.components, entry.ability as any] });
  }

  async function relinkFromUrl() {
    setLibraryError(null);
    try {
      const lib = await relinkLibraryFromUrl(libraryUrl.trim());
      setLibrary(lib);
      setLibrarySource({ mode: "url", url: libraryUrl.trim() });
    } catch (e: any) {
      setLibraryError(e.message ?? String(e));
    }
  }

  /** ---------------- Graph ---------------- */
  const { nodes, edges } = useMemo(() => canonicalToGraph(card), [card]);

  const nodeTypes = useMemo(
    () => ({
      abilityRoot: (p: any) => <AbilityRootNode {...p} card={card} />,
      meta: (p: any) => <MetaNode {...p} card={card} />,
      exec: (p: any) => <ExecNode {...p} card={card} />,
      step: (p: any) => <StepNode {...p} card={card} />
    }),
    [card]
  );

  const rfNodes = useMemo(() => {
    const selectedId = sel?.nodeId ?? null;
    return nodes.map((n: any) => ({ ...n, selected: selectedId ? n.id === selectedId : false }));
  }, [nodes, sel]);

  const errorCount = issues.filter((i) => i.severity === "ERROR").length;

  /** ---------------- Tool Views ---------------- */
  if (tool !== "FORGE") {
    return (
      <div className="app">
        <div className="topbar">
          <div className="brand">
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--accent)" }} />
            Captain Jawa Forge <span className="badge">CJ-1.2</span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setTool("FORGE")}>
              Card Builder
            </button>
            <button className="btn" onClick={() => setTool("CATALOG")}>
              Catalog
            </button>
            <button className="btn" onClick={() => setTool("DECKS")}>
              Deck Builder
            </button>
            <button className="btn" onClick={() => setTool("SCENARIOS")}>
              Scenario Builder
            </button>
          </div>
        </div>

        {tool === "CATALOG" ? (
          <ErrorBoundary title="Catalog">
            <CardLibraryManager />
          </ErrorBoundary>
        ) : null}

        {tool === "DECKS" ? (
          <ErrorBoundary title="Deck Builder">
            <DeckBuilder />
          </ErrorBoundary>
        ) : null}

        {tool === "SCENARIOS" ? (
          <ErrorBoundary title="Scenario Builder">
            <ScenarioBuilder />
          </ErrorBoundary>
        ) : null}
      </div>
    );
  }

  /** ---------------- Forge UI ---------------- */
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--accent)" }} />
          Captain Jawa Forge <span className="badge">CJ-1.2</span>
          <span className="badge">{errorCount === 0 ? "OK" : `${errorCount} errors`}</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setTool("CATALOG")}>
            Catalog
          </button>
          <button className="btn" onClick={() => setTool("DECKS")}>
            Deck Builder
          </button>
          <button className="btn" onClick={() => setTool("SCENARIOS")}>
            Scenario Builder
          </button>

          <span style={{ width: 12 }} />

          <button className="btn" onClick={() => setPreviewOpen(true)}>
            Preview Card
          </button>
          <button className="btn" onClick={() => setLibraryOpen(true)}>
            Action Library
          </button>
          <button className="btn" onClick={() => setImportOpen(true)}>
            Import JSON
          </button>
          <button className="btn" onClick={exportCardJson}>
            Export Card JSON
          </button>
          <button className="btn btnPrimary" onClick={addAbility}>
            + Add Ability
          </button>
          <button className="btn btnDanger" onClick={removeActiveAbility} disabled={abilityIndexes.length <= 1}>
            Remove Ability
          </button>
          <button
            className="btn"
            onClick={() => {
              const fresh = migrateCardToLatest(makeDefaultCard());
              setCard(fresh);
              const idxs = findAbilityIndexes(fresh);
              setActiveAbilityIdx(idxs[0] ?? 0);
              setSel(null);
            }}
          >
            New Card
          </button>
          <button
            className="btn btnDanger"
            onClick={() => {
              clearSaved();
              const fresh = migrateCardToLatest(makeDefaultCard());
              setCard(fresh);
              const idxs = findAbilityIndexes(fresh);
              setActiveAbilityIdx(idxs[0] ?? 0);
              setSel(null);
            }}
          >
            Reset Local
          </button>
        </div>
      </div>

      <div className="grid">
        {/* Palette */}
        <div className="panel">
          <div className="ph">
            <div>
              <div className="h2">Palette</div>
              <div className="small">Grouped steps (accordion)</div>
            </div>
            <span className="badge">{blockRegistry.steps.types.length}</span>
          </div>

          <div className="pb">
            <div className="small">Active Ability</div>
            <select
              className="select"
              value={String(activeAbilityIdx)}
              onChange={(e) => {
                setActiveAbilityIdx(Number(e.target.value));
                setSel(null);
              }}
            >
              {abilityIndexes.map((idx) => {
                const a = card.components[idx] as any;
                return (
                  <option key={idx} value={idx}>
                    {a?.name ?? "Ability"} ({a?.trigger ?? "—"})
                  </option>
                );
              })}
            </select>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btnPrimary" style={{ flex: 1 }} onClick={saveActiveAbilityToLibrary}>
                Save Ability → Library
              </button>
              <button className="btn" style={{ flex: 1 }} onClick={saveSelectedStepToLibrary} disabled={!selectedStep}>
                Save Step → Library
              </button>
            </div>

            <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

            {getStepGroups().map((g) => (
              <details key={g.id} open={g.id === "core"} style={{ marginBottom: 10 }}>
                <summary className="small" style={{ cursor: "pointer", fontWeight: 900 }}>
                  {g.label}
                </summary>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {g.types.map((t) => (
                    <div key={t} className="item" onClick={() => addStep(t)}>
                      <b>{t}</b> <span className="small">step</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="panel">
          <div className="ph">
            <div>
              <div className="h2">Logic Canvas</div>
              <div className="small">Click nodes to edit on the right.</div>
            </div>
            <span className="badge">React Flow</span>
          </div>
          <div className="rfWrap">
            <ReactFlow
              nodes={rfNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              onNodeClick={(_, node) => {
                const d: any = node.data ?? {};
                if (!d?.kind || typeof d.abilityIdx !== "number") return;
                setSel({ nodeId: node.id, kind: d.kind, abilityIdx: d.abilityIdx, stepIdx: d.stepIdx });
              }}
              onPaneClick={() => setSel(null)}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        </div>

        {/* Inspector + JSON + Compile */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <div className="panel" style={{ minHeight: 0 }}>
            <div className="ph">
              <div>
                <div className="h2">Inspector</div>
                <div className="small">{sel?.kind ?? "No selection"}</div>
              </div>
              <span className="badge">{card.schemaVersion}</span>
            </div>

            <div className="pb" style={{ overflow: "auto", maxHeight: "55vh" }}>
              <div className="small">Card Name</div>
              <input className="input" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="small">Card Type</div>
                  <select className="select" value={card.type} onChange={(e) => setCard({ ...card, type: e.target.value as any })}>
                    {["UNIT", "ITEM", "ENVIRONMENT", "SPELL", "TOKEN"].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="small">Schema</div>
                  <input className="input" value={card.schemaVersion} disabled />
                </div>
              </div>

              <details style={{ marginTop: 10 }}>
                <summary className="small" style={{ cursor: "pointer" }}>
                  Identity / Art / Tags / State
                </summary>

                <div className="small" style={{ marginTop: 8 }}>
                  Image URL / Path
                </div>
                <input
                  className="input"
                  value={card.visuals?.cardImage ?? ""}
                  onChange={(e) => setCard({ ...card, visuals: { ...(card.visuals ?? {}), cardImage: e.target.value || undefined } })}
                  placeholder="/cards/my_card.png"
                />

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="small">Faction</div>
                    <input className="input" value={card.faction ?? ""} onChange={(e) => setCard({ ...card, faction: e.target.value || undefined })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="small">Types (comma)</div>
                    <input
                      className="input"
                      value={(card.subType ?? []).join(", ")}
                      onChange={(e) => setCard({ ...card, subType: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="ELEMENTAL, SPRITE..."
                    />
                  </div>
                </div>

                <div className="small" style={{ marginTop: 8 }}>
                  Tags (comma)
                </div>
                <input
                  className="input"
                  value={(card.tags ?? []).join(", ")}
                  onChange={(e) => setCard({ ...card, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="MAGICAL, STORM_SPRITE..."
                />

                {card.type === "ENVIRONMENT" ? (
                  <>
                    <div className="small" style={{ marginTop: 10 }}>
                      Environment Placement
                    </div>
                    <select
                      className="select"
                      value={(card as any).environment?.placementMode ?? "TILE"}
                      onChange={(e) =>
                        setCard({
                          ...card,
                          environment: { ...((card as any).environment ?? {}), placementMode: e.target.value }
                        } as any)
                      }
                    >
                      <option value="TILE">TILE (occupies a tile)</option>
                      <option value="GLOBAL">GLOBAL (weather/global state)</option>
                    </select>
                    <div className="small" style={{ marginTop: 6 }}>
                      Global Key (for GLOBAL placement)
                    </div>
                    <input
                      className="input"
                      value={(card as any).environment?.globalKey ?? ""}
                      onChange={(e) =>
                        setCard({ ...card, environment: { ...((card as any).environment ?? {}), globalKey: e.target.value || undefined } } as any)
                      }
                      placeholder="STORM_CLOUD"
                    />
                  </>
                ) : null}

                <div className="small" style={{ marginTop: 10 }}>
                  Custom State Schema (for robust physical→digital mechanics)
                </div>
                <div className="small">Example keys: <b>caught</b>, <b>loaded</b>, <b>facing</b>, <b>stormBonus</b></div>

                <button
                  className="btn"
                  style={{ marginTop: 8 }}
                  onClick={() =>
                    setCard({
                      ...card,
                      stateSchema: { ...(card as any).stateSchema, newKey: { type: "boolean", default: false } }
                    } as any)
                  }
                >
                  + Add State Key
                </button>

                {Object.entries(((card as any).stateSchema ?? {}) as any).map(([k, def]: any) => (
                  <div key={k} className="panel" style={{ marginTop: 8 }}>
                    <div className="pb">
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          className="input"
                          style={{ flex: 1 }}
                          value={k}
                          onChange={(e) => {
                            const next: any = { ...((card as any).stateSchema ?? {}) };
                            const v = next[k];
                            delete next[k];
                            next[e.target.value] = v;
                            setCard({ ...card, stateSchema: next } as any);
                          }}
                        />
                        <select
                          className="select"
                          value={def.type}
                          onChange={(e) => {
                            const next: any = { ...((card as any).stateSchema ?? {}) };
                            next[k] = { ...(next[k] ?? {}), type: e.target.value };
                            setCard({ ...card, stateSchema: next } as any);
                          }}
                        >
                          {["boolean", "number", "string", "enum"].map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btnDanger"
                          onClick={() => {
                            const next: any = { ...((card as any).stateSchema ?? {}) };
                            delete next[k];
                            setCard({ ...card, stateSchema: Object.keys(next).length ? next : undefined } as any);
                          }}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="small" style={{ marginTop: 6 }}>
                        Default
                      </div>
                      <input
                        className="input"
                        value={String(def.default ?? "")}
                        onChange={(e) => {
                          const next: any = { ...((card as any).stateSchema ?? {}) };
                          let v: any = e.target.value;
                          if (def.type === "boolean") v = e.target.value === "true";
                          if (def.type === "number") v = Number(e.target.value);
                          next[k] = { ...(next[k] ?? {}), default: v };
                          setCard({ ...card, stateSchema: next } as any);
                        }}
                        placeholder={def.type === "boolean" ? "true/false" : def.type === "number" ? "0" : "text"}
                      />

                      {def.type === "enum" ? (
                        <>
                          <div className="small" style={{ marginTop: 6 }}>
                            Enum values (comma)
                          </div>
                          <input
                            className="input"
                            value={String((def.enumValues ?? []).join(", "))}
                            onChange={(e) => {
                              const next: any = { ...((card as any).stateSchema ?? {}) };
                              next[k] = { ...(next[k] ?? {}), enumValues: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) };
                              setCard({ ...card, stateSchema: next } as any);
                            }}
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}

                <button className="btn btnPrimary" style={{ marginTop: 10 }} onClick={() => setPreviewOpen(true)}>
                  Open Preview
                </button>
              </details>

              <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

              {!ability ? (
                <div className="err">
                  <b>No ABILITY component</b>
                  <div className="small">Add an ability to use this editor.</div>
                </div>
              ) : (
                <>
                  {/* ABILITY_ROOT */}
                  {(sel?.kind === "ABILITY_ROOT" || !sel?.kind) && (
                    <>
                      <div className="small">Ability Name</div>
                      <input className="input" value={ability.name} onChange={(e) => setAbility({ name: e.target.value })} />

                      <div className="small" style={{ marginTop: 8 }}>
                        Description
                      </div>
                      <textarea className="textarea" value={ability.description ?? ""} onChange={(e) => setAbility({ description: e.target.value })} />

                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div className="small">Trigger</div>
                          <select className="select" value={ability.trigger} onChange={(e) => setAbility({ trigger: e.target.value as any })}>
                            {(blockRegistry.triggers as string[]).map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="small">AP Cost</div>
                          <input
                            className="input"
                            type="number"
                            value={ability.cost?.ap ?? 0}
                            onChange={(e) => setAbility({ cost: { ...(ability.cost ?? { ap: 0, tokens: {} }), ap: Number(e.target.value) } })}
                          />
                        </div>
                      </div>

                      <div className="small" style={{ marginTop: 8 }}>
                        Requirements (Condition)
                      </div>
                      <ConditionEditor value={ability.requirements ?? ({ type: "ALWAYS" } as any)} onChange={(requirements) => setAbility({ requirements })} />

                      <div className="small" style={{ marginTop: 10 }}>
                        Tip
                      </div>
                      <div className="small">
                        Click the <b>COST</b> node to edit token options and dynamic cost modifiers, or the <b>TARGETING</b> node to edit profiles + LoS rules.
                      </div>
                    </>
                  )}

                  {/* COST */}
                  {sel?.kind === "COST" && (
                    <>
                      <div className="h2">Cost</div>

                      <div className="small" style={{ marginTop: 8 }}>
                        Token Cost (AND)
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {(blockRegistry.keys.TokenKey as string[]).map((k) => (
                          <label key={k} className="chip" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontWeight: 900 }}>{k}</span>
                            <input
                              className="input"
                              style={{ width: 70 }}
                              type="number"
                              value={((ability.cost?.tokens ?? {}) as any)[k] ?? 0}
                              onChange={(e) =>
                                setAbility({
                                  cost: {
                                    ...(ability.cost ?? { ap: 0, tokens: {} }),
                                    tokens: { ...(ability.cost?.tokens ?? {}), [k]: Number(e.target.value) }
                                  }
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>

                      <details style={{ marginTop: 10 }}>
                        <summary className="small" style={{ cursor: "pointer" }}>
                          Alternative Token Options (OR)
                        </summary>
                        <div className="small" style={{ marginTop: 6 }}>
                          Example: costs AWR 1 <b>or</b> SPD 1.
                        </div>

                        <button
                          className="btn"
                          style={{ marginTop: 8 }}
                          onClick={() =>
                            setAbility({
                              cost: { ...(ability.cost ?? { ap: 0, tokens: {} }), tokenOptions: [...(ability.cost?.tokenOptions ?? []), {}] }
                            })
                          }
                        >
                          + Add Option
                        </button>

                        {(ability.cost?.tokenOptions ?? []).map((opt: any, idx: number) => (
                          <div key={idx} className="panel" style={{ marginTop: 8 }}>
                            <div className="pb">
                              <div className="small">Option {idx + 1}</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {(blockRegistry.keys.TokenKey as string[]).map((k) => (
                                  <label key={k} className="chip" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ fontWeight: 900 }}>{k}</span>
                                    <input
                                      className="input"
                                      style={{ width: 70 }}
                                      type="number"
                                      value={opt?.[k] ?? 0}
                                      onChange={(e) => {
                                        const next = (ability.cost?.tokenOptions ?? []).slice();
                                        next[idx] = { ...(next[idx] ?? {}), [k]: Number(e.target.value) };
                                        setAbility({ cost: { ...(ability.cost ?? { ap: 0, tokens: {} }), tokenOptions: next } });
                                      }}
                                    />
                                  </label>
                                ))}
                              </div>
                              <button
                                className="btn btnDanger"
                                style={{ marginTop: 8 }}
                                onClick={() => {
                                  const next = (ability.cost?.tokenOptions ?? []).slice();
                                  next.splice(idx, 1);
                                  setAbility({ cost: { ...(ability.cost ?? { ap: 0, tokens: {} }), tokenOptions: next.length ? next : undefined } });
                                }}
                              >
                                Remove Option
                              </button>
                            </div>
                          </div>
                        ))}
                      </details>

                      <details style={{ marginTop: 10 }}>
                        <summary className="small" style={{ cursor: "pointer" }}>
                          Dynamic Cost Modifiers (future-proof)
                        </summary>
                        <div className="small" style={{ marginTop: 6 }}>
                          Use when costs change due to equipment / environment (e.g. Pyramid Crystal reducing Storm Cloud cost).
                        </div>
                        <pre style={{ marginTop: 8 }}>{JSON.stringify((ability.cost as any)?.modifiers ?? [], null, 2)}</pre>
                        <div className="small">Edit in raw JSON for now (schema supports it in CJ-1.2).</div>
                      </details>
                    </>
                  )}

                  {/* TARGETING */}
                  {sel?.kind === "TARGETING" && (
                    <>
                      <div className="h2">Targeting Profiles</div>
                      <div className="small">Profiles drive UI selection + LoS + range validation.</div>

                      <button
                        className="btn btnPrimary"
                        style={{ marginTop: 8 }}
                        onClick={() => {
                          const next: TargetingProfile[] = [...(ability.targetingProfiles ?? [])];
                          next.push({
                            id: `profile_${next.length + 1}`,
                            label: `Profile ${next.length + 1}`,
                            type: "SINGLE_TARGET" as any,
                            origin: "SOURCE" as any,
                            range: { base: 4, min: 1, max: 4 },
                            lineOfSight: true,
                            los: { mode: "HEX_RAYCAST", required: true, blockers: [{ policy: "BLOCK_ALL", tags: ["BARRIER"] }] }
                          } as any);
                          setAbility({ targetingProfiles: next });
                        }}
                      >
                        + Add Profile
                      </button>

                      {(ability.targetingProfiles ?? []).map((p: any, idx: number) => (
                        <div key={p.id ?? idx} className="panel" style={{ marginTop: 10 }}>
                          <div className="pb">
                            <div style={{ display: "flex", gap: 8 }}>
                              <input
                                className="input"
                                style={{ flex: 1 }}
                                value={p.id}
                                onChange={(e) => {
                                  const next = (ability.targetingProfiles ?? []).slice();
                                  next[idx] = { ...next[idx], id: e.target.value };
                                  setAbility({ targetingProfiles: next });
                                }}
                              />
                              <button
                                className="btn btnDanger"
                                onClick={() => {
                                  const next = (ability.targetingProfiles ?? []).slice();
                                  next.splice(idx, 1);
                                  setAbility({ targetingProfiles: next.length ? next : undefined });
                                }}
                              >
                                Remove
                              </button>
                            </div>

                            <div className="small" style={{ marginTop: 8 }}>
                              Label
                            </div>
                            <input
                              className="input"
                              value={p.label ?? ""}
                              onChange={(e) => {
                                const next = (ability.targetingProfiles ?? []).slice();
                                next[idx] = { ...next[idx], label: e.target.value };
                                setAbility({ targetingProfiles: next });
                              }}
                            />

                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                              <div style={{ flex: 1 }}>
                                <div className="small">Type</div>
                                <select
                                  className="select"
                                  value={p.type}
                                  onChange={(e) => {
                                    const next = (ability.targetingProfiles ?? []).slice();
                                    next[idx] = { ...next[idx], type: e.target.value };
                                    setAbility({ targetingProfiles: next });
                                  }}
                                >
                                  {(blockRegistry.targeting.types as string[]).map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div style={{ flex: 1 }}>
                                <div className="small">Origin</div>
                                <select
                                  className="select"
                                  value={p.origin ?? "SOURCE"}
                                  onChange={(e) => {
                                    const next = (ability.targetingProfiles ?? []).slice();
                                    next[idx] = { ...next[idx], origin: e.target.value };
                                    setAbility({ targetingProfiles: next });
                                  }}
                                >
                                  {["SOURCE", "SELF", "ANYWHERE", "MARKER"].map((o) => (
                                    <option key={o} value={o}>
                                      {o}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="small" style={{ marginTop: 8 }}>
                              Range
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <input
                                className="input"
                                type="number"
                                title="min"
                                value={p.range?.min ?? 0}
                                onChange={(e) => {
                                  const next = (ability.targetingProfiles ?? []).slice();
                                  next[idx] = { ...next[idx], range: { ...(p.range ?? {}), min: Number(e.target.value) } };
                                  setAbility({ targetingProfiles: next });
                                }}
                              />
                              <input
                                className="input"
                                type="number"
                                title="max"
                                value={p.range?.max ?? 0}
                                onChange={(e) => {
                                  const next = (ability.targetingProfiles ?? []).slice();
                                  next[idx] = { ...next[idx], range: { ...(p.range ?? {}), max: Number(e.target.value) } };
                                  setAbility({ targetingProfiles: next });
                                }}
                              />
                              <input
                                className="input"
                                type="number"
                                title="base"
                                value={p.range?.base ?? 0}
                                onChange={(e) => {
                                  const next = (ability.targetingProfiles ?? []).slice();
                                  next[idx] = { ...next[idx], range: { ...(p.range ?? {}), base: Number(e.target.value) } };
                                  setAbility({ targetingProfiles: next });
                                }}
                              />
                            </div>

                            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(p.lineOfSight)}
                                onChange={(e) => {
                                  const next = (ability.targetingProfiles ?? []).slice();
                                  next[idx] = { ...next[idx], lineOfSight: e.target.checked };
                                  setAbility({ targetingProfiles: next });
                                }}
                              />
                              Requires line of sight
                            </label>

                            <details style={{ marginTop: 8 }}>
                              <summary className="small" style={{ cursor: "pointer" }}>
                                LoS Rules (blockers / arc shots / overrides)
                              </summary>
                              <pre style={{ marginTop: 8 }}>{JSON.stringify(p.los ?? {}, null, 2)}</pre>
                              <div className="small">Edit in raw JSON for now (CJ-1.2 supports overrides for “spend tokens to arc/ignore”).</div>
                            </details>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* STEP */}
                  {sel?.kind === "STEP" && selectedStep && typeof sel.stepIdx === "number" && (
                    <>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <div className="small">Step Type</div>
                          <div style={{ fontWeight: 900 }}>{selectedStep.type}</div>
                        </div>
                        <button className="btn" onClick={() => moveStep(sel.stepIdx!, -1)} disabled={sel.stepIdx === 0}>
                          ↑
                        </button>
                        <button
                          className="btn"
                          onClick={() => moveStep(sel.stepIdx!, +1)}
                          disabled={(ability.execution?.steps?.length ?? 0) - 1 === sel.stepIdx}
                        >
                          ↓
                        </button>
                        <button className="btn btnDanger" onClick={() => deleteStep(sel.stepIdx!)}>
                          Delete
                        </button>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        {selectedStep.type === "SHOW_TEXT" ? (
                          <>
                            <div className="small">Text</div>
                            <textarea className="textarea" value={(selectedStep as any).text} onChange={(e) => setStep(sel.stepIdx!, { text: e.target.value })} />
                          </>
                        ) : null}

                        {selectedStep.type === "ROLL_DN" ? (
                          <>
                            <div className="small">sides</div>
                            <input className="input" type="number" value={(selectedStep as any).sides ?? 6} onChange={(e) => setStep(sel.stepIdx!, { sides: Number(e.target.value) })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              saveAs
                            </div>
                            <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => setStep(sel.stepIdx!, { saveAs: e.target.value || undefined })} />
                          </>
                        ) : null}

                        {selectedStep.type === "SET_VARIABLE" ? (
                          <>
                            <div className="small">saveAs</div>
                            <input className="input" value={(selectedStep as any).saveAs} onChange={(e) => setStep(sel.stepIdx!, { saveAs: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              valueExpr
                            </div>
                            <ExpressionEditor value={(selectedStep as any).valueExpr} onChange={(valueExpr) => setStep(sel.stepIdx!, { valueExpr })} />
                          </>
                        ) : null}

                        {selectedStep.type === "CALC_DISTANCE" ? (
                          <>
                            <div className="small">metric</div>
                            <select className="select" value={(selectedStep as any).metric} onChange={(e) => setStep(sel.stepIdx!, { metric: e.target.value as DistanceMetric })}>
                              {(blockRegistry.keys.DistanceMetric as string[]).map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              saveAs
                            </div>
                            <input className="input" value={(selectedStep as any).saveAs} onChange={(e) => setStep(sel.stepIdx!, { saveAs: e.target.value })} />
                          </>
                        ) : null}

                        {selectedStep.type === "DRAW_CARDS" ? (
                          <>
                            <div className="small">from</div>
                            <select className="select" value={(selectedStep as any).from} onChange={(e) => setStep(sel.stepIdx!, { from: e.target.value as ZoneKey })}>
                              {(blockRegistry.keys.ZoneKey as string[]).map((z) => (
                                <option key={z} value={z}>
                                  {z}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              to
                            </div>
                            <select className="select" value={(selectedStep as any).to} onChange={(e) => setStep(sel.stepIdx!, { to: e.target.value as ZoneKey })}>
                              {(blockRegistry.keys.ZoneKey as string[]).map((z) => (
                                <option key={z} value={z}>
                                  {z}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              count
                            </div>
                            <input className="input" type="number" value={(selectedStep as any).count} onChange={(e) => setStep(sel.stepIdx!, { count: Number(e.target.value) })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              saveAs
                            </div>
                            <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => setStep(sel.stepIdx!, { saveAs: e.target.value || undefined })} />
                          </>
                        ) : null}

                        {selectedStep.type === "UNKNOWN_STEP" ? (
                          <div className="err">
                            <b>UNKNOWN_STEP</b>
                            <div className="small">This step type isn’t in the registry. Add it to blockRegistry.json.</div>
                          </div>
                        ) : null}
                      </div>

                      <details style={{ marginTop: 10 }}>
                        <summary className="small" style={{ cursor: "pointer" }}>
                          Raw Step JSON
                        </summary>
                        <pre>{JSON.stringify(selectedStep, null, 2)}</pre>
                      </details>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Sticky right-side confirmation/compile bar */}
            <div
              style={{
                position: "sticky",
                bottom: 0,
                padding: 10,
                borderTop: "1px solid var(--border)",
                background: "var(--panel)"
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                <span className="badge">{errorCount === 0 ? "✅ Valid" : `❌ ${errorCount} errors`}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => setPreviewOpen(true)}>
                    Preview
                  </button>
                  <button className="btn btnPrimary" onClick={exportCardJson}>
                    Export
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ minHeight: 0 }}>
            <div className="ph">
              <div>
                <div className="h2">Preview JSON</div>
                <div className="small">Card JSON (read-only)</div>
              </div>
              <span className="badge">{card.schemaVersion}</span>
            </div>
            <div className="pb" style={{ overflow: "auto", maxHeight: "22vh" }}>
              <pre style={{ margin: 0 }}>{JSON.stringify(card, null, 2)}</pre>
            </div>
          </div>

          <div className="panel">
            <div className="ph">
              <div>
                <div className="h2">Compile</div>
                <div className="small">Schema + invariants</div>
              </div>
              <span className="badge">{errorCount} errors</span>
            </div>
            <div className="pb">
              {issues.some((i) => i.severity === "ERROR") ? (
                issues
                  .filter((i) => i.severity === "ERROR")
                  .map((i, idx) => (
                    <div key={idx} className="err">
                      <b>{i.code}</b>
                      <div className="small">{i.message}</div>
                      {i.path ? (
                        <div className="small">
                          <code>{i.path}</code>
                        </div>
                      ) : null}
                    </div>
                  ))
              ) : (
                <div className="ok">
                  <b>✅ OK</b>
                  <div className="small">{issues[0]?.message ?? "No issues."}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Import modal */}
      <Modal
        open={importOpen}
        title="Import CJ Card JSON"
        onClose={() => {
          setImportOpen(false);
          setImportError(null);
        }}
        footer={
          <button className="btn btnPrimary" onClick={doImport}>
            Import
          </button>
        }
      >
        <div className="small" style={{ marginBottom: 8 }}>
          Unknown step types become <code>UNKNOWN_STEP</code>.
        </div>
        {importError ? (
          <div className="err">
            <b>Import error</b>
            <div className="small">{importError}</div>
          </div>
        ) : null}
        <textarea className="textarea" style={{ minHeight: 260 }} value={importText} onChange={(e) => setImportText(e.target.value)} />
      </Modal>

      {/* Card preview modal */}
      <Modal open={previewOpen} title="Card Preview" onClose={() => setPreviewOpen(false)}>
        <CardPreview card={card} />
      </Modal>

      {/* Action Library modal */}
      <Modal
        open={libraryOpen}
        title="Action Library (Abilities / Steps / Profiles)"
        onClose={() => {
          setLibraryOpen(false);
          setLibraryError(null);
        }}
        footer={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => download("cj_action_library.json", exportLibraryJson(library))}>
              Export Library JSON
            </button>
          </div>
        }
      >
        {libraryError ? (
          <div className="err">
            <b>Library error</b>
            <div className="small">{libraryError}</div>
          </div>
        ) : null}

        <div className="small">Relink library source</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="input" value={libraryUrl} onChange={(e) => setLibraryUrl(e.target.value)} placeholder="https://raw.githubusercontent.com/.../cj_action_library.json" />
          <button className="btn" onClick={relinkFromUrl} disabled={!libraryUrl.trim()}>
            Relink (URL)
          </button>
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          Import library JSON file
        </div>
        <input
          className="input"
          type="file"
          accept="application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const next = importLibraryJson(String(reader.result));
                setLibrary(next);
                setLibrarySource({ mode: "local" });
                setLibraryError(null);
              } catch (err: any) {
                setLibraryError(err.message ?? String(err));
              }
            };
            reader.readAsText(file);
          }}
        />

        <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

        <div className="h2">Abilities</div>
        {library.abilities.length === 0 ? <div className="small">No abilities saved yet.</div> : null}
        {library.abilities.map((a) => (
          <div key={a.id} className="item" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div>
              <b>{a.name}</b>
              <div className="small">{a.id}</div>
            </div>
            <button className="btn btnPrimary" onClick={() => insertAbilityFromLibrary(a.id)}>
              + Add to Card
            </button>
          </div>
        ))}

        <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

        <div className="h2">Steps</div>
        {library.steps.length === 0 ? <div className="small">No steps saved yet.</div> : null}
        {library.steps.slice(0, 20).map((s) => (
          <div key={s.id} className="item">
            <b>{s.name}</b> <span className="small">{s.id}</span>
          </div>
        ))}

        <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

        <button
          className="btn"
          onClick={() => {
            setLibrary(defaultLibrary());
            setLibrarySource({ mode: "local" });
          }}
        >
          Reset Library
        </button>
      </Modal>
    </div>
  );
}
