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
import type { Catalog } from "../catalog";
import { defaultLibrary, type ActionLibrary } from "../repository";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "/api";

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as T;
}

function withQuery(base: string, params: Record<string, string | undefined>) {
  const url = new URL(base, window.location.origin);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.pathname + url.search;
}

const cardProvider: CardProvider = {
  async list(params) {
    const url = withQuery(`${API_BASE}/cards`, {
      search: params?.search,
      type: params?.type,
      faction: params?.faction
    });
    const data = await api<{ cards: CardSummary[] }>(url);
    return data.cards;
  },
  async get(id: string) {
    const data = await api<{ json: CardEntity }>(`${API_BASE}/cards/${id}`);
    return data.json ?? null;
  },
  async upsert(card: CardEntity) {
    await api(`${API_BASE}/cards/${card.id ?? ""}`, {
      method: card.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card.id ? card : { card })
    });
    return card;
  },
  async remove(id: string) {
    await api(`${API_BASE}/cards/${id}`, { method: "DELETE" });
  }
};

const deckProvider: DeckProvider = {
  async list(params) {
    const url = withQuery(`${API_BASE}/decks`, { search: params?.search, faction: params?.faction });
    const data = await api<{ decks: DeckSummary[] }>(url);
    return data.decks;
  },
  async get(id: string) {
    const data = await api<{ json: DeckDefinition }>(`${API_BASE}/decks/${id}`);
    return data.json ?? null;
  },
  async upsert(deck: DeckDefinition) {
    await api(`${API_BASE}/decks/${deck.id ?? ""}`, {
      method: deck.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deck.id ? deck : { deck })
    });
    return deck;
  },
  async remove(id: string) {
    await api(`${API_BASE}/decks/${id}`, { method: "DELETE" });
  }
};

const scenarioProvider: ScenarioProvider = {
  async list(params) {
    const url = withQuery(`${API_BASE}/scenarios`, { search: params?.search });
    const data = await api<{ scenarios: ScenarioSummary[] }>(url);
    return data.scenarios.map((s) => ({
      ...s,
      mode: s.mode ?? "ASSISTED_PHYSICAL",
      players: s.players ?? 2
    }));
  },
  async get(id: string) {
    const data = await api<{ json: ScenarioDefinition }>(`${API_BASE}/scenarios/${id}`);
    return data.json ?? null;
  },
  async upsert(scenario: ScenarioDefinition) {
    await api(`${API_BASE}/scenarios/${scenario.id ?? ""}`, {
      method: scenario.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenario.id ? scenario : { scenario })
    });
    return scenario;
  },
  async remove(id: string) {
    await api(`${API_BASE}/scenarios/${id}`, { method: "DELETE" });
  }
};

const assetProvider: AssetProvider = {
  async uploadFromDataUrl(dataUrl: string): Promise<AssetUploadResult> {
    const data = await api<AssetUploadResult>(`${API_BASE}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl })
    });
    return data;
  },
  async delete(id: string) {
    await api(`${API_BASE}/assets/${id}`, { method: "DELETE" });
  }
};

const catalogProvider: CatalogProvider = {
  async load(): Promise<Catalog> {
    const res = await api<{ namespace: string; entries: { key: string; value: unknown }[] }>(`${API_BASE}/catalogs/catalogs`);
    const catalog: any = {};
    res.entries.forEach((e) => (catalog[e.key] = e.value));
    return catalog as Catalog;
  },
  async save(catalog: Catalog) {
    const entries = Object.entries(catalog);
    await Promise.all(
      entries.map(([key, value]) =>
        api(`${API_BASE}/catalogs/catalogs/${encodeURIComponent(key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value })
        })
      )
    );
  }
};

const libraryProvider: LibraryProvider = {
  async load(): Promise<ActionLibrary> {
    const data = await api<{ entries: { json: ActionLibrary }[] }>(`${API_BASE}/library`);
    // Legacy shape: combine into single library if available
    const first = data.entries[0]?.json;
    return (first as ActionLibrary) ?? defaultLibrary();
  },
  async save(library: ActionLibrary) {
    await api(`${API_BASE}/library/${library.name ?? "library"}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry: { id: library.name ?? "library", json: library, name: library.name ?? "library", kind: "LIBRARY" } })
    });
  }
};

export const localApiProvider: DataProvider = {
  kind: "local-api",
  cards: cardProvider,
  decks: deckProvider,
  scenarios: scenarioProvider,
  assets: assetProvider,
  catalogs: catalogProvider,
  library: libraryProvider
};
