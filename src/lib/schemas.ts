import type { CardEntity, AbilityComponent, Step, TargetingProfile } from "./types";

export type ValidationIssue = {
  severity: "ERROR" | "WARN" | "INFO";
  code: string;
  message: string;
  path?: string;
};

function issue(severity: ValidationIssue["severity"], code: string, message: string, path?: string): ValidationIssue {
  return { severity, code, message, path };
}

function isAbility(c: any): c is AbilityComponent {
  return c && c.componentType === "ABILITY";
}

function stepWalk(steps: Step[], fn: (s: Step, path: string) => void, basePath: string) {
  steps.forEach((s, i) => {
    const p = `${basePath}[${i}]`;
    fn(s, p);
    if (s.type === "IF_ELSE") {
      stepWalk(s.then ?? [], fn, `${p}.then`);
      (s.elseIf ?? []).forEach((b, j) => stepWalk(b.then ?? [], fn, `${p}.elseIf[${j}].then`));
      stepWalk(s.else ?? [], fn, `${p}.else`);
    }
    if (s.type === "OPPONENT_SAVE") {
      stepWalk(s.onFail ?? [], fn, `${p}.onFail`);
      stepWalk(s.onSuccess ?? [], fn, `${p}.onSuccess`);
    }
    if (s.type === "FOR_EACH_TARGET") {
      stepWalk(s.do ?? [], fn, `${p}.do`);
    }
    if (s.type === "PROPERTY_CONTEST") {
      stepWalk(s.onWin ?? [], fn, `${p}.onWin`);
      stepWalk(s.onLose ?? [], fn, `${p}.onLose`);
    }
    if (s.type === "REGISTER_INTERRUPTS") {
      stepWalk(s.onInterrupt ?? [], fn, `${p}.onInterrupt`);
    }
  });
}

function collectTargetProfileIds(profiles: TargetingProfile[] | undefined) {
  const ids = new Set<string>();
  const dupes: string[] = [];
  for (const p of profiles ?? []) {
    if (!p?.id) continue;
    if (ids.has(p.id)) dupes.push(p.id);
    ids.add(p.id);
  }
  return { ids, dupes };
}

function validateSteps(
  steps: Step[],
  path: string,
  profileIds: Set<string>,
  out: ValidationIssue[]
) {
  // track FOR_EACH_TARGET nesting for ITERATION_TARGET enforcement
  const forEachStack: number[] = [];

  const enter = (s: Step) => {
    if (s.type === "FOR_EACH_TARGET") forEachStack.push(1);
  };
  const exit = (s: Step) => {
    if (s.type === "FOR_EACH_TARGET") forEachStack.pop();
  };

  stepWalk(
    steps,
    (s, p) => {
      enter(s);

      // validate SELECT_TARGETS.profileId exists
      if (s.type === "SELECT_TARGETS") {
        if (!profileIds.has(s.profileId)) {
          out.push(issue("ERROR", "TARGET_PROFILE_MISSING", `SELECT_TARGETS.profileId '${s.profileId}' not found`, `${p}.profileId`));
        }
        if (!s.saveAs || !s.saveAs.trim()) {
          out.push(issue("ERROR", "SELECT_TARGETS_SAVEAS", "SELECT_TARGETS.saveAs is required", `${p}.saveAs`));
        }
      }

      // validate FOR_EACH_TARGET.targetSet.ref exists
      if (s.type === "FOR_EACH_TARGET") {
        if (!s.targetSet?.ref) out.push(issue("ERROR", "FOREACH_REF", "FOR_EACH_TARGET.targetSet.ref is required", `${p}.targetSet.ref`));
      }

      // validate ITERATION_TARGET only inside FOR_EACH_TARGET
      const usesIterationTarget = JSON.stringify(s).includes("\"type\":\"ITERATION_TARGET\"");
      if (usesIterationTarget && forEachStack.length === 0) {
        out.push(issue("ERROR", "ITERATION_TARGET_SCOPE", "ITERATION_TARGET can only be used inside FOR_EACH_TARGET", p));
      }

      // PROPERTY_CONTEST sanity
      if (s.type === "PROPERTY_CONTEST") {
        if (!s.onWin?.length) out.push(issue("WARN", "CONTEST_ONWIN_EMPTY", "PROPERTY_CONTEST.onWin is empty", `${p}.onWin`));
        if (!s.onLose?.length) out.push(issue("WARN", "CONTEST_ONLOSE_EMPTY", "PROPERTY_CONTEST.onLose is empty", `${p}.onLose`));
      }

      // AI request sanity
      if (s.type === "AI_REQUEST") {
        if (!s.systemPrompt?.trim()) out.push(issue("ERROR", "AI_SYSTEM_PROMPT", "AI_REQUEST.systemPrompt required", `${p}.systemPrompt`));
        if (!s.userPrompt?.trim()) out.push(issue("ERROR", "AI_USER_PROMPT", "AI_REQUEST.userPrompt required", `${p}.userPrompt`));
      }

      exit(s);
    },
    path
  );
}

export function validateCard(card: CardEntity): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  if (!card) return [issue("ERROR", "NO_CARD", "Card is null/undefined")];

  if (card.schemaVersion !== "CJ-1.0" && card.schemaVersion !== "CJ-1.1") {
    out.push(issue("ERROR", "SCHEMA_VERSION", "schemaVersion must be CJ-1.0 or CJ-1.1", "schemaVersion"));
  }
  if (!card.id || !card.id.trim()) out.push(issue("ERROR", "ID_REQUIRED", "id is required", "id"));
  if (!card.name || !card.name.trim()) out.push(issue("ERROR", "NAME_REQUIRED", "name is required", "name"));
  if (!card.type) out.push(issue("ERROR", "TYPE_REQUIRED", "type is required", "type"));

  const abilities = (card.components ?? []).filter(isAbility);

  if (abilities.length === 0) {
    out.push(issue("WARN", "NO_ABILITIES", "No ABILITY components found. Add at least one ability.", "components"));
    return out;
  }

  abilities.forEach((a, idx) => {
    const basePath = `components[${idx}]`;

    // target profile uniqueness
    const { ids, dupes } = collectTargetProfileIds(a.targetingProfiles);
    dupes.forEach((d) => out.push(issue("ERROR", "DUP_TARGET_PROFILE", `Duplicate targetingProfiles id '${d}'`, `${basePath}.targetingProfiles`)));

    // validate steps
    validateSteps(a.execution?.steps ?? [], `${basePath}.execution.steps`, ids, out);
  });

  return out.length ? out : [issue("INFO", "OK", "No issues found.")];
}
