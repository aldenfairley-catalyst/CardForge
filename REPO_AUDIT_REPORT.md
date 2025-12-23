# REPO_AUDIT_REPORT.md

## 8.1 Executive summary
- P0: 1 • P1: 2 • P2: 3 • P3: 2
- Top risks:
  1. Build/tooling unusable: `npm ci` hangs and leaves no `.bin`, causing `typecheck`, `test`, and `build` to fail immediately.【F:README.md†L5-L16】
  2. Graph editor covers only 4 node types while the step registry defines 30+ steps, so most step types cannot be authored in the new graph UI and are never compiled.【F:src/assets/nodeRegistry.json†L1-L114】【F:src/lib/graphIR/compiler.ts†L60-L116】
  3. README claims CJ-1.0 import/export while the runtime emits CJ-1.2 cards and CJ-FORGE-1.0 projects, risking mismatched assets and validator failures.【F:README.md†L23-L25】【F:src/App.tsx†L528-L542】【F:src/lib/migrations.ts†L3-L49】
  4. Legacy step form editor (`NestedStepsEditor`) is unused; no fallback exists for step types missing from the graph palette, leaving them orphaned in UI despite registry presence.【F:src/components/NestedStepsEditor.tsx†L1-L218】【F:src/App.tsx†L1062-L1108】
  5. Client stores cards/decks/scenarios in localStorage while a SQLite/Express backend exists but is not wired, creating parallel storage systems and drift risk.【F:src/lib/storage.ts†L1-L37】【F:server/src/index.ts†L1-L43】

## 8.2 Build/CI failures
| Command | Result | Evidence |
|---|---|---|
| `npm ci` | Hung >1m, manual interrupt; emitted only warnings. Leaves project without `.bin` scripts. | See Appendix `npm_ci` (warnings + ^C) and missing `node_modules/.bin` implied by later failures. |
| `npm run typecheck` | Failed: missing type definition files for react, uuid, d3, babel, etc. | Appendix `npm_typecheck` shows TS2688 errors. |
| `npm test` | Failed: `vitest: not found` because `.bin` not created. | Appendix `npm_test`. |
| `npm run build` | Failed: `vite: not found`. | Appendix `npm_build`. |
| `npx madge ...` | Failed: npm 403 fetching madge (registry policy). | Appendix `madge_circular`, `madge_graph`. |
| `npx ts-prune -p tsconfig.json` | Failed: npm 403 fetching ts-prune. | Appendix `tsprune`. |
| `npx depcheck` | Failed: npm 403 fetching depcheck. | Appendix `depcheck`. |

## 8.3 System map (source-of-truth)
See Table A.

## 8.4 Findings tables
- Table A — Domain System Map
- Table B — Conflict Matrix
- Table C — Orphan Inventory
- Table D — Incomplete Functionality
- Table E — Duplicated / Double-up Functionality
- Table F — Doc Drift
- Table G — Step/Registry/Schema Alignment (Critical)
- Master Inventory Snapshot

