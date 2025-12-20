import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, Handle, Position } from "reactflow";
import "reactflow/dist/style.css";

import type { CardEntity, Step, AbilityComponent } from "./lib/types";
import { makeDefaultCard, canonicalToGraph, abilitySummary } from "./lib/graph";
import { loadCardJson, saveCardJson, clearSaved } from "./lib/storage";
import { validateCard, type ValidationIssue } from "./lib/schemas";
import { blockRegistry, isStepTypeAllowed } from "./lib/registry";

import { ExpressionEditor } from "./components/ExpressionEditor";
import { ConditionEditor } from "./components/ConditionEditor";
import { CardPreview } from "./components/CardPreview";

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

// ---- React Flow node renderers (minimal) ----
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
      : `${ability?.targeting?.type ?? "—"} • Range ${ability?.targeting?.range?.base ?? 0}`;
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
  const [selected, setSelected] = useState<any>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  // Multi-ability: choose which ability we are editing in the canvas/palette/inspector
  const abilityIndexes = useMemo(() => findAbilityIndexes(card), [card]);
  const [activeAbilityIdx, setActiveAbilityIdx] = useState<number>(() => {
    const idxs = findAbilityIndexes(makeDefaultCard());
    return idxs[0] ?? 0;
  });

  // Keep activeAbilityIdx valid if card changes
  useEffect(() => {
    if (!abilityIndexes.length) return;
    if (!abilityIndexes.includes(activeAbilityIdx)) setActiveAbilityIdx(abilityIndexes[0]);
  }, [abilityIndexes, activeAbilityIdx]);

  useEffect(() => {
    setIssues(validateCard(card));
    // If you embed large images as Data URLs, localStorage may overflow.
    // This try/catch prevents the whole UI from breaking.
    try {
      saveCardJson(JSON.stringify(card));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Could not save card to local storage (possibly too large).", e);
    }
  }, [card]);

  const { nodes, edges } = useMemo(() => {
    // Render only the active ability graph. canonicalToGraph renders "first ability";
    // so we temporarily swap active ability into the first-ability slot for view.
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
          return { type: "OPEN_REACTION_WINDOW", timing: "BEFORE_DAMAGE", windowId: "pre_damage" };
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
        default:
          return { type: "UNKNOWN_STEP", raw: { type: stepType } } as any;
      }
    };

    steps.push(mk());
    setAbility({ execution: { steps } } as any);
  }

  function exportCardJson() {
    download(cardFileName(card, "CJ-1.0"), JSON.stringify(card, null, 2));
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
      const incoming: CardEntity = parsed?.projectVersion === "FORGE-1.0" ? parsed.card : parsed;
      if (!incoming || incoming.schemaVersion !== "CJ-1.0") throw new Error("Expected CJ-1.0 card JSON (or FORGE-1.0 project).");

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
      targeting: { type: "SINGLE_TARGET", range: { base: 4 }, lineOfSight: true },
      execution: { steps: [{ type: "SHOW_TEXT", text: "Do something!" }] }
    };
    setCard({ ...card, components: [...card.components, newAbility as any] });
    setActiveAbilityIdx(card.components.length);
    setSelected(null);
  }

  function removeActiveAbility() {
    if (!ability) return;
    const idxs = findAbilityIndexes(card);
    if (idxs.length <= 1) return; // keep at least one
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
          Captain Jawa Forge <span className="badge">MVP+</span>
          <span className="badge">{errorCount === 0 ? "OK" : `${errorCount} errors`}</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
              <button
                className="btn btnDanger"
                onClick={removeActiveAbility}
                style={{ flex: 1 }}
                disabled={abilityIndexes.length <= 1}
                title={abilityIndexes.length <= 1 ? "Keep at least one ability" : "Remove this ability"}
              >
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
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              onSelectionChange={setSelected}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        </div>

        {/* Inspector + Preview JSON + Compile */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, height: "100%" }}>
          {/* INSPECTOR */}
          <div className="panel" style={{ flex: "1 1 55%", minHeight: 0 }}>
            <div className="ph">
              <div>
                <div className="h2">Inspector</div>
                <div className="small">{selectedKind ?? "No selection"}</div>
              </div>
              <span className="badge">CJ-1.0</span>
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
                  <input className="input" value={card.schemaVersion} disabled />
                </div>
              </div>

              {/* Card preview-relevant fields */}
              <details style={{ marginTop: 10 }}>
                <summary className="small" style={{ cursor: "pointer" }}>
                  Card Art + Identity
                </summary>

                <div className="small" style={{ marginTop: 8 }}>
                  Upload Image (stored as Data URL)
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
                      setCard({
                        ...card,
                        visuals: { ...(card.visuals ?? {}), cardImage: dataUrl }
                      });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <div className="small" style={{ marginTop: 6 }}>
                  Tip: Big images make JSON large. If you hit localStorage limits, use a smaller image.
                </div>

                <div className="small" style={{ marginTop: 8 }}>
                  Card Image URL
                </div>
                <input
                  className="input"
                  value={card.visuals?.cardImage ?? ""}
                  onChange={(e) =>
                    setCard({
                      ...card,
                      visuals: { ...(card.visuals ?? {}), cardImage: e.target.value || undefined }
                    })
                  }
                  placeholder="https://... or cards/my_image.png"
                />

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="small">Faction (Units)</div>
                    <input
                      className="input"
                      value={card.faction ?? ""}
                      onChange={(e) => setCard({ ...card, faction: e.target.value || undefined })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="small">Types (comma)</div>
                    <input
                      className="input"
                      value={(card.subType ?? []).join(", ")}
                      onChange={(e) => setCard({ ...card, subType: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="HUMAN, JAWA..."
                    />
                  </div>
                </div>

                <div className="small" style={{ marginTop: 8 }}>
                  Attributes (comma)
                </div>
                <input
                  className="input"
                  value={(card.attributes ?? []).join(", ")}
                  onChange={(e) => setCard({ ...card, attributes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="FIRE, STEEL..."
                />

                <div className="small" style={{ marginTop: 8 }}>
                  Resources (Umbra / Aether / Strength)
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input
                    className="input"
                    type="number"
                    value={card.resources?.umbra ?? 0}
                    onChange={(e) =>
                      setCard({
                        ...card,
                        resources: { ...(card.resources ?? {}), umbra: Number(e.target.value) }
                      })
                    }
                    title="Umbra"
                  />
                  <input
                    className="input"
                    type="number"
                    value={card.resources?.aether ?? 0}
                    onChange={(e) =>
                      setCard({
                        ...card,
                        resources: { ...(card.resources ?? {}), aether: Number(e.target.value) }
                      })
                    }
                    title="Aether"
                  />
                  <input
                    className="input"
                    type="number"
                    value={card.resources?.strength ?? 0}
                    onChange={(e) =>
                      setCard({
                        ...card,
                        resources: { ...(card.resources ?? {}), strength: Number(e.target.value) }
                      })
                    }
                    title="Strength"
                  />
                </div>

                <div className="small" style={{ marginTop: 8 }}>
                  Presentation (optional)
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <select
                    className="select"
                    value={card.presentation?.template ?? ""}
                    onChange={(e) =>
                      setCard({
                        ...card,
                        presentation: { ...(card.presentation ?? {}), template: (e.target.value || undefined) as any }
                      })
                    }
                    title="Template"
                  >
                    <option value="">Auto</option>
                    <option value="T1">T1</option>
                    <option value="T2">T2</option>
                    <option value="T3">T3</option>
                    <option value="T4">T4</option>
                    <option value="T5">T5</option>
                  </select>

                  <select
                    className="select"
                    value={card.presentation?.theme ?? "BLUE"}
                    onChange={(e) =>
                      setCard({
                        ...card,
                        presentation: { ...(card.presentation ?? {}), theme: e.target.value as any }
                      })
                    }
                    title="Theme"
                  >
                    {["BLUE", "GREEN", "PURPLE", "ORANGE", "RED"].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

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
                  {/* Ability root editing */}
                  {(selectedKind === "ABILITY_ROOT" || !selectedKind) && (
                    <>
                      <div className="small">Ability Name</div>
                      <input className="input" value={ability.name} onChange={(e) => setAbility({ name: e.target.value })} />

                      <div className="small" style={{ marginTop: 8 }}>
                        Description
                      </div>
                      <textarea className="textarea" value={ability.description} onChange={(e) => setAbility({ description: e.target.value })} />

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
                                cost: { ...(ability.cost ?? {}), ap: Number(e.target.value) }
                              })
                            }
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Cost */}
                  {selectedKind === "COST" && (
                    <>
                      <div className="small">Required Equipped Item IDs (comma-separated)</div>
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
                          const n = Number(e.target.value);
                          setAbility({
                            cost: { ...(ability.cost ?? {}), cooldown: n > 0 ? { turns: Math.max(1, Math.floor(n)) } : undefined }
                          });
                        }}
                      />
                    </>
                  )}

                  {/* Targeting */}
                  {selectedKind === "TARGETING" && (
                    <>
                      <div className="small">Targeting Type</div>
                      <select
                        className="select"
                        value={ability.targeting?.type ?? "SINGLE_TARGET"}
                        onChange={(e) => {
                          const type = e.target.value as any;
                          const next: any = { ...(ability.targeting ?? { type }), type };
                          if (type === "AREA_RADIUS" && !next.area) next.area = { radius: 1, includeCenter: true };
                          if (type === "SELF") next.area = undefined;
                          setAbility({ targeting: next });
                        }}
                      >
                        {(blockRegistry.targeting.types as string[]).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>

                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div className="small">Range Base</div>
                          <input
                            className="input"
                            type="number"
                            value={ability.targeting?.range?.base ?? 0}
                            onChange={(e) => {
                              const base = Math.max(0, Math.floor(Number(e.target.value)));
                              setAbility({ targeting: { ...(ability.targeting ?? { type: "SINGLE_TARGET" }), range: { base } } as any });
                            }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="small">Line of Sight</div>
                          <select
                            className="select"
                            value={String(ability.targeting?.lineOfSight ?? false)}
                            onChange={(e) =>
                              setAbility({
                                targeting: { ...(ability.targeting ?? { type: "SINGLE_TARGET" }), lineOfSight: e.target.value === "true" } as any
                              })
                            }
                          >
                            <option value="false">false</option>
                            <option value="true">true</option>
                          </select>
                        </div>
                      </div>

                      {ability.targeting?.type === "AREA_RADIUS" && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div className="small">Area Radius</div>
                            <input
                              className="input"
                              type="number"
                              value={(ability.targeting as any).area?.radius ?? 1}
                              onChange={(e) => {
                                const radius = Math.max(1, Math.floor(Number(e.target.value)));
                                setAbility({ targeting: { ...(ability.targeting as any), area: { ...((ability.targeting as any).area ?? {}), radius } } as any });
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Step */}
                  {selectedKind === "STEP" && selectedStep && (
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
                            <input
                              className="input"
                              value={(selectedStep as any).saveAs ?? ""}
                              onChange={(e) => setStep(selectedStepIdx, { saveAs: e.target.value || undefined })}
                              placeholder="e.g. roll"
                            />
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

                        {selectedStep.type === "DEAL_DAMAGE" && (
                          <>
                            <div className="small">Damage Type</div>
                            <select className="select" value={(selectedStep as any).damageType} onChange={(e) => setStep(selectedStepIdx, { damageType: e.target.value })}>
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
                            <div className="small" style={{ marginTop: 8 }}>
                              Target (edit via Raw JSON below for now)
                            </div>
                          </>
                        )}

                        {selectedStep.type === "HEAL" && (
                          <>
                            <div className="small">Amount Expression</div>
                            <ExpressionEditor value={(selectedStep as any).amountExpr} onChange={(amountExpr) => setStep(selectedStepIdx, { amountExpr })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              Target (edit via Raw JSON below for now)
                            </div>
                          </>
                        )}

                        {selectedStep.type === "APPLY_STATUS" && (
                          <>
                            <div className="small">Status</div>
                            <select className="select" value={(selectedStep as any).status} onChange={(e) => setStep(selectedStepIdx, { status: e.target.value })}>
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
                              onChange={(e) => setStep(selectedStepIdx, { duration: { turns: Math.max(1, Math.floor(Number(e.target.value))) } })}
                            />
                            <div className="small" style={{ marginTop: 8 }}>
                              Target (edit via Raw JSON below for now)
                            </div>
                          </>
                        )}

                        {selectedStep.type === "REMOVE_STATUS" && (
                          <>
                            <div className="small">Status</div>
                            <select className="select" value={(selectedStep as any).status} onChange={(e) => setStep(selectedStepIdx, { status: e.target.value })}>
                              {(blockRegistry.keys.StatusKey as string[]).map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <div className="small" style={{ marginTop: 8 }}>
                              Target (edit via Raw JSON below for now)
                            </div>
                          </>
                        )}

                        {selectedStep.type === "MOVE_ENTITY" && (
                          <>
                            <div className="small">Max Tiles</div>
                            <input
                              className="input"
                              type="number"
                              value={(selectedStep as any).maxTiles ?? 1}
                              onChange={(e) => setStep(selectedStepIdx, { maxTiles: Math.max(1, Math.floor(Number(e.target.value))) })}
                            />
                            <div className="small" style={{ marginTop: 8 }}>
                              Destination Mode
                            </div>
                            <div style={{ fontWeight: 700 }}>{(selectedStep as any).to?.mode ?? "TARGET_POSITION"}</div>
                            <div className="small" style={{ marginTop: 8 }}>
                              Target (edit via Raw JSON below for now)
                            </div>
                          </>
                        )}

                        {selectedStep.type === "OPEN_REACTION_WINDOW" && (
                          <>
                            <div className="small">windowId</div>
                            <input className="input" value={(selectedStep as any).windowId} onChange={(e) => setStep(selectedStepIdx, { windowId: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              timing
                            </div>
                            <div style={{ fontWeight: 700 }}>{(selectedStep as any).timing}</div>
                          </>
                        )}

                        {selectedStep.type === "OPPONENT_SAVE" && (
                          <>
                            <div className="small">Stat</div>
                            <input className="input" value={(selectedStep as any).stat} onChange={(e) => setStep(selectedStepIdx, { stat: e.target.value })} />
                            <div className="small" style={{ marginTop: 8 }}>
                              Difficulty
                            </div>
                            <input
                              className="input"
                              type="number"
                              value={(selectedStep as any).difficulty ?? 10}
                              onChange={(e) => setStep(selectedStepIdx, { difficulty: Math.max(1, Math.floor(Number(e.target.value))) })}
                            />
                            <div className="small" style={{ marginTop: 8 }}>
                              Branch steps
                            </div>
                            <div className="small">
                              MVP: edit <b>onFail</b> / <b>onSuccess</b> in Raw JSON below (next iteration adds nested step editors).
                            </div>
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
                              MVP: edit <b>then</b> / <b>else</b> in Raw JSON below (next iteration adds nested step editors).
                            </div>
                          </>
                        )}

                        {selectedStep.type === "UNKNOWN_STEP" && (
                          <div className="err">
                            <b>UNKNOWN_STEP</b>
                            <div className="small">This step type isn’t in the BR-1.0 registry. Replace it or expand the registry.</div>
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

          {/* PREVIEW JSON */}
          <div className="panel" style={{ flex: "1 1 30%", minHeight: 0 }}>
            <div className="ph">
              <div>
                <div className="h2">Preview</div>
                <div className="small">Card JSON (read-only)</div>
              </div>
              <span className="badge">CJ-1.0</span>
            </div>
            <div className="pb">
              <pre>{JSON.stringify(card, null, 2)}</pre>
            </div>
          </div>

          {/* COMPILE */}
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
        title="Import CJ-1.0 Card JSON (or FORGE-1.0 project)"
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
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ flex: "1 1 180px" }}>
            <div className="small">Template</div>
            <select
              className="select"
              value={card.presentation?.template ?? ""}
              onChange={(e) =>
                setCard({
                  ...card,
                  presentation: { ...(card.presentation ?? {}), template: (e.target.value || undefined) as any }
                })
              }
            >
              <option value="">Auto</option>
              <option value="T1">T1 (Unit)</option>
              <option value="T2">T2 (Item)</option>
              <option value="T3">T3 (Spell)</option>
              <option value="T4">T4 (Environment)</option>
              <option value="T5">T5 (Token)</option>
            </select>
          </div>

          <div style={{ flex: "1 1 180px" }}>
            <div className="small">Theme</div>
            <select
              className="select"
              value={card.presentation?.theme ?? "BLUE"}
              onChange={(e) =>
                setCard({
                  ...card,
                  presentation: { ...(card.presentation ?? {}), theme: e.target.value as any }
                })
              }
            >
              {["BLUE", "GREEN", "PURPLE", "ORANGE", "RED"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <CardPreview card={card} />
      </Modal>
    </div>
  );
}
