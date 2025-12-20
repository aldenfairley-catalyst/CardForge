import type { ScenarioDefinition } from "./scenarioTypes";

const KEY = "CJ_SCENARIOS_V1";

export type ScenarioStore = {
  schemaVersion: "CJ-SCENARIO-STORE-1.0";
  scenarios: ScenarioDefinition[];
};

export function loadScenarioStore(): ScenarioStore {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { schemaVersion: "CJ-SCENARIO-STORE-1.0", scenarios: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== "CJ-SCENARIO-STORE-1.0") return { schemaVersion: "CJ-SCENARIO-STORE-1.0", scenarios: [] };
    return parsed as ScenarioStore;
  } catch {
    return { schemaVersion: "CJ-SCENARIO-STORE-1.0", scenarios: [] };
  }
}

export function saveScenarioStore(store: ScenarioStore) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function upsertScenario(s: ScenarioDefinition) {
  const store = loadScenarioStore();
  const idx = store.scenarios.findIndex((x) => x.id === s.id);
  const scenarios = store.scenarios.slice();
  if (idx >= 0) scenarios[idx] = s;
  else scenarios.push(s);
  saveScenarioStore({ ...store, scenarios });
}

export function removeScenario(id: string) {
  const store = loadScenarioStore();
  saveScenarioStore({ ...store, scenarios: store.scenarios.filter((x) => x.id !== id) });
}

export function importScenariosJson(text: string): ScenarioDefinition[] {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.scenarios)) return parsed.scenarios;
  if (parsed?.schemaVersion === "CJ-SCENARIO-1.0") return [parsed];
  throw new Error("Unrecognized scenario JSON. Expected a scenario, array, or {scenarios:[...]}.");
}
