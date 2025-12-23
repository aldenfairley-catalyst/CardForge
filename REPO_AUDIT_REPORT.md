# REPO_AUDIT_REPORT.md

## Executive summary
- Severity counts: P0=2 (install + typecheck blockers), P1=1 (graph/registry misalignment prevents authoring most step types), P2=3 (doc drift + duplicated libraries + unused provider layer), P3=3 (orphaned assets/components).
- Top risks:
  1. Dependency install blocked (403 from npm registry) prevents any build/test execution.
  2. `tsconfig` settings (`moduleResolution: NodeNext` with `module: ESNext`) fail `npm run typecheck` on TypeScript 5.6, breaking CI.
  3. Graph palette only defines SHOW_TEXT/IF/const nodes while block registry/types cover ~30 step types, so most abilities cannot be authored through the current graph UI; compiler silently falls back to prior steps.
  4. Two different "CJ-LIB-1.0" libraries (card library vs action library) coexist with different shapes, risking data clobbering and confusion.
  5. README claims CJ-1.0 import/export while code defaults to CJ-1.2, creating schema-version misunderstandings for users and API clients.

## Environment & build/CI failures
- Baseline: OS macOS (M1) per instructions; Node v22.21.0; npm v11.4.2.
- Commands:
  - `npm ci` → failed with 403 fetching packages (`@types/react`), preventing dependency installation (Appendix A1).
  - `npm run typecheck` → fails with TS5110: module must be `NodeNext` when `moduleResolution` is `NodeNext` (Appendix A2; `tsconfig.json` lines 3-4).
  - `npm test` → `vitest: not found` because install failed (Appendix A3).
  - `npm run build` → `vite: not found` because install failed (Appendix A4).
  - `npx madge`, `npx ts-prune`, `npx depcheck` → all blocked by npm 403, so import/unused-exports/dependency scans could not run (Appendix A5-A7).

## Repository inventory snapshot
- `git ls-files` captured in `audit_files.txt` (106 tracked files). Major areas: `src/` (app + graphs + registries), `server/` (Express + SQLite API), `tests/` (graph specs), root docs/specs, `src/assets/` registries/schemas, `src/lib/graphIR/` (graph compiler/validators).

## Table A — Domain System Map
| Domain | Source of Truth File(s) | Dependent Files | Duplicate/Alt Implementations | Drift Risk | Notes |
|---|---|---|---|---|---|
| Card model & schema validation | `src/lib/migrations.ts` (CJ-1.0→1.2), `src/lib/schemas.ts`, `src/lib/types.ts` | `src/App.tsx` (validate/migrate), `src/lib/storage.ts` | README schema claims (CJ-1.0) | Medium | Validation tied to block registry; docs lag schema version. |
| Ability logic model | `src/lib/types.ts` (Step union), `src/lib/stepFactory.ts` | `src/components/*` editors, `src/App.tsx` (graph → steps) | None | Medium | Step definitions outpace graph nodes. |
| Step registry/palette | `src/assets/blockRegistry.json`, `src/lib/registry.ts` | `src/lib/schemas.ts`, `src/components/NestedStepsEditor.tsx`, `src/App.tsx` (UNKNOWN recovery) | None | High | Registry lists ~30 step types; graph palette ignores most. |
| Graph/node registry/palette | `src/assets/nodeRegistry.json`, `src/lib/nodes/registry.ts` | `src/App.tsx`, `src/lib/graphIR/*`, `src/components/GraphNode.tsx` | None | High | Only EXEC_START/SHOW_TEXT/IF/const nodes defined. |
| Import/export formats | `src/lib/migrations.ts`, `src/lib/graphIR/graphSchema.ts`, `src/App.tsx` (export functions) | README/AI docs, tests | README CJ-1.0 claim | Medium | Card export defaults to CJ-1.2 while docs say CJ-1.0. |
| Storage (localStorage) | `src/lib/storage.ts`, `src/lib/libraryStore.ts`, `src/lib/deckStore.ts`, `src/lib/scenarioStore.ts`, `src/lib/repository.ts` | Feature UIs in `src/features/*`, `src/App.tsx` | Provider layer duplications | Medium | Multiple schemas share CJ-LIB-1.0 label. |
| Deck builder module | `src/features/decks/DeckBuilder.tsx`, `src/lib/deckTypes.ts`, `src/lib/deckStore.ts` | `src/lib/libraryStore.ts` (cards) | None | Low | Local-only storage. |
| Scenario builder module | `src/features/scenarios/ScenarioBuilder.tsx`, `src/lib/scenarioTypes.ts`, `src/lib/scenarioStore.ts` | `src/lib/libraryStore.ts`, `src/lib/deckStore.ts` | None | Medium | Shares storage patterns with decks. |
| Action library / repository | `src/lib/repository.ts` | `src/App.tsx` (Action Library modal) | `src/lib/libraryStore.ts` (card library) | High | Two incompatible CJ-LIB-1.0 shapes coexist. |
| Image handling | `src/lib/aiImage.ts`, AI modal in `src/App.tsx` | `src/App.tsx` AI image flow | None | Medium | Client helper expects proxy; direct calls present in App. |