### Table A — Domain System Map
| Domain | Source of Truth File(s) | Dependent Files | Duplicate/Alt Implementations | Drift Risk | Notes |
|---|---|---|---|---|---|
| Card model & schema validation | `src/lib/types.ts`, `src/lib/schemas.ts`, `src/lib/migrations.ts` | `src/App.tsx`, `src/lib/graph.ts`, tests in `tests/schema.spec.ts` | README import/export section (CJ-1.0) | Medium | Types/migrations target CJ-1.2 while docs still say CJ-1.0.【F:src/lib/migrations.ts†L3-L49】【F:README.md†L23-L25】 |
| Ability logic model | `src/lib/graphIR/compiler.ts`, `src/lib/graphIR/validateGraph.ts`, `src/lib/graphIR/edgeRules.ts` | `src/App.tsx` graph pipeline | Legacy `src/components/NestedStepsEditor.tsx` | High | Graph compiler supports only SHOW_TEXT/IF nodes; other steps lack graph coverage.【F:src/lib/graphIR/compiler.ts†L60-L116】 |
| Step registry/palette | `src/assets/blockRegistry.json`, `src/lib/registry.ts`, `src/lib/stepFactory.ts` | Tests (`tests/stepCoverage.spec.ts`), `src/lib/schemas.ts` | Node registry as alternate palette | High | Registry lists 30+ steps but graph palette exposes 4 node types.【F:src/assets/blockRegistry.json†L2-L108】【F:src/assets/nodeRegistry.json†L1-L114】 |
| Graph/node registry/palette | `src/assets/nodeRegistry.json`, `src/lib/nodes/registry.ts`, `src/lib/graphIR/types.ts` | `src/App.tsx` palette, graph compiler/validator | Step registry | High | Minimal node set diverges from step registry; graph export uses node set. |
| Import/export formats | `src/lib/migrations.ts`, `src/App.tsx` export/import logic, `src/lib/graphIR/graphSchema.ts` | File download helpers in `src/App.tsx` | README claims CJ-1.0 | Medium | Runtime emits CJ-1.2 cards + CJ-FORGE-1.0 projects; docs mismatch.【F:src/App.tsx†L528-L542】【F:README.md†L23-L25】 |
| Storage (localStorage vs SQLite) | `src/lib/storage.ts`, `src/lib/libraryStore.ts`, `src/lib/deckStore.ts`, `src/lib/scenarioStore.ts` | UI features for library/decks/scenarios | `server/src` SQLite API | High | Client uses localStorage only; backend exists but unused, causing parallel data sources.【F:src/lib/storage.ts†L1-L37】【F:server/src/index.ts†L1-L43】 |
| Deck builder module | `src/features/decks/DeckBuilder.tsx`, `src/lib/deckTypes.ts`, `src/lib/deckStore.ts` | `src/App.tsx` DECKS mode | None | Medium | Depends on local card library; no backend sync. |
| Scenario builder module | `src/features/scenarios/ScenarioBuilder.tsx`, `src/lib/scenarioTypes.ts`, `src/lib/scenarioStore.ts` | `src/App.tsx` SCENARIOS mode | None | Medium | Story editor still raw JSON; no backend sync. |
| Action library / repository system | `src/lib/repository.ts`, `src/App.tsx` library modal | `src/features/library/CardLibraryManager.tsx` uses different store | Medium | Two library concepts (action vs card) increase confusion; only localStorage implementations. |
| Image handling (URL/upload/AI) | `src/App.tsx` AI modal functions | `src/components/CardPreview.tsx` consumption | Server `ai` route (unused) | Medium | AI proxy/server not wired; direct calls require keys; no backend integration. |

### Table B — Conflict Matrix
| ID | Type (Schema/Registry/UI/Storage/Docs) | Symptom | Evidence (files/lines) | Root Cause | Impact | Severity | Suggested Fix |
|---|---|---|---|---|---|---|---|
| C1 | Build/Tooling | `typecheck`, `test`, `build` all fail; `npm ci` hangs leaving no `.bin`. | `npm ci` hang (Appendix `npm_ci`); `vitest: not found` and `vite: not found`. | Install step never completes (likely proxy/registry or postinstall server stall), so dev deps absent. | Cannot run CI or local dev; risk of unnoticed regressions. | P0 | Fix install pipeline (investigate npm config/proxy, allow `npm ci` to finish, ensure `.bin` present). |
| C2 | Registry/UI | Graph palette shows 4 nodes while block registry defines 30+ steps. | Node registry entries only EXEC_START/SHOW_TEXT/CONST_BOOL/CONST_NUMBER/IF.【F:src/assets/nodeRegistry.json†L1-L114】 Block registry lists full step set.【F:src/assets/blockRegistry.json†L2-L108】 Compiler handles only SHOW_TEXT/IF.【F:src/lib/graphIR/compiler.ts†L60-L116】 | Node registry/graph compiler not updated to match step registry. | Designers cannot author most step types in graph UI; compiled card falls back to stale execution. | P1 | Expand nodeRegistry + compiler to cover blockRegistry steps or reintroduce form-based editor as fallback. |
| C3 | Docs/Schema | README claims CJ-1.0 import/export while runtime emits CJ-1.2 card JSON and CJ-FORGE-1.0 projects. | README import/export text.【F:README.md†L23-L25】 Export functions use latest schema + FORGE project wrapper.【F:src/App.tsx†L528-L542】【F:src/lib/migrations.ts†L3-L49】 | Docs outdated from schema migration to CJ-1.2/forge project. | Users may think older schema supported; external tools could reject newer payloads. | P2 | Update docs to CJ-1.2 + FORGE-1.0 or add backward-compat export path. |

