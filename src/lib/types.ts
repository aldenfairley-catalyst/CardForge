/**
 * Captain Jawa Digital — Types
 * CJ-1.2 (permissive typing to avoid blocking iteration)
 */

export type CardSchemaVersion = `CJ-1.${number}`;

export type CardType = "UNIT" | "ITEM" | "ENVIRONMENT" | "SPELL" | "TOKEN";

export type TokenKey = "UMB" | "AET" | "CRD" | "CHR" | "STR" | "RES" | "WIS" | "INT" | "SPD" | "AWR";

export type DistanceMetric = "HEX" | "SQUARE_MANHATTAN" | "SQUARE_EUCLIDEAN" | "SQUARE_CHEBYSHEV";

export type ZoneKey =
  | "ACTOR_ACTION_DECK" | "ACTOR_ACTION_HAND" | "ACTOR_ACTION_DISCARD"
  | "ACTOR_ITEM_DECK" | "ACTOR_ITEM_HAND" | "ACTOR_ITEM_DISCARD"
  | "OPPONENT_ACTION_DECK" | "OPPONENT_ACTION_HAND" | "OPPONENT_ACTION_DISCARD"
  | "OPPONENT_ITEM_DECK" | "OPPONENT_ITEM_HAND" | "OPPONENT_ITEM_DISCARD"
  | "SCENARIO_SHARED_DECK" | "SCENARIO_SHARED_HAND" | "SCENARIO_SHARED_DISCARD"
  | "SCENARIO_EXILE";

export type DamageType = "PHYSICAL" | "ELECTRICAL" | "FIRE" | "COLD" | "POISON" | "SIEGE" | "MAGICAL";

export type StatusKey =
  | "SLOWED" | "STUNNED" | "BURNING" | "POISONED" | "WET" | "FROZEN"
  | "MARKED" | "FEARED" | "INVISIBLE" | "BLEEDING";

export type TriggerKey =
  | "ACTIVE_ACTION" | "PASSIVE_AURA" | "REACTION" | "ON_DEATH"
  | "ON_DRAW" | "ON_EQUIP" | "ON_PLAY_FROM_HAND"
  | "ON_TURN_START" | "ON_TURN_END" | "ON_ROUND_START" | "ON_ROUND_END";

export type ImageFit = "COVER" | "CONTAIN";
export type ImageAlign = "TOP" | "CENTER" | "BOTTOM" | "LEFT" | "RIGHT";

export type LoSMode = "HEX_RAYCAST" | "SQUARE_RAYCAST" | "NONE" | "ADVISORY";
export type LoSBlockPolicy = "BLOCK_ALL" | "BLOCK_RANGED" | "BLOCK_AOE" | "BLOCK_MAGIC" | "BLOCK_NON_MAGICAL";

export type EntityRef =
  | { type: "SELF" }
  | { type: "TARGET" }
  | { type: "ITERATION_TARGET" }
  | { type: "ENTITY_ID"; id: string };

export type TargetSetRef = { ref: string };

export type Expression =
  | { type: "CONST_NUMBER"; value: number }
  | { type: "VAR"; key: string }
  | { type: "ADD"; a: Expression; b: Expression }
  | { type: "SUB"; a: Expression; b: Expression }
  | { type: "MUL"; a: Expression; b: Expression }
  | { type: "DIV"; a: Expression; b: Expression }
  | { type: string; [k: string]: any }; // forward compatible

export type Condition =
  | { type: "ALWAYS" }
  | { type: "NOT"; cond: Condition }
  | { type: "AND"; all: Condition[] }
  | { type: "OR"; any: Condition[] }
  | { type: "STATE_EQUALS"; entity: EntityRef; key: string; value: any }
  | { type: "WITHIN_DISTANCE"; metric: DistanceMetric; from: EntityRef; to: EntityRef; max: number; min?: number }
  | { type: string; [k: string]: any }; // forward compatible

export type TargetingType = "SELF" | "SINGLE_TARGET" | "AREA_RADIUS" | "AREA_AROUND_TARGET" | "LINE" | "CONE" | "GLOBAL_ANYWHERE";
export type TargetOrigin = "SOURCE" | "TARGET" | "ANYWHERE";

export type LoSRule = {
  mode: LoSMode;
  required: boolean;
  blockers?: Array<{ policy: LoSBlockPolicy; tags: string[] }>;
};

export type TargetingProfile = {
  id: string;
  label?: string;
  type: TargetingType;
  origin?: TargetOrigin;
  originRef?: string; // optional: allow targeting based on a prior selection (e.g., secondary around primary)
  range?: { base: number; min?: number; max?: number };
  lineOfSight?: boolean;
  los?: LoSRule;
  area?: { radius: number; includeCenter?: boolean; maxTargets?: number };
};