## Table B — Conflict Matrix
| ID | Type | Symptom | Evidence | Root Cause | Impact | Severity | Suggested Fix |
|---|---|---|---|---|---|---|---|
| B1 | Build/CI | `npm ci` fails (403), tests/build unusable | Appendix A1 (npm 403) | Registry access blocked | CI cannot install deps or run tests/build | P0 | Use offline cache/alt registry or vendor `node_modules`; rerun `npm ci`. |
| B2 | Tooling/Schema | `npm run typecheck` fails (TS5110) | Appendix A2; `tsconfig.json` lines 3-4 (module ESNext + moduleResolution NodeNext) | TS 5.6 requires `module: NodeNext` when using `moduleResolution: NodeNext` | Typecheck script fails, blocking pipelines | P0 | Align tsconfig (set `module` to `NodeNext` or moduleResolution to `Bundler`). |
| B3 | Registry/UI | Graph palette supports only SHOW_TEXT/IF/const while blockRegistry/types allow ~30 step types; compiler only handles those nodes and falls back to previous steps | `src/assets/nodeRegistry.json` lines 19-114; `src/lib/graphIR/compiler.ts` lines 64-116; `src/App.tsx` lines 392-410 | Node registry not kept in sync with blockRegistry/types; compiler logic hardcodes only two node types | Designers cannot author most step types in graph UI; steps silently stick to last good version | P1 | Expand nodeRegistry + compiler mappings for all blockRegistry step types or re-enable step form editor. |

## Table C — Orphan Inventory
| ID | File/Symbol | Evidence | Why it’s orphaned | Risk of removal | Recommendation |
|---|---|---|---|---|---|
| O1 | `src/assets/compileMap.json` | `rg "compileMap"` only finds docs/audit list | Not imported by runtime/compiler | Low | Wire into compiler or delete to avoid drift. |
| O2 | `src/lib/dataProvider.ts`, `src/lib/providers/browserProvider.ts`, `src/lib/providers/localApiProvider.ts` | Only referenced by docs; no imports in app | Provider abstraction not used by UI | Medium | Decide on provider strategy; remove or integrate via context. |
| O3 | `src/components/NestedStepsEditor.tsx` | `rg "NestedStepsEditor"` shows no render usage | Legacy step form UI unused after graph shift | Medium | Remove or reintegrate as fallback for unsupported steps. |
| O4 | `canonicalToGraph` in `src/lib/graph.ts` | No callers besides docs (`rg "canonicalToGraph"`) | Old adapter unused by current graph flow | Low | Remove or migrate into graph import pipeline. |

## Table D — Incomplete Functionality
| ID | Feature | Expected Behavior | Current Behavior | Evidence | Blocker | Severity | Recommendation |
|---|---|---|---|---|---|---|---|
| I1 | Graph editor coverage of step types | Palette should expose all blockRegistry/types steps with compilation to canonical steps | Palette has only EXEC_START/SHOW_TEXT/IF/CONST nodes; compiler only emits SHOW_TEXT/IF; other steps impossible to author | `src/assets/blockRegistry.json` lines 4-107 vs `src/assets/nodeRegistry.json` lines 19-114; `src/lib/graphIR/compiler.ts` lines 64-116; `src/App.tsx` lines 392-410 | Missing node definitions and compiler mappings | P1 | Add node definitions + compiler handlers for remaining step types or provide non-graph editor. |
| I2 | Action/graph validation tooling | Madge/ts-prune/depcheck intended to flag orphans/cycles | All fail due to npm 403, leaving import graph/unused export status unknown | Appendix A5-A7 | Registry access failure | P2 | Re-run once registry access restored; commit reports. |

## Table E — Duplicated / Double-up Functionality
| ID | Function/Module Pair | Overlap Description | Divergence | Evidence | Risk | Severity | Proposed Consolidation |
|---|---|---|---|---|---|---|---|
| D1 | `ActionLibrary` (`src/lib/repository.ts`) vs `CardLibrary` (`src/lib/libraryStore.ts`) | Both labeled CJ-LIB-1.0 but store different shapes (abilities/steps vs cards) in localStorage | Different keys (`CJ_ACTION_LIBRARY` vs `CJ_LIBRARY_V1`) and data schemas; same version string | `src/lib/repository.ts` lines 3-38; `src/lib/libraryStore.ts` lines 3-19 | Developers may confuse schemas; docs ambiguous; future migration risk | P2 | Rename/version one schema (e.g., CJ-ACTION-LIB-1.0) and document separation. |
| D2 | Storage vs Provider abstractions | LocalStorage stores (cards/decks/scenarios/library) duplicated by provider layer | Providers unused; any future backend will diverge from local store logic | `src/lib/providers/*.ts`, `src/lib/storage.ts`, `src/lib/deckStore.ts`, `src/lib/scenarioStore.ts` | P2 | Choose single access layer (provider context) and route UI through it. |

