import { z } from "zod";
import { blockRegistry } from "./registry";

const TriggerZ = z.enum(blockRegistry.triggers as [string, ...string[]]);
const CardTypeZ = z.enum(["UNIT", "ITEM", "ENVIRONMENT", "SPELL", "TOKEN"]);
const SchemaVersionZ = z.enum(["CJ-1.0", "CJ-1.1"]);

const DamageTypeZ = z.enum(blockRegistry.keys.DamageType as [string, ...string[]]);
const StatusKeyZ = z.enum(blockRegistry.keys.StatusKey as [string, ...string[]]);
const StatKeyZ = z.enum(blockRegistry.keys.StatKey as [string, ...string[]]);

const EntityRefZ = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SELF") }).strict(),
  z.object({ type: z.literal("TARGET") }).strict(),
  z.object({ type: z.literal("SOURCE") }).strict(),
  z.object({
    type: z.literal("ENTITY_WITH_TAG"),
    tag: z.string().min(1),
    selection: z.object({ mode: z.literal("NEAREST_TO_SELF"), tieBreak: z.literal("LOWEST_ENTITY_ID") }).strict()
  }).strict()
]);

const ExprZ: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("CONST_NUMBER"), value: z.number() }).strict(),
    z.object({ type: z.literal("SAVED_VALUE"), key: z.string().min(1) }).strict(),
    z.object({ type: z.literal("READ_STAT"), entity: EntityRefZ, stat: StatKeyZ }).strict(),
    z.object({ type: z.enum(["ADD", "SUBTRACT", "MULTIPLY", "DIVIDE", "MIN", "MAX"]), a: ExprZ, b: ExprZ }).strict()
  ])
);

const ConditionZ: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("ALWAYS") }).strict(),
    z.object({ type: z.literal("NOT"), condition: ConditionZ }).strict(),
    z.object({ type: z.enum(["AND", "OR"]), conditions: z.array(ConditionZ).min(1) }).strict(),
    z.object({
      type: z.literal("COMPARE_NUMBERS"),
      lhs: ExprZ,
      op: z.enum([">", ">=", "==", "!=", "<=", "<"]),
      rhs: ExprZ
    }).strict(),
    z.object({ type: z.literal("HAS_TAG"), entity: EntityRefZ, tag: z.string().min(1) }).strict(),
    z.object({
      type: z.literal("COUNT_UNITS_ON_BOARD"),
      targetTag: z.string().min(1),
      min: z.number().int().min(0),
      faction: z.enum(["ANY", "ALLY", "ENEMY"]).optional()
    }).strict()
  ])
);

const CostZ = z
  .object({
    ap: z.number().int().min(0).optional(),
    requiredEquippedItemIds: z.array(z.string()).optional(),
    cooldown: z.object({ turns: z.number().int().min(1) }).strict().optional(),
    tokens: z.record(z.number()).optional()
  })
  .strict();

const TargetingZ = z
  .object({
    type: z.enum(blockRegistry.targeting.types as [string, ...string[]]),
    origin: z.enum(["SOURCE", "ANYWHERE"]).optional(),
    range: z
      .object({
        base: z.number().int().min(0).optional(),
        min: z.number().int().min(0).optional(),
        max: z.number().int().min(0).optional()
      })
      .strict()
      .optional(),
    lineOfSight: z.boolean().optional(),
    area: z
      .object({
        radius: z.number().int().min(0),
        includeCenter: z.boolean().optional()
      })
      .strict()
      .optional()
  })
  .strict();

const StepZ: z.ZodType<any> = z.lazy(() =>
  z.union([
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

    // UPDATED: elseIf supported
    z
      .object({
        type: z.literal("IF_ELSE"),
        condition: ConditionZ,
        then: z.array(StepZ),
        elseIf: z
          .array(
            z
              .object({
                condition: ConditionZ,
                then: z.array(StepZ)
              })
              .strict()
          )
          .optional(),
        else: z.array(StepZ)
      })
      .strict(),

    z.object({ type: z.literal("OPEN_REACTION_WINDOW"), timing: z.literal("BEFORE_DAMAGE"), windowId: z.string().min(1) }).strict(),
    z.object({ type: z.literal("UNKNOWN_STEP"), raw: z.any() }).strict()
  ])
);

const AbilityZ = z
  .object({
    componentType: z.literal("ABILITY"),
    name: z.string().min(1),
    description: z.string().default(""),
    trigger: TriggerZ,
    cost: CostZ.optional(),
    targeting: TargetingZ.optional(),
    execution: z.object({ steps: z.array(StepZ) }).strict().optional()
  })
  .strict();

const VisualsZ = z
  .object({
    cardImage: z.string().optional(),
    tokenImage: z.string().optional(),
    model3d: z.string().optional()
  })
  .strict()
  .optional();

