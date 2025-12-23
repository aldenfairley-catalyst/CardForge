# REPO_AUDIT_REPORT.md

## Executive Summary
- Severity counts: **P0: 3 • P1: 1 • P2: 2 • P3: 1**
- Top risks
  1) CI gate is red: `npm run typecheck`, `npm test`, and `npm run build` all fail, blocking GitHub Actions and Pages publish.【f1a46f†L3-L15】【eb7829†L9-L35】【e82446†L3-L18】
  2) Graph palette/compiler only supports `SHOW_TEXT` and `IF_ELSE` while the block registry defines 30+ steps, so most abilities cannot be authored in the graph UI.【F:src/assets/blockRegistry.json†L4-L109】【F:src/assets/nodeRegistry.json†L20-L113】【F:src/lib/graphIR/compiler.ts†L60-L117】
  3) Deck Builder renders a `description` field that is absent from the deck schema, producing TS errors and risking data drift between UI and saved decks.【f1a46f†L11-L12】【F:src/lib/deckTypes.ts†L1-L20】【F:src/features/decks/DeckBuilder.tsx†L302-L305】
  4) Scenario JSON guidance describes a different shape than the runtime schema (top-level `sides`/`environment` vs nested `setup`), so AI/exported scenarios from the doc would fail validation/import.【F:AI_JSON_GUIDE.md†L179-L199】
  5) Duplicate-connection validation in the graph returns the wrong code/order, causing a deterministic unit-test failure and mis-signaling in the editor.【eb7829†L9-L35】【F:src/lib/graphIR/edgeRules.ts†L91-L120】
- Top recommended fixes (ordered)
  1) Fix CI pipeline: adjust React Flow typings/imports, align deck schema with UI fields, correct edgeRules data-type comparison, and re-run `npm run typecheck`/`npm test`.
  2) Remove unsupported `--cacheDir` flags from build/preview scripts or move the cacheDir into `vite.config.ts` so `npm run build` matches Vite 5 CLI expectations.
  3) Expand `nodeRegistry.json` + compiler to cover the full `blockRegistry` step set or reintroduce a fallback step editor so authors can create every registered step.
  4) Update Scenario JSON docs (AI guide) to match `scenarioTypes.ts` structure (`setup.sides`, `setup.env`, `triggers`, `victory`) and include sample that will validate.
  5) Decide whether decks should store a description; either add it to `deckTypes`/storage or remove it from the UI to resolve the schema/UX drift.

## CI Workflow Summary
- Workflow: `.github/workflows/pages.yml` runs on pushes/PRs; Node 20, `npm ci --no-audit --no-fund --foreground-scripts`, `npm run typecheck`, `npm test`, `npm run build`, then uploads `dist` to Pages for `main`.【77f114†L17-L83】
- Local reproductions (mirror CI steps):
  - `npm ci --no-audit --no-fund --foreground-scripts` **pass with warnings** (proxy config + better-sqlite3 rebuild).【19caeb†L1-L101】
  - `npm run typecheck` **fails**: React Flow type imports, deck description field, edgeRules data-type comparison, graph schema type guard.【f1a46f†L3-L15】
  - `npm test -- --reporter basic` **fails**: duplicate connection expected code (`TARGET_AT_MAX` vs `DUPLICATE`).【eb7829†L9-L35】
  - `npm run build` **fails**: Vite CLI rejects `--cacheDir` flag in script.【e82446†L3-L18】【e96f22†L9-L13】
- Vite base path is computed from `GITHUB_REPOSITORY`, so Pages will use `/<repo>/` when built in Actions; proxy targets `/api` to the local server port from env.【43e921†L4-L27】

## Repo Structure
- `src/` — SPA entry (`main.tsx`, `App.tsx`), shared `components/`, feature modules (`features/decks`, `features/library`, `features/scenarios`), registries/data under `lib/`, and assets/registries under `assets/`.
- `src/lib/` — schemas (`schemas.ts`), types (`types.ts`), migrations, graph IR (`graphIR/`), node registry helpers (`nodes/`), data providers, storage, repositories, deck/scenario types.
- `src/assets/` — `blockRegistry.json`, `nodeRegistry.json`, `graphSchema.json` (imported by runtime).
- `server/` — Express + SQLite API (cards, decks, scenarios, assets, catalogs, library, project) with TS build scripts.【F:server/src/index.ts†L1-L43】
- `tests/` — Vitest suites covering registries, graph compile/edge rules, schema validation, and step coverage.
- Root docs — AI JSON guides, API specs, phase guides, audit playbooks.

## Domain System Map

