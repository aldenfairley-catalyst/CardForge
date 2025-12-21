// src/lib/schemas.ts
import type { CardEntity, AbilityComponent, Step } from "./types";

export type ValidationSeverity = "ERROR" | "WARN";
export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path?: string;
};

const KNOWN_CARD_SCHEMA_VERSIONS = ["CJ-1.0", "CJ-1.1", "CJ-1.2"] as const;

function isKnownSchemaVersion(v: any): v is (typeof KNOWN_CARD_SCHEMA_VERSIONS)[number] {
  return typeof v === "string" && (KNOWN_CARD_SCHEMA_VERSIONS as readonly string[]).includes(v);
}

function isCJ1x(v: any) {
  return typeof v === "string" && /^CJ-1\.\d+$/.test(v);
}

function add(out: ValidationIssue[], severity: ValidationSeverity, code: string, message: string, path?: string) {
  out.push({ severity, code, message, path });
}

function isAbilityComponent(c: any): c is AbilityComponent {
  return c && c.componentType === "ABILITY";
}

/** Collect all nested step arrays in a step (for traversal) */
function getNestedStepLists(step: any): Step[][] {
  const lists: any[] = [];

  // Common nested patterns used in this project
  if (step?.type === "IF_ELSE") {
    if (Array.isArray(step.then)) lists.push(step.then);
    if (Array.isArray(step.else)) lists.push(step.else);
    if (Array.isArray(step.elseIf)) {
      for (const br of step.elseIf) {
        if (Array.isArray(br?.then)) lists.push(br.then);
      }
    }
  }

  if (step?.type === "OPPONENT_SAVE") {
    if (Array.isArray(step.onFail)) lists.push(step.onFail);
    if (Array.isArray(step.onSuccess)) lists.push(step.onSuccess);
  }

  if (step?.type === "FOR_EACH_TARGET") {
    if (Array.isArray(step.do)) lists.push(step.do);
  }

  if (step?.type === "PROPERTY_CONTEST") {
    if (Array.isArray(step.onWin)) lists.push(step.onWin);
    if (Array.isArray(step.onLose)) lists.push(step.onLose);
  }

  if (step?.type === "REGISTER_INTERRUPTS") {
    if (Array.isArray(step.onInterrupt)) lists.push(step.onInterrupt);
  }

  return lists as Step[][];
}

/** Recursively detect an ITERATION_TARGET reference anywhere inside an object */
function containsIterationTarget(obj: any): boolean {
  if (!obj) return false;
  if (typeof obj !== "object") return false;

  // our convention: { type: "ITERATION_TARGET" }
  if (obj.type === "ITERATION_TARGET") return true;

  for (const k of Object.keys(obj)) {
    if (containsIterationTarget(obj[k])) return true;
  }
  return false;
}

/** Collect saveAs keys produced by steps (including nested) */
function collectSaveAs(steps: Step[]): Set<string> {
  const out = new Set<string>();

  const walk = (arr: Step[]) => {
    for (const s of arr) {
      if (s && typeof (s as any).saveAs === "string" && (s as any).saveAs.trim()) {
        out.add((s as any).saveAs.trim());
      }
      const nested = getNestedStepLists(s as any);
      for (const n of nested) walk(n);
    }
  };

  walk(steps);
  return out;
}

/** Traverse all steps with context (inForEachTarget) to validate scoping */
function walkStepsWithContext(
  steps: Step[],
  fn: (step: Step, ctx: { inForEachTarget: boolean }, indexPath: string) => void,
  ctx: { inForEachTarget: boolean },
  basePath: string
) {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const here = `${basePath}[${i}]`;
    fn(s, ctx, here);

    if ((s as any)?.type === "FOR_EACH_TARGET") {
      const nested = (s as any).do;
      if (Array.isArray(nested)) {
        walkStepsWithContext(nested, fn, { inForEachTarget: true }, `${here}.do`);
      }
      continue;
    }

    const nestedLists = getNestedStepLists(s as any);
    // For IF/ELSE etc, the context is inherited
    for (const lst of nestedLists) {
      // But avoid double-walking FOR_EACH_TARGET.do, handled above
      if ((s as any)?.type === "FOR_EACH_TARGET") continue;
      walkStepsWithContext(lst, fn, ctx, `${here}._nested`);
    }
  }
}

