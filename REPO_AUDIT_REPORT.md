# REPO_AUDIT_REPORT.md

## 1) Executive Summary
- Severity counts: **P0: 4 • P1: 1 • P2: 2 • P3: 0**
- Top risks:
  1) `npm ci` fails in postinstall while rebuilding `better-sqlite3` because the proxy blocks Node headers (403), leaving the local-API backend only partially installed (server/better-sqlite3 missing).【b86e3a†L1-L36】【69c316†L1-L1】
  2) CI gates are red: `npm run typecheck`, `npm test`, and `npm run build` all fail under Node 20, matching the workflow environment.【bb6168†L1-L18】【38048f†L1-L11】
  3) Graph authoring is limited to SHOW_TEXT/IF_ELSE nodes while the registry defines 35+ step types; most abilities cannot be authored or compiled from the graph UI.【486fcb†L4-L107】【2edcfe†L20-L114】【d4e8b2†L64-L117】
  4) Deck Builder renders a `description` field that is absent from the deck schema, causing typecheck errors and schema drift for saved decks.【b8fa10†L6-L14】【51ec1c†L296-L305】
  5) AI docs describe scenario and step shapes that differ from runtime schemas/registries (e.g., top-level `sides`/`environment`, SCHEDULE_STEPS), so AI-generated JSON from docs will not validate/import.【cfb93b†L179-L200】【c912ad†L60-L94】【6958db†L47-L95】

## 2) Environment Sanity & Install Viability
- OS/CPU: Linux x86_64 (6.12.13).【c8d7c5†L1-L1】
- Node: `v20.19.5` via `nvm use 20.19.5` (CI parity).【071e98†L1-L1】
- npm: `11.4.2` (warns about unknown `http-proxy` env key).【792c94†L1-L2】
- Git: branch `work`, commit `812d9a…`.【3b9fa0†L1-L2】
- Registry/proxy config: registry `https://registry.npmjs.org/`; npm config shows legacy `http-proxy`/`https-proxy` set to `http://proxy:8080`; env contains `HTTP_PROXY/HTTPS_PROXY` and `NODE_EXTRA_CA_CERTS` for MITM cert.【8632b9†L1-L2】【cf3e92†L1-L8】【cfc654†L10-L51】
- Install status:
  - `npm ci --no-audit --no-fund --foreground-scripts` **failed** during `npm run install:server` because `node-gyp` could not download Node headers through the proxy (403). Server `better-sqlite3` is missing.【b86e3a†L1-L36】【69c316†L1-L1】
  - Install proof log (toolchain present despite failure): **“Here is node_modules/.bin after npm ci.”** — contains `vite`, `vitest`, `tsc`, `vite-node`, etc.【09224f†L1-L21】

## 3) Build/CI Parity Results
| Command (Node 20.19.5) | Result | Evidence | Notes |
| --- | --- | --- | --- |
| `npm run typecheck` | ❌ fails |  | React Flow type import, deck `description`, edgeRules data-type check, graph schema guard. |
| `npm test -- --reporter basic` | ❌ fails | 【bb6168†L1-L18】 | Duplicate-connection test expects `DUPLICATE`, validator returns `TARGET_AT_MAX`. |
| `npm run build` | ❌ fails | 【38048f†L1-L11】【2d7d82†L6-L14】 | Vite CLI rejects `--cacheDir` flag in scripts. |
| `npm ci` | ⚠️ fails (env-blocker) | 【b86e3a†L1-L36】 | Proxy blocks Node headers; backend deps incomplete. |

