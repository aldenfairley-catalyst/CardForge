import { z } from "zod";
import { blockRegistry } from "./registry";

const TriggerZ = z.enum(blockRegistry.triggers as [string, ...string[]]);
const CardTypeZ = z.enum(["UNIT", "ITEM", "ENVIRONMENT", "SPELL", "TOKEN"]);

const EntityRefZ = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SELF") }),
  z.object({ type: z.literal("TARGET") }),
  z.object({ type: z.literal("SOURCE") }),
  z.object({
    type: z.literal("ENTITY_WITH_TAG"),
    tag: z.string().min(1),
    selection: z.object({
      mode: z.literal("NEAREST_TO_SELF"),
      tieBreak: z.literal("LOWEST_ENTITY_ID")
    })
  })
]);

const ExprZ: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("CONST_NUMBER"), value: z.number() }),
    z.object({ type: z.literal("SAVED_VALUE"), key: z.string().min(1) }),
    z.object({ type: z.enum(["ADD","SUBTRACT","MULTIPLY","DIVIDE","MIN","MAX"]), a: ExprZ, b: ExprZ })
  ])
);

const ConditionZ: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("ALWAYS") }),
    z.object({ type: z.literal("NOT"), condition: ConditionZ }),
    z.object({ type: z.enum(["AND","OR"]), conditions: z.array(ConditionZ).min(1) }),
    z.object({ type: z.literal("COMPARE_NUMBERS"), lhs: ExprZ, op: z.enum([">",">=","==","!=","<=","<"]), rhs: ExprZ })
  ])
);

const CostZ = z.object({
  ap: z.number().int().min(0).optional(),
  requiredEquippedItemIds: z.array(z.string()).optional(),
  cooldown: z.object({ turns: z.number().int().min(1) }).optional()
}).strict();

const TargetingZ = z.object({
  type: z.enum(blockRegistry.targeting.types as [string, ...string[]]),
  range: z.object({ base: z.number().int().min(0) }).optional(),
  lineOfSight: z.boolean().optional(),
  area: z.object({ radius: z.number().int().min(1), includeCenter: z.boolean().optional() }).optional()
}).strict();

const StepZ: z.ZodType<any> = z.lazy(() => z.union([
  z.object({ type: z.literal("ROLL_D6"), saveAs: z.string().optional() }).strict(),
  z.object({ type: z.literal("ROLL_D20"), saveAs: z.string().optional() }).strict(),
  z.object({ type: z.literal("SET_VARIABLE"), saveAs: z.string().min(1), valueExpr: ExprZ }).strict(),
  z.object({ type: z.literal("OPPONENT_SAVE"), stat: z.string().min(1), difficulty: z.number().int().min(1), onFail: z.array(StepZ), onSuccess: z.array(StepZ) }).strict(),
  z.object({ type: z.literal("DEAL_DAMAGE"), target: EntityRefZ, amountExpr: ExprZ, damageType: z.enum(blockRegistry.keys.DamageType as [string, ...string[]]) }).strict(),
  z.object({ type: z.literal("HEAL"), target: EntityRefZ, amountExpr: ExprZ }).strict(),
  z.object({ type: z.literal("APPLY_STATUS"), target: EntityRefZ, status: z.enum(blockRegistry.keys.StatusKey as [string, ...string[]]), duration: z.object({ turns: z.number().int().min(1) }).strict() }).strict(),
  z.object({ type: z.literal("REMOVE_STATUS"), target: EntityRefZ, status: z.enum(blockRegistry.keys.StatusKey as [string, ...string[]]) }).strict(),
  z.object({ type: z.literal("MOVE_ENTITY"), target: EntityRefZ, to: z.object({ mode: z.literal("TARGET_POSITION") }).strict(), maxTiles: z.number().int().min(1) }).strict(),
  z.object({ type: z.literal("SHOW_TEXT"), text: z.string() }).strict(),
  z.object({ type: z.literal("IF_ELSE"), condition: ConditionZ, then: z.array(StepZ), else: z.array(StepZ) }).strict(),
  z.object({ type: z.literal("OPEN_REACTION_WINDOW"), timing: z.literal("BEFORE_DAMAGE"), windowId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("UNKNOWN_STEP"), raw: z.any() }).strict()
]));

const AbilityZ = z.object({
  componentType: z.literal("ABILITY"),
  name: z.string().min(1),
  description: z.string().default(""),
  trigger: TriggerZ,
  cost: CostZ.optional(),
  targeting: TargetingZ.optional(),
  execution: z.object({ steps: z.array(StepZ) }).strict().optional()
}).strict();

export const CardZ = z.object({
  schemaVersion: z.literal("CJ-1.0"),
  id: z.string().min(1),
  name: z.string().min(1),
  type: CardTypeZ,
  tags: z.array(z.string()).optional(),
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

  // core invariant: if any step references TARGET, targeting cannot be SELF/missing
  const c: any = parsed.data;
  for (const comp of c.components) {
    if (comp.componentType !== "ABILITY") continue;
    const usesTarget = JSON.stringify(comp.execution ?? {}).includes("\"type\":\"TARGET\"");
    if (usesTarget && (!comp.targeting || comp.targeting.type === "SELF")) {
      issues.push({ severity:"ERROR", code:"ERR_TARGET_REF_REQUIRES_TARGETING", message:"Ability references TARGET but targeting is missing or SELF.", path:"components.execution" });
    }
  }

  if (issues.length === 0) issues.push({ severity:"INFO", code:"OK", message:"Card passes core validation." });
  return issues;
}
