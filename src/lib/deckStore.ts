import type { DeckDefinition } from "./deckTypes";

const KEY = "CJ_DECKS_V1";

export type DeckStore = {
  schemaVersion: "CJ-DECK-STORE-1.0";
  decks: DeckDefinition[];
};

export function loadDeckStore(): DeckStore {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { schemaVersion: "CJ-DECK-STORE-1.0", decks: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== "CJ-DECK-STORE-1.0") return { schemaVersion: "CJ-DECK-STORE-1.0", decks: [] };
    return parsed as DeckStore;
  } catch {
    return { schemaVersion: "CJ-DECK-STORE-1.0", decks: [] };
  }
}

export function saveDeckStore(store: DeckStore) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function upsertDeck(deck: DeckDefinition) {
  const store = loadDeckStore();
  const idx = store.decks.findIndex((d) => d.id === deck.id);
  const decks = store.decks.slice();
  if (idx >= 0) decks[idx] = deck;
  else decks.push(deck);
  saveDeckStore({ ...store, decks });
}

export function removeDeck(deckId: string) {
  const store = loadDeckStore();
  saveDeckStore({ ...store, decks: store.decks.filter((d) => d.id !== deckId) });
}

export function importDecksJson(text: string): DeckDefinition[] {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.decks)) return parsed.decks;
  if (parsed?.schemaVersion === "CJ-DECK-1.0") return [parsed];
  throw new Error("Unrecognized deck JSON. Expected a deck, array, or {decks:[...]}.");
}
