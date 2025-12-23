export const SCHEMA_VERSION_UNSUPPORTED = "SCHEMA_VERSION_UNSUPPORTED" as const;

// Cards
export const CARD_LATEST_VERSION = "CJ-2.0" as const;
export const CARD_VERSION_1_0 = "CJ-1.0" as const;
export const CARD_VERSION_1_1 = "CJ-1.1" as const;
export const CARD_VERSION_1_2 = "CJ-1.2" as const;
export const CARD_IMPORT_VERSIONS = [CARD_VERSION_1_0, CARD_VERSION_1_1, CARD_VERSION_1_2] as const;
export const CARD_SUPPORTED_VERSIONS = [CARD_LATEST_VERSION, ...CARD_IMPORT_VERSIONS] as const;
export type CardSchemaVersion = (typeof CARD_SUPPORTED_VERSIONS)[number];

// Graphs
export const GRAPH_LATEST_VERSION = "CJ-GRAPH-2.0" as const;
export const GRAPH_VERSION_1_0 = "CJ-GRAPH-1.0" as const;
export const GRAPH_VERSION_1_1 = "CJ-GRAPH-1.1" as const;
export const GRAPH_IMPORT_VERSIONS = [GRAPH_VERSION_1_0, GRAPH_VERSION_1_1] as const;
export const GRAPH_SUPPORTED_VERSIONS = [GRAPH_LATEST_VERSION, ...GRAPH_IMPORT_VERSIONS] as const;
export type GraphSchemaVersion = (typeof GRAPH_SUPPORTED_VERSIONS)[number];

// Forge projects
export const FORGE_PROJECT_LATEST_SCHEMA_VERSION = "CJ-FORGE-PROJECT-2.0" as const;
export const FORGE_PROJECT_LATEST_PROJECT_VERSION = FORGE_PROJECT_LATEST_SCHEMA_VERSION;
export const FORGE_PROJECT_VERSION_1_0 = "CJ-FORGE-PROJECT-1.0" as const;
export const FORGE_PROJECT_IMPORT_SCHEMA_VERSIONS = [FORGE_PROJECT_VERSION_1_0] as const;
export const FORGE_PROJECT_SUPPORTED_SCHEMA_VERSIONS = [
  FORGE_PROJECT_LATEST_SCHEMA_VERSION,
  ...FORGE_PROJECT_IMPORT_SCHEMA_VERSIONS
] as const;
export type ForgeProjectSchemaVersion = (typeof FORGE_PROJECT_SUPPORTED_SCHEMA_VERSIONS)[number];

// Other schema versions
export const TOOLS_LATEST_VERSION = "CJ-TOOLS-1.0" as const;
export const TOOL_STORE_VERSION = TOOLS_LATEST_VERSION;
export const CATALOG_LATEST_VERSION = "CJ-CATALOG-1.0" as const;
export const DECK_LATEST_VERSION = "CJ-DECK-1.0" as const;
export const DECK_STORE_VERSION = "CJ-DECK-STORE-1.0" as const;
export const SCENARIO_LATEST_VERSION = "CJ-SCENARIO-1.0" as const;
export const SCENARIO_STORE_VERSION = "CJ-SCENARIO-STORE-1.0" as const;
export const ACTION_LIBRARY_LATEST_VERSION = "CJ-ACTION-LIB-1.0" as const;
export const ACTION_LIBRARY_IMPORT_VERSIONS = ["CJ-LIB-1.0"] as const;
export const CARD_LIBRARY_LATEST_VERSION = "CJ-CARD-LIB-1.0" as const;
export const CARD_LIBRARY_IMPORT_VERSIONS = ["CJ-LIB-1.0"] as const;
export const NODE_REGISTRY_VERSION = "CJ-NODEDEF-1.0" as const;

// Sets for validation
export const CARD_LATEST_VERSION_SET = new Set<string>([CARD_LATEST_VERSION]);
export const CARD_SUPPORTED_VERSION_SET = new Set<string>(CARD_SUPPORTED_VERSIONS);
export const GRAPH_LATEST_VERSION_SET = new Set<string>([GRAPH_LATEST_VERSION]);
export const GRAPH_SUPPORTED_VERSION_SET = new Set<string>(GRAPH_SUPPORTED_VERSIONS);
export const FORGE_PROJECT_LATEST_SCHEMA_VERSION_SET = new Set<string>([FORGE_PROJECT_LATEST_SCHEMA_VERSION]);
export const FORGE_PROJECT_SUPPORTED_SCHEMA_VERSION_SET = new Set<string>(FORGE_PROJECT_SUPPORTED_SCHEMA_VERSIONS);

export const DEPRECATED_IMPORT_VERSION_STRINGS = [
  ...CARD_IMPORT_VERSIONS,
  ...GRAPH_IMPORT_VERSIONS,
  ...FORGE_PROJECT_IMPORT_SCHEMA_VERSIONS
];

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
