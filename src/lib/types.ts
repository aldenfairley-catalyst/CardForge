// src/lib/types.ts
// Captain Jawa Digital – Core Types (CJ-1.1+)
// Option A: Target Profiles + Target Sets
// Adds: custom per-card state schema + state conditions + state mutation steps

export type SchemaVersion = "CJ-1.0" | "CJ-1.1" | string;

export type CardType = "UNIT" | "ITEM" | "ENVIRONMENT" | "SPELL" | "TOKEN";
export type EntityType = CardType;

export type IdString = string;

// ---------------------------
// Token / Resource Keys
// ---------------------------

export type TokenKey =
  | "UMB" // Umbra
  | "AET" // Aether
  | "CRD" // Coordination
  | "CHR" // Charisma
  | "STR" // Strength
  | "RES" // Resilience
  | "WIS" // Wisdom
  | "INT" // Intelligence
  | "SPD" // Speed
  | "AWR"; // Awareness

export type Resources = {
  // Preferred abbreviations
  UMB?: number;
  AET?: number;
  CRD?: number;
  CHR?: number;
  STR?: number;
  RES?: number;
  WIS?: number;
  INT?: number;
  SPD?: number;
  AWR?: number;

  // Legacy aliases (optional)
  umbra?: number;
  aether?: number;
  coordination?: number;
  charisma?: number;
  strength?: number;
  resilience?: number;
  wisdom?: number;
  intelligence?: number;
  speed?: number;
  awareness?: number;
};

// ---------------------------
// Unit Stats
// ---------------------------

export type Gauge = { current: number; max: number };

export type UnitStats = {
  hp?: Gauge;
  ap?: Gauge; // per round
  movement?: number; // MOVE
  resilience?: number;
  size?: number;
};

// ---------------------------
// Custom State (per card instance)
// ---------------------------

export type StateValue = boolean | number | string;
export type StateValueType = "boolean" | "number" | "string";

export type StateDef = {
  type: StateValueType;
  default: StateValue;
  description?: string;
};

export type StateSchema = Record<string, StateDef>;

// ---------------------------
// Presentation / Visuals
// ---------------------------

export type CardVisuals = {
  cardImage?: string; // URL or data URL (MVP)
  tokenImage?: string;
  model3d?: string;

  imageAlign?: "CENTER" | "TOP" | "BOTTOM" | "LEFT" | "RIGHT";
  imageFit?: "COVER" | "CONTAIN";
};

export type CardPresentation = {
  template?: "T1" | "T2" | "T3" | "T4" | "T5";
  theme?: "BLUE" | "GREEN" | "PURPLE" | "ORANGE" | "RED";
};

// ---------------------------
// Card Entity
// ---------------------------

export type CardEntity = {
  schemaVersion: SchemaVersion;
  id: IdString;
  name: string;
  type: CardType;

  faction?: string;
  subType?: string[];
  attributes?: string[];
  tags?: string[];

  visuals?: CardVisuals;
  presentation?: CardPresentation;

  stats?: UnitStats;
  resources?: Resources;

  // NEW: defines custom state keys available on instances of this card
  // e.g. { "loaded": { "type":"boolean", "default": false } }
  stateSchema?: StateSchema;

  components: Component[];
};

// ---------------------------
// Components
// ---------------------------

export type Component = AbilityComponent | ItemComponent | StatsComponent | UnknownComponent;

export type UnknownComponent = {
  componentType: string;
  [k: string]: any;
};

export type StatsComponent = {
  componentType: "STATS";
  stats: UnitStats;
};

export type ItemComponent = {
  componentType: "ITEM";
  slots?: string[];
  hands?: number;
  restrictions?: {
    allowedFactions?: string[];
    allowedTypes?: string[];
  };
};

// ---------------------------
// Abilities
// ---------------------------

export type AbilityTrigger =
  | "ACTIVE_ACTION"
  | "PASSIVE_AURA"
  | "REACTION"
  | "ON_DEATH"
  | "ON_EQUIP"
  | "ON_DRAW"
  | "ON_PLAY";

export type AbilityCost = {
  ap?: number;
  tokens?: Partial<Record<TokenKey, number>>;
  requiredEquippedItemIds?: string[];
  cooldown?: { turns: number };
};

