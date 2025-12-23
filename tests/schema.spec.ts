/// <reference types="vitest" />

import { describe, expect, it } from "vitest";
import { makeDefaultCard } from "../src/lib/graph";
import { validateImportCard, validateLatestCard } from "../src/lib/schemas";
import { CARD_SUPPORTED_VERSIONS, CARD_VERSION_1_1, SCHEMA_VERSION_UNSUPPORTED } from "../src/lib/versions";

describe("schema validation", () => {
  it("passes default card without errors", () => {
    const issues = validateLatestCard(makeDefaultCard());
    expect(issues.filter((i) => i.severity === "ERROR")).toHaveLength(0);
  });

  it("accepts supported schema versions", () => {
    for (const version of CARD_SUPPORTED_VERSIONS) {
      const card = { ...makeDefaultCard(), schemaVersion: version };
      const issues = validateImportCard(card);
      expect(issues.filter((i) => i.severity === "ERROR")).toHaveLength(0);
    }
  });

  it("rejects non-latest schema versions in strict mode", () => {
    const card = { ...makeDefaultCard(), schemaVersion: CARD_VERSION_1_1 };
    const issues = validateLatestCard(card);
    const schemaErrors = issues.filter((i) => i.code === "SCHEMA_VERSION_UNSUPPORTED" && i.severity === "ERROR");
    expect(schemaErrors.length).toBeGreaterThan(0);
  });

  it("rejects invalid schema versions", () => {
    const invalidVersions = ["CJ-0.0", "banana", "CJ-9.9"];
    for (const version of invalidVersions) {
      const card = { ...makeDefaultCard(), schemaVersion: version };
      const issues = validateImportCard(card);
      const schemaErrors = issues.filter(
        (i) => i.code === "SCHEMA_VERSION_UNSUPPORTED" && i.severity === "ERROR" && i.message.includes(SCHEMA_VERSION_UNSUPPORTED)
      );
      expect(schemaErrors.length).toBeGreaterThan(0);
    }
  });
});
