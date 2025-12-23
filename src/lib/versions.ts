export const SCHEMA_VERSION_UNSUPPORTED = "SCHEMA_VERSION_UNSUPPORTED" as const;

export const CARD_LATEST_VERSION = "CJ-2.0" as const;
export const CARD_IMPORT_VERSIONS = ["CJ-1.0", "CJ-1.1", "CJ-1.2"] as const;
export const CARD_SUPPORTED_VERSIONS = [CARD_LATEST_VERSION, ...CARD_IMPORT_VERSIONS] as const;
export type CardSchemaVersion = (typeof CARD_SUPPORTED_VERSIONS)[number];

export const GRAPH_LATEST_VERSION = "CJ-GRAPH-2.0" as const;
export const GRAPH_IMPORT_VERSIONS = ["CJ-GRAPH-1.0", "CJ-GRAPH-1.1"] as const;
export const GRAPH_SUPPORTED_VERSIONS = [GRAPH_LATEST_VERSION, ...GRAPH_IMPORT_VERSIONS] as const;
export type GraphSchemaVersion = (typeof GRAPH_SUPPORTED_VERSIONS)[number];

export const FORGE_PROJECT_LATEST_SCHEMA_VERSION = "CJ-FORGE-PROJECT-2.0" as const;
export const FORGE_PROJECT_LATEST_PROJECT_VERSION = FORGE_PROJECT_LATEST_SCHEMA_VERSION;
export const FORGE_PROJECT_IMPORT_SCHEMA_VERSIONS = ["CJ-FORGE-PROJECT-1.0"] as const;
export const FORGE_PROJECT_SUPPORTED_SCHEMA_VERSIONS = [
  FORGE_PROJECT_LATEST_SCHEMA_VERSION,
  ...FORGE_PROJECT_IMPORT_SCHEMA_VERSIONS
] as const;
export type ForgeProjectSchemaVersion = (typeof FORGE_PROJECT_SUPPORTED_SCHEMA_VERSIONS)[number];

export const TOOLS_LATEST_VERSION = "CJ-TOOLS-1.0" as const;
export const DECK_LATEST_VERSION = "CJ-DECK-1.0" as const;
export const SCENARIO_LATEST_VERSION = "CJ-SCENARIO-1.0" as const;

export const CARD_LATEST_VERSION_SET = new Set<string>([CARD_LATEST_VERSION]);
export const CARD_SUPPORTED_VERSION_SET = new Set<string>(CARD_SUPPORTED_VERSIONS);
export const GRAPH_LATEST_VERSION_SET = new Set<string>([GRAPH_LATEST_VERSION]);
export const GRAPH_SUPPORTED_VERSION_SET = new Set<string>(GRAPH_SUPPORTED_VERSIONS);
export const FORGE_PROJECT_LATEST_SCHEMA_VERSION_SET = new Set<string>([FORGE_PROJECT_LATEST_SCHEMA_VERSION]);
export const FORGE_PROJECT_SUPPORTED_SCHEMA_VERSION_SET = new Set<string>(FORGE_PROJECT_SUPPORTED_SCHEMA_VERSIONS);

export function isSupportedCardVersion(value: string): value is CardSchemaVersion {
  return CARD_SUPPORTED_VERSION_SET.has(value);
}

export function isLatestCardVersion(value: string): value is typeof CARD_LATEST_VERSION {
  return value === CARD_LATEST_VERSION;
}

export function isSupportedGraphVersion(value: string): value is GraphSchemaVersion {
  return GRAPH_SUPPORTED_VERSION_SET.has(value);
}

export function isLatestGraphVersion(value: string): value is typeof GRAPH_LATEST_VERSION {
  return value === GRAPH_LATEST_VERSION;
}

export function isSupportedForgeProjectSchemaVersion(value: string): value is ForgeProjectSchemaVersion {
  return FORGE_PROJECT_SUPPORTED_SCHEMA_VERSION_SET.has(value);
}

export function isLatestForgeProjectSchemaVersion(value: string): value is typeof FORGE_PROJECT_LATEST_SCHEMA_VERSION {
  return value === FORGE_PROJECT_LATEST_SCHEMA_VERSION;
}