export type AbilityCost = {
  ap: number;
  tokens?: Partial<Record<TokenKey, number>>;        // AND cost
  tokenOptions?: Array<Partial<Record<TokenKey, number>>>; // OR options
  requiredEquippedItemIds?: string[];
  cooldown?: { turns: number };
};

export type AbilityComponent = {
  componentType: "ABILITY";
  name: string;
  description?: string;
  trigger: TriggerKey;
  cost: AbilityCost;
  requirements?: Condition;
  targetingProfiles?: TargetingProfile[];
  execution?: { steps: Step[] };
};

export type EffectComponent = {
  componentType: "EFFECT";
  name: string;
  trigger: Exclude<TriggerKey, "ACTIVE_ACTION"> | "PASSIVE_AURA";
  scope?: EntityRef;
  modifiers?: any[];
};

export type RuleComponent = {
  componentType: "RULE";
  name: string;
  text: string;
};

export type Component = AbilityComponent | EffectComponent | RuleComponent | { componentType: string; [k: string]: any };

export type StatsBlock = {
  hp?: { current: number; max: number };
  ap?: { current: number; max: number };
  movement?: number;
  size?: number;
  resilience?: number;
};

export type CardEntity = {
  schemaVersion: CardSchemaVersion;
  id: string;
  name: string;
  type: CardType;
  subType?: string[];
  faction?: string;
  attributes?: string[];
  tags?: string[];
  visuals?: {
    cardImage?: string;
    tokenImage?: string;
    model3d?: string;
    imageFit?: ImageFit;
    imageAlign?: ImageAlign;
  };
  stats?: StatsBlock;
  tokenValue?: Partial<Record<TokenKey, number>>;
  state?: Record<string, any>;
  restrictions?: {
    usableByUnitIds?: string[]; // e.g. Hook Staff only by Fisherman
    equipToTagsAny?: string[];
  };
  unitId?: string; // link unit card to catalog unit
  components: Component[];
  [k: string]: any; // forward compatible
};

// -------- Steps --------

export type Step =
  | ShowTextStep
  | RollD6Step
  | RollD20Step
  | SetVariableStep
  | IfElseStep
  | OpponentSaveStep
  | SelectTargetsStep
  | ForEachTargetStep
  | DealDamageStep
  | HealStep
  | ApplyStatusStep
  | RemoveStatusStep
  | MoveEntityStep
  | MoveWithPathCaptureStep
  | OpenReactionWindowStep
  | CalcDistanceStep
  | DrawCardsStep
  | MoveCardsStep
  | ShuffleZoneStep
  | PutOnTopOrderedStep
  | EndTurnImmediatelyStep
  | EmptyHandStep
  | AddCardsToDeckStep
  | RemoveCardsFromDeckStep
  | SwapDeckStep
  | SetEntityStateStep
  | ToggleEntityStateStep
  | ClearEntityStateStep
  | FindEntitiesStep
  | CountEntitiesStep
  | FilterTargetSetStep
  | SpawnEntityStep
  | DespawnEntityStep
  | OpenUiFlowStep
  | RequestPlayerChoiceStep
  | RegisterInterruptsStep
  | PropertyContestStep
  | WebhookCallStep
  | EmitEventStep
  | AiRequestStep
  | UnknownStep;

export type ShowTextStep = { type: "SHOW_TEXT"; text: string };
export type RollD6Step = { type: "ROLL_D6"; saveAs?: string };
export type RollD20Step = { type: "ROLL_D20"; saveAs?: string };
export type SetVariableStep = { type: "SET_VARIABLE"; saveAs: string; valueExpr: Expression };

export type IfElseStep = {
  type: "IF_ELSE";
  condition: Condition;
  then: Step[];
  elseIf?: Array<{ condition: Condition; then: Step[] }>;
  else?: Step[];
};

export type OpponentSaveStep = {
  type: "OPPONENT_SAVE";
  stat: string;
  difficulty: number;
  onFail: Step[];
  onSuccess: Step[];
};

export type SelectTargetsStep = {
  type: "SELECT_TARGETS";
  profileId: string;
  saveAs: string;
  // optional advanced: originRef for secondary targeting
  originRef?: string;
};

export type ForEachTargetStep = {
  type: "FOR_EACH_TARGET";
  targetSet: TargetSetRef;
  do: Step[];
};

export type DealDamageStep = {
  type: "DEAL_DAMAGE";
  target: EntityRef;
  amountExpr: Expression;
  damageType: DamageType;
};

export type HealStep = {
  type: "HEAL";
  target: EntityRef;
  amountExpr: Expression;
};

export type ApplyStatusStep = {
  type: "APPLY_STATUS";
  target: EntityRef;
  status: StatusKey;
  duration?: { turns: number };
};

export type RemoveStatusStep = {
  type: "REMOVE_STATUS";
  target: EntityRef;
  status: StatusKey;
};

