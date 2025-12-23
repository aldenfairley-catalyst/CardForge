# DATABASE_AND_API_UPDATES_SPEC.md
Captain Jawa Forge — Comprehensive Database + API Updates Specification  
Version: 1.0 (Local-first)  
Target: macOS (M1) local run, single-user MVP that can scale to LAN + multi-client later

---

## 1) Why this exists
You’re moving from a browser-only builder (localStorage + JSON exports) to a **local-first ecosystem** where:
- Cards, decks, scenarios, catalogs, and action libraries are **persisted in SQLite**
- Images/video/audio are stored as **files on disk** and referenced by stable URLs
- The Forge UI + future clients can query everything via a **local API**
- AI agents can reliably:
  - fetch registries/schemas
  - validate objects
  - upsert cards/decks/scenarios/projects
  - request scenario setup details

This document specifies **exactly what to implement** (DB model + API endpoints + invariants + tests).

---

## 2) Core design principles (non-negotiable)
1. **Workspace first**  
   All data lives in a chosen *workspace folder*:
   - `cj.sqlite` (database)
   - `/assets/` (images/video/audio)
   - `/exports/` (bundles)
   - `/logs/` (optional)
2. **Hybrid storage: JSON blobs + indexed columns**  
   Store each object as canonical JSON for flexibility, but extract the most-used fields into columns for fast query.
3. **One Source of Truth for validation**  
   API must reuse the same validators and registries as the UI (no drift).
4. **Stable IDs**  
   Every card/deck/scenario/project/asset uses UUID. Never use array indices as identity.
5. **Schema versioning + migrations**  
   DB tracks:
   - DB schema version (tables/columns)
   - object schema versions (CJ-1.0 / CJ-1.1 / CJ-1.2, etc.)
   - project/graph versions (CJ-FORGE-PROJECT-1.0, CJ-GRAPH-1.1)
6. **Atomic operations**  
   Multi-write operations (e.g., create card + project + assets) happen inside a DB transaction.
7. **Agent-friendly endpoints**  
   Every endpoint returns structured issues (same as Forge UI), so agents can repair payloads.

---

## 3) Workspace & local server requirements
### 3.1 Workspace folder structure
```
<workspace>/
  cj.sqlite
  assets/
    images/
    video/
    audio/
    other/
  exports/
  logs/
  cache/
```

### 3.2 Workspace selection
You need a way to select a workspace on macOS. Options:
- **Option A (recommended now): Server serves UI and owns workspace**
  - Start server with `--workspace <path>` (CLI)
  - UI loads from server and calls `/api/workspace`
- Option B (later): Desktop wrapper (Electron/Tauri) to open file dialogs and start server

**MVP requirement:** support Option A.

### 3.3 Server must:
- bind `127.0.0.1` by default
- expose `/api/*` and serve `/assets/*` from workspace
- support Vite proxy in dev and static UI hosting in prod

---

## 4) Database specification (SQLite)
### 4.1 DB version tables (required)
#### `db_meta`
| column | type | notes |
|---|---|---|
| key | TEXT PK | e.g., `dbVersion`, `createdAt`, `workspaceId` |
| value | TEXT | |
| updatedAt | TEXT | ISO timestamp |

#### `db_migrations`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | autoincrement |
| name | TEXT UNIQUE | migration name |
| appliedAt | TEXT | ISO timestamp |

### 4.2 Core object tables (hybrid)
Each object table stores:
- canonical JSON (`json`)
- extracted fields for queries
- timestamps
- optional `etag` (incrementing integer) for optimistic concurrency

#### `cards`
| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT | indexed |
| type | TEXT | UNIT/ITEM/SPELL/ENVIRONMENT/TOKEN |
| faction | TEXT | indexed |
| schemaVersion | TEXT | e.g., CJ-1.1 |
| tagsJson | TEXT | JSON array of tags (optional) |
| subTypeJson | TEXT | JSON array (optional) |
| attributesJson | TEXT | JSON array (optional) |
| json | TEXT | full canonical card JSON |
| etag | INTEGER | default 1, ++ on update |
| createdAt | TEXT | ISO |
| updatedAt | TEXT | ISO |

Indexes:
- `idx_cards_name` on (name)
- `idx_cards_type` on (type)
- `idx_cards_faction` on (faction)
- `idx_cards_schemaVersion` on (schemaVersion)

Optional (later): SQLite JSON1 indexes via generated columns.

#### `projects`
Stores editor projects (graph layout + UI prefs + canonical card snapshot).
| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |
| cardId | TEXT | FK-ish (soft FK) |
| projectVersion | TEXT | e.g., CJ-FORGE-PROJECT-1.0 |
| graphVersion | TEXT | e.g., CJ-GRAPH-1.1 |
| json | TEXT | full project JSON |
| etag | INTEGER | |
| createdAt | TEXT | |
| updatedAt | TEXT | |

