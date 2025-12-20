import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, Handle, Position } from "reactflow";
import "reactflow/dist/style.css";

import type { CardEntity, Step, AbilityComponent } from "./lib/types";
import { makeDefaultCard, canonicalToGraph, abilitySummary } from "./lib/graph";
import { saveCardJson, clearSaved, loadMigratedCardOrDefault, loadCatalog, saveCatalog, resetCatalog } from "./lib/storage";
import { migrateCard } from "./lib/migrations";
import { validateCard, type ValidationIssue } from "./lib/schemas";
import { blockRegistry, isStepTypeAllowed } from "./lib/registry";

import { useHistoryState } from "./lib/history";
import { normalizeCatalog, type Catalog } from "./lib/catalog";

import { ExpressionEditor } from "./components/ExpressionEditor";
import { ConditionEditor } from "./components/ConditionEditor";
import { CardPreview } from "./components/CardPreview";
import StepListEditor from "./components/NestedStepsEditor";

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

function Modal(props: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
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
          {props.footer ? <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>{props.footer}</div> : null}
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

  const rangeObj: any = ability?.targeting?.range ?? {};
  const maxR = rangeObj.max ?? rangeObj.base ?? 0;
  const minR = rangeObj.min ?? 0;

  const desc =
    data.kind === "COST"
      ? `AP: ${ability?.cost?.ap ?? 0}`
      : `${ability?.targeting?.type ?? "—"} • Range ${minR}-${maxR}`;

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

export default function App() {
  // History-backed card state (undo/redo)
  const history = useHistoryState<CardEntity>(loadMigratedCardOrDefault(makeDefaultCard));
  const card = history.present;
  const setCard = history.set;

  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [selected, setSelected] = useState<any>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  // Catalog
  const [catalog, setCatalog] = useState<Catalog>(() => loadCatalog());
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogText, setCatalogText] = useState(JSON.stringify(catalog, null, 2));
  const [catalogErr, setCatalogErr] = useState<string | null>(null);

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
    setSelected(null);
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
          return { type: "ROLL_D6", saveAs: "roll" };
        case "ROLL_D20":
          return { type: "ROLL_D20", saveAs: "roll" };
        case "OPEN_REACTION_WINDOW":
          return { type: "OPEN_REACTION_WINDOW", timing: "BEFORE_DAMAGE", windowId: "pre_damage" } as any;
        case "DEAL_DAMAGE":
          return { type: "DEAL_DAMAGE", target: { type: "TARGET" } as any, amountExpr: { type: "CONST_NUMBER", value: 10 } as any, damageType: "PHYSICAL" as any } as any;
        case "HEAL":
          return { type: "HEAL", target: { type: "SELF" } as any, amountExpr: { type: "CONST_NUMBER", value: 10 } as any } as any;
        case "SET_VARIABLE":
          return { type: "SET_VARIABLE", saveAs: "var", valueExpr: { type: "CONST_NUMBER", value: 1 } as any } as any;
        case "APPLY_STATUS":
          return { type: "APPLY_STATUS", target: { type: "TARGET" } as any, status: "SLOWED" as any, duration: { turns: 1 } } as any;
        case "REMOVE_STATUS":
          return { type: "REMOVE_STATUS", target: { type: "SELF" } as any, status: "STUNNED" as any } as any;
        case "MOVE_ENTITY":
          return { type: "MOVE_ENTITY", target: { type: "SELF" } as any, to: { mode: "TARGET_POSITION" }, maxTiles: 5 } as any;
        case "OPPONENT_SAVE":
          return { type: "OPPONENT_SAVE", stat: "SPEED", difficulty: 13, onFail: [{ type: "SHOW_TEXT", text: "Fail" }], onSuccess: [{ type: "SHOW_TEXT", text: "Success" }] } as any;
        case "IF_ELSE":
          return { type: "IF_ELSE", condition: { type: "ALWAYS" } as any, then: [{ type: "SHOW_TEXT", text: "Then" }], else: [{ type: "SHOW_TEXT", text: "Else" }] } as any;
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
        nodes: nodes.map((n: any) => ({ id: n.id, x: n.position.x, y: n.position.y, kind: n.data.kind }))
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

      setSelected(null);
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
      cost: { ap: 1 },
      targeting: { type: "SINGLE_TARGET", range: { min: 0, max: 4, base: 4 }, lineOfSight: true } as any,
      execution: { steps: [{ type: "SHOW_TEXT", text: "Do something!" }] }
    };
    setCard({ ...card, components: [...card.components, newAbility as any] });
    setActiveAbilityIdx(card.components.length);
    setSelected(null);
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
    setSelected(null);
  }

  const selectedInfo = selected?.nodes?.[0]?.data ?? null;
  const selectedKind = selectedInfo?.kind ?? null;
  const selectedStepIdx = selectedKind === "STEP" ? selectedInfo.stepIdx : null;
  const selectedStep =
    selectedStepIdx != null && ability?.execution?.steps ? (ability.execution.steps[selectedStepIdx] as Step) : null;

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

          <button className="btn" onClick={() => setCatalogOpen(true)}>
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
              setSelected(null);
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
              setSelected(null);
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
                setSelected(null);
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
              <div className="small">Select nodes to edit on the right.</div>
            </div>
            <span className="badge">React Flow</span>
          </div>
          <div className="rfWrap">
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView onSelectionChange={setSelected} proOptions={{ hideAttribution: true }}>
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
                <div className="small">{selectedKind ?? "No selection"}</div>
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
                    <select
                      className="select"
                      value={card.faction ?? ""}
                      onChange={(e) => setCard({ ...card, faction: e.target.value || undefined })}
                    >
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
                            onChange={(e) => setAbility({ cost: { ...(ability.cost ?? {}), ap: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {selectedKind === "STEP" && selectedStep ? (
                    <>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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

                      {/* NESTED EDITOR ENABLED */}
                      {selectedStep.type === "IF_ELSE" || selectedStep.type === "OPPONENT_SAVE" ? (
                        <StepListEditor
                          title="Nested Step Editor"
                          steps={[selectedStep]}
                          onChange={(next) => setStep(selectedStepIdx, next[0] as any)}
                        />
                      ) : (
                        <div style={{ marginTop: 10 }}>
                          {selectedStep.type === "SHOW_TEXT" ? (
                            <>
                              <div className="small">Text</div>
                              <textarea className="textarea" value={(selectedStep as any).text ?? ""} onChange={(e) => patchStep(selectedStepIdx, { text: e.target.value })} />
                            </>
                          ) : null}

                          {(selectedStep.type === "ROLL_D6" || selectedStep.type === "ROLL_D20") ? (
                            <>
                              <div className="small">saveAs</div>
                              <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => patchStep(selectedStepIdx, { saveAs: e.target.value || undefined })} />
                            </>
                          ) : null}

                          {selectedStep.type === "SET_VARIABLE" ? (
                            <>
                              <div className="small">saveAs</div>
                              <input className="input" value={(selectedStep as any).saveAs ?? ""} onChange={(e) => patchStep(selectedStepIdx, { saveAs: e.target.value })} />
                              <div className="small" style={{ marginTop: 8 }}>
                                valueExpr
                              </div>
                              <ExpressionEditor value={(selectedStep as any).valueExpr} onChange={(valueExpr) => patchStep(selectedStepIdx, { valueExpr })} />
                            </>
                          ) : null}

                          {selectedStep.type === "DEAL_DAMAGE" ? (
                            <>
                              <div className="small">Damage Type</div>
                              <select className="select" value={(selectedStep as any).damageType} onChange={(e) => patchStep(selectedStepIdx, { damageType: e.target.value })}>
                                {(blockRegistry.keys.DamageType as string[]).map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                              </select>
                              <div className="small" style={{ marginTop: 8 }}>
                                Amount Expression
                              </div>
                              <ExpressionEditor value={(selectedStep as any).amountExpr} onChange={(amountExpr) => patchStep(selectedStepIdx, { amountExpr })} />
                            </>
                          ) : null}

                          {selectedStep.type === "HEAL" ? (
                            <>
                              <div className="small">Amount Expression</div>
                              <ExpressionEditor value={(selectedStep as any).amountExpr} onChange={(amountExpr) => patchStep(selectedStepIdx, { amountExpr })} />
                            </>
                          ) : null}

                          {selectedStep.type === "APPLY_STATUS" ? (
                            <>
                              <div className="small">Status</div>
                              <select className="select" value={(selectedStep as any).status} onChange={(e) => patchStep(selectedStepIdx, { status: e.target.value })}>
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
                                onChange={(e) => patchStep(selectedStepIdx, { duration: { turns: Math.max(1, Math.floor(Number(e.target.value) || 1)) } })}
                              />
                            </>
                          ) : null}

                          {selectedStep.type === "REMOVE_STATUS" ? (
                            <>
                              <div className="small">Status</div>
                              <select className="select" value={(selectedStep as any).status} onChange={(e) => patchStep(selectedStepIdx, { status: e.target.value })}>
                                {(blockRegistry.keys.StatusKey as string[]).map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : null}

                          {selectedStep.type === "MOVE_ENTITY" ? (
                            <>
                              <div className="small">Max Tiles</div>
                              <input
                                className="input"
                                type="number"
                                value={(selectedStep as any).maxTiles ?? 1}
                                onChange={(e) => patchStep(selectedStepIdx, { maxTiles: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                              />
                            </>
                          ) : null}

                          {selectedStep.type === "IF_ELSE" ? (
                            <>
                              <div className="small">Condition</div>
                              <ConditionEditor value={(selectedStep as any).condition} onChange={(condition) => patchStep(selectedStepIdx, { condition })} />
                            </>
                          ) : null}
                        </div>
                      )}

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
