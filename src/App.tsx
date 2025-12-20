// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, Handle, Position } from "reactflow";
import "reactflow/dist/style.css";

import type { CardEntity, Step, AbilityComponent, TargetingProfile } from "./lib/types";
import { makeDefaultCard, canonicalToGraph, abilitySummary } from "./lib/graph";
import {
  saveCardJson,
  clearSaved,
  loadMigratedCardOrDefault,
  loadCatalog,
  saveCatalog,
  resetCatalog
} from "./lib/storage";
import { migrateCard } from "./lib/migrations";
import { validateCard, type ValidationIssue } from "./lib/schemas";
import { blockRegistry, isStepTypeAllowed } from "./lib/registry";

import { useHistoryState } from "./lib/history";
import { normalizeCatalog, type Catalog } from "./lib/catalog";

import { ExpressionEditor } from "./components/ExpressionEditor";
import { ConditionEditor } from "./components/ConditionEditor";
import { CardPreview } from "./components/CardPreview";
import StepListEditor from "./components/NestedStepsEditor";
import HexTargetPicker from "./components/HexTargetPicker";

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
  const title = String(data.kind ?? "").toUpperCase().includes("COST") ? "COST" : "TARGETING";

  const firstProfile = (ability as any)?.targetingProfiles?.[0];
  const legacy = (ability as any)?.targeting;

  const type = firstProfile?.type ?? legacy?.type ?? "—";
  const rangeObj = firstProfile?.range ?? legacy?.range ?? {};
  const maxR = rangeObj.max ?? rangeObj.base ?? 0;
  const minR = rangeObj.min ?? 0;

  const desc = title === "COST" ? `AP: ${ability?.cost?.ap ?? 0}` : `${type} • Range ${minR}-${maxR}`;

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

function clampInt(n: any, min: number, max?: number) {
  const x = Math.floor(Number(n || 0));
  const a = Math.max(min, x);
  if (typeof max === "number") return Math.min(max, a);
  return a;
}

