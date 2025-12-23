export type AxialHexPos = { q: number; r: number };

export type ScenarioSideSetup = {
  sideId: string; // "A", "B", etc
  name: string;
  faction?: string;
  deckId?: string;
  startingUnits: Array<{
    cardId: string;
    pos: AxialHexPos;
    facing?: number; // 0..5
    stateOverrides?: Record<string, any>;
  }>;
};

export type VictoryCondition =
  | { type: "ELIMINATE_SIDE"; sideId: string }
  | { type: "SURVIVE_ROUNDS"; sideId: string; rounds: number }
  | { type: "CONTROL_OBJECTIVES"; sideId: string; objectiveIds: string[]; requiredCount?: number }
  | { type: "CUSTOM"; text: string };

export type StoryBeat =
  | { id: string; type: "SLIDESHOW"; src: string; trigger: "ON_SCENARIO_START" | "ON_TRIGGER"; triggerId?: string }
  | { id: string; type: "VIDEO"; src: string; trigger: "ON_SCENARIO_START" | "ON_TRIGGER"; triggerId?: string };

export type TriggerWhen =
  | { type: "ON_SCENARIO_START" }
  | { type: "ON_ROUND_START"; round?: number }
  | { type: "ON_TURN_START"; sideId?: string }
  | { type: "ON_UNIT_DEATH"; cardId?: string; sideId?: string }
  | { type: "ON_ENV_VAR_CHANGED"; key: string }
  | { type: "ON_CUSTOM_EVENT"; name: string };

export type ScenarioAction =
  | { type: "SHOW_STORY"; beatId: string }
  | { type: "SET_ENV_VAR"; key: string; value: any }
  | { type: "INCREMENT_ENV_VAR"; key: string; delta: number }
  | { type: "EMPTY_HAND"; sideId: string }
  | { type: "SWITCH_DECK"; sideId: string; deckId: string }
  | { type: "ADD_CARDS_TO_DECK"; sideId: string; cardId: string; qty: number }
  | { type: "REMOVE_CARDS_FROM_DECK"; sideId: string; cardId: string; qty: number }
  | { type: "SPAWN_UNIT"; sideId: string; cardId: string; pos: AxialHexPos }
  | { type: "REMOVE_UNIT"; unitInstanceId?: string; matchCardId?: string; sideId?: string }
  | { type: "CUSTOM"; text: string; payload?: any };

export type ScenarioTrigger = {
  id: string;
  name: string;
  enabled: boolean;
  when: TriggerWhen;
  conditions?: any[]; // future: reuse Condition/Expr system; keep flexible
  actions: ScenarioAction[];
  runPolicy?: {
    maxTimes?: number;
    oncePerRound?: boolean;
    oncePerTurn?: boolean;
  };
};

export type ScenarioDefinition = {
  schemaVersion: typeof SCENARIO_LATEST_VERSION;
  id: string;
  name: string;
  description?: string;
  players: number;
  mode: "ASSISTED_PHYSICAL" | "FULL_DIGITAL";
  setup: {
    sides: ScenarioSideSetup[];
    env: Record<string, any>;
  };
  victory: VictoryCondition[];
  story: StoryBeat[];
  triggers: ScenarioTrigger[];
};

export function makeDefaultScenario(): ScenarioDefinition {
  return {
    schemaVersion: SCENARIO_LATEST_VERSION,
    id: `scenario.${cryptoRandomId()}`,
    name: "New Scenario",
    description: "",
    players: 2,
    mode: "ASSISTED_PHYSICAL",
    setup: {
      sides: [
        { sideId: "A", name: "Side A", faction: "", deckId: "", startingUnits: [] },
        { sideId: "B", name: "Side B", faction: "", deckId: "", startingUnits: [] }
      ],
      env: { waterLevel: 0 }
    },
    victory: [{ type: "ELIMINATE_SIDE", sideId: "B" }],
    story: [],
    triggers: []
  };
}

function cryptoRandomId() {
  try {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.from(a)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return Math.random().toString(16).slice(2);
  }
}
import { SCENARIO_LATEST_VERSION } from "./versions";
