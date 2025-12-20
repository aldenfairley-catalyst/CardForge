// src/lib/types.ts
// Captain Jawa Digital – Core Types (CJ-1.1+)
// Option A implementation: Target Profiles + Target Sets
// Backwards compatible with legacy ability.targeting (single profile).

// ---------------------------
// Core Card / Entity Types
// ---------------------------

export type SchemaVersion = "CJ-1.0" | "CJ-1.1" | string;

export type CardType = "UNIT" | "ITEM" | "ENVIRONMENT" | "SPELL" | "TOKEN";

export type EntityType = CardType; // alias (some files may use EntityType)

export type IdString = string;

// Long names + abbreviations support (for gradual migration)
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

  // Legacy aliases (if any older cards / tools use these)
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

export type Gauge = {
  current: number;
  max: number;
};

export type UnitStats = {
  hp?: Gauge;
  ap?: Gauge; // Action Points per round
  movement?: number; // MOVE per round
  resilience?: number;
  size?: number; // footprint abstraction (or later: "1x1", etc.)
};

export type CardVisuals = {
  cardImage?: string; // URL or data URL (MVP)
  tokenImage?: string;
  model3d?: string;

  // Preview-only / presentation hints (safe to ignore by server)
  imageAlign?: "CENTER" | "TOP" | "BOTTOM" | "LEFT" | "RIGHT";
  imageFit?: "COVER" | "CONTAIN"; // how to scale in preview frame
};

export type CardPresentation = {
  template?: "T1" | "T2" | "T3" | "T4" | "T5";
  theme?: "BLUE" | "GREEN" | "PURPLE" | "ORANGE" | "RED";
};

export type CardEntity = {
  schemaVersion: SchemaVersion;
  id: IdString;
  name: string;
  type: CardType;

  // Identity / classification
  faction?: string; // from Catalog
  subType?: string[]; // unit types etc (from Catalog)
  attributes?: string[]; // elemental/material etc (from Catalog)
  tags?: string[];

  visuals?: CardVisuals;
  presentation?: CardPresentation;

  // Unit-centric stats (still allowed on non-units; validator can enforce later)
  stats?: UnitStats;

  // Unit token pool or card token value (depending on design)
  resources?: Resources;

  // Component-Entity-System payload
  components: Component[];
};

// ---------------------------
// Components
// ---------------------------

export type Component =
  | AbilityComponent
  | ItemComponent
  | StatsComponent
  | UnknownComponent;

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
  // placeholder for future equip rules, slots, etc.
  slots?: string[];
  hands?: number;
  restrictions?: {
    allowedFactions?: string[];
    allowedTypes?: string[];
  };
};

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

export type AbilityExecution = {
  steps: Step[];
};

// ---------------------------
// Option A: Target Profiles + Target Sets
// ---------------------------

export type TargetingType =
  | "SELF"
  | "SINGLE_TARGET"
  | "MULTI_TARGET"
  | "AREA_RADIUS"
  | "LINE" // future
  | "CONE"; // future

export type TargetingOrigin =
  | "SOURCE"
  | "ANYWHERE"
  | "RELATIVE_TO_TARGET_SET";

export type RangeSpec = {
  min?: number;
  max?: number;

  // legacy field (older cards): treat as max/base
  base?: number;
};

export type AreaSpec = {
  radius: number;
  includeCenter?: boolean;
};

export type TargetingConstraints = {
  excludeSelf?: boolean;

  // Exclude all targets that are already in another named target set
  excludeTargetSet?: string;

  // Require target to be adjacent (range 1) to every/any target in that set
  mustBeAdjacentTo?: string;

  // Future-friendly extension points
  requiredTags?: string[];
  forbiddenTags?: string[];
};

export type TargetingProfile = {
  id: string; // e.g. "primary", "secondary"
  label?: string; // display name

  type: TargetingType;
  origin: TargetingOrigin;

  // Used when origin is RELATIVE_TO_TARGET_SET
  relativeTo?: {
    targetSetId: string; // references another profile id OR a prior saveAs target set (validator decides)
  };

  range?: RangeSpec;
  lineOfSight?: boolean;

  // MULTI_TARGET
  maxTargets?: number;
  optional?: boolean;

  // AREA_RADIUS
  area?: AreaSpec;

  constraints?: TargetingConstraints;
};

// Legacy targeting (single profile) – still supported for older cards
export type LegacyTargeting = {
  type: TargetingType;
  origin?: Exclude<TargetingOrigin, "RELATIVE_TO_TARGET_SET">; // legacy didn’t support relative profiles
  range?: RangeSpec;
  lineOfSight?: boolean;
  area?: AreaSpec;
};

