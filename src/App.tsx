import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, Handle, Position } from "reactflow";
import "reactflow/dist/style.css";

import { CardLibraryManager } from "./features/library/CardLibraryManager";
import { DeckBuilder } from "./features/decks/DeckBuilder";
import { ScenarioBuilder } from "./features/scenarios/ScenarioBuilder";

import type { CardEntity, Step, AbilityComponent, ZoneKey, DistanceMetric } from "./lib/types";
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

import {
  defaultCatalog,
  loadCatalog,
  saveCatalog as persistCatalog,
  upsertFaction,
  deleteFaction,
  upsertUnit,
  deleteUnit,
  upsertTemplate,
  deleteTemplate,
  type Catalog
} from "./lib/catalog";

import { requestAiImage, type AiImageProvider } from "./lib/aiImage";

type ViewKey = "FORGE" | "CATALOG" | "LIBRARY" | "DECKS" | "SCENARIOS";

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Failed to read file."));
    r.readAsDataURL(file);
  });
}

function CatalogView({
  catalog,
  setCatalog
}: {
  catalog: Catalog;
  setCatalog: React.Dispatch<React.SetStateAction<Catalog>>;
}) {
  const [f, setF] = useState({ id: "", name: "", symbolUrl: "", templateId: "" });
  const [u, setU] = useState({ id: "", name: "", factionId: "", cardId: "" });
  const [t, setT] = useState({ id: "", name: "" });

  return (
    <div className="panel" style={{ margin: 12 }}>
      <div className="ph">
        <div>
          <div className="h2">Catalog</div>
          <div className="small">Factions • Units • Templates (local)</div>
        </div>
        <span className="badge">{catalog.schemaVersion}</span>
      </div>

      <div className="pb" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {/* Factions */}
        <div className="panel">
          <div className="ph">
            <div className="h2">Factions</div>
            <span className="badge">{catalog.factions.length}</span>
          </div>
          <div className="pb">
            <div className="small">Add / Update</div>
            <input className="input" placeholder="id (EMERALD_TIDE)" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} />
            <input className="input" placeholder="name (Emerald Tide)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ marginTop: 6 }} />
            <input className="input" placeholder="symbolUrl (/icons/emerald.svg)" value={f.symbolUrl} onChange={(e) => setF({ ...f, symbolUrl: e.target.value })} style={{ marginTop: 6 }} />
            <input className="input" placeholder="templateId (optional)" value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })} style={{ marginTop: 6 }} />
            <button
              className="btn btnPrimary"
              style={{ marginTop: 8 }}
              onClick={() => {
                setCatalog((c) => upsertFaction(c, { id: f.id, name: f.name, symbolUrl: f.symbolUrl || undefined, templateId: f.templateId || undefined }));
                setF({ id: "", name: "", symbolUrl: "", templateId: "" });
              }}
              disabled={!f.id.trim() || !f.name.trim()}
            >
              Save Faction
            </button>

            <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

            {catalog.factions.length === 0 ? <div className="small">No factions yet.</div> : null}
            {catalog.factions.map((x) => (
              <div key={x.id} className="item" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <b>{x.name}</b> <span className="small">{x.id}</span>
                  {x.symbolUrl ? <div className="small">{x.symbolUrl}</div> : null}
                </div>
                <button className="btn btnDanger" onClick={() => setCatalog((c) => deleteFaction(c, x.id))}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Units */}
        <div className="panel">
          <div className="ph">
            <div className="h2">Units</div>
            <span className="badge">{catalog.units.length}</span>
          </div>
          <div className="pb">
            <div className="small">Add / Update</div>
            <input className="input" placeholder="id (THE_FISHERMAN)" value={u.id} onChange={(e) => setU({ ...u, id: e.target.value })} />
            <input className="input" placeholder="name (The Fisherman)" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} style={{ marginTop: 6 }} />
            <select className="select" value={u.factionId} onChange={(e) => setU({ ...u, factionId: e.target.value })} style={{ marginTop: 6 }}>
              <option value="">(no faction)</option>
              {catalog.factions.map((fx) => (
                <option key={fx.id} value={fx.id}>
                  {fx.name} ({fx.id})
                </option>
              ))}
            </select>
            <input className="input" placeholder="cardId (optional link to UNIT card)" value={u.cardId} onChange={(e) => setU({ ...u, cardId: e.target.value })} style={{ marginTop: 6 }} />
            <button
              className="btn btnPrimary"
              style={{ marginTop: 8 }}
              onClick={() => {
                setCatalog((c) => upsertUnit(c, { id: u.id, name: u.name, factionId: u.factionId || undefined, cardId: u.cardId || undefined }));
                setU({ id: "", name: "", factionId: "", cardId: "" });
              }}
              disabled={!u.id.trim() || !u.name.trim()}
            >
              Save Unit
            </button>

            <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

            {catalog.units.length === 0 ? <div className="small">No units yet.</div> : null}
            {catalog.units.map((x) => (
              <div key={x.id} className="item" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <b>{x.name}</b> <span className="small">{x.id}</span>
                  {x.factionId ? <div className="small">faction: {x.factionId}</div> : null}
                  {x.cardId ? <div className="small">cardId: {x.cardId}</div> : null}
                </div>
                <button className="btn btnDanger" onClick={() => setCatalog((c) => deleteUnit(c, x.id))}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Templates */}
        <div className="panel">
          <div className="ph">
            <div className="h2">Templates</div>
            <span className="badge">{catalog.templates.length}</span>
          </div>
          <div className="pb">
            <div className="small">Add / Update</div>
            <input className="input" placeholder="id (EMERALD_UNIT)" value={t.id} onChange={(e) => setT({ ...t, id: e.target.value })} />
            <input className="input" placeholder="name (Emerald Unit Template)" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} style={{ marginTop: 6 }} />
            <button
              className="btn btnPrimary"
              style={{ marginTop: 8 }}
              onClick={() => {
                setCatalog((c) => upsertTemplate(c, { id: t.id, name: t.name }));
                setT({ id: "", name: "" });
              }}
              disabled={!t.id.trim() || !t.name.trim()}
            >
              Save Template
            </button>

            <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

            {catalog.templates.length === 0 ? <div className="small">No templates yet.</div> : null}
            {catalog.templates.map((x) => (
              <div key={x.id} className="item" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <b>{x.name}</b> <span className="small">{x.id}</span>
                </div>
                <button className="btn btnDanger" onClick={() => setCatalog((c) => deleteTemplate(c, x.id))}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => download("cj_catalog.json", JSON.stringify(catalog, null, 2))}>
          Export Catalog JSON
        </button>
        <button
          className="btn"
          onClick={() => {
            setCatalog(defaultCatalog());
          }}
        >
          Reset Catalog (local)
        </button>
      </div>
    </div>
  );
}

export default function App() {
  // ---------- global view ----------
  const [view, setView] = useState<ViewKey>(() => (localStorage.getItem("CJ_VIEW") as ViewKey) || "FORGE");
  useEffect(() => {
    localStorage.setItem("CJ_VIEW", view);
  }, [view]);

  // ---------- catalog ----------
  const [catalog, setCatalog] = useState<Catalog>(() => loadCatalog());
  useEffect(() => {
    persistCatalog(catalog);
  }, [catalog]);

  // ---------- card ----------
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

  // We store selected node id to preserve selection through re-renders.
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

  // Builder AI Image Generator
  const [imgOpen, setImgOpen] = useState(false);
  const [imgProvider, setImgProvider] = useState<AiImageProvider>("OPENAI");
  const [imgSystem, setImgSystem] = useState(
    "You are an expert fantasy card illustrator. Generate a single, high-quality illustration that matches the request. No text, no frames, no watermarks."
  );
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgRefs, setImgRefs] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState<string | null>(null);

  // Multi-ability
  const abilityIndexes = useMemo(() => findAbilityIndexes(card), [card]);
  const [activeAbilityIdx, setActiveAbilityIdx] = useState<number>(() => {
    const idxs = findAbilityIndexes(makeDefaultCard());
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

  const { nodes, edges } = useMemo(() => {
    const comps = card.components.slice();
    const firstAbilityIdx = comps.findIndex((c: any) => c?.componentType === "ABILITY");
    if (firstAbilityIdx < 0 || activeAbilityIdx === firstAbilityIdx) return canonicalToGraph(card);

    const tmp = comps[firstAbilityIdx];
    comps[firstAbilityIdx] = comps[activeAbilityIdx];
    comps[activeAbilityIdx] = tmp;

    const viewCard = { ...card, components: comps } as CardEntity;
    const g = canonicalToGraph(viewCard);

    const patchedNodes = g.nodes.map((n: any) => {
      if (typeof n?.data?.abilityIdx !== "number") return n;
      return { ...n, data: { ...n.data, abilityIdx: activeAbilityIdx } };
    });

    return { nodes: patchedNodes, edges: g.edges };
  }, [card, activeAbilityIdx]);

  const nodesWithSelection = useMemo(
    () => nodes.map((n: any) => ({ ...n, selected: selectedNodeId ? n.id === selectedNodeId : false })),
    [nodes, selectedNodeId]
  );

  const selectedNode = useMemo(() => (selectedNodeId ? nodes.find((n: any) => n.id === selectedNodeId) : null), [nodes, selectedNodeId]);
  const selectedInfo = selectedNode?.data ?? null;
  const selectedKind = selectedInfo?.kind ?? null;

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
    setAbility({ execution: { steps } } as any);
  }

  function deleteStep(stepIdx: number) {
    if (!ability) return;
    const steps = (ability.execution?.steps ?? []).slice();
    steps.splice(stepIdx, 1);
    setAbility({ execution: { steps } } as any);
    setSelectedNodeId(null);
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
          return { type: "SHOW_TEXT", text: "..." };
        case "ROLL_D6":
          return { type: "ROLL_D6", saveAs: "d6" };
        case "ROLL_D20":
          return { type: "ROLL_D20", saveAs: "d20" };
        case "SET_VARIABLE":
          return { type: "SET_VARIABLE", saveAs: "var", valueExpr: { type: "CONST_NUMBER", value: 1 } } as any;
        case "IF_ELSE":
          return { type: "IF_ELSE", condition: { type: "ALWAYS" }, then: [], elseIf: [], else: [] } as any;
        case "SELECT_TARGETS":
          return { type: "SELECT_TARGETS", profileId: ability.targetingProfiles?.[0]?.id ?? "profile", saveAs: "targets" } as any;
        case "FOR_EACH_TARGET":
          return { type: "FOR_EACH_TARGET", targetSet: { ref: "targets" }, do: [{ type: "SHOW_TEXT", text: "Per target..." }] } as any;
        case "DEAL_DAMAGE":
          return { type: "DEAL_DAMAGE", target: { type: "ITERATION_TARGET" }, amountExpr: { type: "CONST_NUMBER", value: 10 }, damageType: "PHYSICAL" } as any;
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
    download(cardFileName(card, "CJ-1.2"), JSON.stringify(card, null, 2));
  }

  function doImport() {
    setImportError(null);
    try {
      const parsed = coerceUnknownSteps(JSON.parse(importText));
      const incoming: CardEntity = parsed?.projectVersion === "FORGE-1.0" ? parsed.card : parsed;
      if (!incoming || (incoming.schemaVersion !== "CJ-1.0" && incoming.schemaVersion !== "CJ-1.1" && (incoming as any).schemaVersion !== "CJ-1.2")) {
        throw new Error("Expected CJ-1.0 / CJ-1.1 / CJ-1.2 card JSON (or FORGE-1.0 project).");
      }
      setCard(incoming);
      const idxs = findAbilityIndexes(incoming);
      setActiveAbilityIdx(idxs[0] ?? 0);
      setSelectedNodeId(null);
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
      cost: { ap: 1, tokens: {} as any },
      targetingProfiles: [
        {
          id: "default",
          label: "Default",
          type: "SINGLE_TARGET",
          origin: "SOURCE",
          range: { base: 4, min: 1, max: 4 },
          lineOfSight: true,
          los: { mode: "HEX_RAYCAST", required: true, blockers: [{ policy: "BLOCK_ALL", tags: ["BARRIER"] }] }
        }
      ],
      execution: { steps: [{ type: "SHOW_TEXT", text: "Do something!" }] }
    };
    setCard({ ...card, components: [...card.components, newAbility as any] });
    setActiveAbilityIdx(card.components.length);
    setSelectedNodeId(null);
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

  // Selected step
  const selectedStepIdx = selectedKind === "STEP" ? selectedInfo?.stepIdx : null;
  const selectedStep =
    selectedStepIdx != null && ability?.execution?.steps ? (ability.execution.steps[selectedStepIdx] as Step) : null;

  // ---------- Action Library helpers ----------
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

  async function runImageGen() {
    setImgErr(null);
    setImgBusy(true);
    try {
      // Default card-art size; adjust if you have a template definition.
      const width = 1024;
      const height = 1536;

      const prompt =
        imgPrompt.trim().length > 0
          ? imgPrompt.trim()
          : `Illustration for a fantasy card named "${card.name}". No text. Cinematic lighting. High detail.`;

      const res = await requestAiImage({
        provider: imgProvider,
        width,
        height,
        systemPrompt: imgSystem,
        userPrompt: prompt,
        referenceImages: imgRefs.length ? imgRefs : undefined
      });

      const url = res.url || res.dataUrl;
      if (!url) throw new Error("AI image response missing url/dataUrl.");

      setCard({ ...card, visuals: { ...(card.visuals ?? {}), cardImage: url } });
      setImgOpen(false);
      setImgRefs([]);
    } catch (e: any) {
      setImgErr(e.message ?? String(e));
    } finally {
      setImgBusy(false);
    }
  }

  // Small helpers for restriction editing (stored as any until types updated)
  const restrictions = ((card as any).restrictions ?? {}) as any;
  const usableByUnitIds: string[] = Array.isArray(restrictions.usableByUnitIds) ? restrictions.usableByUnitIds : [];

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--accent)" }} />
          Captain Jawa Forge <span className="badge">CJ</span>
          <span className="badge">{errorCount === 0 ? "OK" : `${errorCount} errors`}</span>
        </div>

        {/* View tabs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(["FORGE", "CATALOG", "LIBRARY", "DECKS", "SCENARIOS"] as ViewKey[]).map((k) => (
            <button
              key={k}
              className={view === k ? "btn btnPrimary" : "btn"}
              onClick={() => setView(k)}
              title={k}
            >
              {k}
            </button>
          ))}

          <span style={{ width: 1, height: 22, background: "var(--border)", opacity: 0.6, margin: "0 6px" }} />

          <button className="btn" onClick={() => setPreviewOpen(true)} disabled={view !== "FORGE"}>
            Preview Card
          </button>
          <button className="btn" onClick={() => setLibraryOpen(true)} disabled={view !== "FORGE"}>
            Action Library
          </button>
          <button className="btn" onClick={() => setImportOpen(true)} disabled={view !== "FORGE"}>
            Import JSON
          </button>
          <button className="btn" onClick={exportCardJson} disabled={view !== "FORGE"}>
            Export Card JSON
          </button>
          <button className="btn btnPrimary" onClick={addAbility} disabled={view !== "FORGE"}>
            + Add Ability
          </button>
          <button className="btn btnDanger" onClick={removeActiveAbility} disabled={view !== "FORGE" || abilityIndexes.length <= 1}>
            Remove Ability
          </button>
          <button
            className="btn"
            disabled={view !== "FORGE"}
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
            disabled={view !== "FORGE"}
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

      {/* Non-forge views */}
      {view !== "FORGE" ? (
        <>
          {view === "CATALOG" ? <CatalogView catalog={catalog} setCatalog={setCatalog} /> : null}
          {view === "LIBRARY" ? (
            <div style={{ margin: 12 }}>
              <CardLibraryManager />
            </div>
          ) : null}
          {view === "DECKS" ? (
            <div style={{ margin: 12 }}>
              <DeckBuilder />
            </div>
          ) : null}
          {view === "SCENARIOS" ? (
            <div style={{ margin: 12 }}>
              <ScenarioBuilder />
            </div>
          ) : null}
        </>
      ) : (
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
                  setSelectedNodeId(null);
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
                <div className="small">Select nodes to edit on the right.</div>
              </div>
              <span className="badge">React Flow</span>
            </div>
            <div className="rfWrap">
              <ReactFlow
                nodes={nodesWithSelection}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                onSelectionChange={(sel) => setSelectedNodeId(sel?.nodes?.[0]?.id ?? null)}
                proOptions={{ hideAttribution: true }}
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

                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button className="btn btnPrimary" onClick={() => setImgOpen(true)}>
                      ✨ Generate Image (AI)
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        downloadText(cardFileName(card, "prompt") + ".txt", imgPrompt || `Illustration for: ${card.name}`);
                      }}
                    >
                      Export Art Prompt
                    </button>
                  </div>

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
                      <select
                        className="select"
                        value={card.faction ?? ""}
                        onChange={(e) => setCard({ ...card, faction: e.target.value || undefined })}
                      >
                        <option value="">(none)</option>
                        {catalog.factions.map((fx) => (
                          <option key={fx.id} value={fx.id}>
                            {fx.name} ({fx.id})
                          </option>
                        ))}
                      </select>
                      <div className="small" style={{ marginTop: 6 }}>
                        (Manage factions in the <b>CATALOG</b> tab)
                      </div>
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

                  {/* Unit / restrictions */}
                  <div className="small" style={{ marginTop: 10 }}>
                    Unit linkage / restrictions
                  </div>
                  {card.type === "UNIT" ? (
                    <>
                      <div className="small" style={{ marginTop: 6 }}>
                        Unit Registry ID (optional)
                      </div>
                      <input
                        className="input"
                        value={String((card as any).unitId ?? "")}
                        onChange={(e) => setCard({ ...(card as any), unitId: e.target.value || undefined })}
                        placeholder="THE_FISHERMAN"
                      />
                    </>
                  ) : (
                    <>
                      <div className="small" style={{ marginTop: 6 }}>
                        Usable by Unit IDs (comma)
                      </div>
                      <input
                        className="input"
                        value={usableByUnitIds.join(", ")}
                        onChange={(e) => {
                          const ids = e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          setCard({
                            ...(card as any),
                            restrictions: { ...(restrictions ?? {}), usableByUnitIds: ids.length ? ids : undefined }
                          });
                        }}
                        placeholder="THE_FISHERMAN"
                      />
                      <div className="small" style={{ marginTop: 6 }}>
                        Tip: pick Unit IDs from the Catalog tab. This supports rules like “Hookstaff only usable by The Fisherman”.
                      </div>
                    </>
                  )}

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
                    {/* Ability editor when ability root or no selection */}
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
                              onChange={(e) => setAbility({ cost: { ...(ability.cost ?? { ap: 0 }), ap: Number(e.target.value) } })}
                            />
                          </div>
                        </div>

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
                                value={(ability.cost.tokens as any)?.[k] ?? 0}
                                onChange={(e) =>
                                  setAbility({
                                    cost: {
                                      ...(ability.cost ?? { ap: 0 }),
                                      tokens: { ...(ability.cost.tokens ?? {}), [k]: Number(e.target.value) }
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
                            Example: Quick Shot costs AWR 1 <b>or</b> SPD 1.
                          </div>
                          <button
                            className="btn"
                            style={{ marginTop: 8 }}
                            onClick={() =>
                              setAbility({
                                cost: { ...(ability.cost ?? { ap: 0 }), tokenOptions: [...(ability.cost.tokenOptions ?? []), {}] }
                              })
                            }
                          >
                            + Add Option
                          </button>
                          {(ability.cost.tokenOptions ?? []).map((opt, idx) => (
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
                                        value={(opt as any)?.[k] ?? 0}
                                        onChange={(e) => {
                                          const next = (ability.cost.tokenOptions ?? []).slice();
                                          next[idx] = { ...(next[idx] as any), [k]: Number(e.target.value) };
                                          setAbility({ cost: { ...(ability.cost ?? { ap: 0 }), tokenOptions: next } });
                                        }}
                                      />
                                    </label>
                                  ))}
                                </div>
                                <button
                                  className="btn btnDanger"
                                  style={{ marginTop: 8 }}
                                  onClick={() => {
                                    const next = (ability.cost.tokenOptions ?? []).slice();
                                    next.splice(idx, 1);
                                    setAbility({ cost: { ...(ability.cost ?? { ap: 0 }), tokenOptions: next.length ? next : undefined } });
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
                        <ConditionEditor value={ability.requirements ?? { type: "ALWAYS" }} onChange={(requirements) => setAbility({ requirements })} />
                      </>
                    )}

                    {/* STEP EDITOR */}
                    {selectedKind === "STEP" && selectedStep && (
                      <>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ flex: 1 }}>
                            <div className="small">Step Type</div>
                            <div style={{ fontWeight: 900 }}>{selectedStep.type}</div>
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
                          {selectedStep.type === "SHOW_TEXT" && (
                            <>
                              <div className="small">Text</div>
                              <textarea className="textarea" value={(selectedStep as any).text} onChange={(e) => setStep(selectedStepIdx, { text: e.target.value })} />
                            </>
                          )}

                          {(selectedStep.type === "ROLL_D6" || selectedStep.type === "ROLL_D20") && (
                            <>
                              <div className="small">saveAs</div>
                              <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value || undefined })} />
                            </>
                          )}

                          {selectedStep.type === "SET_VARIABLE" && (
                            <>
                              <div className="small">saveAs</div>
                              <input className="input" value={(selectedStep as any).saveAs} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value })} />
                              <div className="small" style={{ marginTop: 8 }}>
                                valueExpr
                              </div>
                              <ExpressionEditor value={(selectedStep as any).valueExpr} onChange={(valueExpr) => setStep(selectedStepIdx, { valueExpr })} />
                            </>
                          )}

                          {selectedStep.type === "IF_ELSE" && (
                            <>
                              <div className="small">Condition</div>
                              <ConditionEditor value={(selectedStep as any).condition} onChange={(condition) => setStep(selectedStepIdx, { condition })} />
                              <div className="small" style={{ marginTop: 8 }}>
                                Branch steps
                              </div>
                              <div className="small">
                                Use nested editors next (already supported by schema). For now edit Raw Step JSON below for <b>then / elseIf / else</b>.
                              </div>
                            </>
                          )}

                          {selectedStep.type === "SELECT_TARGETS" && (
                            <>
                              <div className="small">profileId</div>
                              <input className="input" value={(selectedStep as any).profileId} onChange={(e) => setStep(selectedStepIdx, { profileId: e.target.value })} />
                              <div className="small" style={{ marginTop: 8 }}>
                                saveAs
                              </div>
                              <input className="input" value={(selectedStep as any).saveAs} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value })} />
                              <div className="small" style={{ marginTop: 8 }}>
                                Tip: profileId must match a targetingProfiles[].id on this ability.
                              </div>
                            </>
                          )}

                          {selectedStep.type === "FOR_EACH_TARGET" && (
                            <>
                              <div className="small">targetSet.ref</div>
                              <input className="input" value={(selectedStep as any).targetSet?.ref ?? ""} onChange={(e) => setStep(selectedStepIdx, { targetSet: { ref: e.target.value } })} />
                              <div className="small" style={{ marginTop: 8 }}>
                                do (nested steps)
                              </div>
                              <div className="small">Edit in Raw JSON for now.</div>
                            </>
                          )}

                          {selectedStep.type === "CALC_DISTANCE" && (
                            <>
                              <div className="small">metric</div>
                              <select className="select" value={(selectedStep as any).metric} onChange={(e) => setStep(selectedStepIdx, { metric: e.target.value as DistanceMetric })}>
                                {(blockRegistry.keys.DistanceMetric as string[]).map((m) => (
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

                          {selectedStep.type === "DRAW_CARDS" && (
                            <>
                              <div className="small">from</div>
                              <select className="select" value={(selectedStep as any).from} onChange={(e) => setStep(selectedStepIdx, { from: e.target.value as ZoneKey })}>
                                {(blockRegistry.keys.ZoneKey as string[]).map((z) => (
                                  <option key={z} value={z}>
                                    {z}
                                  </option>
                                ))}
                              </select>
                              <div className="small" style={{ marginTop: 8 }}>
                                to
                              </div>
                              <select className="select" value={(selectedStep as any).to} onChange={(e) => setStep(selectedStepIdx, { to: e.target.value as ZoneKey })}>
                                {(blockRegistry.keys.ZoneKey as string[]).map((z) => (
                                  <option key={z} value={z}>
                                    {z}
                                  </option>
                                ))}
                              </select>
                              <div className="small" style={{ marginTop: 8 }}>
                                count
                              </div>
                              <input className="input" type="number" value={(selectedStep as any).count} onChange={(e) => setStep(selectedStepIdx, { count: Number(e.target.value) })} />
                              <div className="small" style={{ marginTop: 8 }}>
                                saveAs
                              </div>
                              <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value || undefined })} />
                            </>
                          )}

                          {selectedStep.type === "PROPERTY_CONTEST" && (
                            <>
                              <div className="small">variant</div>
                              <select className="select" value={(selectedStep as any).variant} onChange={(e) => setStep(selectedStepIdx, { variant: e.target.value })}>
                                {["STATUS_GAME", "INFLUENCE_INVENTORY"].map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>

                              <details style={{ marginTop: 10 }}>
                                <summary className="small" style={{ cursor: "pointer" }}>
                                  Post-Contest Policy
                                </summary>
                                <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean((selectedStep as any).policy?.shuffleAllDrawnIntoOwnersDeck)}
                                    onChange={(e) => setStep(selectedStepIdx, { policy: { ...((selectedStep as any).policy ?? {}), shuffleAllDrawnIntoOwnersDeck: e.target.checked } })}
                                  />
                                  shuffleAllDrawnIntoOwnersDeck
                                </label>
                                <div className="small" style={{ marginTop: 8 }}>
                                  winnerMayKeepToHandMax
                                </div>
                                <input
                                  className="input"
                                  type="number"
                                  value={(selectedStep as any).policy?.winnerMayKeepToHandMax ?? 0}
                                  onChange={(e) => setStep(selectedStepIdx, { policy: { ...((selectedStep as any).policy ?? {}), winnerMayKeepToHandMax: Number(e.target.value) } })}
                                />
                                <div className="small" style={{ marginTop: 10 }}>
                                  onWin / onLose are nested steps (edit in Raw JSON for now)
                                </div>
                              </details>
                            </>
                          )}

                          {selectedStep.type === "WEBHOOK_CALL" && (
                            <>
                              <div className="small">url</div>
                              <input className="input" value={(selectedStep as any).url} onChange={(e) => setStep(selectedStepIdx, { url: e.target.value })} />
                              <div className="small" style={{ marginTop: 8 }}>
                                eventName
                              </div>
                              <input className="input" value={(selectedStep as any).eventName} onChange={(e) => setStep(selectedStepIdx, { eventName: e.target.value })} />
                            </>
                          )}

                          {selectedStep.type === "OPEN_UI_FLOW" && (
                            <>
                              <div className="small">flowId</div>
                              <select className="select" value={(selectedStep as any).flowId} onChange={(e) => setStep(selectedStepIdx, { flowId: e.target.value })}>
                                {(blockRegistry.uiFlows.types as string[]).map((f) => (
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

                          {selectedStep.type === "AI_REQUEST" && (
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
                            </>
                          )}

                          {selectedStep.type === "UNKNOWN_STEP" && (
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
                          <pre>{JSON.stringify(selectedStep, null, 2)}</pre>
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
      )}

      {/* Import modal */}
      <Modal
        open={importOpen}
        title="Import CJ-1.x Card JSON (or FORGE-1.0 project)"
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

      {/* AI Image Gen modal */}
      <Modal
        open={imgOpen}
        title="Generate Card Image (AI)"
        onClose={() => {
          setImgOpen(false);
          setImgErr(null);
        }}
        footer={
          <button className="btn btnPrimary" onClick={runImageGen} disabled={imgBusy}>
            {imgBusy ? "Generating..." : "Generate"}
          </button>
        }
      >
        {imgErr ? (
          <div className="err">
            <b>Image error</b>
            <div className="small">{imgErr}</div>
          </div>
        ) : null}

        <div className="small">Provider</div>
        <select className="select" value={imgProvider} onChange={(e) => setImgProvider(e.target.value as AiImageProvider)}>
          <option value="OPENAI">OPENAI</option>
          <option value="GEMINI">GEMINI</option>
          <option value="GEMINI_NANO_BANANA_PRO">GEMINI_NANO_BANANA_PRO</option>
        </select>

        <div className="small" style={{ marginTop: 10 }}>
          System prompt
        </div>
        <textarea className="textarea" value={imgSystem} onChange={(e) => setImgSystem(e.target.value)} />

        <div className="small" style={{ marginTop: 10 }}>
          Your prompt
        </div>
        <textarea className="textarea" value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} placeholder={`Illustration for ${card.name}...`} />

        <div className="small" style={{ marginTop: 10 }}>
          Reference images
        </div>
        <input
          className="input"
          type="file"
          accept="image/*"
          multiple
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length) return;
            const next = [];
            for (const f of files) {
              const dataUrl = await fileToDataUrl(f);
              next.push({ name: f.name, dataUrl });
            }
            setImgRefs((prev) => [...prev, ...next]);
          }}
        />
        {imgRefs.length ? (
          <div className="small" style={{ marginTop: 8 }}>
            {imgRefs.length} reference(s) attached.
            <button className="btn" style={{ marginLeft: 8 }} onClick={() => setImgRefs([])}>
              Clear
            </button>
          </div>
        ) : (
          <div className="small" style={{ marginTop: 8 }}>
            Optional. Add character references or style guides.
          </div>
        )}
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
