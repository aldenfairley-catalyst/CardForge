import { z } from "zod";

export type CatalogFaction = { id: string; name: string; abbr: string };
export type Catalog = {
  version: "CAT-1.0";
  factions: CatalogFaction[];
  unitTypes: string[];
  attributes: string[];
};

export const CatalogZ = z.object({
  version: z.literal("CAT-1.0"),
  factions: z.array(z.object({ id: z.string(), name: z.string(), abbr: z.string() })),
  unitTypes: z.array(z.string()),
  attributes: z.array(z.string())
});

export const DEFAULT_CATALOG: Catalog = {
  version: "CAT-1.0",
  factions: [
    { id: "CASTILE", name: "The Castile", abbr: "CAS" },
    { id: "RED_FANG", name: "Red Fang Pirates", abbr: "RFP" },
    { id: "KEEPERS", name: "The Keepers", abbr: "KPR" },
    { id: "UNALIGNED", name: "Unaligned", abbr: "UNA" }
  ],
  unitTypes: [
    "BEAST","UNDEAD","HUMAN","JAWA","GHOST","SPECTRAL","ELEMENTAL","CONSTRUCT","MACHINE","DRAGON",
    "PIRATE","SOLDIER","MAGE","SPIRIT","PLANT","AQUATIC","INSECTOID","REPTILIAN","AVIAN","GIANT"
  ],
  attributes: ["EARTH","FIRE","AIR","WATER","WOOD","STEEL","LIGHT","DARK","ICE","LIGHTNING","POISON","ARCANE"]
};

export function normalizeList(xs: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of xs ?? []) {
    const s = String(raw).trim();
    if (!s) continue;
    const u = s.toUpperCase();
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function normalizeCatalog(cat: any): Catalog {
  const parsed = CatalogZ.safeParse(cat);
  const base: Catalog = parsed.success ? parsed.data : DEFAULT_CATALOG;

  const factions = (base.factions ?? [])
    .map((f) => ({
      id: String(f.id).trim().toUpperCase(),
      name: String(f.name).trim(),
      abbr: String(f.abbr).trim().toUpperCase().slice(0, 4)
    }))
    .filter((f) => f.id && f.name && f.abbr)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    version: "CAT-1.0",
    factions,
    unitTypes: normalizeList(base.unitTypes ?? []).sort(),
    attributes: normalizeList(base.attributes ?? []).sort()
  };
}