export type AbilityComponent = {
  componentType: "ABILITY";
  name: string;
  description?: string;
  trigger: AbilityTrigger;

  cost?: AbilityCost;

  // Option A: multiple selectable profiles
  targetingProfiles?: TargetingProfile[];

  // Legacy single targeting (kept for compatibility + easy authoring early)
  targeting?: LegacyTargeting;

  execution: AbilityExecution;
};

// ---------------------------
// Expressions (for amounts, formulas, etc.)
// ---------------------------

export type Expression =
  | { type: "CONST_NUMBER"; value: number }
  | { type: "VAR"; name: string } // variables saved by ROLL / SET_VARIABLE etc.
  | { type: "GET_STAT"; stat: StatKey; from?: TargetRef }
  | { type: "ADD"; left: Expression; right: Expression }
  | { type: "SUB"; left: Expression; right: Expression }
  | { type: "MUL"; left: Expression; right: Expression }
  | { type: "DIV"; left: Expression; right: Expression }
  | { type: "MIN"; values: Expression[] }
  | { type: "MAX"; values: Expression[] }
  | { type: "CLAMP"; value: Expression; min: Expression; max: Expression };

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

// ---------------------------
// Conditions
// ---------------------------

export type Condition =
  | { type: "ALWAYS" }
  | { type: "NOT"; value: Condition }
  | { type: "AND"; values: Condition[] }
  | { type: "OR"; values: Condition[] }
  | { type: "COMPARE"; op: CompareOp; left: Expression; right: Expression }
  | { type: "HAS_STATUS"; target?: TargetRef; status: StatusKey }
  | { type: "HAS_TAG"; target?: TargetRef; tag: string };

export type CompareOp = "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE";

// ---------------------------
// Target references used by steps
// ---------------------------

export type TargetRef =
  | { type: "SELF" }
  | { type: "TARGET" } // legacy “the chosen target” (older cards)
  | { type: "TARGET_SET"; ref: string } // ref is saveAs from SELECT_TARGETS
  | { type: "ITERATION_TARGET" }; // only valid inside FOR_EACH_TARGET.do

// ---------------------------
// Steps
// ---------------------------

export type DamageType =
  | "PHYSICAL"
  | "FIRE"
  | "ICE"
  | "POISON"
  | "LIGHTNING"
  | "ARCANE"
  | "NECROTIC";

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
  | UnknownStep;

export type ShowTextStep = {
  type: "SHOW_TEXT";
  text: string;
};

export type RollStep =
  | { type: "ROLL_D6"; saveAs?: string }
  | { type: "ROLL_D20"; saveAs?: string };

export type SetVariableStep = {
  type: "SET_VARIABLE";
  saveAs: string;
  valueExpr: Expression;
};

export type DealDamageStep = {
  type: "DEAL_DAMAGE";
  target: TargetRef;
  amountExpr: Expression;
  damageType: DamageType;
};

export type HealStep = {
  type: "HEAL";
  target: TargetRef;
  amountExpr: Expression;
};

export type ApplyStatusStep = {
  type: "APPLY_STATUS";
  target: TargetRef;
  status: StatusKey;
  duration?: { turns: number };
};

export type RemoveStatusStep = {
  type: "REMOVE_STATUS";
  target: TargetRef;
  status: StatusKey;
};

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

// IF / ELSE with optional elseIf ladder
export type IfElseStep = {
  type: "IF_ELSE";
  condition: Condition;
  then: Step[];
  elseIf?: Array<{
    condition: Condition;
    then: Step[];
  }>;
  else?: Step[];
};

// Option A: Explicit targeting selection step
export type SelectTargetsStep = {
  type: "SELECT_TARGETS";
  profileId: string; // references AbilityComponent.targetingProfiles[].id
  saveAs: string; // the target set name for later steps
};

// Option A: Iterate a target set
export type ForEachTargetStep = {
  type: "FOR_EACH_TARGET";
  targetSet: { ref: string }; // references saveAs from SELECT_TARGETS
  do: Step[];
};

export type UnknownStep = {
  type: "UNKNOWN_STEP";
  raw: any;
};

// ---------------------------
// Utility helpers (optional)
// ---------------------------

export type AbilityLike = AbilityComponent;

export type CardProject = {
  projectVersion: "FORGE-1.0" | string;
  card: CardEntity;
  ui?: any;
};
