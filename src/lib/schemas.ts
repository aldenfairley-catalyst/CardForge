/**
 * src/lib/schemas.ts
 * Lightweight validator used by Forge (client-side).
 *
 * Goals:
 * - Accept CJ-1.0 / CJ-1.1 / CJ-1.2 cards (forward compatible)
 * - Catch high-value authoring mistakes that break execution
 * - Never hard-crash the editor on unknown future fields
 *
 * NOTE: This is intentionally not a full JSON-schema implementation.
 */

import type { CardEntity } from "./types";
import { isStepTypeAllowed } from "./registry";

export type ValidationSeverity = "ERROR" | "WARN";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  /** JSONPath-ish pointer used in UI */
  path?: string;
};

export const SUPPORTED_CARD_SCHEMA_VERSIONS = ["CJ-1.0", "CJ-1.1", "CJ-1.2"] as const;

function issue(severity: ValidationSeverity, code: string, message: string, path?: string): ValidationIssue {
  return { severity, code, message, path };
}

function isObj(x: any): x is Record<string, any> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

function asArray<T = any>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

/**
 * Recursively visit steps including nested arrays.
 * Context keeps track of iterator scopes to validate ITERATION_TARGET usage.
 */
function walkSteps(
  steps: any[],
  fn: (step: any, path: string, ctx: { inForEach: boolean; knownTargetSets: Set<string> }) => void,
  basePath: string,
  ctx: { inForEach: boolean; knownTargetSets: Set<string> }
) {
  steps.forEach((s, i) => {
    const p = `${basePath}[${i}]`;
    fn(s, p, ctx);

    // Discover target sets created by SELECT_TARGETS
    if (s?.type === "SELECT_TARGETS" && typeof s.saveAs === "string" && s.saveAs.trim()) {
      ctx.knownTargetSets.add(s.saveAs.trim());
    }

    // Nested branches
    if (s?.type === "IF_ELSE") {
      walkSteps(asArray(s.then), fn, `${p}.then`, { ...ctx });
      asArray(s.elseIf).forEach((b: any, bi: number) => {
        walkSteps(asArray(b?.then), fn, `${p}.elseIf[${bi}].then`, { ...ctx });
      });
      walkSteps(asArray(s.else), fn, `${p}.else`, { ...ctx });
    }

    // Iterators
    if (s?.type === "FOR_EACH_TARGET") {
      walkSteps(asArray(s.do), fn, `${p}.do`, { ...ctx, inForEach: true });
    }

    // Other steps that contain nested steps (extend here as you add more)
    if (s?.type === "OPPONENT_SAVE") {
      walkSteps(asArray(s.onFail), fn, `${p}.onFail`, { ...ctx });
      walkSteps(asArray(s.onSuccess), fn, `${p}.onSuccess`, { ...ctx });
    }

    if (s?.type === "REGISTER_INTERRUPTS") {
      walkSteps(asArray(s.onInterrupt), fn, `${p}.onInterrupt`, { ...ctx });
    }

    if (s?.type === "PROPERTY_CONTEST") {
      walkSteps(asArray(s.onWin), fn, `${p}.onWin`, { ...ctx });
      walkSteps(asArray(s.onLose), fn, `${p}.onLose`, { ...ctx });
    }
  });
}

