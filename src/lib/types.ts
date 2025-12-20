export type Severity = "ERROR" | "WARN" | "INFO";

export type CardType = "UNIT" | "ITEM" | "ENVIRONMENT" | "SPELL" | "TOKEN";

export type TokenKey =
  | "UMB"
  | "AET"
  | "CRD"
  | "CHR"
  | "STR"
  | "RES"
  | "WIS"
  | "INT"
  | "SPD"
  | "AWR";

export type TokenMap = Partial<Record<TokenKey, number>>;

export type ZoneKey =
  | "ACTOR_ACTION_DECK"
  | "ACTOR_ACTION_HAND"
  | "ACTOR_ACTION_DISCARD"
  | "OPPONENT_ACTION_DECK"
  | "OPPONENT_ACTION_HAND"
  | "OPPONENT_ACTION_DISCARD"
  | "CONTEST_POOL_ACTOR_PUBLIC"
  | "CONTEST_POOL_OPPONENT_PUBLIC"
  | "EQUIPPED_ITEMS"
  | "EXILE";

export type DamageType = "PHYSICAL" | "FIRE" | "ICE" | "POISON" | "ARCANE" | "TRUE";

export type StatusKey = "PRONE" | "STUNNED" | "SLOWED" | "CANNOT_REACT";

export type TriggerType =
  | "ACTIVE_ACTION"
  | "PASSIVE_AURA"
  | "REACTION"
  | "ON_EQUIP"
  | "ON_UNEQUIP"
  | "ON_PLAY"
  | "ON_DRAW"
  | "ON_DEATH"
  | "ON_TURN_START"
  | "ON_TURN_END"
  | "ON_MOVE"
  | "ON_DAMAGE"
  | "ON_DISTRACT";

export type LoSMode = "NONE" | "HEX_RAYCAST" | "SQUARE_RAYCAST";
export type LoSBlockerPolicy = "BLOCK_ALL" | "BLOCK_PROJECTILES" | "BLOCK_MAGIC" | "BLOCK_MOVEMENT" | "NONE";
export type DistanceMetric = "HEX" | "SQUARE_MANHATTAN" | "SQUARE_CHEBYSHEV";

export type Presentation = {
  template?: "T1" | "T2" | "T3" | "T4" | "T5";
  theme?: "BLUE" | "GREEN" | "PURPLE" | "ORANGE" | "RED";
};

export type Visuals = {
  cardImage?: string;
  tokenImage?: string;
  model3d?: string;
  imageAlign?: "TOP" | "CENTER" | "BOTTOM" | "LEFT" | "RIGHT";
  imageFit?: "COVER" | "CONTAIN";
};

export type StatBar = { current: number; max: number };

export type Stats = {
  hp?: StatBar;
  ap?: StatBar;
  movement?: number;
  resilience?: number;
  size?: number;
};

export type CardEntity = {
  schemaVersion: "CJ-1.0" | "CJ-1.1";
  id: string;
  name: string;
  type: CardType;

  // Identity
  faction?: string;
  subType?: string[];
  attributes?: string[];
  tags?: string[];

  visuals?: Visuals;
  presentation?: Presentation;

  // Gameplay stats (Units mostly)
  stats?: Stats;

  // Legacy resources (kept for backward compat)
  resources?: { umbra?: number; aether?: number; strength?: number };

  // Printed token value (for contests/minigames) — separate from costs.
  tokenValue?: TokenMap;

  // Optional: declare custom per-instance state keys used by abilities/items.
  stateSchema?: Record<
    string,
    {
      type: "boolean" | "number" | "string";
      default: boolean | number | string;
      description?: string;
    }
  >;

  components: AnyComponent[];
};

export type AnyComponent = AbilityComponent | ItemComponent | Record<string, any>;

export type ItemComponent = {
  componentType: "ITEM";
  slots: Array<"HAND" | "ACCESSORY" | "ARMOR" | "BACKPACK" | "HEAD">;
  hands?: number;
  restrictions?: {
    allowedFactions?: string[];
    allowedTypes?: string[];
  };
};