### Table C — Orphan Inventory
| ID | File/Symbol | Evidence (ts-prune/madge/grep) | Why it’s orphaned | Risk of removal | Recommendation |
|---|---|---|---|---|---|
| O1 | `src/components/NestedStepsEditor.tsx` | `rg "NestedStepsEditor"` finds only its own file/old audit.【F:src/components/NestedStepsEditor.tsx†L1-L218】 | Legacy step form editor not rendered after graph UI shift. | Medium (could be fallback for unsupported steps). | Either reintegrate as fallback UI for non-graph steps or remove to reduce confusion. |
| O2 | `canonicalToGraph` in `src/lib/graph.ts` | No callers beyond docs (`rg "canonicalToGraph"`).【F:src/lib/graph.ts†L72-L118】 | Previous adapter superseded by new graph IR flow. | Low | Remove or wire into import path if needed. |

### Table D — Incomplete Functionality
| ID | Feature | Expected Behavior | Current Behavior | Evidence | Blocker | Severity | Recommendation |
|---|---|---|---|---|---|---|---|
| I1 | Graph editor step coverage | All registry steps editable in graph | Only SHOW_TEXT/IF nodes exist; other steps can’t be placed or compiled. | Node registry + compiler limited.【F:src/assets/nodeRegistry.json†L1-L114】【F:src/lib/graphIR/compiler.ts†L60-L116】 | Missing node definitions + compiler cases. | P1 | Add nodes/config schemas for each blockRegistry step and extend compiler/validator. |
| I2 | Scenario story editor | UI for story media/beats | Raw JSON textarea labeled MVP placeholder. | ScenarioBuilder story section text.【F:src/features/scenarios/ScenarioBuilder.tsx†L154-L207】 | UI not implemented. | P2 | Build structured form for story beats/media triggers. |
| I3 | Backend integration | Client sync with SQLite API | Client uses only localStorage for cards/decks/scenarios/library. | Local storage helpers.【F:src/lib/storage.ts†L1-L37】【F:server/src/index.ts†L1-L43】 | No fetch layer/proxy wiring. | P2 | Add API client + feature toggles to sync with server. |

### Table E — Duplicated / Double-up Functionality
| ID | Function/Module Pair | Overlap Description | Divergence | Evidence | Risk | Severity | Proposed Consolidation |
|---|---|---|---|---|---|---|---|
| D1 | Step registry vs node registry | Both describe ability building blocks. | blockRegistry has 30+ steps; nodeRegistry has 4 nodes and compiler only handles 2 step types. | Registries + compiler snippets.【F:src/assets/blockRegistry.json†L2-L108】【F:src/assets/nodeRegistry.json†L1-L114】【F:src/lib/graphIR/compiler.ts†L60-L116】 | Palette exports graphs inconsistent with canonical steps. | P1 | Align node registry with blockRegistry; auto-generate nodes from step definitions. |
| D2 | Card library vs action library | Two libraries stored in localStorage (cards vs reusable actions/steps). | Separate stores/keys with different schemas. | `libraryStore` vs `repository`.【F:src/lib/libraryStore.ts†L1-L42】【F:src/lib/repository.ts†L1-L110】 | User confusion, duplication of effort. | P2 | Clarify UX and consider merging or renaming to avoid ambiguity. |
| D3 | LocalStorage stores vs backend SQLite | Same entities persisted twice (client vs server). | Client never calls backend; backend stores same artifacts. | Client stores.【F:src/lib/deckStore.ts†L6-L44】 Backend routers.【F:server/src/index.ts†L1-L43】 | Divergent data between devices; server unused. | P2 | Introduce sync layer or drop unused backend until ready. |

