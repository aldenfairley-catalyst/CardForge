import { DEFAULT_CATALOG, normalizeCatalog, type Catalog } from "./catalog";
import { migrateCard } from "./migrations";

const CARD_KEY = "cj_forge_card_json_v1";
const CATALOG_KEY = "cj_forge_catalog_v1";

export function loadCardJson(): string | null {
  return localStorage.getItem(CARD_KEY);
}

export function saveCardJson(text: string) {
  localStorage.setItem(CARD_KEY, text);
}

export function clearSaved() {
  localStorage.removeItem(CARD_KEY);
}

export function loadCatalog(): Catalog {
  const raw = localStorage.getItem(CATALOG_KEY);
  if (!raw) return normalizeCatalog(DEFAULT_CATALOG);
  try {
    return normalizeCatalog(JSON.parse(raw));
  } catch {
    return normalizeCatalog(DEFAULT_CATALOG);
  }
}

export function saveCatalog(cat: Catalog) {
  localStorage.setItem(CATALOG_KEY, JSON.stringify(normalizeCatalog(cat)));
}

export function resetCatalog() {
  localStorage.setItem(CATALOG_KEY, JSON.stringify(normalizeCatalog(DEFAULT_CATALOG)));
}

// Helper: safe load + migrate card
export function loadMigratedCardOrDefault(makeDefaultCard: () => any) {
  const saved = loadCardJson();
  if (!saved) return makeDefaultCard();
  try {
    const parsed = JSON.parse(saved);
    return migrateCard(parsed);
  } catch {
    return makeDefaultCard();
  }
}
