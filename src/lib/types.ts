// src/lib/types.ts
// Core shared types for Captain Jawa Forge (CJ-1.0)
// Keep these types aligned with src/lib/schemas.ts (Zod) and the builder UI.

export type SchemaVersion = "CJ-1.0";

export type CardType = "UNIT" | "ITEM" | "ENVIRONMENT" | "SPELL" | "TOKEN";

/**
 * NOTE: Resources are token-like values stored on a card/unit.
 * We keep this as an open record so you can add more later without breaking types.
 * Common abbreviations used in the UI/preview:
 * UMB, AET, CRD, CHR, STR, RES, WIS, INT, SPD, AWR
 */
export type Resources = Record<string, number>;

export type Visuals = {
  cardImage?: string; // URL or Data URL
  tokenImage?: string;
  model3d?: string;
};

export type Presentation = {
  template?: "T1" | "T2" | "T3" | "T4" | "T5";
  theme?: "BLUE" | "GREEN" | "PURPLE" | "ORANGE" | "RED";
  /**
   * CSS object-position format: "left top" | "center center" | "right bottom" etc.
   * Used by CardPreview to shift the image framing.
   */
  imagePosition?: string;
};

export type HpStat = { current?: number; max?: number };
export type ApStat = { current?: number; max?: number };

export type Stats = {
  // Core unit stats
  hp?: HpStat;
  ap?: ApStat;
  movement?: number; // MOVE
  size?: number; // SIZE
  resilience?: number;

  // Optional extended stats (supported in schema; may be used later)
  speed?: number;
  awareness?: number;
  intelligence?: number;
  wisdom?: number;
  strength?: number;
  charisma?: number;
  coordination?: number;
};

export type CardEntity = {
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  type: CardType;

  // Identity and taxonomy
  faction?: string;
  subType?: string[]; // "types" e.g. HUMAN, JAWA, UNDEAD...
  attributes?: string[]; // e.g. FIRE, STEEL...
  tags?: string[];

  visuals?: Visuals;
  stats?: Stats;
  resources?: Resources;
  presentation?: Presentation;

  // Component Entity System style
  components: Component[];
};

/* -------------------- Components -------------------- */

export type Component = AbilityComponent | UnknownComponent;

export type UnknownComponent = {
  // Allows forward compatibility; other component types can exist.
  componentType?: string;
  [k: string]: any;
};

export type Trigger =
  | "ACTIVE_ACTION"
  | "PASSIVE_AURA"
  | "REACTION"
  | "ON_EQUIP"
  | "ON_DRAW"
  | "ON_PLAY"
  | "ON_DEATH"
  | (string & {}); // allow future triggers

export type Cooldown = { turns: number };

export type TokenCosts = Record<string, number>;

export type AbilityCost = {
  ap?: number;
  requiredEquippedItemIds?: string[];
  cooldown?: Cooldown;
  /**
   * Token costs paid to use the ability.
   * Keys should be resource abbreviations (e.g., "UMB", "AET", "STR", etc.)
   */
  tokens?: TokenCosts;
};

export type TargetingType =
  | "SELF"
  | "SINGLE_TARGET"
  | "AREA_RADIUS"
  | "CONE"
  | "LINE"
  | (string & {}); // allow future targeting types

export type TargetingOrigin = "SOURCE" | "ANYWHERE" | (string & {});

export type TargetingRange = {
  base?: number; // legacy/simple range
  min?: number; // optional min range (donut / dead-zone)
  max?: number; // optional max range
};

export type TargetingArea = {
  radius: number;
  includeCenter?: boolean;
};

export type Targeting = {
  type: TargetingType;
  origin?: TargetingOrigin; // SOURCE shows grid; ANYWHERE hides grid
  range?: TargetingRange;
  lineOfSight?: boolean;
  area?: TargetingArea;
};

export type AbilityExecution = {
  steps: Step[];
};

export type AbilityComponent = {
  componentType: "ABILITY";
  name: string;
  description?: string;
  trigger: Trigger;
  cost?: AbilityCost;
  targeting?: Targeting;
  execution?: AbilityExecution;
};

/* -------------------- Entity References -------------------- */

