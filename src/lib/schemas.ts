import { z } from "zod";
import { blockRegistry } from "./registry";

const TriggerZ = z.enum(blockRegistry.triggers as [string, ...string[]]);
const CardTypeZ = z.enum(["UNIT", "ITEM", "ENVIRONMENT", "SPELL", "TOKEN"]);

const DamageTypeZ = z.enum(blockRegistry.keys.DamageType as [string, ...string[]]);
const StatusKeyZ = z.enum(blockRegistry.keys.StatusKey as [string, ...string[]]);
const StatKeyZ = z.enum(blockRegistry.keys.StatKey as [string, ...string[]]);

// --- EntityRef ---
const EntityRefZ = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SELF") }).strict(),
  z.object({ type: z.literal("TARGET") }).strict(),
  z.object({ type: z.literal("SOURCE") }).strict(),
  z.object({
    type: z.literal("ENTITY_WITH_TAG"),
    tag: z.string().min(1),
    selection: z.object({
      mode: z.literal("NEAREST_TO_SELF"),
      tieBreak: z.literal("LOWEST_ENTITY_ID")
    }).strict()
  }).strict()
]);

// --- Expressions ---
const ExprZ: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("CONST_NUMBER"), value: z.number() }).strict(),
    z.object({ type: z.literal("SAVED_VALUE"), key: z.string().min(1) }).strict(),
    z.object({ type: z.literal("READ_STAT"), entity: EntityRefZ, stat: StatKeyZ }).strict(),
    z.object({
      type: z.enum(["ADD","SUBTRACT","MULTIPLY","DIVIDE","MIN","MAX"]),
      a: ExprZ,
      b: ExprZ
    }).strict()
  ])
);

// --- Conditions ---
const ConditionZ: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("ALWAYS") }).strict(),
    z.object({ type: z.literal("NOT"), condition: ConditionZ }).strict(),
    z.object({ type: z.enum(["AND","OR"]), conditions: z.array(ConditionZ).min(1) }).strict(),
    z.object({
      type: z.literal("COMPARE_NUMBERS"),
      lhs: ExprZ,
      op: z.enum([">",">=","==","!=","<=","<"]),
      rhs: ExprZ
    }).strict(),
    z.object({
      type: z.literal("HAS_TAG"),
      entity: EntityRefZ,
      tag: z.string().min(1)
    }).strict(),
    z.object({
      type: z.literal("COUNT_UNITS_ON_BOARD"),
      targetTag: z.string().min(1),
      min: z.number().int().min(0),
      faction: z.enum(["ANY","ALLY","ENEMY"]).optional()
    }).strict()
  ])
);

// --- Cost / Targeting ---
const CostZ = z.object({
  ap: z.number().int().min(0).optional(),
  requiredEquippedItemIds: z.array(z.string()).optional(),
  cooldown: z.object({ turns: z.number().int().min(1) }).strict().optional()
}).strict();

const TargetingZ = z.object({
  type: z.enum(blockRegistry.targeting.types as [string, ...string[]]),
  range: z.object({ base: z.number().int().min(0) }).strict().optional(),
  lineOfSight: z.boolean().optional(),
  area: z.object({
    radius: z.number().int().min(1),
    includeCenter: z.boolean().optional()
  }).strict().optional()
}).strict();