export function validateCard(card: CardEntity): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ---- Schema version check ----
  const v: any = (card as any)?.schemaVersion;

  if (!v || typeof v !== "string") {
    add(issues, "ERROR", "SCHEMA_VERSION", "schemaVersion is required", "schemaVersion");
  } else if (isKnownSchemaVersion(v)) {
    // OK
  } else if (isCJ1x(v)) {
    // Future-proof: allow CJ-1.x but warn if unknown minor
    add(
      issues,
      "WARN",
      "SCHEMA_VERSION_UNKNOWN_MINOR",
      `schemaVersion ${v} is CJ-1.x but not in known list (${KNOWN_CARD_SCHEMA_VERSIONS.join(", ")}). Consider adding a migration/validator update.`,
      "schemaVersion"
    );
  } else {
    add(
      issues,
      "ERROR",
      "SCHEMA_VERSION",
      `schemaVersion must be ${KNOWN_CARD_SCHEMA_VERSIONS.join(" or ")}`,
      "schemaVersion"
    );
  }

  // ---- Basic shape ----
  if (!(card as any)?.id) add(issues, "ERROR", "ID_REQUIRED", "id is required", "id");
  if (!(card as any)?.name) add(issues, "ERROR", "NAME_REQUIRED", "name is required", "name");
  if (!(card as any)?.type) add(issues, "ERROR", "TYPE_REQUIRED", "type is required", "type");
  if (!Array.isArray((card as any)?.components)) add(issues, "ERROR", "COMPONENTS_REQUIRED", "components[] is required", "components");

  const comps: any[] = Array.isArray((card as any)?.components) ? (card as any).components : [];
  const abilityComps = comps.filter(isAbilityComponent);

  if (abilityComps.length === 0) {
    add(issues, "WARN", "NO_ABILITIES", "No ABILITY components found. This may be valid for some cards, but most gameplay cards need at least one.", "components");
  }

  // ---- Ability-level validations ----
  for (let ai = 0; ai < abilityComps.length; ai++) {
    const ability = abilityComps[ai];
    const aPath = `components[${comps.indexOf(ability)}]`;

    // targetingProfiles uniqueness
    const profiles = Array.isArray((ability as any).targetingProfiles) ? (ability as any).targetingProfiles : [];
    const seen = new Set<string>();
    for (let pi = 0; pi < profiles.length; pi++) {
      const id = profiles[pi]?.id;
      if (!id || typeof id !== "string") {
        add(issues, "ERROR", "TARGET_PROFILE_ID", "targetingProfiles[].id is required", `${aPath}.targetingProfiles[${pi}].id`);
        continue;
      }
      if (seen.has(id)) {
        add(issues, "ERROR", "TARGET_PROFILE_DUP", `Duplicate targetingProfiles id "${id}"`, `${aPath}.targetingProfiles[${pi}].id`);
      }
      seen.add(id);
    }

    // Step validations
    const steps: Step[] = Array.isArray((ability as any)?.execution?.steps) ? ((ability as any).execution.steps as Step[]) : [];

    // Unknown step warnings
    for (let si = 0; si < steps.length; si++) {
      if ((steps[si] as any)?.type === "UNKNOWN_STEP") {
        add(issues, "WARN", "UNKNOWN_STEP", "This step is UNKNOWN_STEP. It will not execute unless registry/engine supports it.", `${aPath}.execution.steps[${si}]`);
      }
    }

    // Validate SELECT_TARGETS.profileId exists
    walkStepsWithContext(
      steps,
      (s, _ctx, path) => {
        if ((s as any)?.type === "SELECT_TARGETS") {
          const pid = (s as any)?.profileId;
          if (!pid || typeof pid !== "string") {
            add(issues, "ERROR", "SELECT_TARGETS_PROFILE", "SELECT_TARGETS.profileId is required", `${aPath}.execution.steps${path}.profileId`);
            return;
          }
          const ok = profiles.some((p: any) => p?.id === pid);
          if (!ok) {
            add(
              issues,
              "ERROR",
              "SELECT_TARGETS_PROFILE_MISSING",
              `SELECT_TARGETS.profileId "${pid}" does not match any targetingProfiles[].id`,
              `${aPath}.execution.steps${path}.profileId`
            );
          }
        }
      },
      { inForEachTarget: false },
      ""
    );

    // Validate FOR_EACH_TARGET.targetSet.ref exists
    const allSaveAs = collectSaveAs(steps);
    walkStepsWithContext(
      steps,
      (s, _ctx, path) => {
        if ((s as any)?.type === "FOR_EACH_TARGET") {
          const ref = (s as any)?.targetSet?.ref;
          if (!ref || typeof ref !== "string") {
            add(issues, "ERROR", "FOR_EACH_TARGET_REF", "FOR_EACH_TARGET.targetSet.ref is required", `${aPath}.execution.steps${path}.targetSet.ref`);
            return;
          }
          if (!allSaveAs.has(ref)) {
            add(
              issues,
              "ERROR",
              "FOR_EACH_TARGET_REF_MISSING",
              `FOR_EACH_TARGET.targetSet.ref "${ref}" does not match any step.saveAs in this ability`,
              `${aPath}.execution.steps${path}.targetSet.ref`
            );
          }
        }
      },
      { inForEachTarget: false },
      ""
    );

    // Validate ITERATION_TARGET only inside FOR_EACH_TARGET.do
    walkStepsWithContext(
      steps,
      (s, ctx, path) => {
        if (!ctx.inForEachTarget && containsIterationTarget(s)) {
          add(
            issues,
            "ERROR",
            "ITERATION_TARGET_SCOPE",
            "ITERATION_TARGET can only be used inside FOR_EACH_TARGET.do (iterator scope).",
            `${aPath}.execution.steps${path}`
          );
        }
      },
      { inForEachTarget: false },
      ""
    );
  }

  return issues;
}