export type MoveEntityStep = {
  type: "MOVE_ENTITY";
  target: EntityRef;
  to: { mode: "TARGET_POSITION" | "HEX"; q?: number; r?: number };
  maxTiles: number;
};

export type MoveWithPathCaptureStep = {
  type: "MOVE_WITH_PATH_CAPTURE";
  target: EntityRef;
  maxTiles: number;
  savePassedEnemiesAs: string;
  ignoreReactions?: boolean;
};

export type OpenReactionWindowStep = {
  type: "OPEN_REACTION_WINDOW";
  timing: "BEFORE_DAMAGE" | "AFTER_DAMAGE" | "BEFORE_MOVE" | "AFTER_MOVE";
  windowId: string;
};

export type CalcDistanceStep = {
  type: "CALC_DISTANCE";
  metric: DistanceMetric;
  from: EntityRef;
  to: EntityRef;
  saveAs: string;
};

export type DrawCardsStep = {
  type: "DRAW_CARDS";
  from: ZoneKey;
  to: ZoneKey;
  count: number;
  faceUp?: boolean;
  saveAs?: string;
};

export type MoveCardsStep = {
  type: "MOVE_CARDS";
  from: ZoneKey;
  to: ZoneKey;
  selector: any;
  saveAs?: string;
};

export type ShuffleZoneStep = { type: "SHUFFLE_ZONE"; zone: ZoneKey };
export type PutOnTopOrderedStep = { type: "PUT_ON_TOP_ORDERED"; zone: ZoneKey; cardsRef: string };
export type EndTurnImmediatelyStep = { type: "END_TURN_IMMEDIATELY" };

// New deck/scenario steps
export type EmptyHandStep = { type: "EMPTY_HAND"; handZone: ZoneKey; to: ZoneKey };
export type AddCardsToDeckStep = { type: "ADD_CARDS_TO_DECK"; deckZone: ZoneKey; cardIds: string[]; countEach?: number; shuffleIn?: boolean };
export type RemoveCardsFromDeckStep = { type: "REMOVE_CARDS_FROM_DECK"; deckZone: ZoneKey; cardIds: string[]; countEach?: number; to?: ZoneKey };
export type SwapDeckStep = { type: "SWAP_DECK"; actor: "ACTOR" | "OPPONENT" | "SCENARIO"; slot: "ACTION" | "ITEM" | "CUSTOM"; newDeckId: string; policy?: { onSwap?: "KEEP_HAND" | "DISCARD_HAND" | "EMPTY_HAND_TO_DISCARD" } };

// New state steps
export type SetEntityStateStep = { type: "SET_ENTITY_STATE"; entity: EntityRef; key: string; value: any };
export type ToggleEntityStateStep = { type: "TOGGLE_ENTITY_STATE"; entity: EntityRef; key: string };
export type ClearEntityStateStep = { type: "CLEAR_ENTITY_STATE"; entity: EntityRef; key: string };

// New entity query/spawn steps
export type FindEntitiesStep = { type: "FIND_ENTITIES"; selector: any; saveAs: string };
export type CountEntitiesStep = { type: "COUNT_ENTITIES"; targetSet: TargetSetRef; saveAs: string };
export type FilterTargetSetStep = { type: "FILTER_TARGET_SET"; source: TargetSetRef; filter: any; saveAs: string };
export type SpawnEntityStep = { type: "SPAWN_ENTITY"; cardId: string; owner?: "ACTOR" | "OPPONENT" | "SCENARIO"; at: any; saveAs?: string };
export type DespawnEntityStep = { type: "DESPAWN_ENTITY"; target: EntityRef };

// UI / integrations
export type OpenUiFlowStep = { type: "OPEN_UI_FLOW"; flowId: string; payload?: any; saveAs?: string };
export type RequestPlayerChoiceStep = { type: "REQUEST_PLAYER_CHOICE"; prompt: string; choices: Array<{ id: string; label: string }>; saveAs: string };
export type RegisterInterruptsStep = { type: "REGISTER_INTERRUPTS"; scope: string; events: string[]; onInterrupt: Step[] };

export type PropertyContestStep = {
  type: "PROPERTY_CONTEST";
  variant: string;
  policy?: any;
  ui?: any;
  io?: any;
  onWin: Step[];
  onLose: Step[];
};

export type WebhookCallStep = { type: "WEBHOOK_CALL"; url: string; method?: "POST" | "GET" | "PUT" | "DELETE"; eventName: string; payload?: any };
export type EmitEventStep = { type: "EMIT_EVENT"; eventName: string; payload?: any };

export type AiRequestStep = {
  type: "AI_REQUEST";
  systemPrompt: string;
  userPrompt: string;
  input?: any;
  outputJsonSchema?: any;
  saveAs: string;
};

export type UnknownStep = { type: "UNKNOWN_STEP"; raw: any };
