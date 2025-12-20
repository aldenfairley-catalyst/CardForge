import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, Handle, Position } from "reactflow";
import "reactflow/dist/style.css";
import { ExpressionEditor } from "./components/ExpressionEditor";
import { ConditionEditor } from "./components/ConditionEditor";
import { v4 as uuidv4 } from "uuid";
import type { CardEntity, Step, AbilityComponent } from "./lib/types";
import { makeDefaultCard, canonicalToGraph, abilitySummary } from "./lib/graph";
import { loadCardJson, saveCardJson, clearSaved } from "./lib/storage";
import { validateCard, type ValidationIssue } from "./lib/schemas";
import { blockRegistry, isStepTypeAllowed } from "./lib/registry";

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
          <button className="btn" onClick={props.onClose}>Close</button>
        </div>
        <div className="pb">
          {props.children}
          {props.footer ? <div style={{ display:"flex", justifyContent:"flex-end", marginTop: 10 }}>{props.footer}</div> : null}
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
      <div className="nodeB">
        {step?.type === "SHOW_TEXT" ? `“${(step as any).text}”` : "Select to edit"}
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// ---- App ----
export default function App() {
  const [card, setCard] = useState<CardEntity>(() => {
    const saved = loadCardJson();
    if (saved) {
      try { return coerceUnknownSteps(JSON.parse(saved)) as CardEntity; } catch {}
    }
    return makeDefaultCard();
  });

  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [selected, setSelected] = useState<any>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setIssues(validateCard(card));
    saveCardJson(JSON.stringify(card));
  }, [card]);

  const { nodes, edges } = useMemo(() => canonicalToGraph(card), [card]);
  const errorCount = issues.filter(i => i.severity === "ERROR").length;

  const nodeTypes = useMemo(() => ({
    abilityRoot: (p: any) => <AbilityRootNode {...p} card={card} />,
    meta: (p: any) => <MetaNode {...p} card={card} />,
    exec: (p: any) => <ExecNode {...p} card={card} />,
    step: (p: any) => <StepNode {...p} card={card} />
  }), [card]);

  function getAbility() {
    const idx = card.components.findIndex((c: any) => c.componentType === "ABILITY");
    if (idx < 0) return null;
    return { idx, ability: card.components[idx] as AbilityComponent };
  }

  function addStep(stepType: string) {
    const r = getAbility();
    if (!r) return;

    const steps = (r.ability.execution?.steps ?? []).slice();

    const mk = (): Step => {
      switch (stepType) {
        case "SHOW_TEXT": return { type: "SHOW_TEXT", text: "..." };
        case "ROLL_D6": return { type: "ROLL_D6", saveAs: "roll" };
        case "ROLL_D20": return { type: "ROLL_D20", saveAs: "roll" };
        case "OPEN_REACTION_WINDOW": return { type:"OPEN_REACTION_WINDOW", timing:"BEFORE_DAMAGE", windowId:"pre_damage" };
        case "DEAL_DAMAGE": return { type:"DEAL_DAMAGE", target:{type:"TARGET"}, amountExpr:{type:"CONST_NUMBER", value:10}, damageType:"PHYSICAL" };
        case "HEAL": return { type:"HEAL", target:{type:"SELF"}, amountExpr:{type:"CONST_NUMBER", value:10} };
        case "SET_VARIABLE": return { type:"SET_VARIABLE", saveAs:"var", valueExpr:{type:"CONST_NUMBER", value:1} };
        case "APPLY_STATUS": return { type:"APPLY_STATUS", target:{type:"TARGET"}, status:"SLOWED", duration:{turns:1} };
        case "REMOVE_STATUS": return { type:"REMOVE_STATUS", target:{type:"SELF"}, status:"STUNNED" };
        case "MOVE_ENTITY": return { type:"MOVE_ENTITY", target:{type:"SELF"}, to:{mode:"TARGET_POSITION"}, maxTiles:5 };
        case "OPPONENT_SAVE": return { type:"OPPONENT_SAVE", stat:"SPEED", difficulty:13, onFail:[{type:"SHOW_TEXT", text:"Fail"}], onSuccess:[{type:"SHOW_TEXT", text:"Success"}] };
        case "IF_ELSE": return { type:"IF_ELSE", condition:{type:"ALWAYS"}, then:[{type:"SHOW_TEXT", text:"Then"}], else:[{type:"SHOW_TEXT", text:"Else"}] };
        default: return { type:"UNKNOWN_STEP", raw:{ type: stepType } } as any;
      }
    };

    steps.push(mk());
    const next = {
      ...card,
      components: card.components.map((c: any, i: number) =>
        i === r.idx ? ({ ...r.ability, execution: { steps } }) : c
      )
    };
    setCard(next);
  }

  function exportCardJson() {
    download(`${card.name.replace(/\s+/g, "_").toLowerCase()}_CJ-1.0.json`, JSON.stringify(card, null, 2));
  }
  function exportForgeProject() {
    const project = {
      projectVersion: "FORGE-1.0",
      card,
      ui: { nodes: nodes.map((n: any) => ({ id: n.id, x: n.position.x, y: n.position.y, kind: n.data.kind })) }
    };
    download(`${card.name.replace(/\s+/g, "_").toLowerCase()}_FORGE-1.0.json`, JSON.stringify(project, null, 2));
  }

  function doImport() {
    setImportError(null);
    try {
      const parsed = coerceUnknownSteps(JSON.parse(importText));
      const incoming: CardEntity = (parsed?.projectVersion === "FORGE-1.0") ? parsed.card : parsed;
      if (!incoming || incoming.schemaVersion !== "CJ-1.0") throw new Error("Expected CJ-1.0 card JSON (or FORGE-1.0 project).");
      setCard(incoming);
      setSelected(null);
      setImportOpen(false);
      setImportText("");
    } catch (e: any) {
      setImportError(e.message ?? String(e));
    }
  }

  // Basic inspector (edits only first ability + a few step fields)
  const abilityRec = getAbility();
  const ability = abilityRec?.ability;

  function setAbility(patch: Partial<AbilityComponent>) {
    if (!abilityRec) return;
    setCard({
      ...card,
      components: card.components.map((c: any, i: number) => i === abilityRec.idx ? ({ ...abilityRec.ability, ...patch }) : c)
    });
  }

  function setStep(stepIdx: number, patch: any) {
    if (!abilityRec?.ability.execution) return;
    const steps = abilityRec.ability.execution.steps.slice();
    steps[stepIdx] = { ...(steps[stepIdx] as any), ...patch };
    setAbility({ execution: { steps } } as any);
  }

  const selectedInfo = selected?.nodes?.[0]?.data ?? null;
  const selectedKind = selectedInfo?.kind ?? null;

  const selectedStepIdx = (selectedKind === "STEP") ? selectedInfo.stepIdx : null;
  const selectedStep = (selectedStepIdx != null && ability?.execution?.steps) ? ability.execution.steps[selectedStepIdx] : null;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span style={{width:10,height:10,borderRadius:999,background:"var(--accent)"}} />
          Captain Jawa Forge <span className="badge">MVP</span>
          <span className="badge">{errorCount === 0 ? "OK" : `${errorCount} errors`}</span>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button className="btn" onClick={() => setImportOpen(true)}>Import JSON</button>
          <button className="btn" onClick={exportCardJson}>Export Card JSON</button>
          <button className="btn" onClick={exportForgeProject}>Export Forge Project</button>
          <button className="btn btnPrimary" onClick={() => { setCard(makeDefaultCard()); setSelected(null); }}>New Card</button>
          <button className="btn btnDanger" onClick={() => { clearSaved(); setCard(makeDefaultCard()); setSelected(null); }}>Reset Local</button>
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
            <div className="small" style={{marginBottom:8}}>Click to append a step.</div>
            {(blockRegistry.steps.types as string[]).map(t => (
              <div key={t} className="item" onClick={() => addStep(t)} style={{marginBottom:8}}>
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

        {/* Inspector + Preview + Compile */}
        <div style={{display:"flex",flexDirection:"column",gap:12,minHeight:0}}>
          <div className="panel">
            <div className="ph">
              <div>
                <div className="h2">Inspector</div>
                <div className="small">{selectedKind ?? "No selection"}</div>
              </div>
              <span className="badge">CJ-1.0</span>
            </div>
            <div className="pb">
              <div className="small">Card Name</div>
              <input className="input" value={card.name} onChange={(e)=>setCard({...card, name: e.target.value})} />

              <div style={{display:"flex", gap:8, marginTop:8}}>
                <div style={{flex:1}}>
                  <div className="small">Card Type</div>
                  <select className="select" value={card.type} onChange={(e)=>setCard({...card, type: e.target.value as any})}>
                    {["UNIT","ITEM","ENVIRONMENT","SPELL","TOKEN"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{flex:1}}>
                  <div className="small">Schema</div>
                  <input className="input" value={card.schemaVersion} disabled />
                </div>
              </div>

              <hr style={{borderColor:"var(--border)", opacity:.5, margin:"12px 0"}} />

              {!ability ? (
                <div className="err"><b>No ABILITY component</b><div className="small">This MVP expects at least one ABILITY.</div></div>
              ) : (
                <>
                  {/* Ability root editing */}
                  {(selectedKind === "ABILITY_ROOT" || !selectedKind) && (
                    <>
                      <div className="small">Ability Name</div>
                      <input className="input" value={ability.name} onChange={(e)=>setAbility({ name: e.target.value })} />
                      <div className="small" style={{marginTop:8}}>Description</div>
                      <textarea className="textarea" value={ability.description} onChange={(e)=>setAbility({ description: e.target.value })} />
                      <div style={{display:"flex", gap:8, marginTop:8}}>
                        <div style={{flex:1}}>
                          <div className="small">Trigger</div>
                          <select className="select" value={ability.trigger} onChange={(e)=>setAbility({ trigger: e.target.value as any })}>
                            {(blockRegistry.triggers as string[]).map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div style={{flex:1}}>
                          <div className="small">AP Cost</div>
                          <input className="input" type="number" value={ability.cost?.ap ?? 0} onChange={(e)=>setAbility({ cost: { ...(ability.cost ?? {}), ap: Number(e.target.value) } })} />
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
                        onChange={(e)=>setAbility({ cost: { ...(ability.cost ?? {}), requiredEquippedItemIds: e.target.value.split(",").map(s=>s.trim()).filter(Boolean) } })}
                      />
                      <div className="small" style={{marginTop:8}}>Cooldown (turns)</div>
                      <input
                        className="input"
                        type="number"
                        value={ability.cost?.cooldown?.turns ?? 0}
                        onChange={(e)=>{
                          const n = Number(e.target.value);
                          setAbility({ cost: { ...(ability.cost ?? {}), cooldown: n > 0 ? { turns: Math.max(1, Math.floor(n)) } : undefined } });
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
                        onChange={(e)=>{
                          const type = e.target.value as any;
                          const next: any = { ...(ability.targeting ?? { type }), type };
                          if (type === "AREA_RADIUS" && !next.area) next.area = { radius: 1, includeCenter: true };
                          if (type === "SELF") next.area = undefined;
                          setAbility({ targeting: next });
                        }}
                      >
                        {(blockRegistry.targeting.types as string[]).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>

                      <div style={{display:"flex", gap:8, marginTop:8}}>
                        <div style={{flex:1}}>
                          <div className="small">Range Base</div>
                          <input
                            className="input"
                            type="number"
                            value={ability.targeting?.range?.base ?? 0}
                            onChange={(e)=>{
                              const base = Math.max(0, Math.floor(Number(e.target.value)));
                              setAbility({ targeting: { ...(ability.targeting ?? { type:"SINGLE_TARGET" }), range: { base } } as any });
                            }}
                          />
                        </div>
                        <div style={{flex:1}}>
                          <div className="small">Line of Sight</div>
                          <select
                            className="select"
                            value={String(ability.targeting?.lineOfSight ?? false)}
                            onChange={(e)=>setAbility({ targeting: { ...(ability.targeting ?? { type:"SINGLE_TARGET" }), lineOfSight: e.target.value === "true" } as any })}
                          >
                            <option value="false">false</option>
                            <option value="true">true</option>
                          </select>
                        </div>
                      </div>

                      {ability.targeting?.type === "AREA_RADIUS" && (
                        <div style={{display:"flex", gap:8, marginTop:8}}>
                          <div style={{flex:1}}>
                            <div className="small">Area Radius</div>
                            <input
                              className="input"
                              type="number"
                              value={ability.targeting.area?.radius ?? 1}
                              onChange={(e)=>{
                                const radius = Math.max(1, Math.floor(Number(e.target.value)));
                                setAbility({ targeting: { ...(ability.targeting as any), area: { ...(ability.targeting?.area ?? {}), radius } } as any });
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
                      <div className="small">Step Type</div>
                      <div style={{fontWeight:800, marginBottom:8}}>{selectedStep.type}</div>

                      {selectedStep.type === "SHOW_TEXT" && (
                        <>
                          <div className="small">Text</div>
                          <textarea className="textarea" value={(selectedStep as any).text} onChange={(e)=>setStep(selectedStepIdx, { text: e.target.value })} />
                        </>
                      )}

                      {selectedStep.type === "DEAL_DAMAGE" && (
                        <>
                          <div className="small">Damage Type</div>
                          <select className="select" value={(selectedStep as any).damageType} onChange={(e)=>setStep(selectedStepIdx, { damageType: e.target.value })}>
                            {(blockRegistry.keys.DamageType as string[]).map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                          <div className="small" style={{marginTop:8}}>Amount (CONST_NUMBER)</div>
                          <input
                            className="input"
                            type="number"
                            value={(selectedStep as any).amountExpr?.value ?? 0}
                            onChange={(e)=>setStep(selectedStepIdx, { amountExpr: { type:"CONST_NUMBER", value: Number(e.target.value) } })}
                          />
                        </>
                      )}

                      <details style={{marginTop:10}}>
                        <summary className="small" style={{cursor:"pointer"}}>Raw Step JSON</summary>
                        <pre>{JSON.stringify(selectedStep, null, 2)}</pre>
                      </details>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="ph">
              <div>
                <div className="h2">Preview</div>
                <div className="small">Rules-ish summary + JSON</div>
              </div>
              <span className="badge">WYSIWYM</span>
            </div>
            <div className="pb">
              <pre>{JSON.stringify(card, null, 2)}</pre>
            </div>
          </div>

          <div className="panel">
            <div className="ph">
              <div>
                <div className="h2">Compile</div>
                <div className="small">Schema + core invariants</div>
              </div>
              <span className="badge">{errorCount} errors</span>
            </div>
            <div className="pb">
              {issues.some(i => i.severity === "ERROR") ? (
                issues.filter(i => i.severity === "ERROR").map((i, idx) => (
                  <div key={idx} className="err">
                    <b>{i.code}</b>
                    <div className="small">{i.message}</div>
                    {i.path ? <div className="small"><code>{i.path}</code></div> : null}
                  </div>
                ))
              ) : (
                <div className="ok"><b>✅ OK</b><div className="small">{issues[0]?.message ?? "No issues."}</div></div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={importOpen}
        title="Import CJ-1.0 Card JSON (or FORGE-1.0 project)"
        onClose={() => { setImportOpen(false); setImportError(null); }}
        footer={<button className="btn btnPrimary" onClick={doImport}>Import</button>}
      >
        <div className="small" style={{ marginBottom: 8 }}>
          Unknown step types become <code>UNKNOWN_STEP</code>.
        </div>
        {importError ? <div className="err"><b>Import error</b><div className="small">{importError}</div></div> : null}
        <textarea className="textarea" style={{ minHeight: 260 }} value={importText} onChange={(e)=>setImportText(e.target.value)} />
      </Modal>
    </div>
  );
}
