import type { CardEntity } from "./types";

const CARD_LIBRARY_KEY = "CJ_CARD_LIBRARY_V1";
const LEGACY_CARD_LIBRARY_KEY = "CJ_LIBRARY_V1";

export const CARD_LIBRARY_VERSION = "CJ-CARD-LIB-1.0" as const;

export type CardLibrary = {
  schemaVersion: typeof CARD_LIBRARY_VERSION;
  cards: CardEntity[];
};

function normalizeCardLibrary(parsed: any): CardLibrary {
  if (Array.isArray(parsed?.cards)) return { schemaVersion: CARD_LIBRARY_VERSION, cards: parsed.cards };
  if (Array.isArray(parsed)) return { schemaVersion: CARD_LIBRARY_VERSION, cards: parsed };
  if (parsed?.schemaVersion === "CJ-LIB-1.0" && Array.isArray(parsed.cards))
    return { schemaVersion: CARD_LIBRARY_VERSION, cards: parsed.cards };
  if (parsed?.schemaVersion === CARD_LIBRARY_VERSION && Array.isArray(parsed.cards))
    return { schemaVersion: CARD_LIBRARY_VERSION, cards: parsed.cards };
  throw new Error("Unrecognized library JSON. Expected {cards:[...]} or an array.");
}

export function loadLibrary(): CardLibrary {
  const raw = localStorage.getItem(CARD_LIBRARY_KEY) ?? localStorage.getItem(LEGACY_CARD_LIBRARY_KEY);
  if (!raw) return { schemaVersion: CARD_LIBRARY_VERSION, cards: [] };
  try {
    return normalizeCardLibrary(JSON.parse(raw));
  } catch {
    return { schemaVersion: CARD_LIBRARY_VERSION, cards: [] };
  }
}

export function saveLibrary(lib: CardLibrary) {
  const normalized = normalizeCardLibrary(lib);
  localStorage.setItem(CARD_LIBRARY_KEY, JSON.stringify(normalized));
}

export function upsertCardInLibrary(card: CardEntity) {
  const lib = loadLibrary();
  const idx = lib.cards.findIndex((c) => c.id === card.id);
  const cards = lib.cards.slice();
  if (idx >= 0) cards[idx] = card;
  else cards.push(card);
  saveLibrary({ ...lib, cards });
}

export function removeCardFromLibrary(cardId: string) {
  const lib = loadLibrary();
  saveLibrary({ ...lib, cards: lib.cards.filter((c) => c.id !== cardId) });
}

export function importLibraryJson(jsonText: string): CardLibrary {
  return normalizeCardLibrary(JSON.parse(jsonText));
}