### Table F — Doc Drift
| Doc File | Claim | Code Reality | Evidence | Impact | Fix (doc/code) |
|---|---|---|---|---|---|
| README.md | Imports/exports CJ-1.0 card JSON | Default cards use CJ-1.2; exports include CJ-FORGE-PROJECT-1.0 wrapper. | README import/export text.【F:README.md†L23-L25】 App export uses latest schema.【F:src/App.tsx†L528-L542】【F:src/lib/migrations.ts†L3-L49】 | External consumers may prepare wrong schema; QA confusion. | Update README to CJ-1.2 + FORGE-1.0 (or provide legacy mode). |
| README.md | Requires Node 20 | Environment/node version is 22.21.0 (audit baseline). | Baseline commands (Appendix `node_version`). | Potential mismatch in support docs. | Note support matrix or pin to tested versions. |

### Table G — Step/Registry/Schema Alignment (Critical)
| Type | In blockRegistry.json | In nodeRegistry.json | In types.ts | In schemas.ts | Has UI editor | Notes |
|---|---:|---:|---:|---:|---|
| SHOW_TEXT | ✅ | ✅ | ✅ | ✅ | Graph node | Only step with full graph support. |
| IF_ELSE | ✅ | ✅ | ✅ | ✅ | Graph node | Supported via IF node compile. |
| CONST_BOOL/CONST_NUMBER (expr) | — | ✅ | ✅ (as Expression) | ✅ | Graph node | Exist only as data nodes; not steps. |
| ROLL_D6 / ROLL_D20 | ✅ | ❌ | ✅ | ✅ | No | Present in registry/types; no graph node. |
| SET_VARIABLE | ✅ | ❌ | ✅ | ✅ | No | Registry/type only. |
| OPPONENT_SAVE | ✅ | ❌ | ✅ | ✅ | No | Registry/type only. |
| SELECT_TARGETS | ✅ | ❌ | ✅ | Partial (profile checks) | No | No node; schema enforces profile presence. |
| FOR_EACH_TARGET | ✅ | ❌ | ✅ | ✅ | No | Loop step not supported in graph nodes. |
| DEAL_DAMAGE / HEAL / APPLY_STATUS / REMOVE_STATUS | ✅ | ❌ | ✅ | ✅ | No | Combat steps only in registry/types. |
| MOVE_ENTITY / MOVE_WITH_PATH_CAPTURE | ✅ | ❌ | ✅ | ✅ | No | Movement steps not exposed in graph. |
| DRAW_CARDS / MOVE_CARDS / SHUFFLE_ZONE / PUT_ON_TOP_ORDERED / EMPTY_HAND / ADD_CARDS_TO_DECK / REMOVE_CARDS_FROM_DECK / SWAP_DECK / END_TURN_IMMEDIATELY | ✅ | ❌ | ✅ | ✅ | No | Deck/zone steps missing from graph. |
| SET_ENTITY_STATE / TOGGLE_ENTITY_STATE / CLEAR_ENTITY_STATE | ✅ | ❌ | ✅ | ✅ | No | Entity state steps missing. |
| FIND_ENTITIES / COUNT_ENTITIES / FILTER_TARGET_SET | ✅ | ❌ | ✅ | ✅ | No | Query steps missing. |
| SPAWN_ENTITY / DESPAWN_ENTITY | ✅ | ❌ | ✅ | ✅ | No | Spawn/despawn missing. |
| OPEN_UI_FLOW / REQUEST_PLAYER_CHOICE / REGISTER_INTERRUPTS / PROPERTY_CONTEST | ✅ | ❌ | ✅ | ✅ | No | UI/subsystem steps missing. |
| WEBHOOK_CALL / EMIT_EVENT / AI_REQUEST | ✅ | ❌ | ✅ | ✅ | No | Integration steps missing. |

