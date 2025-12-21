/// <reference types="vitest" />

import { describe, expect, it } from "vitest";
import { blockRegistry, getStepGroups } from "../src/lib/registry";

const registry: any = blockRegistry;

function expectUnique(values: string[], label: string) {
  const list = Array.isArray(values) ? values : [];
  const set = new Set(list);
  expect(set.size).toBe(
    list.length,
    `${label} should not contain duplicates. Duplicate entries: ${list.filter((v, i) => list.indexOf(v) !== i).join(", ")}`
  );
}

describe("blockRegistry integrity", () => {
  const stepTypes = (registry.steps?.types ?? []) as string[];
  const stepSet = new Set(stepTypes);

  it("has unique step types", () => {
    expectUnique(stepTypes, "steps.types");
  });

  it("has valid group members", () => {
    const groups = getStepGroups();
    for (const group of groups) {
      for (const t of group.types) {
        expect(stepSet.has(t)).toBe(true);
      }
    }
  });

  it("ensures enums are unique", () => {
    const keys = registry.keys ?? {};
    const enumNames = ["TokenKey", "DistanceMetric", "ZoneKey", "DamageType", "StatusKey", "LoSMode", "LoSBlockPolicy"];
    for (const name of enumNames) {
      if (Array.isArray(keys[name])) {
        expectUnique(keys[name], `keys.${name}`);
      }
    }
  });

  it("ensures uiFlows are unique and referenced flows are present", () => {
    const flows = (registry.uiFlows?.types ?? []) as string[];
    expectUnique(flows, "uiFlows.types");
    const flowSet = new Set(flows);

    const expectedFlows = new Set<string>();
    if (stepSet.has("PROPERTY_CONTEST")) expectedFlows.add("PROPERTY_CONTEST");

    for (const flow of expectedFlows) {
      expect(flowSet.has(flow)).toBe(true);
    }
  });
});