export type EntityRef =
  | { type: "SELF" }
  | { type: "TARGET" }
  | { type: "SOURCE" }
  | {
      type: "ENTITY_WITH_TAG";
      tag: string;
      selection: {
        mode: "NEAREST_TO_SELF";
        tieBreak: "LOWEST_ENTITY_ID";
      };
    };

/* -------------------- Expressions -------------------- */

export type StatKey =
  | "HP"
  | "AP"
  | "MOVE"
  | "SIZE"
  | "RESILIENCE"
  | "SPEED"
  | "AWARENESS"
  | "INTELLIGENCE"
  | "WISDOM"
  | "STRENGTH"
  | "CHARISMA"
  | "COORDINATION"
  | (string & {});

export type Expr =
  | { type: "CONST_NUMBER"; value: number }
  | { type: "SAVED_VALUE"; key: string }
  | { type: "READ_STAT"; entity: EntityRef; stat: StatKey }
  | { type: "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE" | "MIN" | "MAX"; a: Expr; b: Expr };

/* -------------------- Conditions -------------------- */

export type CompareOp = ">" | ">=" | "==" | "!=" | "<=" | "<";

export type Condition =
  | { type: "ALWAYS" }
  | { type: "NOT"; condition: Condition }
  | { type: "AND" | "OR"; conditions: Condition[] }
  | { type: "COMPARE_NUMBERS"; lhs: Expr; op: CompareOp; rhs: Expr }
  | { type: "HAS_TAG"; entity: EntityRef; tag: string }
  | {
      type: "COUNT_UNITS_ON_BOARD";
      targetTag: string;
      min: number;
      faction?: "ANY" | "ALLY" | "ENEMY";
    };

/* -------------------- Steps -------------------- */

export type DamageType = "PHYSICAL" | "FIRE" | "ICE" | "POISON" | "LIGHTNING" | "ARCANE" | (string & {});
export type StatusKey = "SLOWED" | "STUNNED" | "BURNING" | "FROZEN" | "POISONED" | (string & {});

export type RollD6Step = { type: "ROLL_D6"; saveAs?: string };
export type RollD20Step = { type: "ROLL_D20"; saveAs?: string };

export type SetVariableStep = { type: "SET_VARIABLE"; saveAs: string; valueExpr: Expr };

export type OpponentSaveStep = {
  type: "OPPONENT_SAVE";
  stat: string;
  difficulty: number;
  onFail: Step[];
  onSuccess: Step[];
};

export type DealDamageStep = {
  type: "DEAL_DAMAGE";
  target: EntityRef;
  amountExpr: Expr;
  damageType: DamageType;
};

export type HealStep = {
  type: "HEAL";
  target: EntityRef;
  amountExpr: Expr;
};

export type ApplyStatusStep = {
  type: "APPLY_STATUS";
  target: EntityRef;
  status: StatusKey;
  duration: { turns: number };
};

export type RemoveStatusStep = {
  type: "REMOVE_STATUS";
  target: EntityRef;
  status: StatusKey;
};

export type MoveEntityStep = {
  type: "MOVE_ENTITY";
  target: EntityRef;
  to: { mode: "TARGET_POSITION" };
  maxTiles: number;
};

export type ShowTextStep = { type: "SHOW_TEXT"; text: string };

export type IfElseBranch = { condition: Condition; then: Step[] };

/**
 * UPDATED: IF_ELSE now supports elseIf[] chains.
 */
export type IfElseStep = {
  type: "IF_ELSE";
  condition: Condition;
  then: Step[];
  elseIf?: IfElseBranch[];
  else: Step[];
};

export type OpenReactionWindowStep = {
  type: "OPEN_REACTION_WINDOW";
  timing: "BEFORE_DAMAGE";
  windowId: string;
};

export type UnknownStep = { type: "UNKNOWN_STEP"; raw: any };

export type Step =
  | RollD6Step
  | RollD20Step
  | SetVariableStep
  | OpponentSaveStep
  | DealDamageStep
  | HealStep
  | ApplyStatusStep
  | RemoveStatusStep
  | MoveEntityStep
  | ShowTextStep
  | IfElseStep
  | OpenReactionWindowStep
  | UnknownStep;
