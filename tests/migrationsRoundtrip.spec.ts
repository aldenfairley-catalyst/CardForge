import { describe, expect, it } from "vitest";
import { migrateCard } from "../src/lib/migrations";
import { validateLatestCard } from "../src/lib/schemas";
import { makeDefaultCard } from "../src/lib/graph";
import { CARD_LATEST_VERSION, CARD_VERSION_1_0, SCHEMA_VERSION_UNSUPPORTED } from "../src/lib/versions";

describe("migration roundtrip gate", () => {
  it("migrates legacy card to latest and validates", () => {
    const legacyCard = {
      schemaVersion: CARD_VERSION_1_0,
      id: "legacy-card",
      name: "Legacy",
      type: "UNIT",
      components: []
    };
    const migrated = migrateCard(legacyCard);
    expect(migrated.schemaVersion).toBe(CARD_LATEST_VERSION);
    const issues = validateLatestCard(migrated);
    const errors = issues.filter((i) => i.severity === "ERROR");
    expect(errors.length).toBe(0);
  });

  it("rejects unknown schema versions", () => {
    expect(() =>
      migrateCard({
        ...makeDefaultCard(),
        schemaVersion: "CJ-9.9"
      })
    ).toThrowError(SCHEMA_VERSION_UNSUPPORTED);
  });
});
