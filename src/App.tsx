// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, Handle, Position } from "reactflow";
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
  StatusKey,
  TargetingType,
  TargetOrigin,
  LoSMode,
  LoSBlockPolicy
} from "./lib/types";
import { makeDefaultStep } from "./lib/stepFactory";

import { makeDefaultCard, canonicalToGraph, abilitySummary } from "./lib/graph";
import { loadMigratedCardOrDefault, saveCardJson, clearSaved } from "./lib/storage";
import { validateCard, type ValidationIssue } from "./lib/schemas";
import { migrateCard } from "./lib/migrations";
import {
  blockRegistry,
  blockRegistryCacheBustingUrl,
  blockRegistryVersion,
  getStepGroups,
  isStepTypeAllowed
} from "./lib/registry";

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
  upsertStep,
  type ActionLibrary
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

const BLOCK_REGISTRY_VERSION_KEY = "cj_block_registry_version";

function coerceStepType(step: any) {
  if (step?.type === "UNKNOWN_STEP" && step?.raw?.type && isStepTypeAllowed(step.raw.type)) {
    return { ...step.raw };
  }
  if (!step?.type) return { type: "UNKNOWN_STEP", raw: step };
  if (!isStepTypeAllowed(step.type)) return { type: "UNKNOWN_STEP", raw: step };
  return step;
}

function coerceStepTree(step: any): Step {
  const base = coerceStepType(step);
  if (!base || typeof base !== "object") return base as Step;

  switch (base.type) {
    case "IF_ELSE":
      return {
        ...base,
        then: coerceStepList(base.then),
        elseIf: Array.isArray(base.elseIf)
          ? base.elseIf.map((branch: any) => ({ ...branch, then: coerceStepList(branch.then) }))
          : base.elseIf,
        else: coerceStepList(base.else)
      };
    case "OPPONENT_SAVE":
      return { ...base, onFail: coerceStepList(base.onFail), onSuccess: coerceStepList(base.onSuccess) };
    case "FOR_EACH_TARGET":
      return { ...base, do: coerceStepList(base.do) };
    case "REGISTER_INTERRUPTS":
      return { ...base, onInterrupt: coerceStepList(base.onInterrupt) };
    case "PROPERTY_CONTEST":
      return { ...base, onWin: coerceStepList(base.onWin), onLose: coerceStepList(base.onLose) };
    default:
      return base as Step;
  }
}

function coerceStepList(maybeSteps: any): Step[] {
  if (!Array.isArray(maybeSteps)) return [];
  return maybeSteps.map((s) => coerceStepTree(s));
}

// Un-UNKNOWN recovery:
// If a step was previously coerced into UNKNOWN_STEP, but registry now knows it,
// restore it from raw. Also re-run nested branches (IF_ELSE, interrupts, contests).
function coerceUnknownSteps(card: any) {
  if (!card) return card;
  const components = Array.isArray(card?.components)
    ? card.components.map((comp: any) => {
        if (comp?.componentType !== "ABILITY") return comp;
        if (!comp.execution) return comp;
        return { ...comp, execution: { ...comp.execution, steps: coerceStepList(comp.execution.steps) } };
      })
    : card?.components;

  return { ...card, components };
}