export type AbilityExecution = { steps: Step[] };

// ---------------------------
// Target Profiles + Target Sets (Option A)
// ---------------------------

export type TargetingType = "SELF" | "SINGLE_TARGET" | "MULTI_TARGET" | "AREA_RADIUS" | "LINE" | "CONE";

export type TargetingOrigin = "SOURCE" | "ANYWHERE" | "RELATIVE_TO_TARGET_SET";

export type RangeSpec = {
  min?: number;
  max?: number;
  base?: number; // legacy
};

export type AreaSpec = {
  radius: number;
  includeCenter?: boolean;
};

export type TargetingConstraints = {
  excludeSelf?: boolean;
  excludeTargetSet?: string;
  mustBeAdjacentTo?: string;

  requiredTags?: string[];
  forbiddenTags?: string[];
};

export type TargetingProfile = {
  id: string;
  label?: string;

  type: TargetingType;
  origin: TargetingOrigin;

  relativeTo?: { targetSetId: string }; // when origin=RELATIVE_TO_TARGET_SET

  range?: RangeSpec;
  lineOfSight?: boolean;

  // MULTI_TARGET
  maxTargets?: number;
  optional?: boolean;

  // AREA_RADIUS
  area?: AreaSpec;

  constraints?: TargetingConstraints;
};

// Legacy single targeting
export type LegacyTargeting = {
  type: TargetingType;
  origin?: Exclude<TargetingOrigin, "RELATIVE_TO_TARGET_SET">;
  range?: RangeSpec;
  lineOfSight?: boolean;
  area?: AreaSpec;
};

// ---------------------------
// Conditions / Expressions (with state + board queries)
// ---------------------------

export type StatKey =
  | "HP"
  | "AP"
  | "MOVE"
  | "SIZE"
  | "RESILIENCE"
  | "SPEED"
  | "AWARENESS"
  | "CHARISMA"
  | "COORDINATION"
  | "INTELLIGENCE"
  | "WISDOM"
  | "STRENGTH";

export type CompareOp = "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE";

// NEW: relationship filters for board queries
export type RelationFilter = "ALLY" | "ENEMY" | "ANY" | "NON_ALLIED";

// Target references used by steps/conditions
export type TargetRef =
  | { type: "SELF" }
  | { type: "TARGET" } // legacy “chosen target”
  | { type: "TARGET_SET"; ref: string } // saveAs from SELECT_TARGETS
  | { type: "ITERATION_TARGET" } // only inside FOR_EACH_TARGET.do
  // NEW: reference an equipped item instance
  | { type: "EQUIPPED_ITEM"; itemId: string; of?: TargetRef }
  // escape hatch
  | { type: string; [k: string]: any };

export type Expression =
  | { type: "CONST_NUMBER"; value: number }
  | { type: "VAR"; name: string }
  | { type: "GET_STAT"; stat: StatKey; from?: TargetRef }
  // NEW: query count of entities in range
  | {
      type: "COUNT_ENTITIES_IN_RANGE";
      center?: TargetRef; // default SELF
      range: number;
      relation?: RelationFilter; // default ANY
      requiredTags?: string[];
      forbiddenTags?: string[];
      mustHaveEquippedItemId?: string;
    }
  | { type: "ADD"; left: Expression; right: Expression }
  | { type: "SUB"; left: Expression; right: Expression }
  | { type: "MUL"; left: Expression; right: Expression }
  | { type: "DIV"; left: Expression; right: Expression }
  | { type: "MIN"; values: Expression[] }
  | { type: "MAX"; values: Expression[] }
  | { type: "CLAMP"; value: Expression; min: Expression; max: Expression }
  // escape hatch
  | { type: string; [k: string]: any };

export type Condition =
  | { type: "ALWAYS" }
  | { type: "NOT"; value: Condition }
  | { type: "AND"; values: Condition[] }
  | { type: "OR"; values: Condition[] }
  | { type: "COMPARE"; op: CompareOp; left: Expression; right: Expression }
  | { type: "HAS_STATUS"; target?: TargetRef; status: StatusKey }
  | { type: "HAS_TAG"; target?: TargetRef; tag: string }
  // NEW: equipment + state checks
  | { type: "HAS_EQUIPPED_ITEM"; target?: TargetRef; itemId: string }
  | { type: "STATE_EQUALS"; target?: TargetRef; key: string; value: StateValue }
  // escape hatch
  | { type: string; [k: string]: any };

