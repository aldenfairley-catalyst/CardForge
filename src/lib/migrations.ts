import type { CardEntity } from "./types";
import { CARD_LATEST_VERSION, CARD_SUPPORTED_VERSIONS, SCHEMA_VERSION_UNSUPPORTED } from "./versions";

export const LATEST_SCHEMA_VERSION = CARD_LATEST_VERSION;
export const SUPPORTED_SCHEMA_VERSIONS = CARD_SUPPORTED_VERSIONS;

function isObj(x: any) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function ensurePresentation(card: any) {
  if (!isObj(card.presentation)) card.presentation = {};
  if (!card.presentation.imagePosition) card.presentation.imagePosition = "center center";
  return card;
}

function migrate_1_0_to_1_1(card: any): CardEntity {
  card.schemaVersion = "CJ-1.1";
  ensurePresentation(card);

  for (const comp of card.components ?? []) {
    if (comp?.componentType !== "ABILITY") continue;
    const t = comp.targeting;
    if (!isObj(t)) continue;

    if (isObj(t.range)) {
      const r = t.range;
      if (typeof r.base === "number" && typeof r.max !== "number") r.max = r.base;
      if (typeof r.min !== "number") r.min = 0;
    }
  }

  return card as CardEntity;
}

function migrate_1_1_to_1_2(card: any): CardEntity {
  card.schemaVersion = "CJ-1.2";
  return ensurePresentation(card) as CardEntity;
}

function finalizeLatest(card: any): CardEntity {
  card.schemaVersion = CARD_LATEST_VERSION;
  return ensurePresentation(card) as CardEntity;
}

export function migrateCard(raw: any): CardEntity {
  const incoming = raw?.projectVersion === "FORGE-1.0" ? raw.card : raw;
  if (!incoming || typeof incoming !== "object") throw new Error("Invalid card JSON.");

  const v = String(incoming.schemaVersion ?? "");
  if (v === CARD_LATEST_VERSION) return finalizeLatest({ ...incoming });
  if (v === "CJ-1.2") return finalizeLatest(migrate_1_1_to_1_2({ ...incoming }));
  if (v === "CJ-1.1") return finalizeLatest(migrate_1_1_to_1_2({ ...incoming }));
  if (v === "CJ-1.0") return finalizeLatest(migrate_1_1_to_1_2(migrate_1_0_to_1_1({ ...incoming })));

  const err = new Error(`${SCHEMA_VERSION_UNSUPPORTED}: ${v}`);
  (err as any).code = SCHEMA_VERSION_UNSUPPORTED;
  throw err;
}
