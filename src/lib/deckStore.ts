import type { DeckDefinition } from "./deckTypes";
import { DECK_LATEST_VERSION, DECK_STORE_VERSION } from "./versions";

const KEY = "CJ_DECKS_V1";

export type DeckStore = {
  schemaVersion: typeof DECK_STORE_VERSION;
  decks: DeckDefinition[];
};

export function loadDeckStore(): DeckStore {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { schemaVersion: DECK_STORE_VERSION, decks: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== DECK_STORE_VERSION) return { schemaVersion: DECK_STORE_VERSION, decks: [] };
    return parsed as DeckStore;
  } catch {
    return { schemaVersion: DECK_STORE_VERSION, decks: [] };
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
  if (parsed?.schemaVersion === DECK_LATEST_VERSION) return [parsed];
  throw new Error("Unrecognized deck JSON. Expected a deck, array, or {decks:[...]}.");
}
