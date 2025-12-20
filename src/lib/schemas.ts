// src/lib/schemas.ts
import type {
  CardEntity,
  AbilityComponent,
  Step,
  TargetRef,
  Expression
} from "./types";

export type ValidationSeverity = "ERROR" | "WARN" | "INFO";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string;
};

function issue(
  out: ValidationIssue[],
  severity: ValidationSeverity,
  code: string,
  message: string,
  path?: string
) {
  out.push({ severity, code, message, path });
}

function getAbilities(card: CardEntity) {
  const out: Array<{ ability: AbilityComponent; idx: number }> = [];
  card.components.forEach((c: any, i) => {
    if (c?.componentType === "ABILITY") out.push({ ability: c as AbilityComponent, idx: i });
  });
  return out;
}

function walkExpression(
  expr: any,
  ctx: { inForEach: boolean },
  out: ValidationIssue[],
  path: string
) {
  if (!expr || typeof expr !== "object") return;

  // Validate any embedded TargetRef inside expressions (GET_STAT.from)
  if (expr.type === "GET_STAT") {
    const from = (expr as any).from as TargetRef | undefined;
    if (from?.type === "ITERATION_TARGET" && !ctx.inForEach) {
      issue(out, "ERROR", "ITERATION_TARGET_OUTSIDE_FOREACH", "ITERATION_TARGET can only be used inside FOR_EACH_TARGET.do", path + ".from");
    }
  }

  // Recurse through expression fields
  for (const k of Object.keys(expr)) {
    const v = (expr as any)[k];
    if (Array.isArray(v)) {
      v.forEach((x, i) => walkExpression(x, ctx, out, `${path}.${k}[${i}]`));
    } else if (v && typeof v === "object") {
      walkExpression(v, ctx, out, `${path}.${k}`);
    }
  }
}

function checkTargetRef(
  ref: any,
  ctx: { inForEach: boolean },
  out: ValidationIssue[],
  path: string
) {
  if (!ref || typeof ref !== "object") return;
  if (ref.type === "ITERATION_TARGET" && !ctx.inForEach) {
    issue(out, "ERROR", "ITERATION_TARGET_OUTSIDE_FOREACH", "ITERATION_TARGET can only be used inside FOR_EACH_TARGET.do", path);
  }
}

function walkSteps(
  steps: Step[] | undefined,
  ctx: { inForEach: boolean },
  out: ValidationIssue[],
  basePath: string
) {
  if (!steps) return;

  steps.forEach((s: any, i: number) => {
    const p = `${basePath}[${i}]`;
    if (!s || typeof s !== "object" || !s.type) return;

    // TargetRef checks in common steps
    if (s.type === "DEAL_DAMAGE" || s.type === "HEAL" || s.type === "APPLY_STATUS" || s.type === "REMOVE_STATUS" || s.type === "MOVE_ENTITY") {
      checkTargetRef(s.target, ctx, out, `${p}.target`);
    }

    // Expression checks
    if (s.type === "DEAL_DAMAGE") {
      walkExpression(s.amountExpr as Expression, ctx, out, `${p}.amountExpr`);
    }
    if (s.type === "HEAL") {
      walkExpression(s.amountExpr as Expression, ctx, out, `${p}.amountExpr`);
    }
    if (s.type === "SET_VARIABLE") {
      walkExpression(s.valueExpr as Expression, ctx, out, `${p}.valueExpr`);
    }

    // IF / ELSE recursion
    if (s.type === "IF_ELSE") {
      walkSteps(s.then, ctx, out, `${p}.then`);
      if (Array.isArray(s.elseIf)) {
        s.elseIf.forEach((br: any, bi: number) => {
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

    // FOR_EACH_TARGET recursion (this is the rule gate for ITERATION_TARGET)
    if (s.type === "FOR_EACH_TARGET") {
      walkSteps(s.do, { inForEach: true }, out, `${p}.do`);
    }
  });
}

export function validateCard(card: CardEntity): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  // Basic shape checks (keep light; gameplay validation evolves later)
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
  if (abilities.length === 0) {
    issue(out, "ERROR", "NO_ABILITY", "At least one ABILITY component is required.", "components");
  }

  for (const { ability, idx } of abilities) {
    const base = `components[${idx}]`;

    // --- (1) validate targetingProfiles uniqueness ---
    const profiles = ability.targetingProfiles ?? [];
    if (profiles.length > 0) {
      const ids = profiles.map((p) => String((p as any)?.id ?? "")).filter(Boolean);
      const seen = new Set<string>();
      const dup = new Set<string>();
      ids.forEach((id) => {
        if (seen.has(id)) dup.add(id);
        else seen.add(id);
      });
      dup.forEach((d) => {
        issue(out, "ERROR", "DUPLICATE_TARGET_PROFILE_ID", `Duplicate targetingProfiles id: "${d}"`, `${base}.targetingProfiles`);
      });
    }

    const profileIdSet = new Set((ability.targetingProfiles ?? []).map((p) => p.id));

    // Collect target set definitions from SELECT_TARGETS
    const steps = ability.execution?.steps ?? [];
    const definedTargetSets = new Set<string>();
    const selectTargetsBySaveAs = new Map<string, number>();

    // Scan top-level steps for SELECT_TARGETS and validate (2)
    steps.forEach((s: any, si: number) => {
      if (!s || typeof s !== "object") return;
      if (s.type !== "SELECT_TARGETS") return;

      const p = `${base}.execution.steps[${si}]`;

      // --- (2) validate SELECT_TARGETS.profileId exists ---
      if (!s.profileId || !profileIdSet.has(String(s.profileId))) {
        issue(
          out,
          "ERROR",
          "SELECT_TARGETS_PROFILE_NOT_FOUND",
          `SELECT_TARGETS.profileId "${s.profileId}" not found in targetingProfiles.`,
          `${p}.profileId`
        );
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
        selectTargetsBySaveAs.set(saveAs, si);
      }
    });

    // Walk steps for recursion + ITERATION_TARGET checks (4)
    walkSteps(steps as Step[], { inForEach: false }, out, `${base}.execution.steps`);

    // Validate FOR_EACH_TARGET refs and nested ones (3)
    // We validate all FOR_EACH_TARGET steps recursively by scanning again using a dedicated recursive function.
    const scanForEachRefs = (nested: Step[] | undefined, path: string) => {
      if (!nested) return;
      nested.forEach((s: any, i: number) => {
        const p = `${path}[${i}]`;
        if (!s || typeof s !== "object") return;

        if (s.type === "FOR_EACH_TARGET") {
          const ref = String(s.targetSet?.ref ?? "").trim();
          // --- (3) validate FOR_EACH_TARGET.targetSet.ref exists ---
          if (!ref || !definedTargetSets.has(ref)) {
            issue(
              out,
              "ERROR",
              "FOREACH_TARGETSET_NOT_FOUND",
              `FOR_EACH_TARGET.targetSet.ref "${ref}" was not defined by a SELECT_TARGETS.saveAs.`,
              `${p}.targetSet.ref`
            );
          }
          scanForEachRefs(s.do, `${p}.do`);
        }

        if (s.type === "IF_ELSE") {
          scanForEachRefs(s.then, `${p}.then`);
          if (Array.isArray(s.elseIf)) {
            s.elseIf.forEach((br: any, bi: number) => scanForEachRefs(br?.then, `${p}.elseIf[${bi}].then`));
          }
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

  if (out.length === 0) {
    return [{ severity: "INFO", code: "OK", message: "No issues." }];
  }
  return out;
}