export type AbilityCost = {
  ap: number;
  tokens?: TokenMap;

  // OR-alternatives (Quick Shot: AWR 1 OR SPD 1)
  tokenOptions?: TokenMap[];

  requiredEquippedItemIds?: string[];
  cooldown?: { turns: number };
};

export type TargetingType =
  | "SELF"
  | "SINGLE_TARGET"
  | "MULTI_TARGET"
  | "AREA_RADIUS"
  | "LINE"
  | "CONE"
  | "TEMPLATE_LINE";

export type TargetOrigin = "SOURCE" | "ANYWHERE";

export type LoSConfig = {
  mode: LoSMode;
  required: boolean;

  // barriers/obstacles can behave differently depending on attack tags/policies
  blockers?: Array<{
    policy: LoSBlockerPolicy;
    tags?: string[]; // e.g. ["BARRIER"]
    ignoreIfAttackHasTags?: string[]; // e.g. ["GHOSTLY"]
  }>;
};

export type TargetingProfile = {
  id: string;
  label: string;

  type: TargetingType;
  origin?: TargetOrigin;

  range: { base: number; min?: number; max?: number };
  lineOfSight?: boolean;
  los?: LoSConfig;

  maxTargets?: number;
  optional?: boolean;

  // Template-only
  template?: {
    kind: "LINE";
    length: number;
    width: number;
  };

  constraints?: {
    excludeSelf?: boolean;
    requiredTags?: string[];
    forbiddenTags?: string[];
  };
};

export type AbilityComponent = {
  componentType: "ABILITY";
  name: string;
  description?: string;
  trigger: TriggerType;

  cost: AbilityCost;
  requirements?: Condition;

  // Option A: profiles stored on ability
  targetingProfiles: TargetingProfile[];

  // Optional metadata/policies for execution and UI
  policies?: {
    postContestDefault?: PostContestPolicy;
    losDefault?: LoSConfig;
  };

  execution: { steps: Step[] };
};

export type EntityRef =
  | { type: "SELF" }
  | { type: "TARGET" } // legacy / fallback
  | { type: "ITERATION_TARGET" }
  | { type: "TARGET_SET"; ref: string }
  | { type: "EQUIPPED_ITEM"; itemId: string; of: EntityRef };

export type Expression =
  | { type: "CONST_NUMBER"; value: number }
  | { type: "CONST_STRING"; value: string }
  | { type: "VAR"; name: string }
  | {
      type: "TOKEN_SUM_IN_HAND";
      hand: ZoneKey;
      selection?: { mode: "ALL" | "ANY_SUBSET"; subsetCount?: number };
      tokens: TokenKey[];
    }
  | {
      type: "COUNT_CARDS_IN_ZONE";
      zone: ZoneKey;
    }
  | {
      type: "COUNT_ENTITIES_IN_RANGE";
      center: EntityRef;
      range: number;
      relation: "ALLY" | "ENEMY" | "ANY";
    };

export type Condition =
  | { type: "ALWAYS" }
  | { type: "AND"; values: Condition[] }
  | { type: "OR"; values: Condition[] }
  | { type: "NOT"; value: Condition }
  | { type: "COMPARE"; op: "EQ" | "NEQ" | "GTE" | "LTE" | "GT" | "LT"; left: Expression; right: Expression }
  | { type: "HAS_EQUIPPED_ITEM"; target: EntityRef; itemId: string }
  | { type: "STATE_EQUALS"; target: EntityRef; key: string; value: any }
  | {
      type: "HAND_TOKEN_CRITERIA";
      hand: ZoneKey;
      selection: { mode: "ALL" | "ANY_SUBSET"; subsetCount?: number };
      minTokens?: TokenMap;
      exactTokens?: TokenMap;
      minCardCount?: number;
      maxCardCount?: number;
    };

export type PostContestPolicy = {
  shuffleAllDrawnIntoOwnersDeck?: boolean;
  winnerMayKeepToH