## Table F — Doc Drift
| Doc File | Claim | Code Reality | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| README.md | Exports CJ-1.0 card JSON + FORGE-1.0 project JSON | Default card schema is CJ-1.2; migrateCard supports CJ-1.0/1.1→1.2 and App exports CJ-1.2 cards | README lines 22-24; `src/lib/migrations.ts` lines 3-49; `src/App.tsx` exportCard/exportProject lines 528-543 | Users/API clients expect CJ-1.0; version mismatch on import/export | Update README to CJ-1.2 + CJ-FORGE-PROJECT-1.0 support and note migration behavior. |

## Table G — Step/Registry/Schema Alignment (Critical)
| Type | In blockRegistry.json | In nodeRegistry.json | In types.ts | In schemas.ts | Has UI editor | Notes |
|---|---:|---:|---:|---:|---|
| SHOW_TEXT | ✅ | ✅ | ✅ | ✅ | Partial (graph) | Only SHOW_TEXT node defined. |
| IF_ELSE | ✅ | ✅ (IF node) | ✅ | ✅ | Partial (graph) | Only IF node; no other branches types. |
| ROLL_D6 | ✅ | ❌ | ✅ | ✅ | ❌ | No node; cannot author in graph. |
| ROLL_D20 | ✅ | ❌ | ✅ | ✅ | ❌ | Same. |
| SET_VARIABLE | ✅ | ❌ | ✅ | ✅ | ❌ | Missing node/editor. |
| OPPONENT_SAVE | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| SELECT_TARGETS | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| FOR_EACH_TARGET | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| DEAL_DAMAGE | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| HEAL | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| APPLY_STATUS | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| REMOVE_STATUS | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| OPEN_REACTION_WINDOW | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| MOVE_ENTITY | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| MOVE_WITH_PATH_CAPTURE | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| CALC_DISTANCE | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| DRAW_CARDS | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| MOVE_CARDS | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| SHUFFLE_ZONE | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| PUT_ON_TOP_ORDERED | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| END_TURN_IMMEDIATELY | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| EMPTY_HAND | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| ADD_CARDS_TO_DECK | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| REMOVE_CARDS_FROM_DECK | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| SWAP_DECK | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| SET_ENTITY_STATE | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| TOGGLE_ENTITY_STATE | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| CLEAR_ENTITY_STATE | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| FIND_ENTITIES | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| COUNT_ENTITIES | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| FILTER_TARGET_SET | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| SPAWN_ENTITY | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| DESPAWN_ENTITY | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| OPEN_UI_FLOW | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| REQUEST_PLAYER_CHOICE | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| REGISTER_INTERRUPTS | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| PROPERTY_CONTEST | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| WEBHOOK_CALL | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| EMIT_EVENT | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |
| AI_REQUEST | ✅ | ❌ | ✅ | ✅ | ❌ | Missing. |

## Recommendations & action list
- Quick wins (1–2 days):
  - Fix `tsconfig` module/moduleResolution mismatch so `npm run typecheck` passes once installs are available.
  - Update README to advertise CJ-1.2 card exports and CJ-FORGE-PROJECT-1.0 project exports.
  - Decide on library naming (Action vs Card) and version labels to avoid CJ-LIB-1.0 ambiguity.
- Medium refactors (1–2 weeks):
  - Expand `nodeRegistry.json` + graph compiler to cover blockRegistry step types, or reintroduce the step form editor (NestedStepsEditor) as a fallback for unsupported steps.
  - Consolidate storage through the provider abstraction or remove the unused provider layer to prevent divergence.
- Architectural moves:
  - Align block registry, node registry, and compiler mappings with a single source of truth; consider generating node definitions from block registry or a shared schema.
  - Restore automated tooling (madge/ts-prune/depcheck) once registry access is resolved to monitor cycles/orphans.

## Stop-the-line conflicts
- Install pipeline blocked (npm 403) and `npm run typecheck` fails due to tsconfig mismatch; CI is red until both are addressed.
- Graph editor cannot represent most step types listed in blockRegistry/types, so ability authoring is limited to SHOW_TEXT/IF and existing steps are frozen; expanding registry/compiler is required before adding new step types.

## Appendix
**A1 – npm ci**
```
npm error 403 403 Forbidden - GET https://registry.npmjs.org/@types%2freact
```

**A2 – npm run typecheck**
```
tsconfig.json(5,15): error TS5110: Option 'module' must be set to 'NodeNext' when option 'moduleResolution' is set to 'NodeNext'.
```

**A3 – npm test**
```
sh: 1: vitest: not found
```

**A4 – npm run build**
```
sh: 1: vite: not found
```

**A5 – npx madge**
```
npm error 403 403 Forbidden - GET https://registry.npmjs.org/madge
```

**A6 – npx ts-prune**
```
npm error 403 403 Forbidden - GET https://registry.npmjs.org/ts-prune
```

**A7 – npx depcheck**
```
npm error 403 403 Forbidden - GET https://registry.npmjs.org/depcheck
```
