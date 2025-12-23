/// <reference types="vitest" />

import { describe, expect, it } from "vitest";
import { blockRegistry } from "../src/lib/registry";
import { makeDefaultStep } from "../src/lib/stepFactory";
import { validateCard } from "../src/lib/schemas";
import type { CardEntity, Step } from "../src/lib/types";
import { CARD_LATEST_VERSION } from "../src/lib/versions";

function containsIterationTarget(node: any): boolean {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(containsIterationTarget);
  if (typeof node === "object") {
    if (node.type === "ITERATION_TARGET") return true;
    return Object.values(node).some(containsIterationTarget);
  }
  return false;
}

function buildCardForStep(stepType: string): CardEntity {
  const abilityProfiles = [{ id: "default", type: "SINGLE_TARGET", origin: "SOURCE" } as any];
  const selectTargets = makeDefaultStep("SELECT_TARGETS", { abilityProfiles: ["default"] });
  const mainStep = makeDefaultStep(stepType, { abilityProfiles: ["default"] });
  const steps: Step[] = [];

  if (stepType === "FOR_EACH_TARGET") {
    steps.push(selectTargets);
    steps.push(mainStep);
  } else if (containsIterationTarget(mainStep)) {
    const loop = makeDefaultStep("FOR_EACH_TARGET", { abilityProfiles: ["default"] }) as any;
    loop.do = [mainStep];
    steps.push(selectTargets);
    steps.push(loop);
  } else {
    steps.push(mainStep);
  }

  return {
    schemaVersion: CARD_LATEST_VERSION,
    id: `card-${stepType}`,
    name: `Card for ${stepType}`,
    type: "UNIT",
    components: [
      {
        componentType: "ABILITY",
        name: `Ability for ${stepType}`,
        description: "",
        trigger: "ACTIVE_ACTION",
        cost: { ap: 1 },
        targetingProfiles: abilityProfiles,
        execution: { steps }
      }
    ]
  } as any;
}

describe("step coverage", () => {
  const stepTypes = (blockRegistry.steps?.types ?? []) as string[];

  it("can instantiate and validate every registry step", () => {
    for (const stepType of stepTypes) {
      const card = buildCardForStep(stepType);
      const issues = validateCard(card);
      const errors = issues.filter((i) => i.severity === "ERROR");
      const unknownStepErrors = errors.filter((i) => i.code === "UNKNOWN_STEP_TYPE");
      expect(unknownStepErrors).toHaveLength(0);
      expect(errors).toHaveLength(0);
    }
  });
});