Index:
- `idx_projects_cardId` on (cardId)

#### `decks`
| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT | indexed |
| faction | TEXT | indexed |
| schemaVersion | TEXT | CJ-DECK-1.0 |
| json | TEXT | full deck JSON |
| etag | INTEGER | |
| createdAt | TEXT | |
| updatedAt | TEXT | |

#### `scenarios`
| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT | indexed |
| schemaVersion | TEXT | CJ-SCENARIO-1.0 |
| players | INTEGER | 1..N |
| json | TEXT | full scenario JSON |
| etag | INTEGER | |
| createdAt | TEXT | |
| updatedAt | TEXT | |

### 4.3 Catalog tables (to avoid hardcoding factions/types/attributes)
These enable future deck validation and editor dropdowns.

#### `catalogs`
| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |
| kind | TEXT | `FACTION`, `UNIT_TYPE`, `ATTRIBUTE`, `TAG`, `DAMAGE_TYPE`, etc. |
| version | INTEGER | increments |
| json | TEXT | canonical catalog JSON |
| updatedAt | TEXT | |

#### Recommended catalog JSON shape
- `id`, `kind`, `items[]` where items include `key`, `label`, optional `iconAssetId`, `meta`

### 4.4 Relations (unit-specific items, synergies, restrictions)
This supports “Hook Staff only usable by Fisherman” and queries like “show all items linked to this unit”.

#### `card_relations`
| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |
| fromCardId | TEXT | subject |
| toCardId | TEXT | related |
| relationType | TEXT | `ONLY_USABLE_BY`, `SYNERGY`, `SUMMONS`, `UPGRADES`, `COUNTERS`, `REQUIRES`, etc. |
| json | TEXT | relation details (conditions, notes) |
| createdAt | TEXT | |
| updatedAt | TEXT | |

Indexes:
- `idx_rel_from` on (fromCardId)
- `idx_rel_to` on (toCardId)
- `idx_rel_type` on (relationType)

### 4.5 Assets (filesystem + metadata)
#### `assets`
| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |
| kind | TEXT | image/video/audio/other |
| mime | TEXT | image/png |
| ext | TEXT | png/jpg/webp |
| path | TEXT | relative to workspace |
| sha256 | TEXT | for dedupe |
| sizeBytes | INTEGER | |
| width | INTEGER | nullable |
| height | INTEGER | nullable |
| createdAt | TEXT | |
| updatedAt | TEXT | |

Indexes:
- `idx_assets_sha` on (sha256)

### 4.6 Action Library / Repository (optional but recommended now)
Replaces localStorage “library” and enables syncing/export.

#### `library_entries`
| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID or stable string |
| entryType | TEXT | `ABILITY`, `STEP`, `TARGET_PROFILE`, `MACRO`, `SUBSYSTEM` |
| name | TEXT | |
| schemaVersion | TEXT | e.g., CJ-ACTION-LIB-1.0 |
| json | TEXT | |
| createdAt | TEXT | |
| updatedAt | TEXT | |

Index:
- `idx_library_type` on (entryType)

### 4.7 Operation log (debug + future multiplayer)
#### `ops_log`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| ts | TEXT | |
| actor | TEXT | `ui`, `agent`, `import`, etc. |
| action | TEXT | e.g. `UPSERT_CARD` |
| refId | TEXT | card/deck/scenario id |
| json | TEXT | details |

---

## 5) API specification (comprehensive)
### 5.1 API conventions
- Base: `/api`
- Envelope:
  - success: `{ ok:true, data:{...}, warnings:[] }`
  - error: `{ ok:false, error:{ code, message, details } }`
- Pagination: `limit`, `offset`
- Sorting: `sort=name`, `dir=asc|desc`
- Optimistic concurrency:
  - clients may send `If-Match: <etag>`
  - server returns `409 CONFLICT` if mismatch

### 5.2 Health & workspace
#### GET `/api/health`
Returns up status + workspace path.

#### GET `/api/workspace`
Returns active workspace + db path + asset path.

#### POST `/api/workspace/open`
Sets workspace (server-side). Body:
```json
{ "workspacePath": "/Users/me/CaptainJawaWorkspace" }
```
Server creates folders + DB if missing.

> Note: UI-only browser build cannot create folders; this is why server-owned workspace is required.

### 5.3 Metadata endpoints (for agents)
#### GET `/api/meta/versions`
Must match validators’ accepted schema versions.

