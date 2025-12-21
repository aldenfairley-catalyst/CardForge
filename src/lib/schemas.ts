// src/lib/schemas.ts
import type { CardEntity, AbilityComponent, Step } from "./types";
import { blockRegistry, isStepTypeAllowed } from "./registry";
import { LATEST_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from "./migrations";

export type ValidationSeverity = "ERROR" | "WARN";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string;
};

const ALLOWED_CARD_TYPES = new Set(["UNIT", "ITEM", "ENVIRONMENT", "SPELL", "TOKEN"]);
const SUPPORTED_SCHEMA_VERSION_SET = new Set<string>(SUPPORTED_SCHEMA_VERSIONS);
const isSchemaVersionAllowed = (v: string) => SUPPORTED_SCHEMA_VERSION_SET.has(v);

function push(
  issues: ValidationIssue[],
  severity: ValidationSeverity,
  code: string,
  message: string,
  path?: string
) {
  issues.push({ severity, code, message, path });
}

function isObj(x: any) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function containsIterationTarget(x: any): boolean {
  if (!x) return false;
  if (Array.isArray(x)) return x.some(containsIterationTarget);
  if (isObj(x)) {
    if (x.type === "ITERATION_TARGET") return true;
    return Object.values(x).some(containsIterationTarget);
  }
  return false;
}

type WalkCtx = {
  inForEachTarget: boolean;
  outputs: Set<string>;
  abilityProfiles: Set<string>;
  path: string;
};

function walkSteps(steps: any[], issues: ValidationIssue[], ctx: WalkCtx) {
  if (!Array.isArray(steps)) return;

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i] as any;
    const stepPath = `${ctx.path}[${i}]`;

    if (!isObj(s) || typeof s.type !== "string") {
      push(issues, "ERROR", "STEP_SHAPE", "Step must be an object with a string 'type'.", stepPath);
      continue;
    }

    // Known step type?
    if (!isStepTypeAllowed(s.type)) {
      push(
        issues,
        "ERROR",
        "UNKNOWN_STEP_TYPE",
        `Step type '${s.type}' is not in blockRegistry.steps.types.`,
        `${stepPath}.type`
      );
    }

    // Track outputs
    if (typeof s.saveAs === "string" && s.saveAs.trim()) ctx.outputs.add(s.saveAs.trim());

    // Specific invariants
    if (s.type === "SELECT_TARGETS") {
      if (typeof s.profileId !== "string" || !s.profileId.trim()) {
        push(issues, "ERROR", "SELECT_TARGETS_PROFILE", "SELECT_TARGETS.profileId is required.", `${stepPath}.profileId`);
      } else if (!ctx.abilityProfiles.has(s.profileId.trim())) {
        push(
          issues,
          "ERROR",
          "SELECT_TARGETS_PROFILE_MISSING",
          `SELECT_TARGETS.profileId '${s.profileId}' does not exist in ability.targetingProfiles[].id`,
          `${stepPath}.profileId`
        );
      }
      if (typeof s.saveAs !== "string" || !s.saveAs.trim()) {
        push(issues, "ERROR", "SELECT_TARGETS_SAVEAS", "SELECT_TARGETS.saveAs is required.", `${stepPath}.saveAs`);
      }
    }

    if (s.type === "FOR_EACH_TARGET") {
      const ref = s?.targetSet?.ref;
      if (typeof ref !== "string" || !ref.trim()) {
        push(issues, "ERROR", "FOR_EACH_TARGET_REF", "FOR_EACH_TARGET.targetSet.ref is required.", `${stepPath}.targetSet.ref`);
      } else if (!ctx.outputs.has(ref.trim())) {
        push(
          issues,
          "WARN",
          "FOR_EACH_TARGET_REF_UNKNOWN",
          `FOR_EACH_TARGET.targetSet.ref '${ref}' does not match any prior saveAs output in this execution.`,
          `${stepPath}.targetSet.ref`
        );
      }

      // Nested context
      const nestedCtx: WalkCtx = { ...ctx, inForEachTarget: true, path: `${stepPath}.do` };
      walkSteps(s.do ?? [], issues, nestedCtx);
      continue;
    }

    // ITERATION_TARGET only valid inside FOR_EACH_TARGET "do"
    if (!ctx.inForEachTarget && containsIterationTarget(s)) {
      push(
        issues,
        "ERROR",
        "ITERATION_TARGET_OUTSIDE_LOOP",
        "ITERATION_TARGET can only be used inside FOR_EACH_TARGET.do steps.",
        stepPath
      );
    }

    // IF/ELSE nesting
    if (s.type === "IF_ELSE") {
      const nestedThen: WalkCtx = { ...ctx, path: `${stepPath}.then` };
      walkSteps(s.then ?? [], issues, nestedThen);

      const elseIfArr = Array.isArray(s.elseIf) ? s.elseIf : [];
      for (let j = 0; j < elseIfArr.length; j++) {
        const branch = elseIfArr[j];
        const nestedEi: WalkCtx = { ...ctx, path: `${stepPath}.elseIf[${j}].then` };
        walkSteps(branch?.then ?? [], issues, nestedEi);
      }

      const nestedElse: WalkCtx = { ...ctx, path: `${stepPath}.else` };
      walkSteps(s.else ?? [], issues, nestedElse);
    }

    // OPPONENT_SAVE nesting
    if (s.type === "OPPONENT_SAVE") {
      const nestedFail: WalkCtx = { ...ctx, path: `${stepPath}.onFail` };
      walkSteps(s.onFail ?? [], issues, nestedFail);

      const nestedSucc: WalkCtx = { ...ctx, path: `${stepPath}.onSuccess` };
      walkSteps(s.onSuccess ?? [], issues, nestedSucc);
    }

    // PROPERTY_CONTEST nesting
    if (s.type === "PROPERTY_CONTEST") {
      const nestedWin: WalkCtx = { ...ctx, path: `${stepPath}.onWin` };
      walkSteps(s.onWin ?? [], issues, nestedWin);

      const nestedLose: WalkCtx = { ...ctx, path: `${stepPath}.onLose` };
      walkSteps(s.onLose ?? [], issues, nestedLose);
    }

    // REGISTER_INTERRUPTS nesting
    if (s.type === "REGISTER_INTERRUPTS") {
      const nestedInt: WalkCtx = { ...ctx, path: `${stepPath}.onInterrupt` };
      walkSteps(s.onInterrupt ?? [], issues, nestedInt);
    }
  }
}

