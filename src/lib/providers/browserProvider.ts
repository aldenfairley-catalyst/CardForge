import { v4 as uuidv4 } from "uuid";
import type {
  AssetProvider,
  AssetUploadResult,
  CardProvider,
  CardSummary,
  CatalogProvider,
  DataProvider,
  DeckProvider,
  DeckSummary,
  LibraryProvider,
  ScenarioProvider,
  ScenarioSummary
} from "../dataProvider";
import type { CardEntity } from "../types";
import type { DeckDefinition } from "../deckTypes";
import type { ScenarioDefinition } from "../scenarioTypes";
import { loadLibrary as loadCardLibrary, upsertCardInLibrary, removeCardFromLibrary } from "../libraryStore";
import { loadDeckStore, upsertDeck, removeDeck } from "../deckStore";
import { loadScenarioStore, upsertScenario, removeScenario } from "../scenarioStore";
import { loadCatalog, saveCatalog } from "../storage";
import { loadLibrary as loadActionLibrary, saveLibrary as saveActionLibrary, type ActionLibrary } from "../repository";

const ASSET_KEY = "CJ_ASSETS_V1";

type AssetStore = Record<string, string>;

function loadAssetStore(): AssetStore {
  try {
    const raw = localStorage.getItem(ASSET_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as AssetStore;
    return {};
  } catch {
    return {};
  }
}

function saveAssetStore(store: AssetStore) {
  localStorage.setItem(ASSET_KEY, JSON.stringify(store));
}

const cardProvider: CardProvider = {
  async list() {
    const lib = loadCardLibrary();
    return lib.cards.map<CardSummary>((c) => ({ ...c }));
  },
  async get(id: string) {
    const lib = loadCardLibrary();
    return lib.cards.find((c) => c.id === id) ?? null;
  },
  async upsert(card: CardEntity) {
    upsertCardInLibrary(card);
    return card;
  },
  async remove(id: string) {
    removeCardFromLibrary(id);
  }
};

const deckProvider: DeckProvider = {
  async list() {
    const store = loadDeckStore();
    return store.decks.map<DeckSummary>((d) => ({ id: d.id, name: d.name, faction: d.faction }));
  },
  async get(id: string) {
    const store = loadDeckStore();
    return store.decks.find((d) => d.id === id) ?? null;
  },
  async upsert(deck: DeckDefinition) {
    upsertDeck(deck);
    return deck;
  },
  async remove(id: string) {
    removeDeck(id);
  }
};

const scenarioProvider: ScenarioProvider = {
  async list() {
    const store = loadScenarioStore();
    return store.scenarios.map<ScenarioSummary>((s) => ({ id: s.id, name: s.name, mode: s.mode, players: s.players }));
  },
  async get(id: string) {
    const store = loadScenarioStore();
    return store.scenarios.find((s) => s.id === id) ?? null;
  },
  async upsert(scenario: ScenarioDefinition) {
    upsertScenario(scenario);
    return scenario;
  },
  async remove(id: string) {
    removeScenario(id);
  }
};

const assetProvider: AssetProvider = {
  async uploadFromDataUrl(dataUrl: string): Promise<AssetUploadResult> {
    const store = loadAssetStore();
    const assetId = uuidv4();
    store[assetId] = dataUrl;
    saveAssetStore(store);
    return { assetId, url: dataUrl };
  },
  async delete(id: string) {
    const store = loadAssetStore();
    if (store[id]) {
      delete store[id];
      saveAssetStore(store);
    }
  }
};

const catalogProvider: CatalogProvider = {
  async load() {
    return loadCatalog();
  },
  async save(catalog) {
    saveCatalog(catalog);
  }
};

const libraryProvider: LibraryProvider = {
  async load(): Promise<ActionLibrary> {
    return loadActionLibrary();
  },
  async save(library: ActionLibrary) {
    saveActionLibrary(library);
  }
};

export const browserProvider: DataProvider = {
  kind: "browser",
  cards: cardProvider,
  decks: deckProvider,
  scenarios: scenarioProvider,
  assets: assetProvider,
  catalogs: catalogProvider,
  library: libraryProvider
};