## 4) Domain System Map (Table A)
| Domain | Source of Truth | Primary user-facing outcome | Observations |
| --- | --- | --- | --- |
| Card authoring (Forge) | `src/App.tsx`, `src/lib/types.ts`, `src/lib/schemas.ts`, `src/lib/migrations.ts` | Design CJ-1.2 cards, validate, migrate, and export/import. | Card editing UI present; schema validation active. |
| Ability/Step authoring | `src/App.tsx`, `src/assets/blockRegistry.json`, `src/lib/stepFactory.ts`, `src/lib/schemas.ts` | Author ability execution steps that validate against registry. | Graph-driven; registry covers 35+ steps but graph palette is minimal. |
| Registry (blockRegistry) | `src/assets/blockRegistry.json`, `src/lib/registry.ts` | Define allowed steps/triggers/keys for validation and defaults. | BR-1.3 lists all canonical steps. |
| Node registry (graph palette) | `src/assets/nodeRegistry.json`, `src/lib/nodes/registry.ts` | Provide graph nodes with config schema/pins. | Only EXEC_START, SHOW_TEXT, CONST_BOOL/NUMBER, IF. |
| Graph compiler/IR validator | `src/lib/graphIR/compiler.ts`, `src/lib/graphIR/validateGraph.ts` | Compile graph to canonical steps; block invalid edges. | Compiler emits SHOW_TEXT/IF_ELSE only; validation enforces pin rules. |
| Import/export formats | `src/lib/graph.ts`, `src/lib/graphIR/graphSchema.ts`, `src/lib/migrations.ts` | Export CJ-1.2 card JSON and Forge project bundles; import older schemas and migrate. | Supports CJ-1.0/1.1 migrations; Forge project schema CJ-FORGE-PROJECT-1.0+. |
| Storage providers | `src/lib/providers/browserProvider.ts`, `src/lib/providers/localApiProvider.ts`, `server/src` | Save/load cards/decks/scenarios/assets via browser storage or Express/SQLite API. | Local API blocked by missing better-sqlite3 build. |
| Deck builder | `src/features/decks/DeckBuilder.tsx`, `src/lib/deckTypes.ts`, `src/lib/deckStore.ts` | Create/manage CJ-DECK-1.0 decks grouped by faction. | UI collects `description` not present in schema/storage. |
| Scenario builder | `src/features/scenarios/ScenarioBuilder.tsx`, `src/lib/scenarioTypes.ts`, `src/lib/scenarioStore.ts` | Build CJ-SCENARIO-1.0 scenarios with triggers/story. | Story uses raw JSON textarea; docs diverge from schema. |
| AI agent docs/JSON guides | `AI_JSON_GUIDE.md`, `AI_ACTION_STEPS.md` | Enable AI to emit valid card/deck/scenario/action JSON. | Lists steps/shapes not supported by runtime schemas/registries. |
| Image handling | `src/App.tsx` (AI image modal), asset providers | Attach or generate card art via upload/proxy/provider. | Direct provider calls require API key; proxy supported. |

## 5) Conflict Matrix (Table B)
| ID | Type | Symptom | Evidence | Root Cause | Impact | Sev | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | ENV/Install | `npm ci` fails (better-sqlite3 headers 403); server dep missing. | 【b86e3a†L1-L36】【69c316†L1-L1】 | Proxy blocks downloads from nodejs.org during node-gyp rebuild. | Local-API backend cannot run; CI parity uncertain. | P0 (ENV-BLOCKER) | Use prebuilt binaries or vendored headers; allowlist nodejs.org in proxy; retry `npm ci`. |
| B2 | CI/Typecheck | `npm run typecheck` fails (React Flow `Node` import, deck `description`, edgeRules type guard, graph schema guard). | 【3833e4†L2-L33】【b8fa10†L6-L14】【51ec1c†L296-L305】【6c2ca4†L31-L98】【2f347e†L40-L129】 | Typed imports drifted from dependencies; deck UI/schema mismatch; data-type comparison allows `"integer"` vs number causing false error; `isRecord` returns unknown. | CI red; editor TS errors risk runtime issues. | P0 | Import React Flow node type via `Node` default or `type Node` from React Flow exports; align deck schema (add `description` or remove field); fix edgeRules data-type comparison or test expectation; strengthen `isRecord` narrowings. |
| B3 | CI/Test | Vitest failure: duplicate edge reported as `TARGET_AT_MAX` instead of `DUPLICATE`. | 【bb6168†L1-L18】【6c2ca4†L91-L120】 | Duplicate check runs after max-connection check. | Graph UI shows wrong error code; CI red. | P0 | Move duplicate check before max-capacity or adjust expected code; keep deterministic codes. |
| B4 | CI/Build | `npm run build` fails: Vite CLI rejects `--cacheDir` flag. | 【38048f†L1-L11】【2d7d82†L6-L14】 | Vite 5 CLI no longer supports `--cacheDir`; config already sets cacheDir. | Build artifact not produced; Pages deploy blocked. | P0 | Drop `--cacheDir` from dev/build/preview scripts; rely on `vite.config.ts` cacheDir. |
| B5 | Registry/UI/Compiler | Graph palette/compiler cover only SHOW_TEXT/IF_ELSE; 30+ registry steps lack nodes/editor coverage. | 【486fcb†L4-L107】【2edcfe†L20-L114】【d4e8b2†L64-L117】 | Node registry not generated from block registry; no fallback editor wired. | Authors cannot create combat/targeting/deck/spawn/integration steps; exported execution stays minimal. | P1 | Generate nodes from blockRegistry or re-enable `NestedStepsEditor` as fallback; extend compiler mappings. |
| B6 | Docs/Schema | AI docs show scenario shape with top-level `sides`/`environment` and extra steps (SCHEDULE_STEPS, SUBSYSTEM_RUN) not in runtime schemas/registry. | 【cfb93b†L179-L200】【c912ad†L60-L94】【6958db†L47-L95】 | Docs not updated after schema/reg changes. | AI outputs will fail validation/import; author confusion. | P2 | Update AI docs to match `scenarioTypes.ts` and blockRegistry; call out unsupported steps or add runtime support. |