export function validateCard(card: any): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isObj(card)) {
    push(issues, "ERROR", "CARD_SHAPE", "Card must be an object.");
    return issues;
  }

  if (typeof card.schemaVersion !== "string" || !isSchemaVersionAllowed(card.schemaVersion)) {
      push(
        issues,
        "ERROR",
        "SCHEMA_VERSION",
        `schemaVersion must be one of: ${Array.from(SUPPORTED_SCHEMA_VERSION_SET).join(", ")}.`,
        "schemaVersion"
      );
  }

  if (typeof card.id !== "string" || !card.id.trim()) {
    push(issues, "ERROR", "CARD_ID", "id must be a non-empty string", "id");
  }

  if (typeof card.name !== "string" || !card.name.trim()) {
    push(issues, "ERROR", "CARD_NAME", "name must be a non-empty string", "name");
  }

  if (typeof card.type !== "string" || !ALLOWED_CARD_TYPES.has(card.type)) {
    push(issues, "ERROR", "CARD_TYPE", "type must be one of UNIT/ITEM/ENVIRONMENT/SPELL/TOKEN", "type");
  }

  if (!Array.isArray(card.components)) {
    push(issues, "ERROR", "COMPONENTS", "components must be an array", "components");
    return issues;
  }

  // Validate ability components + step invariants
  for (let ci = 0; ci < card.components.length; ci++) {
    const comp = card.components[ci] as any;
    if (!isObj(comp)) continue;

    if (comp.componentType === "ABILITY") {
      const ability = comp as AbilityComponent;
      const basePath = `components[${ci}]`;

      if (typeof ability.name !== "string" || !ability.name.trim()) {
        push(issues, "ERROR", "ABILITY_NAME", "Ability.name is required.", `${basePath}.name`);
      }

      // profiles unique
      const profiles = Array.isArray((ability as any).targetingProfiles) ? (ability as any).targetingProfiles : [];
      const seen = new Set<string>();
      for (let pi = 0; pi < profiles.length; pi++) {
        const p = profiles[pi];
        const id = String(p?.id ?? "");
        if (!id.trim()) {
          push(issues, "ERROR", "PROFILE_ID", "targetingProfiles[].id is required.", `${basePath}.targetingProfiles[${pi}].id`);
          continue;
        }
        if (seen.has(id)) {
          push(issues, "ERROR", "PROFILE_ID_DUP", `Duplicate targetingProfiles id '${id}'.`, `${basePath}.targetingProfiles[${pi}].id`);
        }
        seen.add(id);
      }

      const execSteps = (ability as any).execution?.steps;
      if (execSteps && !Array.isArray(execSteps)) {
        push(issues, "ERROR", "STEPS_SHAPE", "execution.steps must be an array", `${basePath}.execution.steps`);
      }

      const ctx = {
        inForEachTarget: false,
        outputs: new Set<string>(),
        abilityProfiles: seen,
        path: `${basePath}.execution.steps`
      };
      walkSteps(execSteps ?? [], issues, ctx);
    }
  }

  if (issues.length === 0) {
    issues.push({ severity: "WARN", code: "OK", message: "No issues." });
  }
  return issues;
}
