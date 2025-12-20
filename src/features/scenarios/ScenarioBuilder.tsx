import React, { useMemo, useState } from "react";
import { loadDeckStore } from "../../lib/deckStore";
import { loadLibrary } from "../../lib/libraryStore";
import { importScenariosJson, loadScenarioStore, removeScenario, upsertScenario } from "../../lib/scenarioStore";
import {
  makeDefaultScenario,
  ScenarioAction,
  ScenarioDefinition,
  ScenarioSideSetup,
  ScenarioTrigger,
  TriggerWhen,
  VictoryCondition
} from "../../lib/scenarioTypes";

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ScenarioBuilder() {
  const [store, setStore] = useState(() => loadScenarioStore());
  const [activeId, setActiveId] = useState(() => store.scenarios[0]?.id ?? "");
  const [importText, setImportText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const decks = loadDeckStore().decks;
  const cards = loadLibrary().cards;

  const scenario: ScenarioDefinition | null = store.scenarios.find((s) => s.id === activeId) ?? null;

  function refresh() {
    setStore(loadScenarioStore());
  }

  function setScenario(patch: Partial<ScenarioDefinition>) {
    if (!scenario) return;
    const next = { ...scenario, ...patch };
    upsertScenario(next);
    refresh();
    setActiveId(next.id);
  }

  function newScenario() {
    const s = makeDefaultScenario();
    upsertScenario(s);
    refresh();
    setActiveId(s.id);
  }

  function deleteScenario() {
    if (!scenario) return;
    removeScenario(scenario.id);
    const nextStore = loadScenarioStore();
    setStore(nextStore);
    setActiveId(nextStore.scenarios[0]?.id ?? "");
  }

  function exportActive() {
    if (!scenario) return;
    download(`${scenario.name.replace(/\s+/g, "_").toLowerCase()}_scenario.json`, JSON.stringify(scenario, null, 2));
  }
  function exportAll() {
    download(`cj_scenarios.json`, JSON.stringify({ scenarios: store.scenarios }, null, 2));
  }

  function doImport() {
    setErr(null);
    try {
      const incoming = importScenariosJson(importText);
      for (const s of incoming) upsertScenario(s);
      setImportText("");
      refresh();
      if (!activeId && incoming[0]) setActiveId(incoming[0].id);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  const unitCards = useMemo(() => cards.filter((c) => c.type === "UNIT").sort((a, b) => a.name.localeCompare(b.name)), [cards]);

  function setSide(idx: number, patch: Partial<ScenarioSideSetup>) {
    if (!scenario) return;
    const sides = scenario.setup.sides.slice();
    sides[idx] = { ...sides[idx], ...patch };
    setScenario({ setup: { ...scenario.setup, sides } });
  }

  function addStartingUnit(sideIdx: number, cardId: string) {
    if (!scenario) return;
    const sides = scenario.setup.sides.slice();
    const s = sides[sideIdx];
    const startingUnits = s.startingUnits.slice();
    startingUnits.push({ cardId, pos: { q: 0, r: 0 } });
    sides[sideIdx] = { ...s, startingUnits };
    setScenario({ setup: { ...scenario.setup, sides } });
  }

  function updateStartingUnit(sideIdx: number, unitIdx: number, patch: any) {
    if (!scenario) return;
    const sides = scenario.setup.sides.slice();
    const s = sides[sideIdx];
    const startingUnits = s.startingUnits.slice();
    startingUnits[unitIdx] = { ...startingUnits[unitIdx], ...patch, pos: { ...startingUnits[unitIdx].pos, ...(patch.pos ?? {}) } };
    sides[sideIdx] = { ...s, startingUnits };
    setScenario({ setup: { ...scenario.setup, sides } });
  }

  function removeStartingUnit(sideIdx: number, unitIdx: number) {
    if (!scenario) return;
    const sides = scenario.setup.sides.slice();
    const s = sides[sideIdx];
    const startingUnits = s.startingUnits.slice();
    startingUnits.splice(unitIdx, 1);
    sides[sideIdx] = { ...s, startingUnits };
    setScenario({ setup: { ...scenario.setup, sides } });
  }

  function addVictory(v: VictoryCondition) {
    if (!scenario) return;
    setScenario({ victory: [...scenario.victory, v] });
  }

  function updateVictory(i: number, patch: any) {
    if (!scenario) return;
    const victory = scenario.victory.slice();
    victory[i] = { ...victory[i], ...patch };
    setScenario({ victory });
  }

  function removeVictory(i: number) {
    if (!scenario) return;
    const victory = scenario.victory.slice();
    victory.splice(i, 1);
    setScenario({ victory });
  }

  function addTrigger() {
    if (!scenario) return;
    const t: ScenarioTrigger = {
      id: `tr.${Math.random().toString(16).slice(2)}`,
      name: "New Trigger",
      enabled: true,
      when: { type: "ON_SCENARIO_START" },
      actions: [{ type: "CUSTOM", text: "Describe what happens..." }]
    };
    setScenario({ triggers: [...scenario.triggers, t] });
  }

  function updateTrigger(i: number, patch: Partial<ScenarioTrigger>) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    triggers[i] = { ...triggers[i], ...patch };
    setScenario({ triggers });
  }

  function removeTrigger(i: number) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    triggers.splice(i, 1);
    setScenario({ triggers });
  }

  function addAction(triggerIdx: number, action: ScenarioAction) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    const t = triggers[triggerIdx];
    triggers[triggerIdx] = { ...t, actions: [...t.actions, action] };
    setScenario({ triggers });
  }

  function updateAction(triggerIdx: number, actionIdx: number, patch: any) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    const t = triggers[triggerIdx];
    const actions = t.actions.slice();
    actions[actionIdx] = { ...actions[actionIdx], ...patch };
    triggers[triggerIdx] = { ...t, actions };
    setScenario({ triggers });
  }

  function removeAction(triggerIdx: number, actionIdx: number) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    const t = triggers[triggerIdx];
    const actions = t.actions.slice();
    actions.splice(actionIdx, 1);
    triggers[triggerIdx] = { ...t, actions };
    setScenario({ triggers });
  }

  function setWhen(triggerIdx: number, when: TriggerWhen) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    triggers[triggerIdx] = { ...triggers[triggerIdx], when };
    setScenario({ triggers });
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "320px 1fr", minHeight: 0 }}>
      {/* Left list */}
      <div className="panel" style={{ minHeight: 0 }}>
        <div className="ph">
          <div>
            <div className="h2">Scenarios</div>
            <div className="small">Triggers • story beats • setup</div>
          </div>
          <span className="badge">{store.scenarios.length}</span>
        </div>
        <div className="pb" style={{ minHeight: 0, overflow: "auto" }}>
          <button className="btn btnPrimary" style={{ width: "100%", marginBottom: 10 }} onClick={newScenario}>
            + New Scenario
          </button>

          {store.scenarios.map((s) => (
            <div
              key={s.id}
              className="item"
              onClick={() => setActiveId(s.id)}
              style={{ border: s.id === activeId ? "1px solid var(--accent)" : "1px solid var(--border)" }}
            >
              <b>{s.name}</b>
              <div className="small">
                {s.mode} • {s.players} players
              </div>
            </div>
          ))}

          <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

          <div className="small">Import Scenario JSON</div>
          {err ? (
            <div className="err">
              <b>Import error</b>
              <div className="small">{err}</div>
            </div>
          ) : null}
          <textarea className="textarea" style={{ minHeight: 140 }} value={importText} onChange={(e) => setImportText(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btnPrimary" onClick={doImport} style={{ flex: 1 }}>
              Import
            </button>
            <button className="btn" onClick={exportAll} style={{ flex: 1 }}>
              Export All
            </button>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="panel" style={{ minHeight: 0 }}>
        <div className="ph">
          <div>
            <div className="h2">Scenario Editor</div>
            <div className="small">{scenario ? scenario.id : "No scenario selected"}</div>
          </div>
          {scenario ? <span className="badge">{scenario.triggers.length} triggers</span> : null}
        </div>

        <div className="pb" style={{ minHeight: 0, overflow: "auto" }}>
          {!scenario ? (
            <div className="small">Create or select a scenario.</div>
          ) : (
            <>
              <div className="small">Name</div>
              <input className="input" value={scenario.name} onChange={(e) => setScenario({ name: e.target.value })} />

              <div className="small" style={{ marginTop: 8 }}>
                Description
              </div>
              <textarea className="textarea" value={scenario.description ?? ""} onChange={(e) => setScenario({ description: e.target.value })} />

              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 160px" }}>
                  <div className="small">Players</div>
                  <input
                    className="input"
                    type="number"
                    value={scenario.players}
                    onChange={(e) => setScenario({ players: Math.max(1, Math.floor(Number(e.target.value))) })}
                  />
                </div>
                <div style={{ flex: "1 1 220px" }}>
                  <div className="small">Mode</div>
                  <select className="select" value={scenario.mode} onChange={(e) => setScenario({ mode: e.target.value as any })}>
                    <option value="ASSISTED_PHYSICAL">ASSISTED_PHYSICAL</option>
                    <option value="FULL_DIGITAL">FULL_DIGITAL</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <button className="btn" onClick={exportActive}>
                    Export
                  </button>
                  <button className="btn btnDanger" onClick={deleteScenario}>
                    Delete
                  </button>
                </div>
              </div>

              <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

              <details open>
                <summary className="small" style={{ cursor: "pointer" }}>
                  <b>Setup</b> — sides, starting units, environment
                </summary>

                {scenario.setup.sides.map((side, idx) => (
                  <div key={side.sideId} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, marginTop: 10 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 120px" }}>
                        <div className="small">Side ID</div>
                        <input className="input" value={side.sideId} onChange={(e) => setSide(idx, { sideId: e.target.value })} />
                      </div>
                      <div style={{ flex: "2 1 200px" }}>
                        <div className="small">Name</div>
                        <input className="input" value={side.name} onChange={(e) => setSide(idx, { name: e.target.value })} />
                      </div>
                      <div style={{ flex: "2 1 200px" }}>
                        <div className="small">Deck</div>
                        <select className="select" value={side.deckId ?? ""} onChange={(e) => setSide(idx, { deckId: e.target.value })}>
                          <option value="">(none)</option>
                          {decks.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.faction ?? "—"})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="small" style={{ marginTop: 8 }}>
                      Starting Units
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <select
                        className="select"
                        onChange={(e) => {
                          if (e.target.value) addStartingUnit(idx, e.target.value);
                          e.currentTarget.selectedIndex = 0;
                        }}
                      >
                        <option value="">+ Add unit...</option>
                        {unitCards.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                      {side.startingUnits.map((u, ui) => (
                        <div key={ui} className="item" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ minWidth: 220 }}>
                            <b>{u.cardId}</b>
                            <div className="small">Hex pos q,r • facing 0..5</div>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input className="input" style={{ width: 90 }} type="number" value={u.pos.q} onChange={(e) => updateStartingUnit(idx, ui, { pos: { q: Number(e.target.value) } })} />
                            <input className="input" style={{ width: 90 }} type="number" value={u.pos.r} onChange={(e) => updateStartingUnit(idx, ui, { pos: { r: Number(e.target.value) } })} />
                            <input className="input" style={{ width: 90 }} type="number" value={u.facing ?? 0} onChange={(e) => updateStartingUnit(idx, ui, { facing: Number(e.target.value) })} />
                            <button className="btn btnDanger" onClick={() => removeStartingUnit(idx, ui)}>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                      {side.startingUnits.length === 0 ? <div className="small">No starting units.</div> : null}
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: 10 }}>
                  <div className="small">Environment Variables (JSON)</div>
                  <textarea
                    className="textarea"
                    value={JSON.stringify(scenario.setup.env ?? {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const env = JSON.parse(e.target.value);
                        setScenario({ setup: { ...scenario.setup, env } });
                      } catch {
                        // ignore while typing
                      }
                    }}
                    style={{ minHeight: 140 }}
                  />
                </div>
              </details>

              <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

              <details open>
                <summary className="small" style={{ cursor: "pointer" }}>
                  <b>Victory Conditions</b>
                </summary>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button className="btn" onClick={() => addVictory({ type: "ELIMINATE_SIDE", sideId: "B" })}>
                    + Eliminate Side
                  </button>
                  <button className="btn" onClick={() => addVictory({ type: "SURVIVE_ROUNDS", sideId: "A", rounds: 5 })}>
                    + Survive Rounds
                  </button>
                  <button className="btn" onClick={() => addVictory({ type: "CUSTOM", text: "Describe a custom win condition" })}>
                    + Custom
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {scenario.victory.map((v, i) => (
                    <div key={i} className="item" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <b style={{ minWidth: 160 }}>{v.type}</b>
                      {v.type !== "CUSTOM" ? (
                        <>
                          {"sideId" in v ? (
                            <input className="input" style={{ width: 120 }} value={(v as any).sideId} onChange={(e) => updateVictory(i, { sideId: e.target.value })} />
                          ) : null}
                          {v.type === "SURVIVE_ROUNDS" ? (
                            <input className="input" style={{ width: 120 }} type="number" value={(v as any).rounds} onChange={(e) => updateVictory(i, { rounds: Number(e.target.value) })} />
                          ) : null}
                        </>
                      ) : (
                        <input className="input" style={{ flex: "1 1 260px" }} value={(v as any).text} onChange={(e) => updateVictory(i, { text: e.target.value })} />
                      )}
                      <button className="btn btnDanger" onClick={() => removeVictory(i)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </details>

              <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

              <details open>
                <summary className="small" style={{ cursor: "pointer" }}>
                  <b>Story Beats</b> — slideshow/video triggers
                </summary>

                <div className="small" style={{ marginTop: 8 }}>
                  MVP: edit raw JSON (next iteration adds a dedicated UI with media picker + trigger dropdown).
                </div>

                <textarea
                  className="textarea"
                  value={JSON.stringify(scenario.story ?? [], null, 2)}
                  onChange={(e) => {
                    try {
                      const story = JSON.parse(e.target.value);
                      setScenario({ story });
                    } catch {}
                  }}
                  style={{ minHeight: 140 }}
                />
              </details>

              <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

              <details open>
                <summary className="small" style={{ cursor: "pointer" }}>
                  <b>Triggers</b> — events + actions (director)
                </summary>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button className="btn btnPrimary" onClick={addTrigger}>
                    + Add Trigger
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                  {scenario.triggers.map((t, ti) => (
                    <div key={t.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input className="input" style={{ flex: "1 1 220px" }} value={t.name} onChange={(e) => updateTrigger(ti, { name: e.target.value })} />
                        <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="checkbox" checked={t.enabled} onChange={(e) => updateTrigger(ti, { enabled: e.target.checked })} />
                          enabled
                        </label>
                        <button className="btn btnDanger" onClick={() => removeTrigger(ti)}>
                          Remove
                        </button>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 220px" }}>
                          <div className="small">When</div>
                          <select
                            className="select"
                            value={t.when.type}
                            onChange={(e) => {
                              const type = e.target.value as TriggerWhen["type"];
                              if (type === "ON_SCENARIO_START") setWhen(ti, { type });
                              else if (type === "ON_ROUND_START") setWhen(ti, { type, round: 1 });
                              else if (type === "ON_TURN_START") setWhen(ti, { type, sideId: "" });
                              else if (type === "ON_UNIT_DEATH") setWhen(ti, { type, cardId: "", sideId: "" });
                              else if (type === "ON_ENV_VAR_CHANGED") setWhen(ti, { type, key: "waterLevel" });
                              else setWhen(ti, { type: "ON_CUSTOM_EVENT", name: "event_name" });
                            }}
                          >
                            {["ON_SCENARIO_START", "ON_ROUND_START", "ON_TURN_START", "ON_UNIT_DEATH", "ON_ENV_VAR_CHANGED", "ON_CUSTOM_EVENT"].map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </select>
                        </div>

                        {t.when.type === "ON_ROUND_START" ? (
                          <div style={{ flex: "0 0 140px" }}>
                            <div className="small">Round</div>
                            <input className="input" type="number" value={(t.when as any).round ?? 1} onChange={(e) => setWhen(ti, { type: "ON_ROUND_START", round: Number(e.target.value) })} />
                          </div>
                        ) : null}

                        {t.when.type === "ON_ENV_VAR_CHANGED" ? (
                          <div style={{ flex: "1 1 180px" }}>
                            <div className="small">Env Key</div>
                            <input className="input" value={(t.when as any).key ?? ""} onChange={(e) => setWhen(ti, { type: "ON_ENV_VAR_CHANGED", key: e.target.value })} />
                          </div>
                        ) : null}

                        {t.when.type === "ON_CUSTOM_EVENT" ? (
                          <div style={{ flex: "1 1 180px" }}>
                            <div className="small">Event Name</div>
                            <input className="input" value={(t.when as any).name ?? ""} onChange={(e) => setWhen(ti, { type: "ON_CUSTOM_EVENT", name: e.target.value })} />
                          </div>
                        ) : null}
                      </div>

                      <div className="small" style={{ marginTop: 10 }}>
                        Actions
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                        <button className="btn" onClick={() => addAction(ti, { type: "SET_ENV_VAR", key: "waterLevel", value: 1 })}>
                          + Set Env
                        </button>
                        <button className="btn" onClick={() => addAction(ti, { type: "INCREMENT_ENV_VAR", key: "waterLevel", delta: 1 })}>
                          + Inc Env
                        </button>
                        <button className="btn" onClick={() => addAction(ti, { type: "EMPTY_HAND", sideId: "A" })}>
                          + Empty Hand
                        </button>
                        <button className="btn" onClick={() => addAction(ti, { type: "SWITCH_DECK", sideId: "A", deckId: decks[0]?.id ?? "" })}>
                          + Switch Deck
                        </button>
                        <button className="btn" onClick={() => addAction(ti, { type: "SPAWN_UNIT", sideId: "A", cardId: unitCards[0]?.id ?? "", pos: { q: 0, r: 0 } })}>
                          + Spawn Unit
                        </button>
                        <button className="btn" onClick={() => addAction(ti, { type: "CUSTOM", text: "Describe a custom action" })}>
                          + Custom
                        </button>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                        {t.actions.map((a, ai) => (
                          <div key={ai} className="item" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <b style={{ minWidth: 170 }}>{a.type}</b>

                            {a.type === "SET_ENV_VAR" ? (
                              <>
                                <input className="input" style={{ width: 160 }} value={(a as any).key} onChange={(e) => updateAction(ti, ai, { key: e.target.value })} />
                                <input className="input" style={{ flex: "1 1 240px" }} value={String((a as any).value)} onChange={(e) => updateAction(ti, ai, { value: e.target.value })} />
                              </>
                            ) : null}

                            {a.type === "INCREMENT_ENV_VAR" ? (
                              <>
                                <input className="input" style={{ width: 160 }} value={(a as any).key} onChange={(e) => updateAction(ti, ai, { key: e.target.value })} />
                                <input className="input" style={{ width: 120 }} type="number" value={(a as any).delta} onChange={(e) => updateAction(ti, ai, { delta: Number(e.target.value) })} />
                              </>
                            ) : null}

                            {a.type === "EMPTY_HAND" ? (
                              <input className="input" style={{ width: 120 }} value={(a as any).sideId} onChange={(e) => updateAction(ti, ai, { sideId: e.target.value })} />
                            ) : null}

                            {a.type === "SWITCH_DECK" ? (
                              <>
                                <input className="input" style={{ width: 120 }} value={(a as any).sideId} onChange={(e) => updateAction(ti, ai, { sideId: e.target.value })} />
                                <select className="select" value={(a as any).deckId} onChange={(e) => updateAction(ti, ai, { deckId: e.target.value })}>
                                  <option value="">(none)</option>
                                  {decks.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.name}
                                    </option>
                                  ))}
                                </select>
                              </>
                            ) : null}

                            {a.type === "SPAWN_UNIT" ? (
                              <>
                                <input className="input" style={{ width: 120 }} value={(a as any).sideId} onChange={(e) => updateAction(ti, ai, { sideId: e.target.value })} />
                                <select className="select" value={(a as any).cardId} onChange={(e) => updateAction(ti, ai, { cardId: e.target.value })}>
                                  <option value="">(choose unit)</option>
                                  {unitCards.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                                <input className="input" style={{ width: 90 }} type="number" value={(a as any).pos?.q ?? 0} onChange={(e) => updateAction(ti, ai, { pos: { ...(a as any).pos, q: Number(e.target.value) } })} />
                                <input className="input" style={{ width: 90 }} type="number" value={(a as any).pos?.r ?? 0} onChange={(e) => updateAction(ti, ai, { pos: { ...(a as any).pos, r: Number(e.target.value) } })} />
                              </>
                            ) : null}

                            {a.type === "CUSTOM" ? (
                              <input className="input" style={{ flex: "1 1 360px" }} value={(a as any).text ?? ""} onChange={(e) => updateAction(ti, ai, { text: e.target.value })} />
                            ) : null}

                            <button className="btn btnDanger" onClick={() => removeAction(ti, ai)}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {scenario.triggers.length === 0 ? <div className="small">No triggers yet.</div> : null}
                </div>
              </details>

              <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

              <details>
                <summary className="small" style={{ cursor: "pointer" }}>
                  <b>Raw Scenario JSON</b>
                </summary>
                <pre>{JSON.stringify(scenario, null, 2)}</pre>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
