export type DeckCardEntry = {
  cardId: string;
  qty: number;
};

export type DeckDefinition = {
  schemaVersion: "CJ-DECK-1.0";
  id: string;
  name: string;
  faction?: string;
  description?: string;
  tags?: string[];
  notes?: string;
  cards: DeckCardEntry[];
};

export function makeDefaultDeck(): DeckDefinition {
  return {
    schemaVersion: "CJ-DECK-1.0",
    id: `deck.${cryptoRandomId()}`,
    name: "New Deck",
    faction: "",
    description: "",
    tags: [],
    notes: "",
    cards: []
  };
}

function cryptoRandomId() {
  try {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.from(a)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return Math.random().toString(16).slice(2);
  }
}
