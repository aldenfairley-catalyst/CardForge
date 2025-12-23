# Deprecation File-by-File Checklist

This table enumerates tracked files and what to check/remove when deprecating old schemas/graph info.

**Use:** Apply changes incrementally and run validation after each batch.


## Validation loop
```bash
npm run typecheck
npm test
npm run build
```


## File checklist

| File                                        | Category        | Action                                                               | What to check / cross-check                                                    |
|:--------------------------------------------|:----------------|:---------------------------------------------------------------------|:-------------------------------------------------------------------------------|
| .github/workflows/pages.yml                 | CI              | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; CI gate: typecheck/test/build                |
| .gitignore                                  | Other           | Search for deprecated versions/legacy imports; remove if unused      | Manual review                                                                  |
| .npmrc                                      | Other           | Search for deprecated versions/legacy imports; remove if unused      | Manual review                                                                  |
| A2_EXECUTION.md                             | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| AGENT_API_IMPLEMENTATION_GUIDE.md           | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| AGENT_GRAPH_REBUILD_GUIDE.md                | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| AGENT_LOCAL_IMPLEMENTATION_GUIDE.md         | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| AGENT_PHASE_A1_DETAILED_IMPLEMENTATION.md   | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| AGENT_TECH_IMPLEMENTATION_INSTRUCTIONS.md   | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| AGENT_UPDATE_PLAYBOOK.md                    | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| AI_ACTION_STEPS.md                          | Docs            | Update to latest + add version header                                | rg for deprecated schema strings                                               |
| AI_DIRECTORY_GUIDE.md                       | Docs            | Update to latest + add version header                                | rg for deprecated schema strings                                               |
| AI_JSON_GUIDE.md                            | Docs            | Update to latest + add version header                                | rg for deprecated schema strings                                               |
| AI_PLAY_GUIDE.md                            | Docs            | Update to latest + add version header                                | rg for deprecated schema strings                                               |
| AI_SYMBOLS_WEBHOOKS.md                      | Docs            | Update to latest + add version header                                | rg for deprecated schema strings                                               |
| AI_VARIABLES.md                             | Docs            | Update to latest + add version header                                | rg for deprecated schema strings                                               |
| API_SPEC.md                                 | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| CJ_GRAPH_SPEC.md                            | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| DATABASE_AND_API_UPDATES_SPEC.md            | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| DIRECTORY_STRUCTURE.md                      | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| LOCAL_RUN_SPEC.md                           | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| PAGES_AND_COMPONENTS.md                     | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| PHASE_A2_CONFIG_EDITOR.md                   | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| PHASE_A3_TYPED_CONNECTIONS.md               | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| README.md                                   | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| RELEASE_NOTES.md                            | Docs            | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| REPO_AUDIT_AGENT_PLAYBOOK.md                | Docs            | Keep (process)                                                       | rg for deprecated schema strings                                               |
| REPO_AUDIT_REPORT.md                        | Docs            | Keep (process)                                                       | rg for deprecated schema strings                                               |
| audit_files.txt                             | Other           | Search for deprecated versions/legacy imports; remove if unused      | Manual review                                                                  |
| index.html                                  | Other           | Search for deprecated versions/legacy imports; remove if unused      | Manual review                                                                  |
| package-lock.json                           | Other           | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| package.json                                | Other           | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| server/.npmrc                               | Server          | Keep; update API; ensure schema version checks use versions.ts       | API smoke test (token) + schema validation                                     |
| server/package-lock.json                    | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/package.json                         | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/src/db.ts                            | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/src/index.ts                         | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/src/migrate.ts                       | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/src/routes/ai.ts                     | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/src/routes/assets.ts                 | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/src/routes/cards.ts                  | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/src/routes/catalogs.ts               | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/src/routes/decks.ts                  | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/src/routes/library.ts                | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/src/routes/project.ts                | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/src/routes/scenarios.ts              | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| server/tsconfig.json                        | Server          | Keep; update API; ensure schema version checks use versions.ts       | rg for deprecated schema strings; API smoke test (token) + schema validation   |
| src/App.tsx                                 | App UI          | Update to latest-only internally; keep migrations at import boundary | rg for deprecated schema strings                                               |
| src/assets/blockRegistry.json               | Registry/Assets | Make single source-of-truth; remove legacy variants; add leak gates  | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/assets/compileMap.json                  | Registry/Assets | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/assets/graphSchema.json                 | Registry/Assets | Make single source-of-truth; remove legacy variants; add leak gates  | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/assets/nodeRegistry.json                | Registry/Assets | Make single source-of-truth; remove legacy variants; add leak gates  | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/components/CardPreview.tsx              | Shared UI       | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/components/ConditionEditor.tsx          | Shared UI       | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/components/EntityRefEditor.tsx          | Shared UI       | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/components/ExpressionEditor.tsx         | Shared UI       | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/components/GraphNode.tsx                | Shared UI       | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/components/HexTargetPicker.tsx          | Shared UI       | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/components/NestedStepsEditor.tsx        | Shared UI       | Either delete OR wire as fallback (explicit)                         | rg for deprecated schema strings                                               |
| src/components/NodeConfigFields.tsx         | Shared UI       | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/components/NodeConfigForm.tsx           | Shared UI       | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/components/Toast.tsx                    | Shared UI       | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/data/catalog.default.json               | App UI          | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/features/decks/DeckBuilder.tsx          | Feature UI      | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; verify entry point + roundtrip export/import |
| src/features/library/CardLibraryManager.tsx | Feature UI      | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; verify entry point + roundtrip export/import |
| src/features/scenarios/ScenarioBuilder.tsx  | Feature UI      | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; verify entry point + roundtrip export/import |
| src/jsx.d.ts                                | App UI          | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/lib/aiImage.ts                          | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/catalog.ts                          | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/dataProvider.ts                     | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/deckStore.ts                        | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/deckTypes.ts                        | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/graph.ts                            | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/graphIR/adapters.ts                 | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/graphIR/compiler.ts                 | Core Lib        | Update to latest-only internally; keep migrations at import boundary | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/graphIR/cycle.ts                    | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/graphIR/edgeRules.ts                | Core Lib        | Update to latest-only internally; keep migrations at import boundary | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/graphIR/edgeUtils.ts                | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/graphIR/graphSchema.ts              | Core Lib        | Update to latest-only internally; keep migrations at import boundary | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/graphIR/reconcile.ts                | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/graphIR/types.ts                    | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/graphIR/validateGraph.ts            | Core Lib        | Update to latest-only internally; keep migrations at import boundary | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/history.ts                          | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/libraryStore.ts                     | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/migrations.ts                       | Core Lib        | Update to latest-only internally; keep migrations at import boundary | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/nodes/configSchema.ts               | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/nodes/registry.ts                   | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/providers/browserProvider.ts        | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/providers/localApiProvider.ts       | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/registry.ts                         | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/repository.ts                       | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/scenarioStore.ts                    | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/scenarioTypes.ts                    | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/schemas.ts                          | Core Lib        | Update to latest-only internally; keep migrations at import boundary | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/stepFactory.ts                      | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/storage.ts                          | Core Lib        | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/lib/types.ts                            | Core Lib        | Update to latest-only internally; keep migrations at import boundary | rg for deprecated schema strings; cross-check registry↔types↔schemas↔compiler  |
| src/main.tsx                                | App UI          | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/styles.css                              | App UI          | Search for deprecated versions/legacy imports; remove if unused      | Manual review                                                                  |
| src/types/external-stubs.d.ts               | App UI          | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| src/vite-client.d.ts                        | App UI          | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| tests/edgeRules.spec.ts                     | Tests           | Update/add deprecation gates + migration fixtures                    | rg for deprecated schema strings; ensure leak gates + migration tests pass     |
| tests/graphCompile.spec.ts                  | Tests           | Update/add deprecation gates + migration fixtures                    | rg for deprecated schema strings; ensure leak gates + migration tests pass     |
| tests/graphIR.spec.ts                       | Tests           | Update/add deprecation gates + migration fixtures                    | rg for deprecated schema strings; ensure leak gates + migration tests pass     |
| tests/graphPinsReconcile.spec.ts            | Tests           | Update/add deprecation gates + migration fixtures                    | rg for deprecated schema strings; ensure leak gates + migration tests pass     |
| tests/registry.spec.ts                      | Tests           | Update/add deprecation gates + migration fixtures                    | rg for deprecated schema strings; ensure leak gates + migration tests pass     |
| tests/schema.spec.ts                        | Tests           | Update/add deprecation gates + migration fixtures                    | rg for deprecated schema strings; ensure leak gates + migration tests pass     |
| tests/stepCoverage.spec.ts                  | Tests           | Update/add deprecation gates + migration fixtures                    | rg for deprecated schema strings; ensure leak gates + migration tests pass     |
| tsconfig.json                               | Other           | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| vite.config.ts                              | Other           | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |
| vitest.config.ts                            | Other           | Search for deprecated versions/legacy imports; remove if unused      | rg for deprecated schema strings                                               |


## Appendix: Cross-check recipes (when unsure)

### 1) Registry ↔ Types ↔ Schemas ↔ Compiler alignment
If you add/rename/remove a step/node:
1) `src/assets/blockRegistry.json` (step exists)
2) `src/lib/types.ts` (Step union includes it)
3) `src/lib/schemas.ts` (validation accepts it)
4) `src/lib/stepFactory.ts` (defaults exist if UI uses it)
5) `src/assets/nodeRegistry.json` (node exists if graph-authorable)
6) `src/lib/graphIR/compiler.ts` (compiler can emit Step)
7) `tests/*` (coverage + leak gates)

### 2) Import/export roundtrip (mandatory)
- Import CJ-1.x sample → migrate → validate latest → export → reimport (no migration needed)

### 3) Safe-to-delete check
```bash
npx madge --ts-config ./tsconfig.json --circular ./src
npx ts-prune -p tsconfig.json
rg -n '<FileOrSymbolName>' src server tests
```
Delete only if no inbound references and UI doesn’t depend on it.