### Table A — Domain System Map
| Domain | Source of Truth File(s) | Dependent Files | Duplicate/Alt Implementations | Drift Risk | Notes |
|---|---|---|---|---|---|
| Card schema + validation | `src/lib/types.ts`, `src/lib/schemas.ts`, `src/lib/migrations.ts` | `src/App.tsx`, `src/lib/graph.ts`, tests (`schema.spec.ts`) | Docs (AI guides) | Medium | CJ-1.2 cards with migration from CJ-1.0/1.1.【F:src/lib/schemas.ts†L3-L150】 |
| Block registry (steps/triggers/keys) | `src/assets/blockRegistry.json`, `src/lib/registry.ts`, `src/lib/stepFactory.ts` | Validator (`schemas.ts`), step coverage test, legacy `NestedStepsEditor` | Node registry | High | Registry lists 30+ step types used for validation and defaults.【F:src/assets/blockRegistry.json†L4-L109】 |
| Node registry + graph compiler | `src/assets/nodeRegistry.json`, `src/lib/nodes/registry.ts`, `src/lib/graphIR/compiler.ts`, `src/lib/graphIR/validateGraph.ts` | Graph UI (`App.tsx`), graph tests, edge rules | Block registry | High | Palette contains only EXEC_START/SHOW_TEXT/IF + const nodes; compiler only emits SHOW_TEXT/IF_ELSE.【F:src/assets/nodeRegistry.json†L20-L113】【F:src/lib/graphIR/compiler.ts†L60-L117】 |
| Forge project schema (graph JSON) | `src/lib/graphIR/graphSchema.ts`, `src/assets/graphSchema.json` | App import/export, tests (`graphIR.spec.ts`) | — | Medium | Supports CJ-GRAPH-1.0/1.1; type error shows weak type guard.【F:src/lib/graphIR/graphSchema.ts†L1-L73】【f1a46f†L13-L15】 |
| Import/export pipeline | `src/App.tsx` export/import helpers, `src/lib/graph.ts`, `src/lib/migrations.ts` | Download buttons in UI | README/AI docs | Medium | Exports CJ-1.2 card + forge project bundle; imports migrate older cards.【F:src/App.tsx†L528-L542】 |
| Persistence providers | `src/lib/storage.ts`, `src/lib/deckStore.ts`, `src/lib/scenarioStore.ts`, `src/lib/providers/*` | Features (cards, decks, scenarios), App provider selector | `server/` API | Medium | Browser provider uses localStorage; local-api targets Express/SQLite backend. |
| Deck builder | `src/features/decks/DeckBuilder.tsx`, `src/lib/deckTypes.ts`, `src/lib/deckStore.ts` | App DECKS mode | — | High | UI collects `description`, but schema lacks it (typecheck failure).【F:src/lib/deckTypes.ts†L1-L20】【F:src/features/decks/DeckBuilder.tsx†L302-L305】 |
| Scenario builder | `src/features/scenarios/ScenarioBuilder.tsx`, `src/lib/scenarioTypes.ts` | App SCENARIOS mode | AI docs scenario section | Medium | Story beats edited via raw JSON; doc/schema mismatch.【F:src/features/scenarios/ScenarioBuilder.tsx†L473-L493】【F:src/lib/scenarioTypes.ts†L60-L93】 |
| Action/library system | `src/lib/repository.ts`, `src/features/library/CardLibraryManager.tsx` | App LIBRARY mode, providers | Card library store | Medium | Separate action library vs card library may confuse storage/UX. |
| AI / asset handling | AI modal + upload in `src/App.tsx`, providers | Card preview visuals | Server `/api/ai` | Medium | Direct provider calls require keys; proxy optional. |

## Findings