### Master Inventory Snapshot (selected files)
| File | Type | Responsibility | Imported by | Exports | Status | Notes |
|---|---|---|---|---|---|---|
| src/App.tsx | UI/Feature | Main SPA modes (Forge/Library/Decks/Scenarios), graph adapter, export/import | Entry via `src/main.tsx` | Default export component | ACTIVE | Graph palette bound to nodeRegistry; exports CJ-1.2 cards/forge project.【F:src/App.tsx†L528-L542】【F:src/App.tsx†L1062-L1108】 |
| src/lib/types.ts | Types | Card/step/type definitions | Many | Type aliases | ACTIVE | Defines CJ-1.2 typings.【F:src/lib/types.ts†L1-L140】 |
| src/lib/migrations.ts | Utility | Card schema migration/validation versions | App import/export, tests | migrateCard | ACTIVE | Supports CJ-1.0→CJ-1.2.【F:src/lib/migrations.ts†L3-L49】 |
| src/lib/schemas.ts | Schema | Card validation | App, tests | validateCard | ACTIVE | Uses blockRegistry to detect unknown steps.【F:src/lib/schemas.ts†L167-L215】 |
| src/lib/registry.ts | Utility | Block registry wrapper/versioning | NestedStepsEditor, App | blockRegistry, isStepTypeAllowed | ACTIVE | Pulls blockRegistry.json.【F:src/lib/registry.ts†L1-L26】 |
| src/assets/blockRegistry.json | Asset | Step definitions/groups | registry, tests | JSON data | ACTIVE | BR-1.3 with 30+ steps.【F:src/assets/blockRegistry.json†L2-L108】 |
| src/assets/nodeRegistry.json | Asset | Graph node definitions | nodes/registry, App palette | JSON data | ACTIVE | Only 4 nodes defined.【F:src/assets/nodeRegistry.json†L1-L114】 |
| src/lib/graphIR/compiler.ts | Logic | Graph→steps compiler | App | compileAbilityGraph | ACTIVE | Compiles only SHOW_TEXT/IF. 【F:src/lib/graphIR/compiler.ts†L60-L116】 |
| src/components/NestedStepsEditor.tsx | UI | Legacy step form editor | none | Step editors | ORPHAN | Not mounted anywhere. 【F:src/components/NestedStepsEditor.tsx†L1-L218】 |
| src/lib/graph.ts | Utility | Default card/graph/project + canonical adapter | App | makeDefaultCard/Graph/Project | ACTIVE (except canonicalToGraph) | `canonicalToGraph` unused. 【F:src/lib/graph.ts†L72-L118】 |
| src/features/library/CardLibraryManager.tsx | Feature | Card library CRUD/import/export | App (LIBRARY mode) | Component | ACTIVE | Uses localStorage library store. |
| src/features/decks/DeckBuilder.tsx | Feature | Deck builder | App (DECKS mode) | Component | ACTIVE | Depends on card library localStorage. |
| src/features/scenarios/ScenarioBuilder.tsx | Feature | Scenario builder | App (SCENARIOS mode) | Component | ACTIVE | Story editor still raw JSON.【F:src/features/scenarios/ScenarioBuilder.tsx†L154-L207】 |
| src/lib/repository.ts | Utility | Action library store (abilities/steps/profiles) | App action library modal | defaultLibrary, import/export | ACTIVE | Parallel to card library. |
| src/lib/storage.ts | Utility | Card/catalog localStorage + migration | App | load/save functions | ACTIVE | Local-only persistence.【F:src/lib/storage.ts†L1-L37】 |
| server/src/index.ts | Backend | Express server wiring, SQLite DB init | Server runtime | Express app | ACTIVE (server) | Not consumed by client. 【F:server/src/index.ts†L1-L43】 |

## 8.5 Recommendations & action list
- Quick wins (1–2 days)
  - Unblock installs: audit npm config/proxy, ensure `npm ci` completes and `.bin` exists; rerun `npm run typecheck/test/build` to restore CI signal.
  - Update README to CJ-1.2 + FORGE-1.0, and document required Node version(s).
  - Remove or temporarily hide the unused `NestedStepsEditor` to avoid confusion, or surface it as a fallback for unsupported steps.
