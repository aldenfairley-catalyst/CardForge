// src/lib/schemas.ts
import type {
  CardEntity,
  AbilityComponent,
  Step,
  TargetRef,
  Expression,
  Condition
} from "./types";

export type ValidationSeverity = "ERROR" | "WARN" | "INFO";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string;
};

function issue(out: ValidationIssue[], severity: ValidationSeverity, code: string, message: string, path?: string) {
  out.push({ severity, code, message, path });
}

function getAbilities(card: CardEntity) {
  const out: Array<{ ability: AbilityComponent; idx: number }> = [];
  card.components.forEach((c: any, i) => {
    if (c?.componentType === "ABILITY") out.push({ ability: c as AbilityComponent, idx: i });
  });
  return out;
}

function checkTargetRef(ref: any, ctx: { inForEach: boolean }, out: ValidationIssue[], path: string) {
  if (!ref || typeof ref !== "object") return;
  if (ref.type === "ITERATION_TARGET" && !ctx.inForEach) {
    issue(out, "ERROR", "ITERATION_TARGET_OUTSIDE_FOREACH", "ITERATION_TARGET can only be used inside FOR_EACH_TARGET.do", path);
  }
  // EQUIPPED_ITEM.of can itself reference ITERATION_TARGET etc.
  if (ref.type === "EQUIPPED_ITEM" && ref.of) {
    checkTargetRef(ref.of, ctx, out, `${path}.of`);
  }
}

function walkExpression(expr: any, ctx: { inForEach: boolean }, out: ValidationIssue[], path: string) {
  if (!expr || typeof expr !== "object") return;

  if (expr.type === "GET_STAT") {
    const from = (expr as any).from as TargetRef | undefined;
    if (from) checkTargetRef(from, ctx, out, `${path}.from`);
  }

  if (expr.type === "COUNT_ENTITIES_IN_RANGE") {
    const center = (expr as any).center as TargetRef | undefined;
    if (center) checkTargetRef(center, ctx, out, `${path}.center`);
    if (typeof expr.range !== "number") {
      issue(out, "WARN", "COUNT_RANGE_NOT_NUMBER", "COUNT_ENTITIES_IN_RANGE.range should be a number.", `${path}.range`);
    }
  }

  for (const k of Object.keys(expr)) {
    const v = (expr as any)[k];
    if (Array.isArray(v)) v.forEach((x, i) => walkExpression(x, ctx, out, `${path}.${k}[${i}]`));
    else if (v && typeof v === "object") walkExpression(v, ctx, out, `${path}.${k}`);
  }
}

function walkCondition(cond: any, ctx: { inForEach: boolean }, out: ValidationIssue[], path: string) {
  if (!cond || typeof cond !== "object") return;

  if (cond.type === "NOT") walkCondition(cond.value, ctx, out, `${path}.value`);
  if (cond.type === "AND" || cond.type === "OR") {
    (cond.values ?? []).forEach((c: any, i: number) => walkCondition(c, ctx, out, `${path}.values[${i}]`));
  }

  if (cond.type === "COMPARE") {
    walkExpression(cond.left, ctx, out, `${path}.left`);
    walkExpression(cond.right, ctx, out, `${path}.right`);
  }

  if (cond.type === "HAS_STATUS" || cond.type === "HAS_TAG" || cond.type === "HAS_EQUIPPED_ITEM" || cond.type === "STATE_EQUALS") {
    if (cond.target) checkTargetRef(cond.target, ctx, out, `${path}.target`);
    if (cond.type === "STATE_EQUALS") {
      if (!String(cond.key ?? "").trim()) issue(out, "ERROR", "STATE_EQUALS_KEY_MISSING", "STATE_EQUALS.key is required.", `${path}.key`);
    }
    if (cond.type === "HAS_EQUIPPED_ITEM" && !String(cond.itemId ?? "").trim()) {
      issue(out, "ERROR", "HAS_EQUIPPED_ITEM_ID_MISSING", "HAS_EQUIPPED_ITEM.itemId is required.", `${path}.itemId`);
    }
  }
}