export default function App() {
  // History-backed card state (undo/redo)
  const history = useHistoryState<CardEntity>(loadMigratedCardOrDefault(makeDefaultCard));
  const card = history.present;
  const setCard = history.set;

  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  // Catalog
  const [catalog, setCatalog] = useState<Catalog>(() => loadCatalog());
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogText, setCatalogText] = useState(JSON.stringify(catalog, null, 2));
  const [catalogErr, setCatalogErr] = useState<string | null>(null);

  // Hex picker UI state (per ability + profile)
  const [hexPickerByAbility, setHexPickerByAbility] = useState<Record<number, Record<string, any>>>({});

  // Target profile selection per ability
  const [activeProfileByAbility, setActiveProfileByAbility] = useState<Record<number, string>>({});

  useEffect(() => {
    try {
      saveCatalog(catalog);
    } catch {
      // ignore
    }
  }, [catalog]);

  // Multi-ability selection
  const abilityIndexes = useMemo(() => findAbilityIndexes(card), [card]);
  const [activeAbilityIdx, setActiveAbilityIdx] = useState<number>(() => {
    const idxs = findAbilityIndexes(loadMigratedCardOrDefault(makeDefaultCard));
    return idxs[0] ?? 0;
  });

  useEffect(() => {
    if (!abilityIndexes.length) return;
    if (!abilityIndexes.includes(activeAbilityIdx)) setActiveAbilityIdx(abilityIndexes[0]);
  }, [abilityIndexes, activeAbilityIdx]);

  useEffect(() => {
    setIssues(validateCard(card));
    try {
      saveCardJson(JSON.stringify(card));
    } catch {
      // ignore
    }
  }, [card]);

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

  const displayedNodes = useMemo(
    () => nodes.map((n: any) => ({ ...n, selected: selectedNodeId ? n.id === selectedNodeId : false })),
    [nodes, selectedNodeId]
  );

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
    const a = card.components[idx] as any;
    if (!a || a.componentType !== "ABILITY") return null;
    return a as AbilityComponent;
  }
  const ability = getAbilityByIndex(activeAbilityIdx);

  function setAbility(patch: Partial<AbilityComponent>) {
    if (!ability) return;
    setCard({
      ...card,
      components: card.components.map((c: any, i: number) => (i === activeAbilityIdx ? { ...ability, ...patch } : c))
    });
  }

  function setStep(stepIdx: number, next: any) {
    if (!ability) return;
    const steps = (ability.execution?.steps ?? []).slice();
    steps[stepIdx] = next;
    setAbility({ execution: { steps } } as any);
  }

  function patchStep(stepIdx: number, patch: any) {
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
          return { type: "SHOW_TEXT", text: "..." } as any;
        case "ROLL_D6":
          return { type: "ROLL_D6", saveAs: "roll" } as any;
        case "ROLL_D20":
          return { type: "ROLL_D20", saveAs: "roll" } as any;
        case "OPEN_REACTION_WINDOW":
          return { type: "OPEN_REACTION_WINDOW", timing: "BEFORE_DAMAGE", windowId: "pre_damage" } as any;
        case "DEAL_DAMAGE":
          return {
            type: "DEAL_DAMAGE",
            target: { type: "TARGET" },
            amountExpr: { type: "CONST_NUMBER", value: 10 },
            damageType: "PHYSICAL"
          } as any;
        case "HEAL":
          return {
            type: "HEAL",
            target: { type: "SELF" },
            amountExpr: { type: "CONST_NUMBER", value: 10 }
          } as any;
        case "SET_VARIABLE":
          return { type: "SET_VARIABLE", saveAs: "var", valueExpr: { type: "CONST_NUMBER", value: 1 } } as any;
        case "APPLY_STATUS":
          return { type: "APPLY_STATUS", target: { type: "TARGET" }, status: "SLOWED", duration: { turns: 1 } } as any;
        case "REMOVE_STATUS":
          return { type: "REMOVE_STATUS", target: { type: "SELF" }, status: "STUNNED" } as any;
        case "MOVE_ENTITY":
          return { type: "MOVE_ENTITY", target: { type: "SELF" }, to: { mode: "TARGET_POSITION" }, maxTiles: 5 } as any;
        case "OPPONENT_SAVE":
          return {
            type: "OPPONENT_SAVE",
            stat: "SPEED",
            difficulty: 13,
            onFail: [{ type: "SHOW_TEXT", text: "Fail" }],
            onSuccess: [{ type: "SHOW_TEXT", text: "Success" }]
          } as any;
        case "IF_ELSE":
          return {
            type: "IF_ELSE",
            condition: { type: "ALWAYS" },
            then: [{ type: "SHOW_TEXT", text: "Then" }],
            else: [{ type: "SHOW_TEXT", text: "Else" }]
          } as any;
        case "SELECT_TARGETS":
          return { type: "SELECT_TARGETS", profileId: "primary", saveAs: "primary" } as any;
        case "FOR_EACH_TARGET":
          return {
            type: "FOR_EACH_TARGET",
            targetSet: { ref: "primary" },
            do: [{ type: "SHOW_TEXT", text: "For each target..." }]
          } as any;
        default:
          return { type: "UNKNOWN_STEP", raw: { type: stepType } } as any;
      }
    };

    steps.push(mk());
    setAbility({ execution: { steps } } as any);
  }

  function exportCardJson() {
    download(cardFileName(card, "CJ"), JSON.stringify(card, null, 2));
  }

  function exportForgeProject() {
    const project = {
      projectVersion: "FORGE-1.0",
      card,
      ui: {
        activeAbilityIdx,
        nodes: displayedNodes.map((n: any) => ({ id: n.id, x: n.position.x, y: n.position.y, kind: n.data.kind }))
      }
    };
    download(cardFileName(card, "FORGE-1.0"), JSON.stringify(project, null, 2));
  }

  function doImport() {
    setImportError(null);
    try {
      const parsed = coerceUnknownSteps(JSON.parse(importText));
      const incoming = migrateCard(parsed);
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
      cost: { ap: 1, tokens: {} } as any,
      targetingProfiles: [
        {
          id: "primary",
          label: "Primary Target",
          type: "SINGLE_TARGET",
          origin: "SOURCE",
          range: { min: 0, max: 4, base: 4 },
          lineOfSight: true,
          constraints: { excludeSelf: true }
        } as any
      ],
      execution: { steps: [{ type: "SELECT_TARGETS", profileId: "primary", saveAs: "primary" } as any] }
    } as any;

    setCard({ ...card, components: [...card.components, newAbility as any] });
    setActiveAbilityIdx(card.components.length);
    setSelectedNodeId(null);

    setActiveProfileByAbility((m) => ({ ...m, [card.components.length]: "primary" }));
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

  // Selected node
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return displayedNodes.find((n: any) => n.id === selectedNodeId) ?? null;
  }, [displayedNodes, selectedNodeId]);

  const kindUpper = String(selectedNode?.data?.kind ?? "").toUpperCase();
  const isCost = kindUpper.includes("COST");
  const isTargeting = kindUpper.includes("TARGET");
  const isAbilityRoot = kindUpper.includes("ABILITY");
  const isStep = kindUpper.includes("STEP");

  const selectedStepIdx = isStep ? (selectedNode?.data?.stepIdx ?? null) : null;
  const selectedStep =
    selectedStepIdx != null && ability?.execution?.steps ? (ability.execution.steps[selectedStepIdx] as Step) : null;

  // COST helper: token costs
  const COST_KEYS = ["UMB", "AET", "CRD", "CHR", "STR", "RES", "WIS", "INT", "SPD", "AWR"] as const;
  function setTokenCost(k: string, v: number) {
    if (!ability) return;
    const tokens = { ...(((ability.cost as any)?.tokens ?? {}) as any) };
    const n = Math.max(0, Math.floor(v || 0));
    if (n <= 0) delete tokens[k];
    else tokens[k] = n;
    setAbility({ cost: { ...(ability.cost ?? {}), tokens } } as any);
  }

  // Target profiles utilities
  const profiles: TargetingProfile[] = (ability?.targetingProfiles ?? []) as any;

  // Keep active profile valid
  useEffect(() => {
    if (!ability) return;
    if (!profiles.length) return;

    const current = activeProfileByAbility[activeAbilityIdx];
    if (current && profiles.some((p) => p.id === current)) return;

    setActiveProfileByAbility((m) => ({ ...m, [activeAbilityIdx]: profiles[0].id }));
  }, [activeAbilityIdx, ability, profiles.map((p) => p.id).join("|")]);

  const activeProfileId = activeProfileByAbility[activeAbilityIdx] ?? profiles[0]?.id ?? "primary";
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;

  function setProfiles(next: TargetingProfile[]) {
    setAbility({ targetingProfiles: next as any });
  }

  function initProfilesFromLegacy() {
    if (!ability) return;

    const legacy: any = (ability as any).targeting ?? {
      type: "SINGLE_TARGET",
      origin: "SOURCE",
      range: { min: 0, max: 4, base: 4 },
      lineOfSight: true
    };

    const range = legacy.range ?? {};
    const max = range.max ?? range.base ?? 4;
    const min = range.min ?? 0;

    const p: TargetingProfile = {
      id: "primary",
      label: "Primary Target",
      type: legacy.type ?? "SINGLE_TARGET",
      origin: legacy.origin ?? "SOURCE",
      range: { min, max, base: max },
      lineOfSight: Boolean(legacy.lineOfSight),
      area: legacy.area ? { ...legacy.area } : undefined,
      constraints: { excludeSelf: true }
    } as any;

    setProfiles([p]);
    setActiveProfileByAbility((m) => ({ ...m, [activeAbilityIdx]: "primary" }));
  }

  function nextProfileId(existing: string[]) {
    const preferred = ["primary", "secondary", "tertiary", "quaternary"];
    for (const p of preferred) if (!existing.includes(p)) return p;
    let i = 1;
    while (existing.includes(`p${i}`)) i++;
    return `p${i}`;
  }

  function addProfile() {
    const ids = profiles.map((p) => p.id);
    const id = nextProfileId(ids);
    const p: TargetingProfile = {
      id,
      label: id[0].toUpperCase() + id.slice(1),
      type: "SINGLE_TARGET",
      origin: "SOURCE",
      range: { min: 0, max: 4, base: 4 },
      lineOfSight: true,
      constraints: { excludeSelf: true }
    } as any;

    const next = [...profiles, p];
    setProfiles(next);
    setActiveProfileByAbility((m) => ({ ...m, [activeAbilityIdx]: id }));
  }

  function deleteProfile(id: string) {
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next);
    const nextActive = next[0]?.id ?? "primary";
    setActiveProfileByAbility((m) => ({ ...m, [activeAbilityIdx]: nextActive }));
  }

  function patchProfile(id: string, patch: Partial<TargetingProfile>) {
    const next = profiles.map((p) => (p.id === id ? ({ ...p, ...patch } as any) : p));
    setProfiles(next);
  }

  function renameProfile(oldId: string, newIdRaw: string) {
    const newId = String(newIdRaw ?? "").trim();
    if (!newId) return;
    if (oldId === newId) return;
    if (profiles.some((p) => p.id === newId)) return; // avoid collision

    // Update profiles
    const nextProfiles = profiles.map((p) => {
      if (p.id !== oldId) {
        // update relativeTo / constraints references if they used oldId
        const rp: any = { ...p };
        if (rp.relativeTo?.targetSetId === oldId) rp.relativeTo = { ...rp.relativeTo, targetSetId: newId };
        if (rp.constraints?.excludeTargetSet === oldId) rp.constraints = { ...rp.constraints, excludeTargetSet: newId };
        if (rp.constraints?.mustBeAdjacentTo === oldId) rp.constraints = { ...rp.constraints, mustBeAdjacentTo: newId };
        return rp;
      }
      return { ...p, id: newId };
    });

    // Update steps referencing profileId in SELECT_TARGETS
    const steps = (ability?.execution?.steps ?? []).map((s: any) => {
      if (s?.type === "SELECT_TARGETS" && s.profileId === oldId) return { ...s, profileId: newId };
      return s;
    });

    setAbility({ targetingProfiles: nextProfiles as any, execution: { steps } } as any);
    setActiveProfileByAbility((m) => ({ ...m, [activeAbilityIdx]: newId }));
  }

  // Helpers: available target sets from SELECT_TARGETS (top-level scan)
  const availableTargetSets = useMemo(() => {
    const steps = ability?.execution?.steps ?? [];
    const out: string[] = [];
    for (const s of steps as any[]) {
      if (s?.type === "SELECT_TARGETS" && String(s.saveAs ?? "").trim()) out.push(String(s.saveAs).trim());
    }
    return Array.from(new Set(out));
  }, [ability?.execution?.steps]);

  // Hex picker props from active profile
  const pRange = activeProfile?.range ?? {};
  const pMin = Number((pRange as any).min ?? 0);
  const pMax = Number((pRange as any).max ?? (pRange as any).base ?? 0);
  const pType = String(activeProfile?.type ?? "SINGLE_TARGET");
  const pOrigin = String(activeProfile?.origin ?? "SOURCE");
  const pAoe = pType === "AREA_RADIUS" ? Number((activeProfile as any)?.area?.radius ?? 0) : 0;
  const pIncludeCenter = pType === "AREA_RADIUS" ? Boolean((activeProfile as any)?.area?.includeCenter ?? true) : true;
  const pLoS = Boolean(activeProfile?.lineOfSight);

  const showHexPicker = Boolean(activeProfile) && pOrigin !== "ANYWHERE" && pType !== "SELF";

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--accent)" }} />
          Captain Jawa Forge <span className="badge">CJ-1.1</span>
          <span className="badge">{errorCount === 0 ? "OK" : `${errorCount} errors`}</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={history.undo} disabled={!history.canUndo}>
            Undo
          </button>
          <button className="btn" onClick={history.redo} disabled={!history.canRedo}>
            Redo
          </button>

          <button
            className="btn"
            onClick={() => {
              setCatalogText(JSON.stringify(catalog, null, 2));
              setCatalogOpen(true);
            }}
          >
            Catalog
          </button>

          <button className="btn" onClick={() => setPreviewOpen(true)}>
            Preview Card
          </button>
          <button className="btn" onClick={() => setImportOpen(true)}>
            Import JSON
          </button>
          <button className="btn" onClick={exportCardJson}>
            Export Card JSON
          </button>
          <button className="btn" onClick={exportForgeProject}>
            Export Forge Project
          </button>

          <button
            className="btn btnPrimary"
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
              <div className="small">BR-1.0 core steps</div>
            </div>
            <span className="badge">{blockRegistry.steps.types.length}</span>
          </div>

          <div className="pb">
            <div className="small" style={{ marginBottom: 8 }}>
              Ability + steps
            </div>

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
              <button className="btn btnPrimary" onClick={addAbility} style={{ flex: 1 }}>
                + Add Ability
              </button>
              <button className="btn btnDanger" onClick={removeActiveAbility} style={{ flex: 1 }} disabled={abilityIndexes.length <= 1}>
                Remove
              </button>
            </div>

            <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

            <div className="small" style={{ marginBottom: 8 }}>
              Click to append a step.
            </div>
            {(blockRegistry.steps.types as string[]).map((t) => (
              <div key={t} className="item" onClick={() => addStep(t)} style={{ marginBottom: 8 }}>
                <b>{t}</b> <span className="small">step</span>
              </div>
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
              nodes={displayedNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onSelectionChange={(sel) => {
                const n = sel?.nodes?.[0];
                if (n?.id) setSelectedNodeId(n.id);
              }}
              onPaneClick={() => setSelectedNodeId(null)}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        </div>

        {/* Inspector + JSON + Compile */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, height: "100%" }}>
          <div className="panel" style={{ flex: "1 1 55%", minHeight: 0 }}>
            <div className="ph">
              <div>
                <div className="h2">Inspector</div>
                <div className="small">{selectedNode?.data?.kind ?? "No selection"}</div>
              </div>
              <span className="badge">{(card as any).schemaVersion ?? "CJ"}</span>
            </div>

            <div className="pb">
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
                  <input className="input" value={(card as any).schemaVersion} disabled />
                </div>
              </div>

              <details style={{ marginTop: 10 }}>
                <summary className="small" style={{ cursor: "pointer" }}>
                  Identity (Catalog-powered)
                </summary>

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="small">Faction (Units)</div>
                    <select className="select" value={card.faction ?? ""} onChange={(e) => setCard({ ...card, faction: e.target.value || undefined })}>
                      <option value="">(none)</option>
                      {catalog.factions.map((f) => (
                        <option key={f.id} value={f.name}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div className="small">Types (comma)</div>
                    <input
                      className="input"
                      value={(card.subType ?? []).join(", ")}
                      onChange={(e) => setCard({ ...card, subType: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    />
                    <div className="small" style={{ marginTop: 6 }}>
                      Add Type
                    </div>
                    <select
                      className="select"
                      value=""
                      onChange={(e) => {
                        const t = e.target.value;
                        if (!t) return;
                        const next = Array.from(new Set([...(card.subType ?? []), t]));
                        setCard({ ...card, subType: next });
                      }}
                    >
                      <option value="">Pick…</option>
                      {catalog.unitTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="small" style={{ marginTop: 8 }}>
                  Attributes (comma)
                </div>
                <input
                  className="input"
                  value={(card.attributes ?? []).join(", ")}
                  onChange={(e) => setCard({ ...card, attributes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                />
                <div className="small" style={{ marginTop: 6 }}>
                  Add Attribute
                </div>
                <select
                  className="select"
                  value=""
                  onChange={(e) => {
                    const a = e.target.value;
                    if (!a) return;
                    const next = Array.from(new Set([...(card.attributes ?? []), a]));
                    setCard({ ...card, attributes: next });
                  }}
                >
                  <option value="">Pick…</option>
                  {catalog.attributes.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </details>

              <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

              {!ability ? (
                <div className="err">
                  <b>No ABILITY component</b>
                  <div className="small">Add an ability to use this editor.</div>
                </div>
              ) : (
                <>
                  {/* Ability root editor */}
                  {(!selectedNodeId || isAbilityRoot) && (
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
                            onChange={(e) =>
                              setAbility({
                                cost: { ...(ability.cost ?? {}), ap: Math.max(0, Math.floor(Number(e.target.value) || 0)) }
                              })
                            }
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* COST editor */}
                  {isCost && (
                    <>
                      <div className="h2" style={{ marginTop: 4 }}>
                        Cost
                      </div>

                      <div className="small" style={{ marginTop: 8 }}>
                        Required Equipped Item IDs (comma-separated)
                      </div>
                      <input
                        className="input"
                        value={(ability.cost?.requiredEquippedItemIds ?? []).join(", ")}
                        onChange={(e) =>
                          setAbility({
                            cost: {
                              ...(ability.cost ?? {}),
                              requiredEquippedItemIds: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                            }
                          })
                        }
                      />

                      <div className="small" style={{ marginTop: 8 }}>
                        Cooldown (turns)
                      </div>
                      <input
                        className="input"
                        type="number"
                        value={ability.cost?.cooldown?.turns ?? 0}
                        onChange={(e) => {
                          const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setAbility({
                            cost: { ...(ability.cost ?? {}), cooldown: n > 0 ? { turns: n } : undefined }
                          });
                        }}
                      />

                      <div className="small" style={{ marginTop: 10 }}>
                        Token Costs
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginTop: 6 }}>
                        {COST_KEYS.map((k) => (
                          <div key={k}>
                            <div className="small">{k}</div>
                            <input
                              className="input"
                              type="number"
                              value={Number((ability.cost as any)?.tokens?.[k] ?? 0)}
                              onChange={(e) => setTokenCost(k, Number(e.target.value))}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* TARGET PROFILES editor */}
                  {isTargeting && (
                    <>
                      <div className="h2" style={{ marginTop: 4 }}>
                        Target Profiles
                      </div>

                      {!profiles.length ? (
                        <div className="err" style={{ marginTop: 8 }}>
                          <b>No targetingProfiles</b>
                          <div className="small">
                            Option A uses targetingProfiles. You can create them from legacy targeting or start fresh.
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <button className="btn btnPrimary" onClick={initProfilesFromLegacy}>
                              Init from legacy targeting
                            </button>
                            <button className="btn" onClick={addProfile}>
                              + Add profile
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div className="small">Active Profile</div>
                              <select
                                className="select"
                                value={activeProfileId}
                                onChange={(e) => setActiveProfileByAbility((m) => ({ ...m, [activeAbilityIdx]: e.target.value }))}
                              >
                                {profiles.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.id} {p.label ? `— ${p.label}` : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button className="btn" onClick={addProfile} style={{ marginTop: 18 }}>
                              + Add
                            </button>
                            <button
                              className="btn btnDanger"
                              onClick={() => activeProfile && deleteProfile(activeProfile.id)}
                              style={{ marginTop: 18 }}
                              disabled={!activeProfile || profiles.length <= 1}
                              title={profiles.length <= 1 ? "Keep at least one profile" : "Delete this profile"}
                            >
                              Delete
                            </button>
                          </div>

                          {activeProfile ? (
                            <>
                              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                <div style={{ flex: 1 }}>
                                  <div className="small">Profile ID</div>
                                  <input
                                    className="input"
                                    value={activeProfile.id}
                                    onChange={(e) => renameProfile(activeProfile.id, e.target.value)}
                                  />
                                  <div className="small" style={{ marginTop: 6 }}>
                                    (Renaming updates SELECT_TARGETS.profileId references)
                                  </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div className="small">Label</div>
                                  <input
                                    className="input"
                                    value={activeProfile.label ?? ""}
                                    onChange={(e) => patchProfile(activeProfile.id, { label: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                <div style={{ flex: 1 }}>
                                  <div className="small">Type</div>
                                  <select
                                    className="select"
                                    value={activeProfile.type}
                                    onChange={(e) => {
                                      const type = e.target.value as any;
                                      const patch: any = { type };
                                      if (type === "AREA_RADIUS" && !activeProfile.area) patch.area = { radius: 1, includeCenter: true };
                                      if (type !== "AREA_RADIUS") patch.area = undefined;
                                      if (type === "MULTI_TARGET" && typeof activeProfile.maxTargets !== "number") patch.maxTargets = 2;
                                      if (type !== "MULTI_TARGET") {
                                        patch.maxTargets = undefined;
                                        patch.optional = undefined;
                                      }
                                      patchProfile(activeProfile.id, patch);
                                    }}
                                  >
                                    {["SELF", "SINGLE_TARGET", "MULTI_TARGET", "AREA_RADIUS"].map((t) => (
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
                                    value={activeProfile.origin}
                                    onChange={(e) => {
                                      const origin = e.target.value as any;
                                      const patch: any = { origin };
                                      if (origin !== "RELATIVE_TO_TARGET_SET") patch.relativeTo = undefined;
                                      if (origin === "RELATIVE_TO_TARGET_SET" && !activeProfile.relativeTo) {
                                        patch.relativeTo = { targetSetId: profiles[0]?.id ?? "primary" };
                                      }
                                      patchProfile(activeProfile.id, patch);
                                    }}
                                  >
                                    {["SOURCE", "ANYWHERE", "RELATIVE_TO_TARGET_SET"].map((o) => (
                                      <option key={o} value={o}>
                                        {o}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {activeProfile.origin === "RELATIVE_TO_TARGET_SET" ? (
                                <div style={{ marginTop: 10 }}>
                                  <div className="small">Relative To (profile id)</div>
                                  <select
                                    className="select"
                                    value={activeProfile.relativeTo?.targetSetId ?? ""}
                                    onChange={(e) =>
                                      patchProfile(activeProfile.id, {
                                        relativeTo: { targetSetId: e.target.value }
                                      } as any)
                                    }
                                  >
                                    {profiles
                                      .filter((p) => p.id !== activeProfile.id)
                                      .map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.id}
                                        </option>
                                      ))}
                                  </select>
                                  <div className="small" style={{ marginTop: 6 }}>
                                    (Hex preview anchoring for RELATIVE profiles will be improved next.)
                                  </div>
                                </div>
                              ) : null}

                              {activeProfile.type !== "SELF" ? (
                                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                  <div style={{ flex: 1 }}>
                                    <div className="small">Min Range</div>
                                    <input
                                      className="input"
                                      type="number"
                                      value={Number(activeProfile.range?.min ?? 0)}
                                      onChange={(e) => {
                                        const min = clampInt(e.target.value, 0);
                                        const max = Math.max(min, Number(activeProfile.range?.max ?? activeProfile.range?.base ?? 4));
                                        patchProfile(activeProfile.id, { range: { ...(activeProfile.range ?? {}), min, max, base: max } });
                                      }}
                                    />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div className="small">Max Range</div>
                                    <input
                                      className="input"
                                      type="number"
                                      value={Number(activeProfile.range?.max ?? activeProfile.range?.base ?? 4)}
                                      onChange={(e) => {
                                        const max = clampInt(e.target.value, 0);
                                        const min = Math.min(Number(activeProfile.range?.min ?? 0), max);
                                        patchProfile(activeProfile.id, { range: { ...(activeProfile.range ?? {}), min, max, base: max } });
                                      }}
                                    />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div className="small">Line of Sight</div>
                                    <select
                                      className="select"
                                      value={String(Boolean(activeProfile.lineOfSight))}
                                      onChange={(e) => patchProfile(activeProfile.id, { lineOfSight: e.target.value === "true" })}
                                    >
                                      <option value="false">false</option>
                                      <option value="true">true</option>
                                    </select>
                                  </div>
                                </div>
                              ) : null}

                              {activeProfile.type === "MULTI_TARGET" ? (
                                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                  <div style={{ flex: 1 }}>
                                    <div className="small">Max Targets</div>
                                    <input
                                      className="input"
                                      type="number"
                                      value={Number(activeProfile.maxTargets ?? 2)}
                                      onChange={(e) => patchProfile(activeProfile.id, { maxTargets: clampInt(e.target.value, 1, 12) } as any)}
                                    />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div className="small">Optional</div>
                                    <select
                                      className="select"
                                      value={String(Boolean(activeProfile.optional))}
                                      onChange={(e) => patchProfile(activeProfile.id, { optional: e.target.value === "true" } as any)}
                                    >
                                      <option value="false">false</option>
                                      <option value="true">true</option>
                                    </select>
                                  </div>
                                </div>
                              ) : null}

                              {activeProfile.type === "AREA_RADIUS" ? (
                                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                  <div style={{ flex: 1 }}>
                                    <div className="small">AoE Radius</div>
                                    <input
                                      className="input"
                                      type="number"
                                      value={Number((activeProfile as any).area?.radius ?? 0)}
                                      onChange={(e) =>
                                        patchProfile(activeProfile.id, {
                                          area: { ...((activeProfile as any).area ?? { includeCenter: true }), radius: clampInt(e.target.value, 0, 30) }
                                        } as any)
                                      }
                                    />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div className="small">Include Center</div>
                                    <select
                                      className="select"
                                      value={String(Boolean((activeProfile as any).area?.includeCenter ?? true))}
                                      onChange={(e) =>
                                        patchProfile(activeProfile.id, {
                                          area: { ...((activeProfile as any).area ?? { radius: 1 }), includeCenter: e.target.value === "true" }
                                        } as any)
                                      }
                                    >
                                      <option value="true">true</option>
                                      <option value="false">false</option>
                                    </select>
                                  </div>
                                </div>
                              ) : null}

                              <details style={{ marginTop: 10 }}>
                                <summary className="small" style={{ cursor: "pointer" }}>
                                  Constraints
                                </summary>

                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                  <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean((activeProfile as any).constraints?.excludeSelf)}
                                      onChange={(e) =>
                                        patchProfile(activeProfile.id, {
                                          constraints: { ...((activeProfile as any).constraints ?? {}), excludeSelf: e.target.checked }
                                        } as any)
                                      }
                                    />
                                    Exclude Self
                                  </label>
                                </div>

                                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                  <div style={{ flex: 1 }}>
                                    <div className="small">Exclude Target Set (name)</div>
                                    <select
                                      className="select"
                                      value={String((activeProfile as any).constraints?.excludeTargetSet ?? "")}
                                      onChange={(e) =>
                                        patchProfile(activeProfile.id, {
                                          constraints: { ...((activeProfile as any).constraints ?? {}), excludeTargetSet: e.target.value || undefined }
                                        } as any)
                                      }
                                    >
                                      <option value="">(none)</option>
                                      {profiles.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.id}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div style={{ flex: 1 }}>
                                    <div className="small">Must Be Adjacent To (set)</div>
                                    <select
                                      className="select"
                                      value={String((activeProfile as any).constraints?.mustBeAdjacentTo ?? "")}
                                      onChange={(e) =>
                                        patchProfile(activeProfile.id, {
                                          constraints: { ...((activeProfile as any).constraints ?? {}), mustBeAdjacentTo: e.target.value || undefined }
                                        } as any)
                                      }
                                    >
                                      <option value="">(none)</option>
                                      {profiles.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.id}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div className="small" style={{ marginTop: 8 }}>
                                  (Constraints reference target sets by name — best practice is to keep saveAs == profileId.)
                                </div>
                              </details>

                              {showHexPicker ? (
                                <HexTargetPicker
                                  minRange={pMin}
                                  maxRange={pMax}
                                  aoeRadius={pAoe}
                                  includeCenter={pIncludeCenter}
                                  lineOfSight={pLoS}
                                  value={hexPickerByAbility[activeAbilityIdx]?.[activeProfile.id]}
                                  onChange={(next) =>
                                    setHexPickerByAbility((m) => ({
                                      ...m,
                                      [activeAbilityIdx]: { ...(m[activeAbilityIdx] ?? {}), [activeProfile.id]: next }
                                    }))
                                  }
                                />
                              ) : (
                                <div className="small" style={{ marginTop: 10 }}>
                                  Hex preview hidden for origin=ANYWHERE or type=SELF.
                                </div>
                              )}
                            </>
                          ) : null}
                        </>
                      )}
                    </>
                  )}

                  {/* STEP editor */}
                  {isStep && selectedStep ? (
                    <>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                        <div style={{ flex: 1 }}>
                          <div className="small">Step Type</div>
                          <div style={{ fontWeight: 800 }}>{selectedStep.type}</div>
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

                      {/* New: SELECT_TARGETS editor */}
                      {selectedStep.type === "SELECT_TARGETS" ? (
                        <div style={{ marginTop: 10 }}>
                          <div className="small">profileId</div>
                          <select
                            className="select"
                            value={(selectedStep as any).profileId ?? ""}
                            onChange={(e) => patchStep(selectedStepIdx, { profileId: e.target.value })}
                          >
                            <option value="">(select)</option>
                            {profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.id}
                              </option>
                            ))}
                          </select>

                          <div className="small" style={{ marginTop: 8 }}>
                            saveAs (target set name)
                          </div>
                          <input
                            className="input"
                            value={(selectedStep as any).saveAs ?? ""}
                            onChange={(e) => patchStep(selectedStepIdx, { saveAs: e.target.value })}
                            placeholder="e.g. primary"
                          />

                          <div className="small" style={{ marginTop: 8 }}>
                            Tip: keep saveAs == profileId (best practice)
                          </div>
                        </div>
                      ) : null}

                      {/* New: FOR_EACH_TARGET editor */}
                      {selectedStep.type === "FOR_EACH_TARGET" ? (
                        <div style={{ marginTop: 10 }}>
                          <div className="small">targetSet.ref</div>
                          <select
                            className="select"
                            value={(selectedStep as any).targetSet?.ref ?? ""}
                            onChange={(e) => patchStep(selectedStepIdx, { targetSet: { ref: e.target.value } })}
                          >
                            <option value="">(select)</option>
                            {availableTargetSets.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>

                          <div className="small" style={{ marginTop: 10 }}>
                            do (steps)
                          </div>
                          <StepListEditor
                            title="FOR_EACH_TARGET.do"
                            steps={(selectedStep as any).do ?? []}
                            onChange={(nextSteps: Step[]) => patchStep(selectedStepIdx, { do: nextSteps })}
                          />
                        </div>
                      ) : null}

                      {/* Existing nested editors */}
                      {selectedStep.type === "IF_ELSE" || selectedStep.type === "OPPONENT_SAVE" ? (
                        <StepListEditor
                          title="Nested Step Editor"
                          steps={[selectedStep]}
                          onChange={(next) => setStep(selectedStepIdx, next[0] as any)}
                        />
                      ) : null}

                      {/* Base editors for other step types */}
                      {selectedStep.type !== "IF_ELSE" &&
                      selectedStep.type !== "OPPONENT_SAVE" &&
                      selectedStep.type !== "SELECT_TARGETS" &&
                      selectedStep.type !== "FOR_EACH_TARGET" ? (
                        <div style={{ marginTop: 10 }}>
                          {selectedStep.type === "SHOW_TEXT" ? (
                            <>
                              <div className="small">Text</div>
                              <textarea
                                className="textarea"
                                value={(selectedStep as any).text ?? ""}
                                onChange={(e) => patchStep(selectedStepIdx, { text: e.target.value })}
                              />
                            </>
                          ) : null}

                          {(selectedStep.type === "ROLL_D6" || selectedStep.type === "ROLL_D20") ? (
                            <>
                              <div className="small">saveAs</div>
                              <input
                                className="input"
                                value={(selectedStep as any).saveAs ?? ""}
                                onChange={(e) => patchStep(selectedStepIdx, { saveAs: e.target.value || undefined })}
                              />
                            </>
                          ) : null}

                          {selectedStep.type === "SET_VARIABLE" ? (
                            <>
                              <div className="small">saveAs</div>
                              <input
                                className="input"
                                value={(selectedStep as any).saveAs ?? ""}
                                onChange={(e) => patchStep(selectedStepIdx, { saveAs: e.target.value })}
                              />
                              <div className="small" style={{ marginTop: 8 }}>
                                valueExpr
                              </div>
                              <ExpressionEditor
                                value={(selectedStep as any).valueExpr}
                                onChange={(valueExpr) => patchStep(selectedStepIdx, { valueExpr })}
                              />
                            </>
                          ) : null}

                          {selectedStep.type === "DEAL_DAMAGE" ? (
                            <>
                              <div className="small">Damage Type</div>
                              <select
                                className="select"
                                value={(selectedStep as any).damageType}
                                onChange={(e) => patchStep(selectedStepIdx, { damageType: e.target.value })}
                              >
                                {(blockRegistry.keys.DamageType as string[]).map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                              </select>
                              <div className="small" style={{ marginTop: 8 }}>
                                Amount Expression
                              </div>
                              <ExpressionEditor
                                value={(selectedStep as any).amountExpr}
                                onChange={(amountExpr) => patchStep(selectedStepIdx, { amountExpr })}
                              />
                            </>
                          ) : null}

                          {selectedStep.type === "HEAL" ? (
                            <>
                              <div className="small">Amount Expression</div>
                              <ExpressionEditor
                                value={(selectedStep as any).amountExpr}
                                onChange={(amountExpr) => patchStep(selectedStepIdx, { amountExpr })}
                              />
                            </>
                          ) : null}

                          {selectedStep.type === "APPLY_STATUS" ? (
                            <>
                              <div className="small">Status</div>
                              <select
                                className="select"
                                value={(selectedStep as any).status}
                                onChange={(e) => patchStep(selectedStepIdx, { status: e.target.value })}
                              >
                                {(blockRegistry.keys.StatusKey as string[]).map((s) => (
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
                                onChange={(e) =>
                                  patchStep(selectedStepIdx, {
                                    duration: { turns: Math.max(1, Math.floor(Number(e.target.value) || 1)) }
                                  })
                                }
                              />
                            </>
                          ) : null}
                        </div>
                      ) : null}

                      <details style={{ marginTop: 10 }}>
                        <summary className="small" style={{ cursor: "pointer" }}>
                          Raw Step JSON
                        </summary>
                        <pre>{JSON.stringify(selectedStep, null, 2)}</pre>
                      </details>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="panel" style={{ flex: "1 1 30%", minHeight: 0 }}>
            <div className="ph">
              <div>
                <div className="h2">Preview</div>
                <div className="small">Card JSON (read-only)</div>
              </div>
              <span className="badge">{(card as any).schemaVersion}</span>
            </div>
            <div className="pb">
              <pre>{JSON.stringify(card, null, 2)}</pre>
            </div>
          </div>

          <div className="panel" style={{ flex: "0 0 190px", minHeight: 0 }}>
            <div className="ph">
              <div>
                <div className="h2">Compile</div>
                <div className="small">Schema + core invariants</div>
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
        title="Import CJ Card JSON (CJ-1.0/CJ-1.1) or FORGE-1.0 project"
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

      {/* Catalog modal */}
      <Modal
        open={catalogOpen}
        title="Catalog Editor (Factions / Unit Types / Attributes)"
        onClose={() => {
          setCatalogOpen(false);
          setCatalogErr(null);
        }}
        footer={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              onClick={() => {
                resetCatalog();
                const fresh = loadCatalog();
                setCatalog(fresh);
                setCatalogText(JSON.stringify(fresh, null, 2));
                setCatalogErr(null);
              }}
            >
              Reset to Default
            </button>
            <button
              className="btn btnPrimary"
              onClick={() => {
                setCatalogErr(null);
                try {
                  const parsed = JSON.parse(catalogText);
                  const normalized = normalizeCatalog(parsed);
                  setCatalog(normalized);
                  setCatalogOpen(false);
                } catch (e: any) {
                  setCatalogErr(e.message ?? String(e));
                }
              }}
            >
              Save
            </button>
          </div>
        }
      >
        {catalogErr ? (
          <div className="err">
            <b>Catalog error</b>
            <div className="small">{catalogErr}</div>
          </div>
        ) : null}
        <div className="small" style={{ marginBottom: 8 }}>
          Edit JSON and Save (stored in localStorage).
        </div>
        <textarea className="textarea" style={{ minHeight: 320 }} value={catalogText} onChange={(e) => setCatalogText(e.target.value)} />
      </Modal>

      {/* Card preview modal */}
      <Modal open={previewOpen} title="Card Preview" onClose={() => setPreviewOpen(false)}>
        <CardPreview card={card} />
      </Modal>
    </div>
  );
}
