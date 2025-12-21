import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, Handle, Position, type Node } from "reactflow";
import "reactflow/dist/style.css";

import { CardLibraryManager } from "./features/library/CardLibraryManager";
import { DeckBuilder } from "./features/decks/DeckBuilder";
import { ScenarioBuilder } from "./features/scenarios/ScenarioBuilder";

import type {
  CardEntity,
  Step,
  AbilityComponent,
  ZoneKey,
  DistanceMetric,
  DamageType,
  StatusKey
} from "./lib/types";

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

type AppMode = "FORGE" | "LIBRARY" | "DECKS" | "SCENARIOS";

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

// ---- React Flow node renderers ----
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

function safeJsonParse(text: string) {
  try {
    return { ok: true as const, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? String(e) };
  }
}

export default function App() {
  const [mode, setMode] = useState<AppMode>("FORGE");

  const [card, setCard] = useState<CardEntity>(() => {
    const saved = loadCardJson();
    if (saved) {
      try {
        return coerceUnknownSteps(JSON.parse(saved)) as CardEntity;
      } catch {
        // ignore
      }
    }
    return makeDefaultCard();
  });

  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
    const idxs = findAbilityIndexes(makeDefaultCard());
    return idxs[0] ?? 0;
  });

  // Target Profile editor state
  const [activeProfileId, setActiveProfileId] = useState<string>("default");

  // Keep activeAbilityIdx valid
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

  // keep activeProfileId valid for current ability
  useEffect(() => {
    const profiles = ability?.targetingProfiles ?? [];
    if (!profiles.length) return;
    const exists = profiles.some((p) => p.id === activeProfileId);
    if (!exists) setActiveProfileId(profiles[0].id);
  }, [ability, activeProfileId]);

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
    setAbility({ execution: { steps } } as any);
  }

  function deleteStep(stepIdx: number) {
    if (!ability) return;
    const steps = (ability.execution?.steps ?? []).slice();
    steps.splice(stepIdx, 1);
    setAbility({ execution: { steps } } as any);
    // keep selection stable: if you deleted the selected step, selection may become invalid
  }

  function moveStep(stepIdx: number, dir: -1 | 1) {
    if (!ability) return;
    const steps = (ability.execution?.steps ?? []).slice();
    const j = stepIdx + dir;
    if (j < 0 || j >= steps.length) return;
    const tmp = steps[stepIdx];
    steps[stepIdx] = steps[j];
    steps[j] = tmp;
    setAbility({ execution: { steps } } as any);
  }

  function addStep(stepType: string) {
    if (!ability) return;
    const steps = (ability.execution?.steps ?? []).slice();

    const mk = (): Step => {
      switch (stepType) {
        case "SHOW_TEXT":
          return { type: "SHOW_TEXT", text: "..." } as any;

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
            profileId: ability.targetingProfiles?.[0]?.id ?? "default",
            saveAs: "targets"
          } as any;

        case "FOR_EACH_TARGET":
          return { type: "FOR_EACH_TARGET", targetSet: { ref: "targets" }, do: [{ type: "SHOW_TEXT", text: "Per target..." }] } as any;

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

        case "MOVE_ENTITY":
          return { type: "MOVE_ENTITY", target: { type: "SELF" }, to: { mode: "TARGET_POSITION" }, maxTiles: 4 } as any;

        case "MOVE_WITH_PATH_CAPTURE":
          return { type: "MOVE_WITH_PATH_CAPTURE", target: { type: "SELF" }, maxTiles: 4, savePassedEnemiesAs: "passedEnemies", ignoreReactions: true } as any;

        case "OPEN_REACTION_WINDOW":
          return { type: "OPEN_REACTION_WINDOW", timing: "BEFORE_DAMAGE", windowId: "pre_damage" } as any;

        case "OPPONENT_SAVE":
          return { type: "OPPONENT_SAVE", stat: "SPEED", difficulty: 13, onFail: [], onSuccess: [] } as any;

        case "CALC_DISTANCE":
          return { type: "CALC_DISTANCE", metric: "HEX", from: { type: "SELF" }, to: { type: "ITERATION_TARGET" }, saveAs: "distance" } as any;

        case "DRAW_CARDS":
          return { type: "DRAW_CARDS", from: "ACTOR_ACTION_DECK", to: "ACTOR_ACTION_HAND", count: 1, faceUp: false, saveAs: "drawn" } as any;

        case "MOVE_CARDS":
          return { type: "MOVE_CARDS", from: "ACTOR_ACTION_HAND", to: "ACTOR_ACTION_DISCARD", selector: { topN: 1 } } as any;

        case "SHUFFLE_ZONE":
          return { type: "SHUFFLE_ZONE", zone: "ACTOR_ACTION_DECK" } as any;

        case "PUT_ON_TOP_ORDERED":
          return { type: "PUT_ON_TOP_ORDERED", zone: "ACTOR_ACTION_DECK", cardsRef: "drawn" } as any;

        case "END_TURN_IMMEDIATELY":
          return { type: "END_TURN_IMMEDIATELY" } as any;

        // ---- NEW: Entity State steps ----
        case "SET_ENTITY_STATE":
          return { type: "SET_ENTITY_STATE", entity: { type: "SELF" }, key: "loaded", value: true } as any;

        case "TOGGLE_ENTITY_STATE":
          return { type: "TOGGLE_ENTITY_STATE", entity: { type: "SELF" }, key: "loaded" } as any;

        case "CLEAR_ENTITY_STATE":
          return { type: "CLEAR_ENTITY_STATE", entity: { type: "SELF" }, key: "loaded" } as any;

        // ---- NEW: Entity Query / TargetSet steps ----
        case "FIND_ENTITIES":
          return {
            type: "FIND_ENTITIES",
            selector: { scope: "BOARD", filters: { tagsAny: [], tagsAll: [] } },
            saveAs: "found"
          } as any;

        case "COUNT_ENTITIES":
          return { type: "COUNT_ENTITIES", targetSet: { ref: "found" }, saveAs: "foundCount" } as any;

        case "FILTER_TARGET_SET":
          return { type: "FILTER_TARGET_SET", source: { ref: "found" }, filter: { tagsAny: [], tagsAll: [] }, saveAs: "filtered" } as any;

        // ---- NEW: Spawn / Despawn ----
        case "SPAWN_ENTITY":
          return { type: "SPAWN_ENTITY", cardId: "token_smoke", owner: "SCENARIO", at: { mode: "TARGET_POSITION" }, saveAs: "spawned" } as any;

        case "DESPAWN_ENTITY":
          return { type: "DESPAWN_ENTITY", target: { type: "ITERATION_TARGET" } } as any;

        // ---- NEW: Deck/Scenario zone utilities ----
        case "EMPTY_HAND":
          return { type: "EMPTY_HAND", handZone: "ACTOR_ACTION_HAND", to: "ACTOR_ACTION_DISCARD" } as any;

        case "ADD_CARDS_TO_DECK":
          return { type: "ADD_CARDS_TO_DECK", deckZone: "ACTOR_ACTION_DECK", cardIds: ["some_card_id"], countEach: 1, shuffleIn: true } as any;

        case "REMOVE_CARDS_FROM_DECK":
          return { type: "REMOVE_CARDS_FROM_DECK", deckZone: "ACTOR_ACTION_DECK", cardIds: ["some_card_id"], countEach: 1, to: "SCENARIO_EXILE" } as any;

        case "SWAP_DECK":
          return { type: "SWAP_DECK", actor: "ACTOR", slot: "ACTION", newDeckId: "deck_id", policy: { onSwap: "DISCARD_HAND" } } as any;

        // ---- UI / Subsystems / Integrations (existing) ----
        case "OPEN_UI_FLOW":
          return { type: "OPEN_UI_FLOW", flowId: "CUSTOM", payload: { note: "open mini-flow UI" }, saveAs: "uiResult" } as any;

        case "REQUEST_PLAYER_CHOICE":
          return { type: "REQUEST_PLAYER_CHOICE", prompt: "Choose one:", choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }], saveAs: "choice" } as any;

        case "REGISTER_INTERRUPTS":
          return { type: "REGISTER_INTERRUPTS", scope: "UNTIL_TURN_END", events: ["ON_MOVE"], onInterrupt: [{ type: "SHOW_TEXT", text: "Interrupted!" }] } as any;

        case "PROPERTY_CONTEST":
          return {
            type: "PROPERTY_CONTEST",
            variant: "STATUS_GAME",
            policy: { shuffleAllDrawnIntoOwnersDeck: true, winnerMayKeepToHandMax: 0 },
            ui: { flowId: "PROPERTY_CONTEST", allowSpectators: true },
            io: { actorPoolRef: "actorPool", opponentPoolRef: "opponentPool", winnerRef: "winner" },
            onWin: [{ type: "SHOW_TEXT", text: "Win branch" }],
            onLose: [{ type: "SHOW_TEXT", text: "Lose branch" }]
          } as any;

        case "WEBHOOK_CALL":
          return { type: "WEBHOOK_CALL", url: "http://localhost:3000/hook", method: "POST", eventName: "event", payload: { hello: "world" } } as any;

        case "EMIT_EVENT":
          return { type: "EMIT_EVENT", eventName: "MY_EVENT", payload: { note: "internal event bus" } } as any;

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
    setAbility({ execution: { steps } } as any);
  }

  function exportCardJson() {
    // keep suffix stable; schemaVersion is stored in card.schemaVersion
    download(cardFileName(card, card.schemaVersion), JSON.stringify(card, null, 2));
  }

  function doImport() {
    setImportError(null);
    try {
      const parsed = coerceUnknownSteps(JSON.parse(importText));
      const incoming: CardEntity = parsed?.projectVersion === "FORGE-1.0" ? parsed.card : parsed;
      if (!incoming?.schemaVersion || typeof incoming.schemaVersion !== "string") {
        throw new Error("Expected CJ card JSON with schemaVersion.");
      }
      // validator now handles CJ-1.0/1.1/1.2; we don't hard-block here
      setCard(incoming);
      const idxs = findAbilityIndexes(incoming);
      setActiveAbilityIdx(idxs[0] ?? 0);
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
      targetingProfiles: [
        {
          id: "default",
          label: "Default",
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
    // keep selection stable: do not force clear unless you want
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
    setSelectedNodeId(null);
  }

  // ---------- Action Library helpers ----------
  function saveActiveAbilityToLibrary() {
    if (!ability) return;
    const id = `${card.id}::${ability.name}`.replace(/\s+/g, "_").toLowerCase();
    const next = upsertAbility(library, { id, name: ability.name, ability });
    setLibrary(next);
  }

  function saveSelectedStepToLibrary(selectedStep: Step) {
    const id = `${card.id}::step::${(selectedStep as any).type}::${Date.now()}`;
    const next = upsertStep(library, { id, name: (selectedStep as any).type, step: selectedStep });
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

  // --- ReactFlow graph (with persistent selection) ---
  const { nodes, edges } = useMemo(() => {
    const comps = card.components.slice();
    const firstAbilityIdx = comps.findIndex((c: any) => c?.componentType === "ABILITY");
    if (firstAbilityIdx < 0 || activeAbilityIdx === firstAbilityIdx) {
      const g = canonicalToGraph(card);
      const patched = g.nodes.map((n: any) => ({ ...n, selected: selectedNodeId === n.id }));
      return { nodes: patched, edges: g.edges };
    }

    const tmp = comps[firstAbilityIdx];
    comps[firstAbilityIdx] = comps[activeAbilityIdx];
    comps[activeAbilityIdx] = tmp;

    const viewCard = { ...card, components: comps } as CardEntity;
    const g = canonicalToGraph(viewCard);

    const patchedNodes = g.nodes.map((n: any) => {
      const next = { ...n, selected: selectedNodeId === n.id };
      if (typeof next?.data?.abilityIdx === "number") {
        next.data = { ...next.data, abilityIdx: activeAbilityIdx };
      }
      return next;
    });

    return { nodes: patchedNodes, edges: g.edges };
  }, [card, activeAbilityIdx, selectedNodeId]);

  // clear selection if node no longer exists
  useEffect(() => {
    if (!selectedNodeId) return;
    if (!nodes.some((n: any) => n.id === selectedNodeId)) setSelectedNodeId(null);
  }, [nodes, selectedNodeId]);

  const errorCount = issues.filter((i) => i.severity === "ERROR").length;

  const nodeTypes = useMemo(
    () => ({
      abilityRoot: (p: any) => <AbilityRootNode {...p} card={card} />,
      meta: (p: any) => <MetaNode {...p} card={card} />,
      exec: (p: any) => <ExecNode {...p} card={card} />,
      step: (p: any) => <StepNode {...p} card={card} />
    }),
    [card]
  );

  // derive selected node data from id (stable)
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return (nodes as any[]).find((n) => n.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  const selectedInfo = (selectedNode as any)?.data ?? null;
  const selectedKind = selectedInfo?.kind ?? null;

  const selectedStepIdx = selectedKind === "STEP" ? selectedInfo.stepIdx : null;
  const selectedStep =
    selectedStepIdx != null && ability?.execution?.steps ? (ability.execution.steps[selectedStepIdx] as Step) : null;

  // ---- Target profile editing helpers ----
  const profiles = ability?.targetingProfiles ?? [];
  const activeProfile = profiles.find((p: any) => p.id === activeProfileId) ?? profiles[0];

  function setProfiles(nextProfiles: any[]) {
    setAbility({ targetingProfiles: nextProfiles } as any);
  }

  function ensureUniqueProfileId(base: string) {
    const existing = new Set((profiles ?? []).map((p: any) => p.id));
    if (!existing.has(base)) return base;
    let i = 2;
    while (existing.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }

  function addProfile() {
    const id = ensureUniqueProfileId("profile");
    const next = [
      ...(profiles ?? []),
      {
        id,
        label: "New Profile",
        type: "SINGLE_TARGET",
        origin: "SOURCE",
        range: { base: 4, min: 1, max: 4 },
        lineOfSight: true,
        los: { mode: "HEX_RAYCAST", required: true, blockers: [{ policy: "BLOCK_ALL", tags: ["BARRIER"] }] }
      }
    ];
    setProfiles(next);
    setActiveProfileId(id);
  }

  function removeProfile(id: string) {
    if (!profiles?.length) return;
    if (profiles.length <= 1) return;
    const next = profiles.filter((p: any) => p.id !== id);
    setProfiles(next);
    setActiveProfileId(next[0]?.id ?? "default");
  }

  // ---- Render non-FORGE modes ----
  if (mode !== "FORGE") {
    return (
      <div className="app">
        <div className="topbar">
          <div className="brand">
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--accent)" }} />
            Captain Jawa Forge <span className="badge">{card.schemaVersion}</span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={`btn ${mode === "FORGE" ? "btnPrimary" : ""}`} onClick={() => setMode("FORGE")}>
              Forge
            </button>
            <button className={`btn ${mode === "LIBRARY" ? "btnPrimary" : ""}`} onClick={() => setMode("LIBRARY")}>
              Library
            </button>
            <button className={`btn ${mode === "DECKS" ? "btnPrimary" : ""}`} onClick={() => setMode("DECKS")}>
              Decks
            </button>
            <button className={`btn ${mode === "SCENARIOS" ? "btnPrimary" : ""}`} onClick={() => setMode("SCENARIOS")}>
              Scenarios
            </button>
          </div>
        </div>

        <div style={{ padding: 12 }}>
          <div className="panel">
            <div className="ph">
              <div className="h2">
                {mode === "LIBRARY" ? "Card Library" : mode === "DECKS" ? "Deck Builder" : "Scenario Builder"}
              </div>
              <span className="badge">MVP</span>
            </div>
            <div className="pb">
              {mode === "LIBRARY" ? <CardLibraryManager /> : null}
              {mode === "DECKS" ? <DeckBuilder /> : null}
              {mode === "SCENARIOS" ? <ScenarioBuilder /> : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- FORGE UI ----
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--accent)" }} />
          Captain Jawa Forge <span className="badge">{card.schemaVersion}</span>
          <span className="badge">{errorCount === 0 ? "OK" : `${errorCount} errors`}</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={`btn ${mode === "FORGE" ? "btnPrimary" : ""}`} onClick={() => setMode("FORGE")}>
            Forge
          </button>
          <button className={`btn ${mode === "LIBRARY" ? "btnPrimary" : ""}`} onClick={() => setMode("LIBRARY")}>
            Library
          </button>
          <button className={`btn ${mode === "DECKS" ? "btnPrimary" : ""}`} onClick={() => setMode("DECKS")}>
            Decks
          </button>
          <button className={`btn ${mode === "SCENARIOS" ? "btnPrimary" : ""}`} onClick={() => setMode("SCENARIOS")}>
            Scenarios
          </button>

          <span style={{ width: 1, background: "var(--border)", opacity: 0.6, margin: "0 6px" }} />

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
              const fresh = makeDefaultCard();
              setCard(fresh);
              const idxs = findAbilityIndexes(fresh);
              setActiveAbilityIdx(idxs[0] ?? 0);
              setSelectedNodeId(null);
            }}
          >
            New Card
          </button>
          <button
            className="btn btnDanger"
            onClick={() => {
              clearSaved();
              const fresh = makeDefaultCard();
              setCard(fresh);
              const idxs = findAbilityIndexes(fresh);
              setActiveAbilityIdx(idxs[0] ?? 0);
              setSelectedNodeId(null);
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
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => selectedStep && saveSelectedStepToLibrary(selectedStep)}
                disabled={!selectedStep}
              >
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
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
              onNodeClick={(_, n) => setSelectedNodeId(n.id)}
              onPaneClick={() => setSelectedNodeId(null)}
            >
              <Background />
              <Controls position="bottom-right" />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        </div>

        {/* Inspector + JSON + Compile */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <div className="panel">
            <div className="ph">
              <div>
                <div className="h2">Inspector</div>
                <div className="small">{selectedKind ?? "No selection"}</div>
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
                  Card Art + Identity
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
                    <div className="small">Image Align</div>
                    <select
                      className="select"
                      value={card.visuals?.imageAlign ?? "CENTER"}
                      onChange={(e) => setCard({ ...card, visuals: { ...(card.visuals ?? {}), imageAlign: e.target.value as any } })}
                    >
                      {["TOP", "CENTER", "BOTTOM", "LEFT", "RIGHT"].map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="small">Image Fit</div>
                    <select
                      className="select"
                      value={card.visuals?.imageFit ?? "COVER"}
                      onChange={(e) => setCard({ ...card, visuals: { ...(card.visuals ?? {}), imageFit: e.target.value as any } })}
                    >
                      {["COVER", "CONTAIN"].map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

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
                      placeholder="HUMAN, DUELIST..."
                    />
                  </div>
                </div>

                <div className="small" style={{ marginTop: 8 }}>
                  Printed Token Value (for contests)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {((blockRegistry.keys.TokenKey as string[]) ?? []).map((k) => (
                    <label key={k} className="chip" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontWeight: 900 }}>{k}</span>
                      <input
                        className="input"
                        style={{ width: 70 }}
                        type="number"
                        value={(card.tokenValue as any)?.[k] ?? 0}
                        onChange={(e) =>
                          setCard({
                            ...card,
                            tokenValue: { ...(card.tokenValue ?? {}), [k]: Number(e.target.value) }
                          })
                        }
                      />
                    </label>
                  ))}
                </div>

                {card.type === "UNIT" ? (
                  <>
                    <div className="small" style={{ marginTop: 10 }}>
                      Unit Stats
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <input
                        className="input"
                        type="number"
                        title="HP max"
                        value={card.stats?.hp?.max ?? 100}
                        onChange={(e) => {
                          const max = Number(e.target.value);
                          setCard({
                            ...card,
                            stats: {
                              ...(card.stats ?? {}),
                              hp: { current: Math.min(card.stats?.hp?.current ?? max, max), max }
                            }
                          });
                        }}
                      />
                      <input
                        className="input"
                        type="number"
                        title="AP max"
                        value={card.stats?.ap?.max ?? 2}
                        onChange={(e) => {
                          const max = Number(e.target.value);
                          setCard({
                            ...card,
                            stats: {
                              ...(card.stats ?? {}),
                              ap: { current: Math.min(card.stats?.ap?.current ?? max, max), max }
                            }
                          });
                        }}
                      />
                      <input
                        className="input"
                        type="number"
                        title="MOVE"
                        value={card.stats?.movement ?? 4}
                        onChange={(e) => setCard({ ...card, stats: { ...(card.stats ?? {}), movement: Number(e.target.value) } })}
                      />
                      <input
                        className="input"
                        type="number"
                        title="SIZE"
                        value={card.stats?.size ?? 1}
                        onChange={(e) => setCard({ ...card, stats: { ...(card.stats ?? {}), size: Number(e.target.value) } })}
                      />
                    </div>
                  </>
                ) : null}

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
                  {/* Ability Root editor */}
                  {(selectedKind === "ABILITY_ROOT" || !selectedKind) && (
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
                            {((blockRegistry.triggers as string[]) ?? []).map((t) => (
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
                            onChange={(e) => setAbility({ cost: { ...(ability.cost ?? { ap: 0 }), ap: Number(e.target.value) } })}
                          />
                        </div>
                      </div>

                      <div className="small" style={{ marginTop: 8 }}>
                        Token Cost (AND)
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {((blockRegistry.keys.TokenKey as string[]) ?? []).map((k) => (
                          <label key={k} className="chip" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontWeight: 900 }}>{k}</span>
                            <input
                              className="input"
                              style={{ width: 70 }}
                              type="number"
                              value={((ability.cost as any)?.tokens as any)?.[k] ?? 0}
                              onChange={(e) =>
                                setAbility({
                                  cost: {
                                    ...(ability.cost ?? { ap: 0 }),
                                    tokens: { ...((ability.cost as any)?.tokens ?? {}), [k]: Number(e.target.value) }
                                  } as any
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
                              cost: { ...(ability.cost ?? { ap: 0 }), tokenOptions: [...(((ability.cost as any)?.tokenOptions ?? []) as any[]), {}] } as any
                            })
                          }
                        >
                          + Add Option
                        </button>
                        {(((ability.cost as any)?.tokenOptions ?? []) as any[]).map((opt, idx) => (
                          <div key={idx} className="panel" style={{ marginTop: 8 }}>
                            <div className="pb">
                              <div className="small">Option {idx + 1}</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {((blockRegistry.keys.TokenKey as string[]) ?? []).map((k) => (
                                  <label key={k} className="chip" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ fontWeight: 900 }}>{k}</span>
                                    <input
                                      className="input"
                                      style={{ width: 70 }}
                                      type="number"
                                      value={(opt as any)?.[k] ?? 0}
                                      onChange={(e) => {
                                        const next = ([...(((ability.cost as any)?.tokenOptions ?? []) as any[])] as any[]);
                                        next[idx] = { ...(next[idx] as any), [k]: Number(e.target.value) };
                                        setAbility({ cost: { ...(ability.cost ?? { ap: 0 }), tokenOptions: next } as any });
                                      }}
                                    />
                                  </label>
                                ))}
                              </div>

                              <button
                                className="btn btnDanger"
                                style={{ marginTop: 8 }}
                                onClick={() => {
                                  const next = ([...(((ability.cost as any)?.tokenOptions ?? []) as any[])] as any[]);
                                  next.splice(idx, 1);
                                  setAbility({ cost: { ...(ability.cost ?? { ap: 0 }), tokenOptions: next.length ? next : undefined } as any });
                                }}
                              >
                                Remove Option
                              </button>
                            </div>
                          </div>
                        ))}
                      </details>

                      <div className="small" style={{ marginTop: 10 }}>
                        Requirements (Condition)
                      </div>
                      <ConditionEditor value={(ability as any).requirements ?? { type: "ALWAYS" }} onChange={(requirements) => setAbility({ requirements } as any)} />
                    </>
                  )}

                  {/* COST editor (Meta node) */}
                  {selectedKind === "COST" && (
                    <>
                      <div className="small">Required Equipped Item IDs (comma)</div>
                      <input
                        className="input"
                        value={(((ability.cost as any)?.requiredEquippedItemIds ?? []) as string[]).join(", ")}
                        onChange={(e) =>
                          setAbility({
                            cost: {
                              ...(ability.cost ?? { ap: 0 }),
                              requiredEquippedItemIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                            } as any
                          })
                        }
                      />

                      <div className="small" style={{ marginTop: 8 }}>
                        Cooldown (turns)
                      </div>
                      <input
                        className="input"
                        type="number"
                        value={(ability.cost as any)?.cooldown?.turns ?? 0}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setAbility({
                            cost: { ...(ability.cost ?? { ap: 0 }), cooldown: n > 0 ? { turns: Math.max(1, Math.floor(n)) } : undefined } as any
                          });
                        }}
                      />
                    </>
                  )}

                  {/* TARGETING editor (Meta node) */}
                  {selectedKind === "TARGETING" && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div>
                          <div className="small">Target Profiles</div>
                          <div className="small">Use multiple profiles for primary + secondary targets.</div>
                        </div>
                        <button className="btn btnPrimary" onClick={addProfile}>
                          + Add Profile
                        </button>
                      </div>

                      <div className="small" style={{ marginTop: 8 }}>
                        Active Profile
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <select className="select" value={activeProfile?.id ?? ""} onChange={(e) => setActiveProfileId(e.target.value)} style={{ flex: 1 }}>
                          {(profiles ?? []).map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.id} — {p.label ?? ""}
                            </option>
                          ))}
                        </select>
                        <button className="btn btnDanger" onClick={() => removeProfile(activeProfile?.id)} disabled={(profiles?.length ?? 0) <= 1}>
                          Remove
                        </button>
                      </div>

                      {activeProfile ? (
                        <>
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div className="small">id</div>
                              <input
                                className="input"
                                value={activeProfile.id}
                                onChange={(e) => {
                                  const nextId = e.target.value.trim();
                                  if (!nextId) return;
                                  const dup = profiles.some((p: any) => p.id === nextId && p !== activeProfile);
                                  if (dup) return;
                                  const next = profiles.map((p: any) => (p === activeProfile ? { ...p, id: nextId } : p));
                                  setProfiles(next);
                                  setActiveProfileId(nextId);
                                }}
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div className="small">label</div>
                              <input
                                className="input"
                                value={activeProfile.label ?? ""}
                                onChange={(e) => setProfiles(profiles.map((p: any) => (p === activeProfile ? { ...p, label: e.target.value } : p)))}
                              />
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div className="small">type</div>
                              <select
                                className="select"
                                value={activeProfile.type ?? "SINGLE_TARGET"}
                                onChange={(e) => {
                                  const type = e.target.value;
                                  const next = profiles.map((p: any) =>
                                    p === activeProfile
                                      ? {
                                          ...p,
                                          type,
                                          area:
                                            type === "AREA_RADIUS" || type === "AREA_AROUND_TARGET"
                                              ? { ...(p.area ?? { radius: 1, includeCenter: true }) }
                                              : undefined
                                        }
                                      : p
                                  );
                                  setProfiles(next);
                                }}
                              >
                                {((blockRegistry.targeting?.types as string[]) ?? []).map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div style={{ flex: 1 }}>
                              <div className="small">origin</div>
                              <select
                                className="select"
                                value={activeProfile.origin ?? "SOURCE"}
                                onChange={(e) => setProfiles(profiles.map((p: any) => (p === activeProfile ? { ...p, origin: e.target.value } : p)))}
                              >
                                {((blockRegistry.targeting?.origins as string[]) ?? ["SOURCE", "TARGET", "ANYWHERE"]).map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="small" style={{ marginTop: 8 }}>
                            originRef (optional; for secondary profiles that depend on a previous selection)
                          </div>
                          <input
                            className="input"
                            value={activeProfile.originRef ?? ""}
                            onChange={(e) => setProfiles(profiles.map((p: any) => (p === activeProfile ? { ...p, originRef: e.target.value || undefined } : p)))}
                            placeholder='e.g. "targets_primary"'
                          />

                          <div className="small" style={{ marginTop: 8 }}>
                            Range
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                            <input
                              className="input"
                              type="number"
                              title="base"
                              value={activeProfile.range?.base ?? 0}
                              onChange={(e) => {
                                const base = Math.max(0, Math.floor(Number(e.target.value)));
                                setProfiles(profiles.map((p: any) => (p === activeProfile ? { ...p, range: { ...(p.range ?? {}), base } } : p)));
                              }}
                            />
                            <input
                              className="input"
                              type="number"
                              title="min"
                              value={activeProfile.range?.min ?? 0}
                              onChange={(e) => {
                                const min = Math.max(0, Math.floor(Number(e.target.value)));
                                setProfiles(profiles.map((p: any) => (p === activeProfile ? { ...p, range: { ...(p.range ?? {}), min } } : p)));
                              }}
                            />
                            <input
                              className="input"
                              type="number"
                              title="max"
                              value={activeProfile.range?.max ?? (activeProfile.range?.base ?? 0)}
                              onChange={(e) => {
                                const max = Math.max(0, Math.floor(Number(e.target.value)));
                                setProfiles(profiles.map((p: any) => (p === activeProfile ? { ...p, range: { ...(p.range ?? {}), max } } : p)));
                              }}
                            />
                          </div>

                          <div className="small" style={{ marginTop: 8 }}>
                            Line of Sight
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <select
                              className="select"
                              value={String(activeProfile.lineOfSight ?? false)}
                              onChange={(e) => setProfiles(profiles.map((p: any) => (p === activeProfile ? { ...p, lineOfSight: e.target.value === "true" } : p)))}
                            >
                              <option value="false">false</option>
                              <option value="true">true</option>
                            </select>

                            <select
                              className="select"
                              value={activeProfile.los?.mode ?? "HEX_RAYCAST"}
                              onChange={(e) =>
                                setProfiles(
                                  profiles.map((p: any) =>
                                    p === activeProfile ? { ...p, los: { ...(p.los ?? { required: true }), mode: e.target.value } } : p
                                  )
                                )
                              }
                              title="los.mode"
                            >
                              {(((blockRegistry.keys as any)?.LoSMode as string[]) ?? ["HEX_RAYCAST", "SQUARE_RAYCAST", "NONE", "ADVISORY"]).map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>

                            <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input
                                type="checkbox"
                                checked={Boolean(activeProfile.los?.required ?? true)}
                                onChange={(e) =>
                                  setProfiles(
                                    profiles.map((p: any) =>
                                      p === activeProfile ? { ...p, los: { ...(p.los ?? { mode: "HEX_RAYCAST" }), required: e.target.checked } } : p
                                    )
                                  )
                                }
                              />
                              required
                            </label>
                          </div>

                          <details style={{ marginTop: 10 }}>
                            <summary className="small" style={{ cursor: "pointer" }}>
                              LoS Blockers (tags/policy)
                            </summary>

                            <button
                              className="btn"
                              style={{ marginTop: 8 }}
                              onClick={() => {
                                const blockers = [...(activeProfile.los?.blockers ?? [])];
                                blockers.push({ policy: "BLOCK_ALL", tags: ["BARRIER"] });
                                setProfiles(
                                  profiles.map((p: any) =>
                                    p === activeProfile
                                      ? { ...p, los: { ...(p.los ?? { mode: "HEX_RAYCAST", required: true }), blockers } }
                                      : p
                                  )
                                );
                              }}
                            >
                              + Add blocker
                            </button>

                            {(activeProfile.los?.blockers ?? []).map((b: any, bi: number) => (
                              <div key={bi} className="panel" style={{ marginTop: 8 }}>
                                <div className="pb">
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <select
                                      className="select"
                                      value={b.policy ?? "BLOCK_ALL"}
                                      onChange={(e) => {
                                        const blockers = [...(activeProfile.los?.blockers ?? [])];
                                        blockers[bi] = { ...blockers[bi], policy: e.target.value };
                                        setProfiles(
                                          profiles.map((p: any) =>
                                            p === activeProfile ? { ...p, los: { ...(p.los ?? { mode: "HEX_RAYCAST", required: true }), blockers } } : p
                                          )
                                        );
                                      }}
                                    >
                                      {(((blockRegistry.keys as any)?.LoSBlockPolicy as string[]) ?? ["BLOCK_ALL"]).map((pol) => (
                                        <option key={pol} value={pol}>
                                          {pol}
                                        </option>
                                      ))}
                                    </select>

                                    <input
                                      className="input"
                                      value={(b.tags ?? []).join(", ")}
                                      onChange={(e) => {
                                        const blockers = [...(activeProfile.los?.blockers ?? [])];
                                        blockers[bi] = { ...blockers[bi], tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) };
                                        setProfiles(
                                          profiles.map((p: any) =>
                                            p === activeProfile ? { ...p, los: { ...(p.los ?? { mode: "HEX_RAYCAST", required: true }), blockers } } : p
                                          )
                                        );
                                      }}
                                      placeholder="BARRIER, WALL..."
                                    />

                                    <button
                                      className="btn btnDanger"
                                      onClick={() => {
                                        const blockers = [...(activeProfile.los?.blockers ?? [])];
                                        blockers.splice(bi, 1);
                                        setProfiles(
                                          profiles.map((p: any) =>
                                            p === activeProfile ? { ...p, los: { ...(p.los ?? { mode: "HEX_RAYCAST", required: true }), blockers } } : p
                                          )
                                        );
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </details>

                          {(activeProfile.type === "AREA_RADIUS" || activeProfile.type === "AREA_AROUND_TARGET") && (
                            <>
                              <div className="small" style={{ marginTop: 10 }}>
                                Area
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <input
                                  className="input"
                                  type="number"
                                  title="radius"
                                  value={activeProfile.area?.radius ?? 1}
                                  onChange={(e) => {
                                    const radius = Math.max(0, Math.floor(Number(e.target.value)));
                                    setProfiles(profiles.map((p: any) => (p === activeProfile ? { ...p, area: { ...(p.area ?? {}), radius } } : p)));
                                  }}
                                />
                                <input
                                  className="input"
                                  type="number"
                                  title="maxTargets (optional)"
                                  value={activeProfile.area?.maxTargets ?? 0}
                                  onChange={(e) => {
                                    const maxTargets = Math.max(0, Math.floor(Number(e.target.value)));
                                    setProfiles(
                                      profiles.map((p: any) =>
                                        p === activeProfile ? { ...p, area: { ...(p.area ?? {}), maxTargets: maxTargets > 0 ? maxTargets : undefined } } : p
                                      )
                                    );
                                  }}
                                />
                                <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(activeProfile.area?.includeCenter ?? true)}
                                    onChange={(e) =>
                                      setProfiles(
                                        profiles.map((p: any) =>
                                          p === activeProfile ? { ...p, area: { ...(p.area ?? {}), includeCenter: e.target.checked } } : p
                                        )
                                      )
                                    }
                                  />
                                  includeCenter
                                </label>
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <div className="err">
                          <b>No targeting profiles</b>
                          <div className="small">Add a profile to enable SELECT_TARGETS.</div>
                        </div>
                      )}
                    </>
                  )}

                  {/* STEP EDITOR */}
                  {selectedKind === "STEP" && selectedStep && (
                    <>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <div className="small">Step Type</div>
                          <div style={{ fontWeight: 900 }}>{(selectedStep as any).type}</div>
                        </div>
                        <button className="btn" onClick={() => moveStep(selectedStepIdx, -1)} disabled={selectedStepIdx === 0}>
                          ↑
                        </button>
                        <button
                          className="btn"
                          onClick={() => moveStep(selectedStepIdx, +1)}
                          disabled={(ability.execution?.steps?.length ?? 0) - 1 === selectedStepIdx}
                        >
                          ↓
                        </button>
                        <button className="btn btnDanger" onClick={() => deleteStep(selectedStepIdx)}>
                          Delete
                        </button>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        {(selectedStep as any).type === "SHOW_TEXT" && (
                          <>
                            <div className="small">Text</div>
                            <textarea className="textarea" value={(selectedStep as any).text} onChange={(e) => setStep(selectedStepIdx, { text: e.target.value })} />
                          </>
                        )}

                        {((selectedStep as any).type === "ROLL_D6" || (selectedStep as any).type === "ROLL_D20") && (
                          <>
                            <div className="small">saveAs</div>
                            <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value || undefined })} />
                          </>
                        )}

                        {(selectedStep as any).type === "SET_VARIABLE" && (
                          <>
                            <div className="small">saveAs</div>
                            <input className="input" value={(selectedStep as any).saveAs} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              valueExpr
                            </div>
                            <ExpressionEditor value={(selectedStep as any).valueExpr} onChange={(valueExpr) => setStep(selectedStepIdx, { valueExpr })} />
                          </>
                        )}

                        {(selectedStep as any).type === "IF_ELSE" && (
                          <>
                            <div className="small">Condition</div>
                            <ConditionEditor value={(selectedStep as any).condition} onChange={(condition) => setStep(selectedStepIdx, { condition })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              Branch steps
                            </div>
                            <div className="small">
                              Edit <b>then / elseIf / else</b> in Raw Step JSON for now (next: nested editors).
                            </div>
                          </>
                        )}

                        {(selectedStep as any).type === "SELECT_TARGETS" && (
                          <>
                            <div className="small">profileId</div>
                            <input className="input" value={(selectedStep as any).profileId} onChange={(e) => setStep(selectedStepIdx, { profileId: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              saveAs
                            </div>
                            <input className="input" value={(selectedStep as any).saveAs} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              originRef (optional)
                            </div>
                            <input
                              className="input"
                              value={(selectedStep as any).originRef ?? ""}
                              onChange={(e) => setStep(selectedStepIdx, { originRef: e.target.value || undefined })}
                              placeholder='e.g. "targets_primary"'
                            />
                          </>
                        )}

                        {(selectedStep as any).type === "FOR_EACH_TARGET" && (
                          <>
                            <div className="small">targetSet.ref</div>
                            <input className="input" value={(selectedStep as any).targetSet?.ref ?? ""} onChange={(e) => setStep(selectedStepIdx, { targetSet: { ref: e.target.value } })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              do (nested steps)
                            </div>
                            <div className="small">Edit in Raw JSON for now.</div>
                          </>
                        )}

                        {(selectedStep as any).type === "DEAL_DAMAGE" && (
                          <>
                            <div className="small">Damage Type</div>
                            <select
                              className="select"
                              value={(selectedStep as any).damageType}
                              onChange={(e) => setStep(selectedStepIdx, { damageType: e.target.value as DamageType })}
                            >
                              {((blockRegistry.keys.DamageType as string[]) ?? []).map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              Amount Expression
                            </div>
                            <ExpressionEditor value={(selectedStep as any).amountExpr} onChange={(amountExpr) => setStep(selectedStepIdx, { amountExpr })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              Target is edited via Raw JSON (ENTITY REFs)
                            </div>
                          </>
                        )}

                        {(selectedStep as any).type === "APPLY_STATUS" && (
                          <>
                            <div className="small">Status</div>
                            <select className="select" value={(selectedStep as any).status} onChange={(e) => setStep(selectedStepIdx, { status: e.target.value as StatusKey })}>
                              {((blockRegistry.keys.StatusKey as string[]) ?? []).map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              Duration (turns)
                            </div>
                            <input
                              className="input"
                              type="number"
                              value={(selectedStep as any).duration?.turns ?? 1}
                              onChange={(e) => setStep(selectedStepIdx, { duration: { turns: Math.max(1, Math.floor(Number(e.target.value))) } })}
                            />
                          </>
                        )}

                        {(selectedStep as any).type === "REMOVE_STATUS" && (
                          <>
                            <div className="small">Status</div>
                            <select className="select" value={(selectedStep as any).status} onChange={(e) => setStep(selectedStepIdx, { status: e.target.value as StatusKey })}>
                              {((blockRegistry.keys.StatusKey as string[]) ?? []).map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </>
                        )}

                        {(selectedStep as any).type === "CALC_DISTANCE" && (
                          <>
                            <div className="small">metric</div>
                            <select
                              className="select"
                              value={(selectedStep as any).metric}
                              onChange={(e) => setStep(selectedStepIdx, { metric: e.target.value as DistanceMetric })}
                            >
                              {((blockRegistry.keys.DistanceMetric as string[]) ?? []).map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              saveAs
                            </div>
                            <input className="input" value={(selectedStep as any).saveAs} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              from / to are edited via Raw JSON (entity refs).
                            </div>
                          </>
                        )}

                        {/* NEW: State steps */}
                        {(selectedStep as any).type === "SET_ENTITY_STATE" && (
                          <>
                            <div className="small">key</div>
                            <input className="input" value={(selectedStep as any).key ?? ""} onChange={(e) => setStep(selectedStepIdx, { key: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              value (JSON)
                            </div>
                            <textarea
                              className="textarea"
                              value={JSON.stringify((selectedStep as any).value ?? true, null, 2)}
                              onChange={(e) => {
                                const parsed = safeJsonParse(e.target.value);
                                if (!parsed.ok) return; // keep typing; edit via Raw JSON if needed
                                setStep(selectedStepIdx, { value: parsed.value });
                              }}
                            />
                            <div className="small">entity is edited via Raw JSON (SELF / TARGET / ENTITY_ID).</div>
                          </>
                        )}

                        {(selectedStep as any).type === "TOGGLE_ENTITY_STATE" && (
                          <>
                            <div className="small">key</div>
                            <input className="input" value={(selectedStep as any).key ?? ""} onChange={(e) => setStep(selectedStepIdx, { key: e.target.value })} />
                            <div className="small">entity edited via Raw JSON.</div>
                          </>
                        )}

                        {(selectedStep as any).type === "CLEAR_ENTITY_STATE" && (
                          <>
                            <div className="small">key</div>
                            <input className="input" value={(selectedStep as any).key ?? ""} onChange={(e) => setStep(selectedStepIdx, { key: e.target.value })} />
                            <div className="small">entity edited via Raw JSON.</div>
                          </>
                        )}

                        {/* NEW: Entity query / spawn / deck steps (minimal editors) */}
                        {(selectedStep as any).type === "FIND_ENTITIES" && (
                          <>
                            <div className="small">saveAs</div>
                            <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              selector (JSON)
                            </div>
                            <textarea
                              className="textarea"
                              value={JSON.stringify((selectedStep as any).selector ?? {}, null, 2)}
                              onChange={(e) => {
                                const parsed = safeJsonParse(e.target.value);
                                if (!parsed.ok) return;
                                setStep(selectedStepIdx, { selector: parsed.value });
                              }}
                            />
                          </>
                        )}

                        {(selectedStep as any).type === "COUNT_ENTITIES" && (
                          <>
                            <div className="small">targetSet.ref</div>
                            <input className="input" value={(selectedStep as any).targetSet?.ref ?? ""} onChange={(e) => setStep(selectedStepIdx, { targetSet: { ref: e.target.value } })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              saveAs
                            </div>
                            <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value })} />
                          </>
                        )}

                        {(selectedStep as any).type === "FILTER_TARGET_SET" && (
                          <>
                            <div className="small">source.ref</div>
                            <input className="input" value={(selectedStep as any).source?.ref ?? ""} onChange={(e) => setStep(selectedStepIdx, { source: { ref: e.target.value } })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              saveAs
                            </div>
                            <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              filter (JSON)
                            </div>
                            <textarea
                              className="textarea"
                              value={JSON.stringify((selectedStep as any).filter ?? {}, null, 2)}
                              onChange={(e) => {
                                const parsed = safeJsonParse(e.target.value);
                                if (!parsed.ok) return;
                                setStep(selectedStepIdx, { filter: parsed.value });
                              }}
                            />
                          </>
                        )}

                        {(selectedStep as any).type === "SPAWN_ENTITY" && (
                          <>
                            <div className="small">cardId</div>
                            <input className="input" value={(selectedStep as any).cardId ?? ""} onChange={(e) => setStep(selectedStepIdx, { cardId: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              owner
                            </div>
                            <select className="select" value={(selectedStep as any).owner ?? "SCENARIO"} onChange={(e) => setStep(selectedStepIdx, { owner: e.target.value })}>
                              {["ACTOR", "OPPONENT", "SCENARIO"].map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              saveAs
                            </div>
                            <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value || undefined })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              at (JSON)
                            </div>
                            <textarea
                              className="textarea"
                              value={JSON.stringify((selectedStep as any).at ?? { mode: "TARGET_POSITION" }, null, 2)}
                              onChange={(e) => {
                                const parsed = safeJsonParse(e.target.value);
                                if (!parsed.ok) return;
                                setStep(selectedStepIdx, { at: parsed.value });
                              }}
                            />
                          </>
                        )}

                        {(selectedStep as any).type === "DESPAWN_ENTITY" && (
                          <>
                            <div className="small">target is edited via Raw JSON (SELF / TARGET / ITERATION_TARGET / ENTITY_ID)</div>
                          </>
                        )}

                        {(selectedStep as any).type === "EMPTY_HAND" && (
                          <>
                            <div className="small">handZone</div>
                            <select className="select" value={(selectedStep as any).handZone} onChange={(e) => setStep(selectedStepIdx, { handZone: e.target.value as ZoneKey })}>
                              {((blockRegistry.keys.ZoneKey as string[]) ?? []).map((z) => (
                                <option key={z} value={z}>
                                  {z}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              to
                            </div>
                            <select className="select" value={(selectedStep as any).to} onChange={(e) => setStep(selectedStepIdx, { to: e.target.value as ZoneKey })}>
                              {((blockRegistry.keys.ZoneKey as string[]) ?? []).map((z) => (
                                <option key={z} value={z}>
                                  {z}
                                </option>
                              ))}
                            </select>
                          </>
                        )}

                        {(selectedStep as any).type === "ADD_CARDS_TO_DECK" && (
                          <>
                            <div className="small">deckZone</div>
                            <select className="select" value={(selectedStep as any).deckZone} onChange={(e) => setStep(selectedStepIdx, { deckZone: e.target.value as ZoneKey })}>
                              {((blockRegistry.keys.ZoneKey as string[]) ?? []).map((z) => (
                                <option key={z} value={z}>
                                  {z}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              cardIds (comma)
                            </div>
                            <input
                              className="input"
                              value={(((selectedStep as any).cardIds ?? []) as string[]).join(", ")}
                              onChange={(e) => setStep(selectedStepIdx, { cardIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                            />
                            <div className="small" style={{ marginTop: 8 }}>
                              countEach
                            </div>
                            <input className="input" type="number" value={(selectedStep as any).countEach ?? 1} onChange={(e) => setStep(selectedStepIdx, { countEach: Number(e.target.value) })} />
                            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                              <input
                                type="checkbox"
                                checked={Boolean((selectedStep as any).shuffleIn ?? true)}
                                onChange={(e) => setStep(selectedStepIdx, { shuffleIn: e.target.checked })}
                              />
                              shuffleIn
                            </label>
                          </>
                        )}

                        {(selectedStep as any).type === "REMOVE_CARDS_FROM_DECK" && (
                          <>
                            <div className="small">deckZone</div>
                            <select className="select" value={(selectedStep as any).deckZone} onChange={(e) => setStep(selectedStepIdx, { deckZone: e.target.value as ZoneKey })}>
                              {((blockRegistry.keys.ZoneKey as string[]) ?? []).map((z) => (
                                <option key={z} value={z}>
                                  {z}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              cardIds (comma)
                            </div>
                            <input
                              className="input"
                              value={(((selectedStep as any).cardIds ?? []) as string[]).join(", ")}
                              onChange={(e) => setStep(selectedStepIdx, { cardIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                            />
                            <div className="small" style={{ marginTop: 8 }}>
                              countEach
                            </div>
                            <input className="input" type="number" value={(selectedStep as any).countEach ?? 1} onChange={(e) => setStep(selectedStepIdx, { countEach: Number(e.target.value) })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              to (optional)
                            </div>
                            <select
                              className="select"
                              value={(selectedStep as any).to ?? ""}
                              onChange={(e) => setStep(selectedStepIdx, { to: e.target.value ? (e.target.value as ZoneKey) : undefined })}
                            >
                              <option value="">(none)</option>
                              {((blockRegistry.keys.ZoneKey as string[]) ?? []).map((z) => (
                                <option key={z} value={z}>
                                  {z}
                                </option>
                              ))}
                            </select>
                          </>
                        )}

                        {(selectedStep as any).type === "SWAP_DECK" && (
                          <>
                            <div className="small">actor</div>
                            <select className="select" value={(selectedStep as any).actor ?? "ACTOR"} onChange={(e) => setStep(selectedStepIdx, { actor: e.target.value })}>
                              {["ACTOR", "OPPONENT", "SCENARIO"].map((a) => (
                                <option key={a} value={a}>
                                  {a}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              slot
                            </div>
                            <select className="select" value={(selectedStep as any).slot ?? "ACTION"} onChange={(e) => setStep(selectedStepIdx, { slot: e.target.value })}>
                              {["ACTION", "ITEM", "CUSTOM"].map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              newDeckId
                            </div>
                            <input className="input" value={(selectedStep as any).newDeckId ?? ""} onChange={(e) => setStep(selectedStepIdx, { newDeckId: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              policy.onSwap
                            </div>
                            <select
                              className="select"
                              value={(selectedStep as any).policy?.onSwap ?? "DISCARD_HAND"}
                              onChange={(e) => setStep(selectedStepIdx, { policy: { ...((selectedStep as any).policy ?? {}), onSwap: e.target.value } })}
                            >
                              {["KEEP_HAND", "DISCARD_HAND", "EMPTY_HAND_TO_DISCARD"].map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </>
                        )}

                        {(selectedStep as any).type === "OPEN_UI_FLOW" && (
                          <>
                            <div className="small">flowId</div>
                            <select className="select" value={(selectedStep as any).flowId} onChange={(e) => setStep(selectedStepIdx, { flowId: e.target.value })}>
                              {((blockRegistry.uiFlows.types as string[]) ?? []).map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              saveAs
                            </div>
                            <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value || undefined })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              payload: edit in Raw JSON
                            </div>
                          </>
                        )}

                        {(selectedStep as any).type === "PROPERTY_CONTEST" && (
                          <>
                            <div className="small">variant</div>
                            <select className="select" value={(selectedStep as any).variant} onChange={(e) => setStep(selectedStepIdx, { variant: e.target.value })}>
                              {["STATUS_GAME", "INFLUENCE_INVENTORY"].map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 10 }}>
                              Nested branches (onWin/onLose) edited in Raw JSON for now.
                            </div>
                          </>
                        )}

                        {(selectedStep as any).type === "AI_REQUEST" && (
                          <>
                            <div className="small">systemPrompt</div>
                            <textarea className="textarea" value={(selectedStep as any).systemPrompt} onChange={(e) => setStep(selectedStepIdx, { systemPrompt: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              userPrompt
                            </div>
                            <textarea className="textarea" value={(selectedStep as any).userPrompt} onChange={(e) => setStep(selectedStepIdx, { userPrompt: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              saveAs
                            </div>
                            <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value || undefined })} />
                            <details style={{ marginTop: 10 }}>
                              <summary className="small" style={{ cursor: "pointer" }}>
                                outputJsonSchema (advanced)
                              </summary>
                              <pre>{JSON.stringify((selectedStep as any).outputJsonSchema ?? {}, null, 2)}</pre>
                              <div className="small">Edit in Raw JSON below for now.</div>
                            </details>
                          </>
                        )}

                        {(selectedStep as any).type === "UNKNOWN_STEP" && (
                          <div className="err">
                            <b>UNKNOWN_STEP</b>
                            <div className="small">This step type isn’t in the registry. Add it to blockRegistry.json.</div>
                          </div>
                        )}
                      </div>

                      <details style={{ marginTop: 10 }}>
                        <summary className="small" style={{ cursor: "pointer" }}>
                          Raw Step JSON
                        </summary>
                        <pre style={{ margin: 0 }}>{JSON.stringify(selectedStep, null, 2)}</pre>
                      </details>
                    </>
                  )}
                </>
              )}
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
        title="Import CJ Card JSON (or FORGE-1.0 project)"
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
          <input
            className="input"
            value={libraryUrl}
            onChange={(e) => setLibraryUrl(e.target.value)}
            placeholder="https://raw.githubusercontent.com/.../cj_action_library.json"
          />
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
        {library.steps.slice(0, 30).map((s) => (
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