function walkSteps(steps: Step[] | undefined, ctx: { inForEach: boolean }, out: ValidationIssue[], basePath: string) {
  if (!steps) return;

  steps.forEach((s: any, i: number) => {
    const p = `${basePath}[${i}]`;
    if (!s || typeof s !== "object" || !s.type) return;

    // TargetRef checks
    if (
      s.type === "DEAL_DAMAGE" ||
      s.type === "HEAL" ||
      s.type === "APPLY_STATUS" ||
      s.type === "REMOVE_STATUS" ||
      s.type === "MOVE_ENTITY" ||
      s.type === "SET_STATE" ||
      s.type === "TOGGLE_STATE"
    ) {
      checkTargetRef(s.target, ctx, out, `${p}.target`);
    }

    // Expression checks
    if (s.type === "DEAL_DAMAGE") walkExpression(s.amountExpr, ctx, out, `${p}.amountExpr`);
    if (s.type === "HEAL") walkExpression(s.amountExpr, ctx, out, `${p}.amountExpr`);
    if (s.type === "SET_VARIABLE") walkExpression(s.valueExpr, ctx, out, `${p}.valueExpr`);
    if (s.type === "SET_STATE" && s.valueExpr) walkExpression(s.valueExpr, ctx, out, `${p}.valueExpr`);

    // New state steps basic shape
    if (s.type === "SET_STATE") {
      if (!String(s.key ?? "").trim()) issue(out, "ERROR", "SET_STATE_KEY_MISSING", "SET_STATE.key is required.", `${p}.key`);
      const hasValue = typeof s.value !== "undefined";
      const hasExpr = typeof s.valueExpr !== "undefined";
      if (!hasValue && !hasExpr) {
        issue(out, "ERROR", "SET_STATE_VALUE_MISSING", "SET_STATE requires value or valueExpr.", `${p}`);
      }
    }
    if (s.type === "TOGGLE_STATE") {
      if (!String(s.key ?? "").trim()) issue(out, "ERROR", "TOGGLE_STATE_KEY_MISSING", "TOGGLE_STATE.key is required.", `${p}.key`);
    }

    // IF / ELSE recursion + validate condition tree
    if (s.type === "IF_ELSE") {
      walkCondition(s.condition, ctx, out, `${p}.condition`);
      walkSteps(s.then, ctx, out, `${p}.then`);
      if (Array.isArray(s.elseIf)) {
        s.elseIf.forEach((br: any, bi: number) => {
          walkCondition(br?.condition, ctx, out, `${p}.elseIf[${bi}].condition`);
          walkSteps(br?.then, ctx, out, `${p}.elseIf[${bi}].then`);
        });
      }
      walkSteps(s.else, ctx, out, `${p}.else`);
    }

    // OPPONENT_SAVE recursion
    if (s.type === "OPPONENT_SAVE") {
      walkSteps(s.onFail, ctx, out, `${p}.onFail`);
      walkSteps(s.onSuccess, ctx, out, `${p}.onSuccess`);
    }

    // FOR_EACH_TARGET recursion (gate for ITERATION_TARGET)
    if (s.type === "FOR_EACH_TARGET") {
      walkSteps(s.do, { inForEach: true }, out, `${p}.do`);
    }
  });
}