function coerceLibrary(lib: ActionLibrary): ActionLibrary {
  if (!lib) return lib;
  return {
    ...lib,
    abilities: Array.isArray(lib.abilities)
      ? lib.abilities.map((entry) => ({
          ...entry,
          ability: entry.ability?.execution
            ? { ...entry.ability, execution: { ...entry.ability.execution, steps: coerceStepList(entry.ability.execution.steps) } }
            : entry.ability
        }))
      : [],
    steps: Array.isArray(lib.steps)
      ? lib.steps.map((entry) => ({
          ...entry,
          step: coerceStepTree(entry.step)
        }))
      : []
  };
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
          <div className="nodeS">{(step as any)?.type ?? "—"}</div>
        </div>
        <span className="badge">{(step as any)?.type ?? "—"}</span>
      </div>
      <div className="nodeB">{(step as any)?.type === "SHOW_TEXT" ? `“${(step as any).text}”` : "Select to edit"}</div>
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

type AiRefImage = { name: string; mime: string; dataUrl: string };

export default function App() {
  const [mode, setMode] = useState<AppMode>("FORGE");

  const [card, setCard] = useState<CardEntity>(() => {
    const migrated = loadMigratedCardOrDefault(makeDefaultCard);
    return coerceUnknownSteps(migrated) as CardEntity;
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

  // Registry upgrades: reload cached cards/libraries and prefetch cache-busted registry asset
  useEffect(() => {
    const lastVersion = localStorage.getItem(BLOCK_REGISTRY_VERSION_KEY);
    if (lastVersion === blockRegistryVersion) return;

    localStorage.setItem(BLOCK_REGISTRY_VERSION_KEY, blockRegistryVersion);
    setCard((prev) => coerceUnknownSteps(prev));
    setLibrary((prev) => coerceLibrary(prev));
  }, []);

  useEffect(() => {
    const linkId = "cj-block-registry-prefetch";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "prefetch";
      link.as = "fetch";
      document.head.appendChild(link);
    }
    link.href = blockRegistryCacheBustingUrl;
  }, []);

  // AI Image modal
  const [aiImgOpen, setAiImgOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<"OPENAI" | "GEMINI">(
    () => (localStorage.getItem("cj_ai_provider") as any) ?? "OPENAI"
  );
  const [aiModel, setAiModel] = useState<string>(() => localStorage.getItem("cj_ai_model") ?? "gpt-image-1");
  const [aiApiKey, setAiApiKey] = useState<string>(() => localStorage.getItem("cj_ai_key") ?? "");
  const [aiProxyUrl, setAiProxyUrl] = useState<string>(() => localStorage.getItem("cj_ai_proxy") ?? "");
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiNegative, setAiNegative] = useState<string>("");
  const [aiSizeW, setAiSizeW] = useState<number>(768);
  const [aiSizeH, setAiSizeH] = useState<number>(1024);
  const [aiRefs, setAiRefs] = useState<AiRefImage[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiLastResponse, setAiLastResponse] = useState<any>(null);

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

  useEffect(() => {
    localStorage.setItem("cj_ai_provider", aiProvider);
    localStorage.setItem("cj_ai_model", aiModel);
    localStorage.setItem("cj_ai_key", aiApiKey);
    localStorage.setItem("cj_ai_proxy", aiProxyUrl);
  }, [aiProvider, aiModel, aiApiKey, aiProxyUrl]);

  function getAbilityByIndex(idx: number) {
    const ability = card.components[idx] as any;
    if (!ability || ability.componentType !== "ABILITY") return null;
    return ability as AbilityComponent;
  }

  const ability = getAbilityByIndex(activeAbilityIdx);

  // keep activeProfileId valid for current ability
  useEffect(() => {
    const profiles = (ability as any)?.targetingProfiles ?? [];
    if (!profiles.length) return;
    const exists = profiles.some((p: any) => p.id === activeProfileId);
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
    const steps = ((ability as any).execution?.steps ?? []).slice();
    steps[stepIdx] = { ...(steps[stepIdx] as any), ...patch };
    setAbility({ execution: { steps } } as any);
  }

  function deleteStep(stepIdx: number) {
    if (!ability) return;
    const steps = ((ability as any).execution?.steps ?? []).slice();
    steps.splice(stepIdx, 1);
    setAbility({ execution: { steps } } as any);
  }

  function moveStep(stepIdx: number, dir: -1 | 1) {
    if (!ability) return;
    const steps = ((ability as any).execution?.steps ?? []).slice();
    const j = stepIdx + dir;
    if (j < 0 || j >= steps.length) return;
    const tmp = steps[stepIdx];
    steps[stepIdx] = steps[j];
    steps[j] = tmp;
    setAbility({ execution: { steps } } as any);
  }

  function addStep(stepType: string) {
    if (!ability) return;
    const steps = ((ability as any).execution?.steps ?? []).slice();

    const profiles = ((ability as any).targetingProfiles ?? []).map((p: any) => p?.id).filter(Boolean) as string[];
    steps.push(makeDefaultStep(stepType, { abilityProfiles: profiles }));
    setAbility({ execution: { steps } } as any);
  }

  function exportCardJson() {
    download(cardFileName(card, card.schemaVersion ?? "CJ"), JSON.stringify(card, null, 2));
  }

  function doImport() {
    setImportError(null);
    try {
      const parsed = JSON.parse(importText);
      const migrated = migrateCard(parsed);
      const incoming = coerceUnknownSteps(migrated) as CardEntity;
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
      cost: { ap: 1, tokens: {} as any } as any,
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
    } as any;

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

  // ---------- Action Library helpers ----------
  function saveActiveAbilityToLibrary() {
    if (!ability) return;
    const id = `${card.id}::${(ability as any).name}`.replace(/\s+/g, "_").toLowerCase();
    const next = upsertAbility(library, { id, name: (ability as any).name, ability });
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

  // --- ReactFlow graph (persistent selection) ---
  const { nodes, edges } = useMemo(() => {
    const comps = card.components.slice();
    const firstAbilityIdx = comps.findIndex((c: any) => c?.componentType === "ABILITY");
    const viewCard =
      firstAbilityIdx < 0 || activeAbilityIdx === firstAbilityIdx
        ? card
        : (() => {
            const tmp = comps[firstAbilityIdx];
            comps[firstAbilityIdx] = comps[activeAbilityIdx];
            comps[activeAbilityIdx] = tmp;
            return { ...card, components: comps } as CardEntity;
          })();

    const g = canonicalToGraph(viewCard);

    const patchedNodes = g.nodes.map((n: any) => {
      const selected = selectedNodeId === n.id;
      const patched = { ...n, selected };

      if (typeof patched?.data?.abilityIdx === "number") {
        patched.data = { ...patched.data, abilityIdx: activeAbilityIdx };
      }
      return patched;
    });

    return { nodes: patchedNodes, edges: g.edges };
  }, [card, activeAbilityIdx, selectedNodeId]);

  // selection cleanup if node disappears
  useEffect(() => {
    if (!selectedNodeId) return;
    if (!(nodes as any[]).some((n) => n.id === selectedNodeId)) setSelectedNodeId(null);
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

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return (nodes as any[]).find((n) => n.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  const selectedInfo = (selectedNode as any)?.data ?? null;
  const selectedKind = selectedInfo?.kind ?? null;

  const selectedStepIdx = selectedKind === "STEP" ? selectedInfo.stepIdx : null;
  const selectedStep =
    selectedStepIdx != null && (ability as any)?.execution?.steps ? ((ability as any).execution.steps[selectedStepIdx] as Step) : null;

  // ---- Target profile editing helpers ----
  const TARGETING_TYPES: TargetingType[] = [
    "SELF",
    "SINGLE_TARGET",
    "AREA_RADIUS",
    "AREA_AROUND_TARGET",
    "LINE",
    "CONE",
    "GLOBAL_ANYWHERE"
  ];
  const TARGET_ORIGINS: TargetOrigin[] = ["SOURCE", "TARGET", "ANYWHERE"];
  const LOS_MODES: LoSMode[] = ["HEX_RAYCAST", "SQUARE_RAYCAST", "NONE", "ADVISORY"];
  const LOS_POLICIES: LoSBlockPolicy[] = ["BLOCK_ALL", "BLOCK_RANGED", "BLOCK_AOE", "BLOCK_MAGIC", "BLOCK_NON_MAGICAL"];

  const profiles = ((ability as any)?.targetingProfiles ?? []) as any[];
  const activeProfile = profiles.find((p: any) => p.id === activeProfileId) ?? profiles[0];

  function setProfiles(nextProfiles: any[]) {
    const cloned = (nextProfiles ?? []).map((p) => ({
      ...(p ?? {}),
      range: p?.range ? { ...p.range } : undefined,
      los: p?.los
        ? {
            ...p.los,
            blockers: Array.isArray(p.los.blockers)
              ? p.los.blockers.map((b: any) => ({ ...b, tags: Array.isArray(b.tags) ? [...b.tags] : [] }))
              : undefined
          }
        : undefined,
      area: p?.area ? { ...p.area } : undefined
    }));
    setAbility({ targetingProfiles: cloned } as any);
  }

  function updateActiveProfile(updater: (profile: any) => any) {
    if (!activeProfile) return;
    const next = (profiles ?? []).map((p: any) => (p.id === activeProfile.id ? updater({ ...p }) : { ...p }));
    setProfiles(next);
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

  // ---------- AI Image Generate ----------
  function buildAiImageRequest() {
    return {
      provider: aiProvider,
      model: aiModel,
      apiKey: aiApiKey || undefined, // you can omit if proxy injects it
      size: { width: aiSizeW, height: aiSizeH },
      prompt: aiPrompt,
      negativePrompt: aiNegative || undefined,
      references: aiRefs.map((r) => ({ name: r.name, mime: r.mime, dataUrl: r.dataUrl })),
      output: "dataUrl",
      meta: {
        cardId: card.id,
        cardName: card.name
      }
    };
  }

  function dataUrlToBase64(dataUrl: string) {
    const idx = dataUrl.indexOf(",");
    return idx === -1 ? dataUrl : dataUrl.slice(idx + 1);
  }

  function extractImageFromPayload(payload: any) {
    if (!payload) return null;

    const direct = payload?.imageDataUrl ?? payload?.dataUrl ?? payload?.imageUrl ?? payload?.url ?? null;
    if (direct) return direct;

    const openAi = payload?.data?.[0];
    if (openAi?.b64_json) return `data:image/png;base64,${openAi.b64_json}`;
    if (openAi?.url) return openAi.url;

    const gemImages = payload?.images ?? [];
    const gemInline = gemImages[0]?.inlineData;
    if (gemInline?.data) return `data:${gemInline.mimeType ?? "image/png"};base64,${gemInline.data}`;
    if (gemImages[0]?.url || gemImages[0]?.imageUri) return gemImages[0].url ?? gemImages[0].imageUri;

    const candidateParts = payload?.candidates?.[0]?.content?.parts ?? [];
    const inlinePart = candidateParts.find((p: any) => p?.inlineData?.data);
    if (inlinePart?.inlineData?.data) {
      return `data:${inlinePart.inlineData.mimeType ?? "image/png"};base64,${inlinePart.inlineData.data}`;
    }

    return null;
  }

  async function callAiImageProxy(proxyUrl: string, req: ReturnType<typeof buildAiImageRequest>) {
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req)
    });

    const text = await res.text();
    const parsed = safeJsonParse(text);
    const payload = parsed.ok ? parsed.value : { raw: text };

    if (!res.ok) {
      throw Object.assign(new Error(payload?.error ?? `Proxy returned ${res.status}`), { payload });
    }

    return { image: extractImageFromPayload(payload), payload };
  }

  async function callOpenAiDirect(req: ReturnType<typeof buildAiImageRequest>) {
    const promptSegments = [req.prompt];
    if (req.negativePrompt?.trim()) promptSegments.push(`Negative prompt: ${req.negativePrompt.trim()}`);
    if (req.references?.length) promptSegments.push(`Reference images: ${req.references.map((r) => r.name).join(", ")}`);

    const body = {
      model: req.model || "gpt-image-1",
      prompt: promptSegments.join("\n\n"),
      size: `${req.size.width}x${req.size.height}`,
      response_format: "b64_json",
      n: 1
    };

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`
      },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    const parsed = safeJsonParse(text);
    const payload = parsed.ok ? parsed.value : { raw: text };

    if (!res.ok) {
      throw Object.assign(new Error(payload?.error?.message ?? payload?.error ?? `OpenAI returned ${res.status}`), { payload });
    }

    return { image: extractImageFromPayload(payload), payload };
  }

  async function callGeminiDirect(req: ReturnType<typeof buildAiImageRequest>) {
    const parts: any[] = [];
    if (req.prompt) parts.push({ text: req.prompt });
    if (req.negativePrompt?.trim()) parts.push({ text: `Negative prompt: ${req.negativePrompt.trim()}` });

    if (req.references?.length) {
      parts.push(
        ...req.references.map((r) => ({
          inlineData: {
            data: dataUrlToBase64(r.dataUrl),
            mimeType: r.mime || "image/png"
          }
        }))
      );
    }

    const body = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "image/png",
        responseImageDimensions: { width: req.size.width, height: req.size.height }
      }
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent?key=${encodeURIComponent(String(req.apiKey))}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );

    const text = await res.text();
    const parsed = safeJsonParse(text);
    const payload = parsed.ok ? parsed.value : { raw: text };

    if (!res.ok) {
      throw Object.assign(new Error(payload?.error?.message ?? payload?.error ?? `Gemini returned ${res.status}`), { payload });
    }

    return { image: extractImageFromPayload(payload), payload };
  }

  async function callAiProviderDirect(req: ReturnType<typeof buildAiImageRequest>) {
    if (!req.apiKey?.trim()) {
      throw new Error("Direct provider calls require an API key. Add a proxy URL or enter your provider key.");
    }

    if (req.provider === "OPENAI") return callOpenAiDirect(req);
    if (req.provider === "GEMINI") return callGeminiDirect(req);
    throw new Error(`Unsupported AI provider: ${req.provider}`);
  }

  async function runAiImageGenerate() {
    setAiErr(null);
    setAiLastResponse(null);

    const req = buildAiImageRequest();

    const proxyUrl = aiProxyUrl.trim();
    setAiBusy(true);
    try {
      const { image, payload } = proxyUrl ? await callAiImageProxy(proxyUrl, req) : await callAiProviderDirect(req);
      setAiLastResponse(payload);

      const nextImage = image ?? extractImageFromPayload(payload);
      if (nextImage) {
        setCard({
          ...card,
          visuals: { ...(card.visuals ?? {}), cardImage: nextImage }
        });
      } else {
        setAiErr("Provider response did not include an image payload or URL.");
      }
    } catch (e: any) {
      setAiErr(e?.message ?? String(e));
      setAiLastResponse(e?.payload ?? req);
    } finally {
      setAiBusy(false);
    }
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
            <button className="btn" onClick={() => setMode("FORGE")}>
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
          <button className="btn" onClick={() => setMode("LIBRARY")}>
            Library
          </button>
          <button className="btn" onClick={() => setMode("DECKS")}>
            Decks
          </button>
          <button className="btn" onClick={() => setMode("SCENARIOS")}>
            Scenarios
          </button>

          <span style={{ width: 1, background: "var(--border)", opacity: 0.6, margin: "0 6px" }} />

          <button className="btn" onClick={() => setPreviewOpen(true)}>
            Preview Card
          </button>
          <button className="btn" onClick={() => setAiImgOpen(true)}>
            AI Image
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
            <span className="badge">{(blockRegistry.steps.types as string[]).length}</span>
          </div>

          <div className="pb">
            <div className="small">Active Ability</div>
            <select className="select" value={String(activeAbilityIdx)} onChange={(e) => setActiveAbilityIdx(Number(e.target.value))}>
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
              <button className="btn" style={{ flex: 1 }} onClick={() => selectedStep && saveSelectedStepToLibrary(selectedStep)} disabled={!selectedStep}>
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
              nodes={nodes as any}
              edges={edges as any}
              nodeTypes={nodeTypes as any}
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

                <div className="small" style={{ marginTop: 8 }}>
                  Upload Image (stores as Data URL — ok for MVP)
                </div>
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const dataUrl = String(reader.result);
                      setCard({ ...card, visuals: { ...(card.visuals ?? {}), cardImage: dataUrl } });
                    };
                    reader.readAsDataURL(file);
                  }}
                />

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="small">Image Align</div>
                    <select
                      className="select"
                      value={(card.visuals as any)?.imageAlign ?? "CENTER"}
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
                      value={(card.visuals as any)?.imageFit ?? "COVER"}
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

                <button className="btn" style={{ marginTop: 10 }} onClick={() => setAiImgOpen(true)}>
                  AI Generate Image…
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
                  {(selectedKind === "ABILITY_ROOT" || !selectedKind) && (
                    <>
                      <div className="small">Ability Name</div>
                      <input className="input" value={(ability as any).name} onChange={(e) => setAbility({ name: e.target.value })} />

                      <div className="small" style={{ marginTop: 8 }}>
                        Description
                      </div>
                      <textarea className="textarea" value={(ability as any).description ?? ""} onChange={(e) => setAbility({ description: e.target.value })} />

                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div className="small">Trigger</div>
                          <select className="select" value={(ability as any).trigger} onChange={(e) => setAbility({ trigger: e.target.value as any })}>
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
                            value={(ability as any).cost?.ap ?? 0}
                            onChange={(e) => setAbility({ cost: { ...((ability as any).cost ?? { ap: 0 }), ap: Number(e.target.value) } } as any)}
                          />
                        </div>
                      </div>

                      <div className="small" style={{ marginTop: 8 }}>
                        Requirements (Condition)
                      </div>
                      <ConditionEditor value={(ability as any).requirements ?? { type: "ALWAYS" }} onChange={(requirements) => setAbility({ requirements } as any)} />
                    </>
                  )}

                  {/* TARGETING editor */}
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
                        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div>
                            <div className="small">Label</div>
                            <input
                              className="input"
                              value={activeProfile.label ?? ""}
                              onChange={(e) => updateActiveProfile((p) => ({ ...p, label: e.target.value || undefined }))}
                              placeholder="Primary Target"
                            />
                          </div>

                          <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div className="small">Type</div>
                              <select
                                className="select"
                                value={activeProfile.type ?? "SELF"}
                                onChange={(e) => updateActiveProfile((p) => ({ ...p, type: e.target.value as TargetingType }))}
                              >
                                {TARGETING_TYPES.map((t) => (
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
                                value={activeProfile.origin ?? "SOURCE"}
                                onChange={(e) => updateActiveProfile((p) => ({ ...p, origin: e.target.value as TargetOrigin }))}
                              >
                                {TARGET_ORIGINS.map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <div className="small">Origin Ref (for chained targeting)</div>
                            <input
                              className="input"
                              value={activeProfile.originRef ?? ""}
                              onChange={(e) => updateActiveProfile((p) => ({ ...p, originRef: e.target.value || undefined }))}
                              placeholder="targets"
                            />
                          </div>

                          <div>
                            <div className="small">Range</div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <div className="small">Base</div>
                                <input
                                  className="input"
                                  type="number"
                                  value={activeProfile.range?.base ?? 0}
                                  onChange={(e) =>
                                    updateActiveProfile((p) => ({
                                      ...p,
                                      range: { ...(p.range ?? {}), base: Number(e.target.value) }
                                    }))
                                  }
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div className="small">Min</div>
                                <input
                                  className="input"
                                  type="number"
                                  value={activeProfile.range?.min ?? 0}
                                  onChange={(e) =>
                                    updateActiveProfile((p) => ({
                                      ...p,
                                      range: { ...(p.range ?? {}), min: Number(e.target.value) }
                                    }))
                                  }
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div className="small">Max</div>
                                <input
                                  className="input"
                                  type="number"
                                  value={activeProfile.range?.max ?? 0}
                                  onChange={(e) =>
                                    updateActiveProfile((p) => ({
                                      ...p,
                                      range: { ...(p.range ?? {}), max: Number(e.target.value) }
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(activeProfile.lineOfSight)}
                                onChange={(e) => updateActiveProfile((p) => ({ ...p, lineOfSight: e.target.checked }))}
                              />
                              Line of Sight Required
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(activeProfile.los?.required)}
                                onChange={(e) =>
                                  updateActiveProfile((p) => ({
                                    ...p,
                                    los: { ...(p.los ?? { mode: "HEX_RAYCAST", blockers: [] }), required: e.target.checked }
                                  }))
                                }
                              />
                              Strict LOS
                            </label>
                          </div>

                          <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div className="small">LOS Mode</div>
                              <select
                                className="select"
                                value={activeProfile.los?.mode ?? "HEX_RAYCAST"}
                                onChange={(e) =>
                                  updateActiveProfile((p) => ({
                                    ...p,
                                    los: { ...(p.los ?? { required: true, blockers: [] }), mode: e.target.value as LoSMode }
                                  }))
                                }
                              >
                                {LOS_MODES.map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ flex: 2 }}>
                              <div className="small">LOS Blockers</div>
                              {Array.isArray(activeProfile.los?.blockers) && activeProfile.los.blockers.length
                                ? activeProfile.los.blockers.map((b: any, i: number) => (
                                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                                      <select
                                        className="select"
                                        value={b.policy}
                                        onChange={(e) =>
                                          updateActiveProfile((p) => {
                                            const blockers = Array.isArray(p.los?.blockers) ? p.los.blockers.slice() : [];
                                            blockers[i] = { ...(blockers[i] ?? {}), policy: e.target.value as LoSBlockPolicy };
                                            return { ...p, los: { ...(p.los ?? {}), blockers } };
                                          })
                                        }
                                        style={{ flex: 1 }}
                                      >
                                        {LOS_POLICIES.map((pol) => (
                                          <option key={pol} value={pol}>
                                            {pol}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        className="input"
                                        style={{ flex: 2 }}
                                        placeholder="tags comma separated"
                                        value={(b.tags ?? []).join(", ")}
                                        onChange={(e) =>
                                          updateActiveProfile((p) => {
                                            const blockers = Array.isArray(p.los?.blockers) ? p.los.blockers.slice() : [];
                                            blockers[i] = {
                                              ...(blockers[i] ?? {}),
                                              tags: e.target.value
                                                .split(",")
                                                .map((t) => t.trim())
                                                .filter(Boolean)
                                            };
                                            return { ...p, los: { ...(p.los ?? {}), blockers } };
                                          })
                                        }
                                      />
                                      <button
                                        className="btn btnDanger"
                                        onClick={() =>
                                          updateActiveProfile((p) => {
                                            const blockers = Array.isArray(p.los?.blockers) ? p.los.blockers.slice() : [];
                                            blockers.splice(i, 1);
                                            return { ...p, los: { ...(p.los ?? {}), blockers } };
                                          })
                                        }
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))
                                : null}
                              <button
                                className="btn"
                                onClick={() =>
                                  updateActiveProfile((p) => {
                                    const blockers = Array.isArray(p.los?.blockers) ? p.los.blockers.slice() : [];
                                    blockers.push({ policy: LOS_POLICIES[0], tags: [] });
                                    return { ...p, los: { ...(p.los ?? { mode: "HEX_RAYCAST", required: true }), blockers } };
                                  })
                                }
                              >
                                + Add Blocker
                              </button>
                            </div>
                          </div>

                          <div>
                            <div className="small">Area</div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <div className="small">Radius</div>
                                <input
                                  className="input"
                                  type="number"
                                  value={activeProfile.area?.radius ?? 0}
                                  onChange={(e) =>
                                    updateActiveProfile((p) => ({
                                      ...p,
                                      area: { ...(p.area ?? {}), radius: Number(e.target.value) }
                                    }))
                                  }
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div className="small">Max Targets</div>
                                <input
                                  className="input"
                                  type="number"
                                  value={activeProfile.area?.maxTargets ?? 0}
                                  onChange={(e) =>
                                    updateActiveProfile((p) => ({
                                      ...p,
                                      area: { ...(p.area ?? {}), maxTargets: Number(e.target.value) }
                                    }))
                                  }
                                />
                              </div>
                              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(activeProfile.area?.includeCenter)}
                                  onChange={(e) =>
                                    updateActiveProfile((p) => ({
                                      ...p,
                                      area: { ...(p.area ?? {}), includeCenter: e.target.checked }
                                    }))
                                  }
                                />
                                Include Center
                              </label>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <details style={{ marginTop: 10 }}>
                        <summary className="small" style={{ cursor: "pointer" }}>
                          Raw Profiles JSON
                        </summary>
                        <pre style={{ margin: 0 }}>{JSON.stringify(profiles, null, 2)}</pre>
                      </details>
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
                        <button className="btn" onClick={() => moveStep(selectedStepIdx, +1)} disabled={((ability as any).execution?.steps?.length ?? 0) - 1 === selectedStepIdx}>
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

                        {(selectedStep as any).type === "DEAL_DAMAGE" && (
                          <>
                            <div className="small">Damage Type</div>
                            <select className="select" value={(selectedStep as any).damageType} onChange={(e) => setStep(selectedStepIdx, { damageType: e.target.value as DamageType })}>
                              {(blockRegistry.keys.DamageType as string[]).map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              Amount Expression
                            </div>
                            <ExpressionEditor value={(selectedStep as any).amountExpr} onChange={(amountExpr) => setStep(selectedStepIdx, { amountExpr })} />
                          </>
                        )}

                        {(selectedStep as any).type === "APPLY_STATUS" && (
                          <>
                            <div className="small">Status</div>
                            <select className="select" value={(selectedStep as any).status} onChange={(e) => setStep(selectedStepIdx, { status: e.target.value as StatusKey })}>
                              {(blockRegistry.keys.StatusKey as string[]).map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </>
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
          Unknown step types become <code>UNKNOWN_STEP</code> (and will auto-recover if registry later adds the type).
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

      {/* AI Image modal */}
      <Modal
        open={aiImgOpen}
        title="AI Image Generation (Builder Tool)"
        onClose={() => {
          setAiImgOpen(false);
          setAiErr(null);
        }}
        footer={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => download("cj_ai_image_request.json", JSON.stringify(buildAiImageRequest(), null, 2))}>
              Download Request JSON
            </button>
            <button className="btn btnPrimary" disabled={aiBusy || !aiPrompt.trim()} onClick={runAiImageGenerate}>
              {aiBusy ? "Generating..." : "Generate"}
            </button>
          </div>
        }
      >
        {aiErr ? (
          <div className="err">
            <b>AI error</b>
            <div className="small">{aiErr}</div>
          </div>
        ) : null}

        <div className="small">Provider</div>
        <select className="select" value={aiProvider} onChange={(e) => setAiProvider(e.target.value as any)}>
          <option value="OPENAI">OpenAI</option>
          <option value="GEMINI">Gemini</option>
        </select>

        <div className="small" style={{ marginTop: 8 }}>
          Model (free text)
        </div>
        <input className="input" value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder="e.g. gpt-image-1 / nano-banana-pro" />

        <div className="small" style={{ marginTop: 8 }}>
          API Key (stored locally; optional if proxy handles keys)
        </div>
        <input className="input" value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)} placeholder="sk-..." />

        <div className="small" style={{ marginTop: 8 }}>
          Proxy URL (recommended for CORS; example: http://localhost:8787/ai/image)
        </div>
        <input className="input" value={aiProxyUrl} onChange={(e) => setAiProxyUrl(e.target.value)} placeholder="http://localhost:8787/ai/image" />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="small">Width</div>
            <input className="input" type="number" value={aiSizeW} onChange={(e) => setAiSizeW(Number(e.target.value))} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="small">Height</div>
            <input className="input" type="number" value={aiSizeH} onChange={(e) => setAiSizeH(Number(e.target.value))} />
          </div>
        </div>

        <div className="small" style={{ marginTop: 8 }}>
          Prompt
        </div>
        <textarea className="textarea" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Describe the card art..." />

        <div className="small" style={{ marginTop: 8 }}>
          Negative prompt (optional)
        </div>
        <textarea className="textarea" value={aiNegative} onChange={(e) => setAiNegative(e.target.value)} placeholder="No text, no watermark..." />

        <div className="small" style={{ marginTop: 8 }}>
          Reference images (optional)
        </div>
        <input
          className="input"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length) return;

            files.forEach((file) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = String(reader.result);
                setAiRefs((prev) => [...prev, { name: file.name, mime: file.type || "image/png", dataUrl }]);
              };
              reader.readAsDataURL(file);
            });

            e.currentTarget.value = "";
          }}
        />

        {aiRefs.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {aiRefs.map((r, idx) => (
              <div key={idx} className="panel" style={{ width: 160 }}>
                <div className="pb">
                  <div className="small" style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.name}
                  </div>
                  <div style={{ width: "100%", height: 90, borderRadius: 8, overflow: "hidden", marginTop: 6 }}>
                    <img src={r.dataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <button className="btn btnDanger" style={{ marginTop: 8, width: "100%" }} onClick={() => setAiRefs((prev) => prev.filter((_, i) => i !== idx))}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <details style={{ marginTop: 12 }}>
          <summary className="small" style={{ cursor: "pointer" }}>
            Request / Response JSON (debug)
          </summary>
          <div className="small" style={{ marginTop: 8 }}>
            Request
          </div>
          <pre style={{ margin: 0 }}>{JSON.stringify(buildAiImageRequest(), null, 2)}</pre>
          <div className="small" style={{ marginTop: 8 }}>
            Last response
          </div>
          <pre style={{ margin: 0 }}>{JSON.stringify(aiLastResponse ?? {}, null, 2)}</pre>
        </details>
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
