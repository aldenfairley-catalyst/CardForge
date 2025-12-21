/// <reference types="vitest" />

import { describe, expect, it } from "vitest";
import { makeDefaultCard } from "../src/lib/graph";
import { validateCard } from "../src/lib/schemas";
import { LATEST_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from "../src/lib/migrations";

describe("schema validation", () => {
  it("passes default card without errors", () => {
    const issues = validateCard(makeDefaultCard());
    expect(issues.filter((i) => i.severity === "ERROR")).toHaveLength(0);
  });

  it("accepts supported schema versions", () => {
    for (const version of SUPPORTED_SCHEMA_VERSIONS) {
      const card = { ...makeDefaultCard(), schemaVersion: version };
      const issues = validateCard(card);
      expect(issues.filter((i) => i.severity === "ERROR")).toHaveLength(0);
    }
  });

  it("rejects invalid schema versions", () => {
    const invalidVersions = ["CJ-0.0", "banana", "CJ-9.9"];
    for (const version of invalidVersions) {
      const card = { ...makeDefaultCard(), schemaVersion: version };
      const issues = validateCard(card);
      const schemaErrors = issues.filter((i) => i.code === "SCHEMA_VERSION" && i.severity === "ERROR");
      expect(schemaErrors.length).toBeGreaterThan(0);
    }
  });
});
