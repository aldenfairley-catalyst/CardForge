import type { CardEntity } from "./types";

const KEY = "CJ_LIBRARY_V1";

export type CardLibrary = {
  schemaVersion: "CJ-LIB-1.0";
  cards: CardEntity[];
};

export function loadLibrary(): CardLibrary {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { schemaVersion: "CJ-LIB-1.0", cards: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== "CJ-LIB-1.0") return { schemaVersion: "CJ-LIB-1.0", cards: [] };
    return parsed as CardLibrary;
  } catch {
    return { schemaVersion: "CJ-LIB-1.0", cards: [] };
  }
}

export function saveLibrary(lib: CardLibrary) {
  localStorage.setItem(KEY, JSON.stringify(lib));
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
  const parsed = JSON.parse(jsonText);
  if (Array.isArray(parsed?.cards)) return { schemaVersion: "CJ-LIB-1.0", cards: parsed.cards };
  if (Array.isArray(parsed)) return { schemaVersion: "CJ-LIB-1.0", cards: parsed };
  throw new Error("Unrecognized library JSON. Expected {cards:[...]} or an array.");
}