## 6) Step/Registry/Schema/Graph Alignment (Table G)
Legend: ✅ present/covered • ⚠️ partial (fallback only) • ❌ missing

| Step Type | blockRegistry | types.ts | schemas.ts (validation) | stepFactory | Node in palette | Compiler emits | UI path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SHOW_TEXT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Graph |
| IF_ELSE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Graph |
| ROLL_D6 / ROLL_D20 | ✅ | ✅ | ⚠️ (shape not enforced) | ✅ | ❌ | ❌ | None |
| SET_VARIABLE | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| OPPONENT_SAVE | ✅ | ✅ | ⚠️ (branch walk only) | ✅ | ❌ | ❌ | None |
| SELECT_TARGETS | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | None |
| FOR_EACH_TARGET | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | None |
| DEAL_DAMAGE / HEAL / APPLY_STATUS / REMOVE_STATUS | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| OPEN_REACTION_WINDOW | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| MOVE_ENTITY / MOVE_WITH_PATH_CAPTURE | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| CALC_DISTANCE | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| DRAW_CARDS / MOVE_CARDS / SHUFFLE_ZONE / PUT_ON_TOP_ORDERED | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| END_TURN_IMMEDIATELY | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| EMPTY_HAND / ADD_CARDS_TO_DECK / REMOVE_CARDS_FROM_DECK / SWAP_DECK | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| SET/TOGGLE/CLEAR_ENTITY_STATE | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| FIND_ENTITIES / COUNT_ENTITIES / FILTER_TARGET_SET | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| SPAWN_ENTITY / DESPAWN_ENTITY | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| OPEN_UI_FLOW / REQUEST_PLAYER_CHOICE / REGISTER_INTERRUPTS / PROPERTY_CONTEST | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |
| WEBHOOK_CALL / EMIT_EVENT / AI_REQUEST | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | None |

**Summary:** Only SHOW_TEXT and IF_ELSE have full graph coverage; all other registry steps rely on raw JSON or unused fallback editor, blocking authoring coverage.

## 7) Feature Entry Points & Runtime Notes (Table H below)
- App renders **Library / Decks / Scenarios** modes via topbar buttons and provider switch; each loads its component.【67c17d†L989-L1034】
- Local-API provider likely fails at runtime because `better-sqlite3` is absent (server install failed).【b86e3a†L1-L36】【69c316†L1-L1】
- No dev-server runtime check executed due to install blocker; console/fetch errors not verified.

### Table H — Functional Outcome Impact Map
| Outcome | Current blocker | Evidence | Sev | Next action |
| --- | --- | --- | --- | --- |
| CI builds & deploys | Typecheck/test/build failures | 【bb6168†L1-L18】【38048f†L1-L11】 | P0 | Fix typings, deck schema drift, edgeRules order; drop `--cacheDir`; rerun CI. |
| Local-API data provider works | `npm ci` fails building better-sqlite3 under proxy | 【b86e3a†L1-L36】【69c316†L1-L1】 | P0 (ENV) | Obtain proxy access or prebuilt binaries; rerun install. |
| Ability authoring covers all steps | Palette/compiler cover 2 of 35+ steps | 【486fcb†L4-L107】【2edcfe†L20-L114】【d4e8b2†L64-L117】 | P1 | Generate nodes or enable fallback editor; extend compiler. |
| Deck builder schema alignment | UI uses `description` not in schema | 【b8fa10†L6-L14】【51ec1c†L296-L305】 | P0 | Add `description` to schema/store or remove field from UI. |
| AI docs produce valid JSON | Docs show scenario/step shapes not supported | 【cfb93b†L179-L200】【c912ad†L60-L94】【6958db†L47-L95】 | P2 | Update docs or add runtime support; flag unsupported steps. |

## 8) Orphans (Table C)
| ID | Artifact | Evidence | Risk | Recommendation |
| --- | --- | --- | --- | --- |
| O1 | `src/components/NestedStepsEditor.tsx` | Component exists but `rg` finds no references; standalone fallback step editor only.【f2a718†L1-L184】【88a442†L1-L1】 | Medium (could be useful fallback; currently dead). | Either wire it as fallback for non-graph steps or remove to reduce drift. |