#### GET `/api/meta/registries`
Returns:
- blockRegistry.json
- nodeRegistry.json
- derived enums (TokenKey, ZoneKey, etc.)

#### GET `/api/meta/schemas`
Return JSON schemas if present (recommended).

### 5.4 Validation endpoints
#### POST `/api/validate/card`
Body: `{ payload }` → returns `{ issues }` (same shape as Forge).

#### POST `/api/validate/deck`
#### POST `/api/validate/scenario`
Same pattern.

### 5.5 Cards endpoints
#### POST `/api/cards`
Body envelope:
```json
{
  "mode": "canonical|forgeProject",
  "payload": {},
  "options": { "upsert": true, "validate": true, "storeProject": true, "compileGraphs": false }
}
```

Rules:
- If `mode=forgeProject`, server extracts `payload.card` and stores project JSON too.
- If `compileGraphs=true`, compile graph → update canonical steps.

Returns `{ id, storedAs, issues, warnings }`.

#### GET `/api/cards/:id`
Returns canonical card + optional project summary.

#### PUT `/api/cards/:id`
Upsert with concurrency support.

#### GET `/api/cards`
Filters:
- `query`
- `type`
- `faction`
- `subType` (repeatable)
- `tag` (repeatable)
- `attribute` (repeatable)

#### GET `/api/cards/:id/relations`
Returns inbound/outbound relations from `card_relations`.

#### POST `/api/cards/:id/relations`
Upsert relation. Body:
```json
{ "toCardId":"...", "relationType":"ONLY_USABLE_BY", "json": { "notes":"..." } }
```

### 5.6 Projects (graph editor persistence)
#### POST `/api/projects`
Store/Upsert project JSON.

#### GET `/api/projects/:id`
#### GET `/api/projects?cardId=...`

### 5.7 Catalog endpoints (factions/types/attributes)
#### GET `/api/catalogs`
Query by `kind`.

#### PUT `/api/catalogs/:kind`
Upsert catalog items for that kind.
Body:
```json
{ "kind":"FACTION", "items":[ { "key":"RED_FANG", "label":"Red Fang Pirates", "iconAssetId":"..." } ] }
```

Required kinds for MVP:
- `FACTION`
- `UNIT_TYPE`
- `ATTRIBUTE`
- `TAG`
- `TOKEN_KEY` (should match TokenKey registry)
- `DAMAGE_TYPE`
- `STATUS_KEY`

### 5.8 Assets endpoints
#### POST `/api/assets`
multipart upload:
- field: `file`
- optional fields: `kind`, `dedupe=true`
Returns: `{ assetId, url, sha256, width, height }`

#### GET `/assets/:file`
Serves from workspace assets folder.

#### GET `/api/assets/:id`
Metadata

#### DELETE `/api/assets/:id`
Deletes metadata + file (policy: refuse if referenced unless `force=true`).

### 5.9 Deck endpoints
#### POST `/api/decks`
Body: `{ payload, options }`.

#### GET `/api/decks/:id`
#### PUT `/api/decks/:id`
#### GET `/api/decks`
Filters:
- `query`
- `faction`
- `hasCardId` (find decks containing a specific card)

### 5.10 Scenario endpoints
#### POST `/api/scenarios`
Upsert scenario JSON.

#### GET `/api/scenarios/:id`
#### PUT `/api/scenarios/:id`
#### GET `/api/scenarios`
Filters: `query`, `players`, `hasDeckId`.

#### GET `/api/scenarios/:id/setup`
Returns derived setup package:
- starting units by side
- deck assignments
- environment variables
- triggers summary
- story slide mapping

#### POST `/api/scenarios/:id/simulate`
Runs scenario triggers against a test state/event payload and returns:
- nextState
- firedTriggers
- issues

### 5.11 Library endpoints
#### GET `/api/library`
Filters by `entryType`.

#### POST `/api/library`
Upsert entry.

#### GET `/api/library/export`
Returns JSON library bundle.

#### POST `/api/library/import`
Imports library bundle.

### 5.12 Export/import full workspace
#### GET `/api/export/all`
Returns bundle (zip recommended later; JSON ok for MVP):
- cards
- decks
- scenarios
- projects
- catalogs
- relations
- asset manifest

#### POST `/api/import/all`
Imports bundle; supports “relink assets” by copying files into workspace.

### 5.13 AI endpoints (server-side to avoid CORS & to centralize keys)
**MVP approach:** implement endpoints but allow providers to be “NOT_IMPLEMENTED” until configured.

#### POST `/api/ai/image`
Body:
```json
{
  "provider": "openai|gemini",
  "prompt": "string",
  "references": ["assetId1","assetId2"],
  "size": { "width": 768, "height": 1024 },
  "saveAsAsset": true
}
```
Returns asset URL.