// --- Steps ---
const StepZ: z.ZodType<any> = z.lazy(() => z.union([
  z.object({ type: z.literal("ROLL_D6"), saveAs: z.string().optional() }).strict(),
  z.object({ type: z.literal("ROLL_D20"), saveAs: z.string().optional() }).strict(),
  z.object({ type: z.literal("SET_VARIABLE"), saveAs: z.string().min(1), valueExpr: ExprZ }).strict(),
  z.object({
    type: z.literal("OPPONENT_SAVE"),
    stat: z.string().min(1),
    difficulty: z.number().int().min(1),
    onFail: z.array(StepZ),
    onSuccess: z.array(StepZ)
  }).strict(),
  z.object({ type: z.literal("DEAL_DAMAGE"), target: EntityRefZ, amountExpr: ExprZ, damageType: DamageTypeZ }).strict(),
  z.object({ type: z.literal("HEAL"), target: EntityRefZ, amountExpr: ExprZ }).strict(),
  z.object({
    type: z.literal("APPLY_STATUS"),
    target: EntityRefZ,
    status: StatusKeyZ,
    duration: z.object({ turns: z.number().int().min(1) }).strict()
  }).strict(),
  z.object({ type: z.literal("REMOVE_STATUS"), target: EntityRefZ, status: StatusKeyZ }).strict(),
  z.object({
    type: z.literal("MOVE_ENTITY"),
    target: EntityRefZ,
    to: z.object({ mode: z.literal("TARGET_POSITION") }).strict(),
    maxTiles: z.number().int().min(1)
  }).strict(),
  z.object({ type: z.literal("SHOW_TEXT"), text: z.string() }).strict(),
z.object({
  type: z.literal("IF_ELSE"),
  condition: ConditionZ,
  then: z.array(StepZ),
  elseIf: z.array(
    z.object({
      condition: ConditionZ,
      then: z.array(StepZ)
    }).strict()
  ).optional(),
  else: z.array(StepZ)
}).strict(),
  z.object({ type: z.literal("OPEN_REACTION_WINDOW"), timing: z.literal("BEFORE_DAMAGE"), windowId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("UNKNOWN_STEP"), raw: z.any() }).strict()
]));

// --- Ability ---
const AbilityZ = z.object({
  componentType: z.literal("ABILITY"),
  name: z.string().min(1),
  description: z.string().default(""),
  trigger: TriggerZ,
  cost: CostZ.optional(),
  targeting: TargetingZ.optional(),
  execution: z.object({ steps: z.array(StepZ) }).strict().optional()
}).strict();

// --- Card metadata additions ---
const VisualsZ = z.object({
  cardImage: z.string().optional(),
  tokenImage: z.string().optional(),
  model3d: z.string().optional()
}).strict().optional();

const StatsZ = z.object({
  hp: z.object({ current: z.number().optional(), max: z.number().optional() }).strict().optional(),
  ap: z.object({ current: z.number().optional(), max: z.number().optional() }).strict().optional(),

  movement: z.number().optional(),
  resilience: z.number().optional(),
  size: z.number().optional(),

  speed: z.number().optional(),
  awareness: z.number().optional(),
  intelligence: z.number().optional(),
  wisdom: z.number().optional(),
  strength: z.number().optional(),
  charisma: z.number().optional(),
  coordination: z.number().optional()
}).strict().optional();

const ResourcesZ = z.object({
  umbra: z.number().optional(),
  aether: z.number().optional(),
  strength: z.number().optional()
}).strict().optional();

const PresentationZ = z.object({
  template: z.enum(["T1","T2","T3","T4","T5"]).optional(),
  theme: z.enum(["BLUE","GREEN","PURPLE","ORANGE","RED"]).optional()
}).strict().optional();

export const CardZ = z.object({
  schemaVersion: z.literal("CJ-1.0"),
  id: z.string().min(1),
  name: z.string().min(1),
  type: CardTypeZ,

  faction: z.string().optional(),
  subType: z.array(z.string()).optional(),
  attributes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),

  visuals: VisualsZ,
  stats: StatsZ,
  resources: ResourcesZ,

  presentation: PresentationZ,

  components: z.array(z.union([AbilityZ, z.record(z.any())])).min(1)
}).strict();

export type ValidationIssue = { severity: "ERROR"|"INFO"; code: string; message: string; path?: string };

export function validateCard(card: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const parsed = CardZ.safeParse(card);

  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      issues.push({ severity: "ERROR", code: "SCHEMA", message: i.message, path: i.path.join(".") });
    }
    return issues;
  }

  // Invariant: if any step references TARGET, targeting cannot be SELF/missing
  const c: any = parsed.data;
  for (const comp of c.components) {
    if (comp.componentType !== "ABILITY") continue;
    const usesTarget = JSON.stringify(comp.execution ?? {}).includes("\"type\":\"TARGET\"");
    if (usesTarget && (!comp.targeting || comp.targeting.type === "SELF")) {
      issues.push({
        severity:"ERROR",
        code:"ERR_TARGET_REF_REQUIRES_TARGETING",
        message:"Ability references TARGET but targeting is missing or SELF.",
        path:"components.execution"
      });
    }
  }

  if (issues.length === 0) issues.push({ severity:"INFO", code:"OK", message:"Card passes core validation." });
  return issues;
}