// ---------------------------
// Ability Component
// ---------------------------

export type AbilityComponent = {
  componentType: "ABILITY";
  name: string;
  description?: string;
  trigger: AbilityTrigger;

  cost?: AbilityCost;

  // NEW: gating condition checked before cost is paid / action is allowed
  requirements?: Condition;

  targetingProfiles?: TargetingProfile[];
  targeting?: LegacyTargeting;

  execution: AbilityExecution;
};

// ---------------------------
// Steps
// ---------------------------

export type DamageType = "PHYSICAL" | "FIRE" | "ICE" | "POISON" | "LIGHTNING" | "ARCANE" | "NECROTIC";

export type StatusKey =
  | "STUNNED"
  | "SLOWED"
  | "BURNING"
  | "POISONED"
  | "BLEEDING"
  | "ROOTED"
  | "WEAKENED"
  | "SHIELDED";

export type Step =
  | ShowTextStep
  | RollStep
  | SetVariableStep
  | DealDamageStep
  | HealStep
  | ApplyStatusStep
  | RemoveStatusStep
  | MoveEntityStep
  | OpenReactionWindowStep
  | OpponentSaveStep
  | IfElseStep
  | SelectTargetsStep
  | ForEachTargetStep
  // NEW: state mutation
  | SetStateStep
  | ToggleStateStep
  | UnknownStep;

export type ShowTextStep = { type: "SHOW_TEXT"; text: string };

export type RollStep =
  | { type: "ROLL_D6"; saveAs?: string }
  | { type: "ROLL_D20"; saveAs?: string };

export type SetVariableStep = { type: "SET_VARIABLE"; saveAs: string; valueExpr: Expression };

export type DealDamageStep = { type: "DEAL_DAMAGE"; target: TargetRef; amountExpr: Expression; damageType: DamageType };

export type HealStep = { type: "HEAL"; target: TargetRef; amountExpr: Expression };

export type ApplyStatusStep = { type: "APPLY_STATUS"; target: TargetRef; status: StatusKey; duration?: { turns: number } };

export type RemoveStatusStep = { type: "REMOVE_STATUS"; target: TargetRef; status: StatusKey };

export type MoveEntityStep = {
  type: "MOVE_ENTITY";
  target: TargetRef;
  to: { mode: "TARGET_POSITION" | "RELATIVE" | "ABSOLUTE"; dq?: number; dr?: number; x?: number; y?: number };
  maxTiles?: number;
};

export type OpenReactionWindowStep = {
  type: "OPEN_REACTION_WINDOW";
  timing: "BEFORE_DAMAGE" | "AFTER_DAMAGE" | "BEFORE_MOVE" | "AFTER_MOVE" | string;
  windowId: string;
};

export type OpponentSaveStep = {
  type: "OPPONENT_SAVE";
  stat: StatKey | string;
  difficulty: number;
  onFail: Step[];
  onSuccess: Step[];
};

export type IfElseStep = {
  type: "IF_ELSE";
  condition: Condition;
  then: Step[];
  elseIf?: Array<{ condition: Condition; then: Step[] }>;
  else?: Step[];
};

export type SelectTargetsStep = { type: "SELECT_TARGETS"; profileId: string; saveAs: string };

export type ForEachTargetStep = { type: "FOR_EACH_TARGET"; targetSet: { ref: string }; do: Step[] };

// NEW: state mutation steps
export type SetStateStep = {
  type: "SET_STATE";
  target: TargetRef;
  key: string;
  // set a constant (boolean/number/string) OR a numeric expression
  value?: StateValue;
  valueExpr?: Expression;
};

export type ToggleStateStep = {
  type: "TOGGLE_STATE";
  target: TargetRef;
  key: string;
};

export type UnknownStep = { type: "UNKNOWN_STEP"; raw: any };

export type CardProject = {
  projectVersion: "FORGE-1.0" | string;
  card: CardEntity;
  ui?: any;
};