export function validateCard(card: CardEntity): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isObj(card)) {
    return [issue("ERROR", "CARD_TYPE", "Card must be a JSON object.")];
  }

  // ---- schemaVersion ----
  const v = (card as any).schemaVersion;
  if (!SUPPORTED_CARD_SCHEMA_VERSIONS.includes(v)) {
    issues.push(
      issue(
        "ERROR",
        "SCHEMA_VERSION",
        `schemaVersion must be one of: ${SUPPORTED_CARD_SCHEMA_VERSIONS.join(", ")}.`,
        "schemaVersion"
      )
    );
  }

  // ---- required fields ----
  if (typeof (card as any).id !== "string" || !(card as any).id.trim()) {
    issues.push(issue("ERROR", "CARD_ID", "Card id is required.", "id"));
  }
  if (typeof (card as any).name !== "string") {
    issues.push(issue("ERROR", "CARD_NAME", "Card name must be a string.", "name"));
  }
  if (typeof (card as any).type !== "string") {
    issues.push(issue("ERROR", "CARD_TYPE_FIELD", "Card type must be a string.", "type"));
  }

  const components = asArray((card as any).components);
  if (!components.length) {
    issues.push(issue("WARN", "NO_COMPONENTS", "Card has no components (no rules/abilities).", "components"));
  }

  // ---- ability checks ----
  components.forEach((c: any, ci: number) => {
    if (c?.componentType !== "ABILITY") return;

    const base = `components[${ci}]`;

    // targeting profile id uniqueness
    const profiles = asArray(c.targetingProfiles);
    const seen = new Set<string>();
    profiles.forEach((p: any, pi: number) => {
      const pid = String(p?.id ?? "");
      if (!pid.trim()) {
        issues.push(issue("ERROR", "PROFILE_ID", "targetingProfiles[].id is required.", `${base}.targetingProfiles[${pi}].id`));
      } else if (seen.has(pid)) {
        issues.push(issue("ERROR", "PROFILE_ID_DUP", `Duplicate targeting profile id: "${pid}".`, `${base}.targetingProfiles[${pi}].id`));
      } else {
        seen.add(pid);
      }
    });

    const steps = asArray(c.execution?.steps);
    if (!steps.length) {
      issues.push(issue("WARN", "NO_STEPS", "Ability has no execution steps.", `${base}.execution.steps`));
      return;
    }

    const knownTargetSets = new Set<string>();
    walkSteps(
      steps,
      (s, path, ctx) => {
        if (!s || typeof s !== "object") {
          issues.push(issue("ERROR", "STEP_TYPE", "Step must be an object.", path));
          return;
        }
        if (typeof s.type !== "string" || !s.type.trim()) {
          issues.push(issue("ERROR", "STEP_TYPE", "Step.type is required.", `${path}.type`));
          return;
        }

        // Unknown step types are allowed, but we flag them. Forge can coerce to UNKNOWN_STEP.
        if (!isStepTypeAllowed(s.type) && s.type !== "UNKNOWN_STEP") {
          issues.push(
            issue(
              "WARN",
              "STEP_UNKNOWN",
              `Unknown step type "${s.type}". Add it to blockRegistry.json (and validator) to enable editing.`,
              `${path}.type`
            )
          );
        }

        // SELECT_TARGETS profileId must exist
        if (s.type === "SELECT_TARGETS") {
          const profileId = String(s.profileId ?? "");
          if (!profileId.trim()) {
            issues.push(issue("ERROR", "SELECT_TARGETS_PROFILE", "SELECT_TARGETS.profileId is required.", `${path}.profileId`));
          } else if (!seen.has(profileId)) {
            issues.push(
              issue(
                "ERROR",
                "SELECT_TARGETS_PROFILE_MISSING",
                `SELECT_TARGETS.profileId "${profileId}" does not match any targetingProfiles[].id on this ability.`,
                `${path}.profileId`
              )
            );
          }

          if (typeof s.saveAs !== "string" || !s.saveAs.trim()) {
            issues.push(issue("ERROR", "SELECT_TARGETS_SAVEAS", "SELECT_TARGETS.saveAs is required.", `${path}.saveAs`));
          }
        }

        // FOR_EACH_TARGET must reference known target sets (best-effort single-pass)
        if (s.type === "FOR_EACH_TARGET") {
          const ref = String(s?.targetSet?.ref ?? "");
          if (!ref.trim()) {
            issues.push(issue("ERROR", "FOREACH_REF", "FOR_EACH_TARGET.targetSet.ref is required.", `${path}.targetSet.ref`));
          } else if (!ctx.knownTargetSets.has(ref)) {
            issues.push(
              issue(
                "WARN",
                "FOREACH_REF_UNKNOWN",
                `FOR_EACH_TARGET.targetSet.ref "${ref}" does not match any prior SELECT_TARGETS.saveAs in this ability (may still be valid if created in another branch).`,
                `${path}.targetSet.ref`
              )
            );
          }
        }

        // ITERATION_TARGET scoping (best-effort)
        const scanEntityRef = (x: any): boolean => {
          if (!x) return false;
          if (x?.type === "ITERATION_TARGET") return true;
          if (Array.isArray(x)) return x.some(scanEntityRef);
          if (typeof x === "object") return Object.values(x).some(scanEntityRef);
          return false;
        };
        if (scanEntityRef(s) && !ctx.inForEach) {
          issues.push(
            issue(
              "WARN",
              "ITERATION_TARGET_SCOPE",
              "ITERATION_TARGET used outside a FOR_EACH_TARGET context. This may break at runtime.",
              path
            )
          );
        }
      },
      `${base}.execution.steps`,
      { inForEach: false, knownTargetSets }
    );
  });

  return issues;
}
