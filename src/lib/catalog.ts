/**
 * src/lib/catalog.ts
 * Lightweight catalog for factions, templates, and unit registry.
 *
 * Stored in localStorage so builder UIs can provide dropdowns + relationships.
 * Deck/Scenario builder can reference this in the future.
 */

export type CatalogSchemaVersion = "CJ-CATALOG-1.0";

export type FactionDef = {
  id: string;            // stable id, e.g. "EMERALD_TIDE"
  name: string;          // display label
  symbolUrl?: string;    // optional icon path/URL
  templateId?: string;   // optional default card template
};

export type TemplateDef = {
  id: string;            // stable id
  name: string;
  // Future-proof: template fields are free-form; renderer decides what it understands.
  data?: Record<string, any>;
};

export type UnitDef = {
  id: string;            // stable id, e.g. "THE_FISHERMAN"
  name: string;
  factionId?: string;
  cardId?: string;       // links to a UNIT card id
};

export type Catalog = {
  schemaVersion: CatalogSchemaVersion;
  factions: FactionDef[];
  templates: TemplateDef[];
  units: UnitDef[];
};

const LS_KEY = "CJ_CATALOG";
const BASE_CATALOG: Catalog = { schemaVersion: "CJ-CATALOG-1.0", factions: [], templates: [], units: [] };

export const DEFAULT_CATALOG: Catalog = BASE_CATALOG;

export function defaultCatalog(): Catalog {
  return normalizeCatalog(BASE_CATALOG);
}

export function normalizeCatalog(raw: unknown): Catalog {
  if (!raw || typeof raw !== "object") return normalizeCatalog(BASE_CATALOG);
  const parsed = raw as Partial<Catalog>;
  return {
    schemaVersion: "CJ-CATALOG-1.0",
    factions: Array.isArray(parsed.factions) ? parsed.factions.slice() : [],
    templates: Array.isArray(parsed.templates) ? parsed.templates.slice() : [],
    units: Array.isArray(parsed.units) ? parsed.units.slice() : []
  };
}

export function loadCatalog(): Catalog {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultCatalog();
    return normalizeCatalog(JSON.parse(raw));
  } catch {
    return defaultCatalog();
  }
}

export function saveCatalog(cat: Catalog) {
  localStorage.setItem(LS_KEY, JSON.stringify(cat));
}

// Upsert helpers
export function upsertFaction(cat: Catalog, f: FactionDef): Catalog {
  const id = f.id.trim();
  if (!id) return cat;
  const next = { ...cat, factions: cat.factions.slice() };
  const idx = next.factions.findIndex((x) => x.id === id);
  if (idx >= 0) next.factions[idx] = { ...next.factions[idx], ...f, id };
  else next.factions.push({ ...f, id });
  return next;
}

export function deleteFaction(cat: Catalog, factionId: string): Catalog {
  return { ...cat, factions: cat.factions.filter((f) => f.id !== factionId) };
}

export function upsertUnit(cat: Catalog, u: UnitDef): Catalog {
  const id = u.id.trim();
  if (!id) return cat;
  const next = { ...cat, units: cat.units.slice() };
  const idx = next.units.findIndex((x) => x.id === id);
  if (idx >= 0) next.units[idx] = { ...next.units[idx], ...u, id };
  else next.units.push({ ...u, id });
  return next;
}

export function deleteUnit(cat: Catalog, unitId: string): Catalog {
  return { ...cat, units: cat.units.filter((u) => u.id !== unitId) };
}

export function upsertTemplate(cat: Catalog, t: TemplateDef): Catalog {
  const id = t.id.trim();
  if (!id) return cat;
  const next = { ...cat, templates: cat.templates.slice() };
  const idx = next.templates.findIndex((x) => x.id === id);
  if (idx >= 0) next.templates[idx] = { ...next.templates[idx], ...t, id };
  else next.templates.push({ ...t, id });
  return next;
}

export function deleteTemplate(cat: Catalog, templateId: string): Catalog {
  return { ...cat, templates: cat.templates.filter((t) => t.id !== templateId) };
}