### Table B — Conflict Matrix
| ID | Type (CI/Schema/Registry/UI/Docs) | Symptom | Evidence | Root Cause | Functional Outcome Impact | Severity | Suggested Fix |
|---|---|---|---|---|---|---|---|
| B1 | CI/Typecheck/UI | `npm run typecheck` fails (React Flow types, deck description field, edgeRules data-type check, graph schema type guard). | Typecheck log.【f1a46f†L3-L15】 App imports `Node` type that React Flow package doesn’t export under Bundler resolution.【F:src/App.tsx†L2-L13】 Deck schema lacks `description` while UI writes it.【F:src/lib/deckTypes.ts†L1-L20】【F:src/features/decks/DeckBuilder.tsx†L302-L305】 | Typing drift between dependencies and app code; schema/UX mismatch for decks; loose type guard in graph schema. | Blocks CI, Pages deploy, and local builds; deck builder may persist fields that schema drops. | P0 | Update React Flow imports to the correct generic types, add/remove deck `description` consistently (schema + storage or UI), and tighten type guards in graph schema/edgeRules. |
| B2 | CI/Build | `npm run build` fails: Vite CLI rejects `--cacheDir` option. | Build log.【e82446†L3-L18】 Script uses unsupported flag.【e96f22†L9-L13】 | Vite 5 no longer accepts `--cacheDir` CLI flag. | Pages artifact never produced; build job fails. | P0 | Move cacheDir config into `vite.config.ts` (already set) and drop CLI flag from scripts (build/preview/dev). |
| B3 | CI/Test/Graph | Unit test failure: duplicate connection expected `DUPLICATE` but validator returns `TARGET_AT_MAX`. | Test log.【eb7829†L9-L35】 Edge rule checks max connections before duplicate detection.【F:src/lib/graphIR/edgeRules.ts†L91-L120】 | Validation order reports max-capacity even when duplicate edge already exists. | Graph editor gets misleading error codes; CI red. | P0 | Reorder duplicate check ahead of max-capacity logic or allow distinct codes per case; update tests accordingly. |
| B4 | Registry/UI/Compiler | Graph palette + compiler cover only SHOW_TEXT/IF_ELSE while block registry lists 30+ steps. | Registry vs node registry vs compiler.【F:src/assets/blockRegistry.json†L4-L109】【F:src/assets/nodeRegistry.json†L20-L113】【F:src/lib/graphIR/compiler.ts†L60-L117】 | Node registry not aligned to block registry; compiler has cases for only two node types. | Authors cannot create most step types; ability authoring/export blocked for combat/targeting/deck/spawn/integration steps. | P1 | Expand nodeRegistry + compiler coverage (consider generating nodes from blockRegistry) or reintroduce a fallback form editor. |
| B5 | Docs/Schema | AI scenario JSON sample uses `sides`/`environment` top-level, not `setup.sides/env` used by runtime schema. | AI guide sample.【F:AI_JSON_GUIDE.md†L179-L199】 Scenario schema definition.【F:src/lib/scenarioTypes.ts†L60-L93】 | Docs not updated after schema refactor to nested `setup`. | AI-generated or user-authored scenarios per docs will fail import/validation; scenario builder UX misaligned. | P2 | Update AI_JSON_GUIDE scenario section to match `scenarioTypes.ts` (setup.sides/env, triggers array, victory shape). |

### Table C — Orphan Inventory
| ID | File/Symbol | Evidence | Why orphaned | Risk of removal | Recommendation |
|---|---|---|---|---|---|
| O1 | `src/components/NestedStepsEditor.tsx` | Only referenced in its own file (no imports in app).【F:src/components/NestedStepsEditor.tsx†L1-L60】【8b502d†L1-L4】 | Legacy step form editor superseded by graph UI. | Medium (could serve as fallback for missing graph nodes). | Either reintegrate as fallback for unsupported steps or remove to reduce drift. |

### Table D — Incomplete Functionality
| ID | Feature | Expected | Current | Evidence | Blocker | Severity | Recommendation |
|---|---|---|---|---|---|---|---|
| I1 | Scenario story editor | Structured UI for story beats/media triggers | Raw JSON textarea noted as MVP placeholder. | Scenario builder story section.【F:src/features/scenarios/ScenarioBuilder.tsx†L473-L493】 | Lacks UX for media selection/validation. | P2 | Implement structured story beat editor (type-safe fields for slides/video/trigger refs). |

### Table E — Duplicated / Double-up Functionality
| ID | Pair | Overlap | Divergence | Evidence | Risk | Severity | Consolidation Plan |
|---|---|---|---|---|---|---|---|
| D1 | Card library vs Action library | Both manage reusable content in localStorage | Different schemas/keys and UI entry points; action library modal vs card library manager | README table and repository module.【F:src/App.tsx†L49-L66】【F:src/lib/repository.ts†L1-L110】 | User confusion; duplicated persistence paths. | P2 | Clarify naming and surface a single library entry point or merge schemas. |
| D2 | Browser vs local-api providers | Both persist cards/decks/scenarios | Browser uses localStorage; local-api targets Express/SQLite | Providers and server API.【F:src/lib/providers/browserProvider.ts†L1-L92】【F:src/lib/providers/localApiProvider.ts†L1-L125】【F:server/src/index.ts†L1-L43】 | Divergent data across devices; unclear source of truth. | P2 | Add sync strategy/toggle defaults; document provider expectations in UI. |

### Table F — Doc Drift
| Doc File | Claim | Code Reality | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| AI_JSON_GUIDE.md (Scenario section) | Scenario JSON uses top-level `sides`/`environment` fields | Runtime schema nests `setup: { sides, env }` and expects `triggers`, `victory` arrays accordingly | Doc sample vs schema.【F:AI_JSON_GUIDE.md†L179-L199】【F:src/lib/scenarioTypes.ts†L60-L93】 | AI or user following doc will produce invalid scenario JSON (import/validation failure). | Rewrite sample and field descriptions to match `scenarioTypes.ts`. |

