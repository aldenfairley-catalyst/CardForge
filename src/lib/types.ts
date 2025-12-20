export type CardType = "UNIT" | "ITEM" | "ENVIRONMENT" | "SPELL" | "TOKEN";
export type TriggerType =
  | "ACTIVE_ACTION"
  | "PASSIVE_AURA"
  | "REACTION"
  | "ON_DEATH"
  | "ON_SPAWN"
  | "ON_TURN_START"
  | "ON_TURN_END";

export type TargetingType = "SELF" | "SINGLE_TARGET" | "AREA_RADIUS";
export type DamageType = "PHYSICAL" | "FIRE" | "ICE" | "DARK" | "LIGHT";
export type StatusKey = "STUNNED" | "SLOWED" | "POISONED" | "BURNING" | "FRIGHTENED" | "WEAKENED";

export type EntityRef =
  | { type: "SELF" }
  | { type: "TARGET" }
  | { type: "SOURCE" }
  | {
      type: "ENTITY_WITH_TAG";
      tag: string;
      selection: { mode: "NEAREST_TO_SELF"; tieBreak: "LOWEST_ENTITY_ID" };
    };

export type StatKey =
  | "HP_CURRENT" | "HP_MAX"
  | "AP_CURRENT" | "AP_MAX"
  | "MOVEMENT" | "RESILIENCE" | "SIZE"
  | "SPEED" | "AWARENESS" | "INTELLIGENCE" | "WISDOM"
  | "STRENGTH" | "CHARISMA" | "COORDINATION";

export type Expr =
  | { type: "CONST_NUMBER"; value: number }
  | { type: "SAVED_VALUE"; key: string }
  | { type: "READ_STAT"; entity: EntityRef; stat: StatKey }
  | { type: "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE" | "MIN" | "MAX"; a: Expr; b: Expr };

export type Condition =
  | { type: "ALWAYS" }
  | { type: "NOT"; condition: Condition }
  | { type: "AND" | "OR"; conditions: Condition[] }
  | { type: "COMPARE_NUMBERS"; lhs: Expr; op: ">" | ">=" | "==" | "!=" | "<=" | "<"; rhs: Expr }
  | { type: "HAS_TAG"; entity: EntityRef; tag: string }
  | { type: "COUNT_UNITS_ON_BOARD"; targetTag: string; min: number; faction?: "ANY" | "ALLY" | "ENEMY" };

export type Cost = {
  ap?: number;
  requiredEquippedItemIds?: string[];
  cooldown?: { turns: number };
};

export type Targeting = {
  type: TargetingType;
  range?: { base: number };
  lineOfSight?: boolean;
  area?: { radius: number; includeCenter?: boolean };
};

export type Step =
  | { type: "ROLL_D6"; saveAs?: string }
  | { type: "ROLL_D20"; saveAs?: string }
  | { type: "SET_VARIABLE"; saveAs: string; valueExpr: Expr }
  | { type: "OPPONENT_SAVE"; stat: string; difficulty: number; onFail: Step[]; onSuccess: Step[] }
  | { type: "DEAL_DAMAGE"; target: EntityRef; amountExpr: Expr; damageType: DamageType }
  | { type: "HEAL"; target: EntityRef; amountExpr: Expr }
  | { type: "APPLY_STATUS"; target: EntityRef; status: StatusKey; duration: { turns: number } }
  | { type: "REMOVE_STATUS"; target: EntityRef; status: StatusKey }
  | { type: "MOVE_ENTITY"; target: EntityRef; to: { mode: "TARGET_POSITION" }; maxTiles: number }
  | { type: "SHOW_TEXT"; text: string }
  | { type: "IF_ELSE"; condition: Condition; then: Step[]; else: Step[] }
  | { type: "OPEN_REACTION_WINDOW"; timing: "BEFORE_DAMAGE"; windowId: string }
  | { type: "UNKNOWN_STEP"; raw: any };

export type AbilityComponent = {
  componentType: "ABILITY";
  name: string;
  description: string;
  trigger: TriggerType;
  cost?: Cost;
  targeting?: Targeting;
  execution?: { steps: Step[] };
};

export type Visuals = {
  cardImage?: string;
  tokenImage?: string;
  model3d?: string;
};

export type Stats = {
  hp?: { current?: number; max?: number };
  ap?: { current?: number; max?: number };
  movement?: number;
  resilience?: number;
  size?: number;

  speed?: number;
  awareness?: number;
  intelligence?: number;
  wisdom?: number;
  strength?: number;
  charisma?: number;
  coordination?: number;
};

export type Resources = {
  umbra?: number;
  aether?: number;
  strength?: number;
};

export type Presentation = {
  template?: "T1" | "T2" | "T3" | "T4" | "T5";
  theme?: "BLUE" | "GREEN" | "PURPLE" | "ORANGE" | "RED";
};

export type CardEntity = {
  schemaVersion: "CJ-1.0";
  id: string;
  name: string;
  type: CardType;

  // requested metadata
  faction?: string;
  subType?: string[];      // e.g., ["HUMAN","JAWA","UNDEAD"]
  attributes?: string[];   // e.g., ["FIRE","STEEL"]
  tags?: string[];

  visuals?: Visuals;
  stats?: Stats;
  resources?: Resources;

  // UI-only but safe to keep in CJ-1.0 exports for now
  presentation?: Presentation;

  components: Array<AbilityComponent | { componentType: string; [k: string]: any }>;
};