- Medium refactors (1–2 weeks)
  - Expand `nodeRegistry.json` (auto-generate from `blockRegistry.json`) and extend `graphIR/compiler.ts` + `graphIR/validateGraph.ts` to support all registry steps.
  - Add structured UI for scenario story beats instead of raw JSON textarea.
  - Consolidate card vs action library UX and clarify storage keys.
- Architectural moves
  - Decide on a single storage of truth (localStorage vs SQLite server). Add a data access layer to sync with the backend, or remove the server until the client can target it.
  - Consider schema/registry source-of-truth generation to prevent drift across block registry, node registry, and validator.

## 8.6 “Stop-the-line” conflicts
1) Build is red: dependency install hangs; core scripts fail (`typecheck`, `test`, `build`).
2) Graph palette does not cover the step registry; most steps cannot be authored or compiled.
3) Docs advertise CJ-1.0 while runtime emits CJ-1.2/forge project payloads.

---

## Appendix — CLI outputs
<details>
<summary>node_version</summary>

```
$ node -v
v22.21.0
```
</details>

<details>
<summary>npm_version</summary>

```
$ npm -v
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
npm warn Unknown project config "always-auth" (//registry.npmjs.org/:always-auth). This will stop working in the next major version of npm.
11.4.2
```
</details>

<details>
<summary>npm_ci</summary>

```
$ npm ci
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
npm warn Unknown project config "always-auth" (//registry.npmjs.org/:always-auth). This will stop working in the next major version of npm.
(node:4227) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 socket listeners added to [ClientRequest]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
^C
^C
```
</details>

<details>
<summary>npm_typecheck</summary>

```
$ npm run typecheck
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
npm warn Unknown project config "always-auth" (//registry.npmjs.org/:always-auth). This will stop working in the next major version of npm.

> captain-jawa-forge@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit

error TS2688: Cannot find type definition file for 'babel__core'.
...
error TS2688: Cannot find type definition file for 'uuid'.
```
</details>

<details>
<summary>npm_test</summary>

```
$ npm test
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
npm warn Unknown project config "always-auth" (//registry.npmjs.org/:always-auth). This will stop working in the next major version of npm.

> captain-jawa-forge@0.1.0 test
> vitest run

sh: 1: vitest: not found
```
</details>

<details>
<summary>npm_build</summary>

```
$ npm run build
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
npm warn Unknown project config "always-auth" (//registry.npmjs.org/:always-auth). This will stop working in the next major version of npm.

> captain-jawa-forge@0.1.0 build
> vite build --cacheDir .vite

sh: 1: vite: not found
```
</details>

<details>
<summary>madge_circular</summary>

```
$ npx madge --ts-config ./tsconfig.json --circular ./src
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
npm warn Unknown project config "always-auth" (//registry.npmjs.org/:always-auth). This will stop working in the next major version of npm.
npm error code E403
npm error 403 403 Forbidden - GET https://registry.npmjs.org/madge
...
```
</details>

<details>
<summary>madge_graph</summary>

```
$ npx madge --ts-config ./tsconfig.json ./src --image madge_graph.svg
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
npm warn Unknown project config "always-auth" (//registry.npmjs.org/:always-auth). This will stop working in the next major version of npm.
npm error code E403
npm error 403 403 Forbidden - GET https://registry.npmjs.org/madge
...
```
</details>

<details>
<summary>tsprune</summary>

```
$ npx ts-prune -p tsconfig.json
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
npm warn Unknown project config "always-auth" (//registry.npmjs.org/:always-auth). This will stop working in the next major version of npm.
npm error code E403
npm error 403 403 Forbidden - GET https://registry.npmjs.org/ts-prune
...
```
</details>

<details>
<summary>depcheck</summary>

```
$ npx depcheck
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
npm warn Unknown project config "always-auth" (//registry.npmjs.org/:always-auth). This will stop working in the next major version of npm.
npm error code E403
npm error 403 403 Forbidden - GET https://registry.npmjs.org/depcheck
...
```
</details>

<details>
<summary>file_count</summary>

```
$ git ls-files | wc -l
111
```
</details>