#### POST `/api/ai/json`
Lets an agent request “rule-safe JSON” from an LLM with strict schema.
Body includes:
- systemPrompt
- userPrompt
- schema (JSON schema)
- context selectors (include catalogs, registries, etc.)

---

## 6) Validation, invariants, and cross-checks (critical)
### 6.1 Registry ⇄ Types ⇄ Schema alignment
Implement an automated check (test) that ensures:
- Every step type in `blockRegistry.steps.types` exists in:
  - TS union types
  - schema validator allowances
  - (if relevant) editor UI mapping or generic editor fallback
- Every enum in registry exists in schema dropdowns (or is derived dynamically)

### 6.2 Schema version consistency
The API and UI must share:
- accepted schema versions list (for cards/decks/scenarios/projects)
- migrations that can upgrade old objects to new versions

### 6.3 Referential integrity checks
Validation endpoints should optionally verify references:
- card ids referenced in decks exist
- deck ids referenced in scenarios exist
- asset ids referenced in cards exist (optional “warn only”)

### 6.4 Object round-trip requirements
- Export → Import must preserve objects exactly
- Project export must preserve graph + layout + canonical card snapshot

---

## 7) Implementation requirements (server stack)
### 7.1 Recommended stack
- Node.js + TypeScript
- Fastify (or Express)
- better-sqlite3 (simple, fast, sync)
- @fastify/multipart for uploads
- @fastify/static for assets
- CORS config for dev

### 7.2 Scripts
Add root scripts:
- `dev:server` (tsx server)
- `dev` (vite)
- `dev:all` (concurrently)
- `test` runs:
  - registry/schema alignment tests
  - API smoke tests
  - UI build

### 7.3 Vite proxy
In dev, configure:
- `/api` → server
- `/assets` → server

---

## 8) Scenario runtime model (needed for robust triggers)
Even in “physical board + digital helper” mode, scenarios require:
- event triggers (TURN_START, UNIT_DIED, ZONE_EMPTY, etc.)
- environment variables (waterLevel, fogDensity, etc.)
- deck/hand manipulation actions
- story slide triggers (open a slideshow/video)

**Recommendation:** store scenario triggers as the same **step program** system used by abilities, but with different event origins and permissions.

### 8.1 Scenario trigger structure (recommended)
- `when`: event filter + condition
- `then`: steps to execute
- `priority`: order if multiple triggers fire
- `once`: boolean
- `cooldown`: optional

### 8.2 Event bus (server-side)
Define canonical events:
- GAME_START
- TURN_START / TURN_END
- UNIT_SPAWNED / UNIT_DIED
- CARD_DRAWN / CARD_DISCARDED
- ENV_CHANGED
- CUSTOM_EVENT (payload)

Simulation endpoint applies triggers deterministically for testing.

---

## 9) “Exactly what must be built” (deliverables)
### 9.1 Database
- Workspace initialization + folder creation
- SQLite DB with tables listed in §4
- Indexes listed in §4
- Migration system:
  - db migrations
  - object schema migrations (CJ-1.0 → CJ-1.1 → CJ-1.2)

### 9.2 API
- All endpoint groups in §5 implemented
- Consistent envelopes
- Validation endpoints use shared validators
- Assets upload + serving works
- Export/import bundles work

### 9.3 UI wiring (minimum)
- UI can:
  - select workspace (if server provides)
  - show server status
  - upload images via `/api/assets`
  - list/search cards via `/api/cards`
  - deck builder uses `/api/cards` search + `/api/decks`
  - scenario builder uses `/api/scenarios` + `/api/scenarios/:id/setup`

### 9.4 Tests
- Registry/schema alignment test (P0)
- API smoke test:
  - create card
  - fetch card
  - upload asset
  - create deck referencing card
  - create scenario referencing deck
  - export bundle
  - import bundle to fresh workspace

### 9.5 Documentation updates
Update root docs to include:
- API usage for agents
- Workspace model
- Object versions and migration rules
- How to add a new step type end-to-end (registry → schema → editor → server)

---

## 10) Acceptance Criteria (final checklist)
- ✅ New workspace can be created and opened
- ✅ Cards can be created via API and appear in UI search
- ✅ Asset upload returns stable URL and card preview renders it
- ✅ Decks can be created and validated against cards
- ✅ Scenarios can be created, show derived setup, and simulate triggers
- ✅ Export/import preserves everything
- ✅ No schemaVersion mismatch between UI export and API validation
- ✅ Automated tests prevent drift (registry/types/schema)

---
