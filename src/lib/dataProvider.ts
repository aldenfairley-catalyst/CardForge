import type { CardEntity } from "./types";
import type { DeckDefinition } from "./deckTypes";
import type { ScenarioDefinition } from "./scenarioTypes";
import type { Catalog } from "./catalog";
import type { ActionLibrary } from "./repository";

export type CardSummary = Pick<CardEntity, "id" | "name" | "type" | "faction" | "subType" | "tags"> & {
  updatedAt?: number;
};

export type DeckSummary = Pick<DeckDefinition, "id" | "name" | "faction"> & { updatedAt?: number };

export type ScenarioSummary = Pick<ScenarioDefinition, "id" | "name" | "mode" | "players"> & { updatedAt?: number };

export interface CardProvider {
  list(params?: { search?: string; type?: string; faction?: string }): Promise<CardSummary[]>;
  get(id: string): Promise<CardEntity | null>;
  upsert(card: CardEntity): Promise<CardEntity>;
  remove(id: string): Promise<void>;
}

export interface DeckProvider {
  list(params?: { search?: string; faction?: string }): Promise<DeckSummary[]>;
  get(id: string): Promise<DeckDefinition | null>;
  upsert(deck: DeckDefinition): Promise<DeckDefinition>;
  remove(id: string): Promise<void>;
}

export interface ScenarioProvider {
  list(params?: { search?: string }): Promise<ScenarioSummary[]>;
  get(id: string): Promise<ScenarioDefinition | null>;
  upsert(scenario: ScenarioDefinition): Promise<ScenarioDefinition>;
  remove(id: string): Promise<void>;
}

export interface AssetUploadResult {
  assetId: string;
  url: string;
}

export interface AssetProvider {
  uploadFromDataUrl(dataUrl: string): Promise<AssetUploadResult>;
  delete(id: string): Promise<void>;
}

export interface CatalogProvider {
  load(): Promise<Catalog>;
  save(catalog: Catalog): Promise<void>;
}

export interface LibraryProvider {
  load(): Promise<ActionLibrary>;
  save(library: ActionLibrary): Promise<void>;
}

export interface DataProvider {
  kind: "browser" | "local-api";
  cards: CardProvider;
  decks: DeckProvider;
  scenarios: ScenarioProvider;
  assets: AssetProvider;
  catalogs: CatalogProvider;
  library: LibraryProvider;
}