## 9) Duplicates (Table E)
| ID | Pair | Evidence | Risk | Recommendation |
| --- | --- | --- | --- | --- |
| D1 | Card Library vs Action Library | Separate modules/storage for reusable content.【67c17d†L989-L1034】 | User confusion over which library to use; duplicated persistence. | Clarify UX or merge libraries; document scopes. |
| D2 | Browser vs Local-API providers | Provider switch in UI with different storage backends.【67c17d†L1012-L1034】 | Divergent datasets; backend currently broken. | Document default/provider requirements; ensure backend install succeeds. |

## 10) Incomplete Functionality (Table D)
| ID | Feature | Gap | Evidence | Severity | Recommendation |
| --- | --- | --- | --- | --- | --- |
| I1 | Scenario story editor | Only raw JSON textarea; UI notes future dedicated editor. | 【3661d7†L473-L493】 | P2 | Add structured story-beat form (type, media ref, trigger). |
| I2 | Graph step coverage | Palette/compiler omit most registry steps. | 【2edcfe†L20-L114】【d4e8b2†L64-L117】 | P1 | Auto-generate nodes per registry or enable fallback editor. |

## 11) Docs Drift (Table F)
| Doc | Drift | Evidence | Impact | Recommendation |
| --- | --- | --- | --- | --- |
| AI_JSON_GUIDE.md | Scenario sample uses top-level `sides`/`environment`; runtime expects `setup.sides/env`. | 【cfb93b†L179-L200】【c912ad†L60-L94】 | AI/user JSON invalid on import. | Rewrite sample/fields to match `scenarioTypes.ts`. |
| AI_ACTION_STEPS.md | Lists steps (ROLL_DN, WHILE, SUBSYSTEM_RUN, SCHEDULE_STEPS, CANCEL_SCHEDULED, SEARCH_ZONE, etc.) not present in blockRegistry/types. | 【6958db†L47-L95】 | AI-generated steps will be rejected or coerced to UNKNOWN_STEP. | Trim doc to supported steps or add runtime support & registry entries. |

## 12) Action List (ordered: stop-the-line first)
1) **Unblock installs (P0 ENV):** Get proxy access to nodejs.org or use prebuilt `better-sqlite3`; rerun `npm ci --no-audit --no-fund --foreground-scripts` until server/node_modules installs cleanly.【b86e3a†L1-L36】
2) **Fix CI commands (P0):**
   - Update React Flow imports and deck schema/UI alignment; tighten `edgeRules` type/data checks; fix `graphSchema` type guard.【3833e4†L2-L33】【b8fa10†L6-L14】【51ec1c†L296-L305】【6c2ca4†L31-L98】【2f347e†L40-L129】
   - Reorder duplicate check before max-fan-in in `edgeRules` (or adjust test).【bb6168†L1-L18】【6c2ca4†L91-L120】
   - Drop `--cacheDir` from npm scripts (dev/build/preview).【38048f†L1-L11】【2d7d82†L6-L14】
3) **Restore authoring coverage (P1):** Generate node definitions from blockRegistry or re-enable `NestedStepsEditor` as fallback; extend compiler to emit all registry steps.【486fcb†L4-L107】【2edcfe†L20-L114】【d4e8b2†L64-L117】【f2a718†L1-L184】
4) **Doc alignment (P2):** Update AI guides (scenario shape; supported steps list) to match runtime schemas/registry; note unsupported steps explicitly.【cfb93b†L179-L200】【c912ad†L60-L94】【6958db†L47-L95】
5) **Scenario story UX (P2):** Replace raw JSON textarea with structured story-beat form to prevent malformed entries.【3661d7†L473-L493】

## 13) Quick “Stop the Line” Checklist
- `npm ci` completes (frontend + server) and `node_modules/.bin` contains `vite`, `vitest`, `tsc`.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes (no `--cacheDir` CLI flag).
- Exported schema versions match validators; blockRegistry steps have authoring path or fallback editor.
- Docs samples validate against runtime schemas.

## 14) Appendix — Evidence Pack
- Environment commands: uname/Node/npm/git/registry/proxy/env.【c8d7c5†L1-L1】【071e98†L1-L1】【792c94†L1-L2】【3b9fa0†L1-L2】【8632b9†L1-L2】【cf3e92†L1-L8】【cfc654†L10-L51】
- Install failure log + missing server module; install proof (`node_modules/.bin`).【b86e3a†L1-L36】【69c316†L1-L1】【09224f†L1-L21】
- CI command outputs: typecheck/test/build failures.【bb6168†L1-L18】【38048f†L1-L11】
- Registry/types/compiler excerpts: blockRegistry, nodeRegistry, compiler, deck schema/UI, scenario schema/doc, step docs.【486fcb†L4-L107】【2edcfe†L20-L114】【d4e8b2†L64-L117】【b8fa10†L6-L14】【51ec1c†L296-L305】【cfb93b†L179-L200】【c912ad†L60-L94】【6958db†L47-L95】