### Table G — Step/Registry/Schema Alignment (Critical)
| Step Type | In blockRegistry | In Step union (types.ts) | In schemas.ts | Has UI editor | Has fallback editor | Has node def | Compiler supports | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| SHOW_TEXT | ✅ | ✅ | ✅ | Graph | ⚠️ (orphan form) | ✅ | ✅ | Only fully supported path. |
| IF_ELSE | ✅ | ✅ | ✅ | Graph | ⚠️ | ✅ | ✅ | ElseIf pins supported. |
| SELECT_TARGETS | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | Registry critical step missing from palette/editor. |
| FOR_EACH_TARGET | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | Loop + ITERATION_TARGET impossible to author in graph. |
| DEAL_DAMAGE / HEAL / APPLY_STATUS / REMOVE_STATUS | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | Combat pipeline steps registry-only. |
| MOVE_ENTITY / MOVE_WITH_PATH_CAPTURE | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | Movement absent from nodes. |
| DRAW_CARDS / MOVE_CARDS / SHUFFLE_ZONE / PUT_ON_TOP_ORDERED / EMPTY_HAND / ADD/REMOVE_CARDS / SWAP_DECK / END_TURN_IMMEDIATELY | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | Deck/zone management unavailable in graph UI. |
| SET/TOGGLE/CLEAR_ENTITY_STATE | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | Entity state authoring blocked. |
| FIND_ENTITIES / COUNT_ENTITIES / FILTER_TARGET_SET | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | Target queries missing. |
| OPEN_UI_FLOW / REQUEST_PLAYER_CHOICE / REGISTER_INTERRUPTS / PROPERTY_CONTEST | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | UI/subsystem steps only in registry. |
| WEBHOOK_CALL / EMIT_EVENT / AI_REQUEST | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | Integration steps not authorable in graph. |

### Table H — Functional Outcome Impact Map
| Outcome | What “done” looks like | Current blockers found | Evidence | Severity | Next action |
|---|---|---|---|---|---|
| CI builds + deploys to GitHub Pages | Actions workflow passes typecheck/test/build and uploads `dist` | Typecheck, tests, build all failing | Logs.【f1a46f†L3-L15】【eb7829†L9-L35】【e82446†L3-L18】 | P0 | Fix typings, deck schema drift, edgeRules order; drop `--cacheDir` from scripts; rerun CI. |
| Builder outcomes (create/edit abilities/steps) | Palette/editors allow every registry step and compile to steps | Node registry/compiler cover only SHOW_TEXT/IF_ELSE | Registry vs node vs compiler.【F:src/assets/blockRegistry.json†L4-L109】【F:src/assets/nodeRegistry.json†L20-L113】【F:src/lib/graphIR/compiler.ts†L60-L117】 | P1 | Generate nodes from registry or add fallback editor; extend compiler. |
| Deck builder loads, searches, validates | Deck schema matches UI fields; CI passes | UI uses `description` not in schema, causing TS failure | Typecheck + deck files.【f1a46f†L11-L12】【F:src/lib/deckTypes.ts†L1-L20】【F:src/features/decks/DeckBuilder.tsx†L302-L305】 | P0 | Add `description` to schema/storage or remove field from UI. |
| Scenario builder loads, defines triggers/story | Docs guide users to valid schema; UI supports story editing | AI guide shows wrong scenario shape; story editor is raw JSON | Doc + UI evidence.【F:AI_JSON_GUIDE.md†L179-L199】【F:src/features/scenarios/ScenarioBuilder.tsx†L473-L493】 | P2 | Update docs and add structured story UI. |
| Shared registries enable AI/validation | blockRegistry, nodeRegistry, types, validator stay aligned | Palette/compiler missing most registry steps | Alignment table | P1 | Auto-sync node registry + compiler from block registry. |

## Round-trip Verification
- Not executed: CI blockers (typecheck/test/build failures) prevent confident round-trip testing. Once CI is green, add minimal/maximal card/deck/scenario round-trip checks to ensure schema/registry/graph exports import cleanly.

## Appendix — Command Outputs
- `npm ci --no-audit --no-fund --foreground-scripts` (root + server postinstall): warnings about proxy config and better-sqlite3 rebuild, completed successfully.【19caeb†L1-L101】
- `npm run typecheck`: failed with React Flow/Deck/edgeRules/graphSchema errors.【f1a46f†L3-L15】
- `npm test -- --reporter basic`: failed duplicate-connection assertion; other suites passed.【eb7829†L9-L35】
- `npm run build`: failed because Vite CLI rejects `--cacheDir`.【e82446†L3-L18】
