import type { Step } from "./types";

export type StepFactoryContext = {
  abilityProfiles?: string[];
};

export function makeDefaultStep(stepType: string, ctx?: StepFactoryContext): Step {
  const profileId = ctx?.abilityProfiles?.[0] ?? "default";

  switch (stepType) {
    case "SHOW_TEXT":
      return { type: "SHOW_TEXT", text: "..." } as any;

    case "ROLL_D6":
      return { type: "ROLL_D6", saveAs: "d6" } as any;

    case "ROLL_D20":
      return { type: "ROLL_D20", saveAs: "d20" } as any;

    case "SET_VARIABLE":
      return { type: "SET_VARIABLE", saveAs: "var", valueExpr: { type: "CONST_NUMBER", value: 1 } } as any;

    case "IF_ELSE":
      return { type: "IF_ELSE", condition: { type: "ALWAYS" }, then: [], elseIf: [], else: [] } as any;

    case "SELECT_TARGETS":
      return {
        type: "SELECT_TARGETS",
        profileId,
        saveAs: "targets"
      } as any;

    case "FOR_EACH_TARGET":
      return { type: "FOR_EACH_TARGET", targetSet: { ref: "targets" }, do: [{ type: "SHOW_TEXT", text: "Per target..." }] } as any;

    case "DEAL_DAMAGE":
      return {
        type: "DEAL_DAMAGE",
        target: { type: "ITERATION_TARGET" },
        amountExpr: { type: "CONST_NUMBER", value: 10 },
        damageType: "PHYSICAL"
      } as any;

    case "HEAL":
      return { type: "HEAL", target: { type: "SELF" }, amountExpr: { type: "CONST_NUMBER", value: 10 } } as any;

    case "APPLY_STATUS":
      return { type: "APPLY_STATUS", target: { type: "ITERATION_TARGET" }, status: "SLOWED", duration: { turns: 1 } } as any;

    case "REMOVE_STATUS":
      return { type: "REMOVE_STATUS", target: { type: "SELF" }, status: "STUNNED" } as any;

    case "MOVE_ENTITY":
      return { type: "MOVE_ENTITY", target: { type: "SELF" }, to: { mode: "TARGET_POSITION" }, maxTiles: 4 } as any;

    case "MOVE_WITH_PATH_CAPTURE":
      return { type: "MOVE_WITH_PATH_CAPTURE", target: { type: "SELF" }, maxTiles: 4, savePassedEnemiesAs: "passedEnemies", ignoreReactions: true } as any;

    case "OPEN_REACTION_WINDOW":
      return { type: "OPEN_REACTION_WINDOW", timing: "BEFORE_DAMAGE", windowId: "pre_damage" } as any;

    case "OPPONENT_SAVE":
      return { type: "OPPONENT_SAVE", stat: "SPEED", difficulty: 13, onFail: [], onSuccess: [] } as any;

    case "CALC_DISTANCE":
      return { type: "CALC_DISTANCE", metric: "HEX", from: { type: "SELF" }, to: { type: "ITERATION_TARGET" }, saveAs: "distance" } as any;

    case "DRAW_CARDS":
      return { type: "DRAW_CARDS", from: "ACTOR_ACTION_DECK", to: "ACTOR_ACTION_HAND", count: 1, faceUp: false, saveAs: "drawn" } as any;

    case "MOVE_CARDS":
      return { type: "MOVE_CARDS", from: "ACTOR_ACTION_HAND", to: "ACTOR_ACTION_DISCARD", selector: { topN: 1 } } as any;

    case "SHUFFLE_ZONE":
      return { type: "SHUFFLE_ZONE", zone: "ACTOR_ACTION_DECK" } as any;

    case "PUT_ON_TOP_ORDERED":
      return { type: "PUT_ON_TOP_ORDERED", zone: "ACTOR_ACTION_DECK", cardsRef: "drawn" } as any;

    case "END_TURN_IMMEDIATELY":
      return { type: "END_TURN_IMMEDIATELY" } as any;

    // NEW: deck/scenario
    case "EMPTY_HAND":
      return { type: "EMPTY_HAND", handZone: "ACTOR_ACTION_HAND", to: "ACTOR_ACTION_DISCARD" } as any;

    case "ADD_CARDS_TO_DECK":
      return { type: "ADD_CARDS_TO_DECK", deckZone: "ACTOR_ACTION_DECK", cardIds: ["some_card_id"], countEach: 1, shuffleIn: true } as any;

    case "REMOVE_CARDS_FROM_DECK":
      return { type: "REMOVE_CARDS_FROM_DECK", deckZone: "ACTOR_ACTION_DECK", cardIds: ["some_card_id"], countEach: 1, to: "SCENARIO_EXILE" } as any;

    case "SWAP_DECK":
      return { type: "SWAP_DECK", actor: "ACTOR", slot: "ACTION", newDeckId: "deck_id", policy: { onSwap: "DISCARD_HAND" } } as any;

    // NEW: state
    case "SET_ENTITY_STATE":
      return { type: "SET_ENTITY_STATE", entity: { type: "SELF" }, key: "loaded", value: true } as any;

    case "TOGGLE_ENTITY_STATE":
      return { type: "TOGGLE_ENTITY_STATE", entity: { type: "SELF" }, key: "loaded" } as any;

    case "CLEAR_ENTITY_STATE":
      return { type: "CLEAR_ENTITY_STATE", entity: { type: "SELF" }, key: "loaded" } as any;

    // NEW: queries/spawn
    case "FIND_ENTITIES":
      return { type: "FIND_ENTITIES", selector: { scope: "BOARD", filters: { tagsAny: [], tagsAll: [] } }, saveAs: "found" } as any;

    case "COUNT_ENTITIES":
      return { type: "COUNT_ENTITIES", targetSet: { ref: "found" }, saveAs: "foundCount" } as any;

    case "FILTER_TARGET_SET":
      return { type: "FILTER_TARGET_SET", source: { ref: "found" }, filter: { tagsAny: [], tagsAll: [] }, saveAs: "filtered" } as any;

    case "SPAWN_ENTITY":
      return { type: "SPAWN_ENTITY", cardId: "token_smoke", owner: "SCENARIO", at: { mode: "TARGET_POSITION" }, saveAs: "spawned" } as any;

    case "DESPAWN_ENTITY":
      return { type: "DESPAWN_ENTITY", target: { type: "ITERATION_TARGET" } } as any;

    // UI / subsystems
    case "OPEN_UI_FLOW":
      return { type: "OPEN_UI_FLOW", flowId: "CUSTOM", payload: { note: "open mini-flow UI" }, saveAs: "uiResult" } as any;

    case "REQUEST_PLAYER_CHOICE":
      return { type: "REQUEST_PLAYER_CHOICE", prompt: "Choose one:", choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }], saveAs: "choice" } as any;

    case "REGISTER_INTERRUPTS":
      return { type: "REGISTER_INTERRUPTS", scope: "UNTIL_TURN_END", events: ["ON_MOVE"], onInterrupt: [{ type: "SHOW_TEXT", text: "Interrupted!" }] } as any;

    case "PROPERTY_CONTEST":
      return {
        type: "PROPERTY_CONTEST",
        variant: "STATUS_GAME",
        policy: { shuffleAllDrawnIntoOwnersDeck: true, winnerMayKeepToHandMax: 0 },
        ui: { flowId: "PROPERTY_CONTEST", allowSpectators: true },
        io: { actorPoolRef: "actorPool", opponentPoolRef: "opponentPool", winnerRef: "winner" },
        onWin: [{ type: "SHOW_TEXT", text: "Win branch" }],
        onLose: [{ type: "SHOW_TEXT", text: "Lose branch" }]
      } as any;

    // integrations
    case "WEBHOOK_CALL":
      return { type: "WEBHOOK_CALL", url: "http://localhost:3000/hook", method: "POST", eventName: "event", payload: { hello: "world" } } as any;

    case "EMIT_EVENT":
      return { type: "EMIT_EVENT", eventName: "MY_EVENT", payload: { note: "internal event bus" } } as any;

    case "AI_REQUEST":
      return {
        type: "AI_REQUEST",
        systemPrompt: "You are a rules assistant. Output strict JSON only.",
        userPrompt: "Given the current card and ability, suggest a balanced damage value.",
        input: { includeCard: true, includeAbility: true, includeStep: false, includeGameState: false },
        outputJsonSchema: { type: "object", properties: { damage: { type: "number" }, note: { type: "string" } }, required: ["damage"] },
        saveAs: "aiResult"
      } as any;

    default:
      return { type: "UNKNOWN_STEP", raw: { type: stepType } } as any;
  }
}
