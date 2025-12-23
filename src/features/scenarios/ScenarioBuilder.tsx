import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { DataProvider, DeckSummary, ScenarioSummary } from "../../lib/dataProvider";
import type { CardEntity } from "../../lib/types";
import { importScenariosJson } from "../../lib/scenarioStore";
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

export function ScenarioBuilder({ provider }: { provider: DataProvider }) {
  const [cards, setCards] = useState<CardEntity[]>([]);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [activeId, setActiveId] = useState("");
  const [scenario, setScenarioState] = useState<ScenarioDefinition | null>(null);
  const [importText, setImportText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    async (desiredId?: string) => {
      setLoading(true);
      setErr(null);
      try {
        const [deckList, scenarioList, cardList] = await Promise.all([
          provider.decks.list(),
          provider.scenarios.list(),
          provider.cards.list()
        ]);
        setDecks(deckList);
        setScenarios(scenarioList);
        setCards(cardList as CardEntity[]);

        const nextId = (desiredId && scenarioList.some((s) => s.id === desiredId) && desiredId) || scenarioList[0]?.id || "";
        setActiveId(nextId);
        const detail = nextId ? await provider.scenarios.get(nextId) : null;
        setScenarioState(detail ?? null);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
        setScenarioState(null);
      } finally {
        setLoading(false);
      }
    },
    [provider]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unitCards = useMemo(() => cards.filter((c) => c.type === "UNIT").sort((a, b) => a.name.localeCompare(b.name)), [cards]);

  async function setScenario(patch: Partial<ScenarioDefinition>) {
    if (!scenario) return;
    const next = { ...scenario, ...patch };
    await provider.scenarios.upsert(next);
    setScenarioState(next);
    setScenarios((prev) => prev.map((s) => (s.id === next.id ? { ...s, name: next.name } : s)));
  }

  async function newScenario() {
    const s = makeDefaultScenario();
    await provider.scenarios.upsert(s);
    await refresh(s.id);
  }

  async function deleteScenario() {
    if (!scenario) return;
    await provider.scenarios.remove(scenario.id);
    setScenarioState(null);
    await refresh();
  }

  async function exportActive() {
    if (!scenario) return;
    download(`${scenario.name.replace(/\s+/g, "_").toLowerCase()}_scenario.json`, JSON.stringify(scenario, null, 2));
  }
  async function exportAll() {
    const all = await Promise.all(scenarios.map((s) => provider.scenarios.get(s.id)));
    download(`cj_scenarios.json`, JSON.stringify({ scenarios: all.filter(Boolean) }, null, 2));
  }

  async function doImport() {
    setErr(null);
    try {
      const incoming = importScenariosJson(importText);
      for (const s of incoming) await provider.scenarios.upsert(s);
      setImportText("");
      await refresh(incoming[0]?.id);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  function setSide(idx: number, patch: Partial<ScenarioSideSetup>) {
    if (!scenario) return;
    const sides = scenario.setup.sides.slice();
    sides[idx] = { ...sides[idx], ...patch };
    void setScenario({ setup: { ...scenario.setup, sides } });
  }

  function addStartingUnit(sideIdx: number, cardId: string) {
    if (!scenario) return;
    const sides = scenario.setup.sides.slice();
    const s = sides[sideIdx];
    const startingUnits = s.startingUnits.slice();
    startingUnits.push({ cardId, pos: { q: 0, r: 0 } });
    sides[sideIdx] = { ...s, startingUnits };
    void setScenario({ setup: { ...scenario.setup, sides } });
  }

  function updateStartingUnit(sideIdx: number, unitIdx: number, patch: any) {
    if (!scenario) return;
    const sides = scenario.setup.sides.slice();
    const s = sides[sideIdx];
    const startingUnits = s.startingUnits.slice();
    startingUnits[unitIdx] = { ...startingUnits[unitIdx], ...patch, pos: { ...startingUnits[unitIdx].pos, ...(patch.pos ?? {}) } };
    sides[sideIdx] = { ...s, startingUnits };
    void setScenario({ setup: { ...scenario.setup, sides } });
  }

  function removeStartingUnit(sideIdx: number, unitIdx: number) {
    if (!scenario) return;
    const sides = scenario.setup.sides.slice();
    const s = sides[sideIdx];
    const startingUnits = s.startingUnits.slice();
    startingUnits.splice(unitIdx, 1);
    sides[sideIdx] = { ...s, startingUnits };
    void setScenario({ setup: { ...scenario.setup, sides } });
  }

  function addVictory(v: VictoryCondition) {
    if (!scenario) return;
    void setScenario({ victory: [...scenario.victory, v] });
  }

  function updateVictory(i: number, patch: any) {
    if (!scenario) return;
    const victory = scenario.victory.slice();
    victory[i] = { ...victory[i], ...patch };
    void setScenario({ victory });
  }

  function removeVictory(i: number) {
    if (!scenario) return;
    const victory = scenario.victory.slice();
    victory.splice(i, 1);
    void setScenario({ victory });
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
    void setScenario({ triggers: [...scenario.triggers, t] });
  }

  function updateTrigger(i: number, patch: Partial<ScenarioTrigger>) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    triggers[i] = { ...triggers[i], ...patch };
    void setScenario({ triggers });
  }

  function removeTrigger(i: number) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    triggers.splice(i, 1);
    void setScenario({ triggers });
  }

  function addAction(triggerIdx: number, action: ScenarioAction) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    const t = triggers[triggerIdx];
    triggers[triggerIdx] = { ...t, actions: [...t.actions, action] };
    void setScenario({ triggers });
  }

  function updateAction(triggerIdx: number, actionIdx: number, patch: any) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    const t = triggers[triggerIdx];
    const actions = t.actions.slice();
    actions[actionIdx] = { ...actions[actionIdx], ...patch };
    triggers[triggerIdx] = { ...t, actions };
    void setScenario({ triggers });
  }

  function removeAction(triggerIdx: number, actionIdx: number) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    const t = triggers[triggerIdx];
    const actions = t.actions.slice();
    actions.splice(actionIdx, 1);
    triggers[triggerIdx] = { ...t, actions };
    void setScenario({ triggers });
  }

  function setWhen(triggerIdx: number, when: TriggerWhen) {
    if (!scenario) return;
    const triggers = scenario.triggers.slice();
    triggers[triggerIdx] = { ...triggers[triggerIdx], when };
    void setScenario({ triggers });
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "320px 1fr", minHeight: 0 }}>
      <div className="panel" style={{ minHeight: 0 }}>
        <div className="ph">
          <div>
            <div className="h2">Scenarios</div>
            <div className="small">Triggers • story beats • setup</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="badge">{scenarios.length}</span>
            {loading ? <span className="small">Loading…</span> : null}
          </div>
        </div>
        <div className="pb" style={{ minHeight: 0, overflow: "auto" }}>
          <button className="btn btnPrimary" style={{ width: "100%", marginBottom: 10 }} onClick={() => void newScenario()}>
            + New Scenario
          </button>

          {err ? (
            <div className="err">
              <b>Error</b>
              <div className="small">{err}</div>
            </div>
          ) : null}

          {scenarios.map((s) => (
            <div
              key={s.id}
              className="item"
              onClick={() => void refresh(s.id)}
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
          {err && !scenario ? (
            <div className="err">
              <b>Import error</b>
              <div className="small">{err}</div>
            </div>
          ) : null}
          <textarea className="textarea" style={{ minHeight: 140 }} value={importText} onChange={(e) => setImportText(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btnPrimary" onClick={() => void doImport()} style={{ flex: 1 }} disabled={!importText.trim()}>
              Import
            </button>
            <button className="btn" onClick={() => void exportAll()} style={{ flex: 1 }}>
              Export All
            </button>
          </div>
        </div>
      </div>

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
              <input className="input" value={scenario.name} onChange={(e) => void setScenario({ name: e.target.value })} />

              <div className="small" style={{ marginTop: 8 }}>
                Description
              </div>
              <textarea className="textarea" value={scenario.description ?? ""} onChange={(e) => void setScenario({ description: e.target.value })} />

              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 160px" }}>
                  <div className="small">Players</div>
                  <input
                    className="input"
                    type="number"
                    value={scenario.players}
                    onChange={(e) => void setScenario({ players: Math.max(1, Math.floor(Number(e.target.value))) })}
                  />
                </div>
                <div style={{ flex: "1 1 220px" }}>
                  <div className="small">Mode</div>
                  <select className="select" value={scenario.mode} onChange={(e) => void setScenario({ mode: e.target.value as any })}>
                    <option value="ASSISTED_PHYSICAL">ASSISTED_PHYSICAL</option>
                    <option value="FULL_DIGITAL">FULL_DIGITAL</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <button className="btn" onClick={() => void exportActive()}>
                    Export
                  </button>
                  <button className="btn btnDanger" onClick={() => void deleteScenario()}>
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
                        void setScenario({ setup: { ...scenario.setup, env } });
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
                      void setScenario({ story });
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
                          <div style={{ flex: "0 0 180px" }}>
                            <div className="small">Env Key</div>
                            <input className="input" value={(t.when as any).key ?? ""} onChange={(e) => setWhen(ti, { type: "ON_ENV_VAR_CHANGED", key: e.target.value })} />
                          </div>
                        ) : null}

                        {t.when.type === "ON_TURN_START" || t.when.type === "ON_UNIT_DEATH" ? (
                          <div style={{ flex: "0 0 180px" }}>
                            <div className="small">Side</div>
                            <input className="input" value={(t.when as any).sideId ?? ""} onChange={(e) => setWhen(ti, { ...t.when, sideId: e.target.value } as any)} />
                          </div>
                        ) : null}

                        {t.when.type === "ON_UNIT_DEATH" ? (
                          <div style={{ flex: "0 0 180px" }}>
                            <div className="small">Card</div>
                            <input className="input" value={(t.when as any).cardId ?? ""} onChange={(e) => setWhen(ti, { ...t.when, cardId: e.target.value } as any)} />
                          </div>
                        ) : null}

                        {t.when.type === "ON_CUSTOM_EVENT" ? (
                          <div style={{ flex: "0 0 220px" }}>
                            <div className="small">Event</div>
                            <input className="input" value={(t.when as any).name ?? ""} onChange={(e) => setWhen(ti, { type: "ON_CUSTOM_EVENT", name: e.target.value })} />
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 220px" }}>
                          <div className="small">Actions</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button className="btn" onClick={() => addAction(ti, { type: "CUSTOM", text: "Describe a custom action" })}>
                            + Custom Action
                          </button>
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                        {t.actions.map((a, ai) => (
                          <div key={ai} className="item" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <div className="small" style={{ minWidth: 160 }}>
                              {a.type}
                            </div>
                            {a.type === "CUSTOM" ? (
                              <input className="input" style={{ flex: "1 1 260px" }} value={(a as any).text} onChange={(e) => updateAction(ti, ai, { text: e.target.value })} />
                            ) : null}
                            {a.type === "SPAWN_UNIT" ? (
                              <>
                                <input className="input" style={{ width: 200 }} value={(a as any).cardId} onChange={(e) => updateAction(ti, ai, { cardId: e.target.value })} />
                                <input
                                  className="input"
                                  style={{ width: 160 }}
                                  type="number"
                                  value={(a as any).qty ?? 1}
                                  onChange={(e) => updateAction(ti, ai, { qty: Number(e.target.value) })}
                                />
                              </>
                            ) : null}
                            <button className="btn btnDanger" onClick={() => removeAction(ti, ai)}>
                              Remove
                            </button>
                          </div>
                        ))}
                        {!t.actions.length ? <div className="small">No actions configured yet.</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