export function validateCard(card: CardEntity): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  if (!card) {
    issue(out, "ERROR", "CARD_MISSING", "Card is missing.");
    return out;
  }
  if (!card.schemaVersion) issue(out, "ERROR", "SCHEMA_VERSION_MISSING", "schemaVersion is required.", "schemaVersion");
  if (!card.id) issue(out, "ERROR", "ID_MISSING", "id is required.", "id");
  if (!card.name || !card.name.trim()) issue(out, "ERROR", "NAME_MISSING", "name is required.", "name");
  if (!card.type) issue(out, "ERROR", "TYPE_MISSING", "type is required.", "type");
  if (!Array.isArray(card.components)) issue(out, "ERROR", "COMPONENTS_MISSING", "components[] is required.", "components");

  const abilities = getAbilities(card);
  if (abilities.length === 0) issue(out, "ERROR", "NO_ABILITY", "At least one ABILITY component is required.", "components");

  for (const { ability, idx } of abilities) {
    const base = `components[${idx}]`;

    // targetingProfiles uniqueness
    const profiles = ability.targetingProfiles ?? [];
    if (profiles.length > 0) {
      const ids = profiles.map((p) => String((p as any)?.id ?? "")).filter(Boolean);
      const seen = new Set<string>();
      const dup = new Set<string>();
      ids.forEach((id) => (seen.has(id) ? dup.add(id) : seen.add(id)));
      dup.forEach((d) =>
        issue(out, "ERROR", "DUPLICATE_TARGET_PROFILE_ID", `Duplicate targetingProfiles id: "${d}"`, `${base}.targetingProfiles`)
      );
    }

    const profileIdSet = new Set((ability.targetingProfiles ?? []).map((p) => p.id));

    // Validate requirements condition tree
    if (ability.requirements) {
      walkCondition(ability.requirements, { inForEach: false }, out, `${base}.requirements`);
    }

    // Collect target set definitions (SELECT_TARGETS)
    const steps = ability.execution?.steps ?? [];
    const definedTargetSets = new Set<string>();

    steps.forEach((s: any, si: number) => {
      if (!s || typeof s !== "object") return;
      if (s.type !== "SELECT_TARGETS") return;

      const p = `${base}.execution.steps[${si}]`;

      // validate SELECT_TARGETS.profileId exists
      if (!s.profileId || !profileIdSet.has(String(s.profileId))) {
        issue(out, "ERROR", "SELECT_TARGETS_PROFILE_NOT_FOUND", `SELECT_TARGETS.profileId "${s.profileId}" not found in targetingProfiles.`, `${p}.profileId`);
      }

      const saveAs = String(s.saveAs ?? "").trim();
      if (!saveAs) {
        issue(out, "ERROR", "SELECT_TARGETS_SAVEAS_MISSING", "SELECT_TARGETS.saveAs is required.", `${p}.saveAs`);
        return;
      }
      if (definedTargetSets.has(saveAs)) {
        issue(out, "ERROR", "DUPLICATE_TARGET_SET_SAVEAS", `Duplicate target set name "${saveAs}".`, `${p}.saveAs`);
      } else {
        definedTargetSets.add(saveAs);
      }
    });

    // Walk for ITERATION_TARGET rules etc.
    walkSteps(steps as Step[], { inForEach: false }, out, `${base}.execution.steps`);

    // validate FOR_EACH_TARGET.targetSet.ref exists
    const scanForEachRefs = (nested: Step[] | undefined, path: string) => {
      if (!nested) return;
      nested.forEach((s: any, i: number) => {
        const p = `${path}[${i}]`;
        if (!s || typeof s !== "object") return;

        if (s.type === "FOR_EACH_TARGET") {
          const ref = String(s.targetSet?.ref ?? "").trim();
          if (!ref || !definedTargetSets.has(ref)) {
            issue(out, "ERROR", "FOREACH_TARGETSET_NOT_FOUND", `FOR_EACH_TARGET.targetSet.ref "${ref}" was not defined by a SELECT_TARGETS.saveAs.`, `${p}.targetSet.ref`);
          }
          scanForEachRefs(s.do, `${p}.do`);
        }

        if (s.type === "IF_ELSE") {
          scanForEachRefs(s.then, `${p}.then`);
          if (Array.isArray(s.elseIf)) s.elseIf.forEach((br: any, bi: number) => scanForEachRefs(br?.then, `${p}.elseIf[${bi}].then`));
          scanForEachRefs(s.else, `${p}.else`);
        }

        if (s.type === "OPPONENT_SAVE") {
          scanForEachRefs(s.onFail, `${p}.onFail`);
          scanForEachRefs(s.onSuccess, `${p}.onSuccess`);
        }
      });
    };
    scanForEachRefs(steps as Step[], `${base}.execution.steps`);
  }

  if (out.length === 0) return [{ severity: "INFO", code: "OK", message: "No issues." }];
  return out;
}
