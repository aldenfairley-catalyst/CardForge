import type { ScenarioDefinition } from "./scenarioTypes";
import { SCENARIO_LATEST_VERSION, SCENARIO_STORE_VERSION } from "./versions";

const KEY = "CJ_SCENARIOS_V1";

export type ScenarioStore = {
  schemaVersion: typeof SCENARIO_STORE_VERSION;
  scenarios: ScenarioDefinition[];
};

export function loadScenarioStore(): ScenarioStore {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { schemaVersion: SCENARIO_STORE_VERSION, scenarios: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== SCENARIO_STORE_VERSION) return { schemaVersion: SCENARIO_STORE_VERSION, scenarios: [] };
    return parsed as ScenarioStore;
  } catch {
    return { schemaVersion: SCENARIO_STORE_VERSION, scenarios: [] };
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
  if (parsed?.schemaVersion === SCENARIO_LATEST_VERSION) return [parsed];
  throw new Error("Unrecognized scenario JSON. Expected a scenario, array, or {scenarios:[...]}.");
}