const StatsZ = z
  .object({
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
  })
  .strict()
  .optional();

const PresentationZ = z
  .object({
    template: z.enum(["T1", "T2", "T3", "T4", "T5"]).optional(),
    theme: z.enum(["BLUE", "GREEN", "PURPLE", "ORANGE", "RED"]).optional(),
    imagePosition: z.string().optional()
  })
  .strict()
  .optional();

export const CardZ = z
  .object({
    schemaVersion: SchemaVersionZ,
    id: z.string().min(1),
    name: z.string().min(1),
    type: CardTypeZ,

    faction: z.string().optional(),
    subType: z.array(z.string()).optional(),
    attributes: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),

    visuals: VisualsZ,
    stats: StatsZ,
    resources: z.record(z.number()).optional(),
    presentation: PresentationZ,

    components: z.array(z.union([AbilityZ, z.record(z.any())])).min(1)
  })
  .strict();

export type ValidationIssue = { severity: "ERROR" | "INFO"; code: string; message: string; path?: string };

function walkSteps(steps: any[], cb: (s: any) => void) {
  for (const s of steps ?? []) {
    cb(s);
    if (s?.type === "IF_ELSE") {
      walkSteps(s.then ?? [], cb);
      for (const b of s.elseIf ?? []) walkSteps(b.then ?? [], cb);
      walkSteps(s.else ?? [], cb);
    }
    if (s?.type === "OPPONENT_SAVE") {
      walkSteps(s.onFail ?? [], cb);
      walkSteps(s.onSuccess ?? [], cb);
    }
  }
}

function stepUsesTargetRef(s: any): boolean {
  // check common places where EntityRef appears
  const checkRef = (x: any) => x && typeof x === "object" && x.type === "TARGET";
  if (checkRef(s?.target)) return true;
  if (checkRef(s?.entity)) return true;
  // expressions/conditions might contain TARGET too
  const str = JSON.stringify(s);
  return str.includes('"type":"TARGET"');
}

export function validateCard(card: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const parsed = CardZ.safeParse(card);

  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      issues.push({ severity: "ERROR", code: "SCHEMA", message: i.message, path: i.path.join(".") });
    }
    return issues;
  }

  const c: any = parsed.data;

  for (let i = 0; i < (c.components ?? []).length; i++) {
    const comp = c.components[i];
    if (comp?.componentType !== "ABILITY") continue;

    const targeting = comp.targeting;
    const origin = String(targeting?.origin ?? "SOURCE");
    const tType = String(targeting?.type ?? "");

    const steps = comp.execution?.steps ?? [];
    let usesTarget = false;
    walkSteps(steps, (s) => {
      if (stepUsesTargetRef(s)) usesTarget = true;
    });

    // 1) If a step uses TARGET, enforce non-SELF targeting
    if (usesTarget) {
      if (!targeting || tType === "SELF") {
        issues.push({
          severity: "ERROR",
          code: "ERR_TARGET_REF_REQUIRES_TARGETING",
          message: "Ability uses TARGET but targeting is missing or SELF.",
          path: `components.${i}.targeting`
        });
      }
    }

    // 2) If origin === ANYWHERE, allow range rules differently (but still needs targeting != SELF)
    if (origin === "ANYWHERE") {
      if (!targeting || tType === "SELF") {
        issues.push({
          severity: "ERROR",
          code: "ERR_ANYWHERE_REQUIRES_NON_SELF_TARGETING",
          message: "origin=ANYWHERE requires a non-SELF targeting type.",
          path: `components.${i}.targeting.origin`
        });
      }
      // Optional: recommend LoS off for global
      if (targeting?.lineOfSight === true) {
        issues.push({
          severity: "INFO",
          code: "INFO_ANYWHERE_LOS",
          message: "origin=ANYWHERE with lineOfSight=true is unusual. Consider disabling LoS for global casts.",
          path: `components.${i}.targeting.lineOfSight`
        });
      }
    }

    // 3) If AoE radius > 0, require AREA_RADIUS targeting
    const radius = Number(targeting?.area?.radius ?? 0);
    if (radius > 0 && tType !== "AREA_RADIUS") {
      issues.push({
        severity: "ERROR",
        code: "ERR_AOE_REQUIRES_AREA_RADIUS",
        message: "AoE radius > 0 requires targeting.type = AREA_RADIUS.",
        path: `components.${i}.targeting`
      });
    }
    if (tType === "AREA_RADIUS" && !targeting?.area) {
      issues.push({
        severity: "ERROR",
        code: "ERR_AREA_RADIUS_MISSING_AREA",
        message: "targeting.type = AREA_RADIUS requires targeting.area.",
        path: `components.${i}.targeting.area`
      });
    }
  }

  if (issues.length === 0) issues.push({ severity: "INFO", code: "OK", message: "Card passes core validation." });
  return issues;
}
