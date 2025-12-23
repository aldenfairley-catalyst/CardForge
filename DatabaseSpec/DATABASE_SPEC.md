# Captain Jawa Forge — Database Specifications
Version: 1.0  
Date: 2025-12-23  
Applies to: **Local API / SQLite backend** (trusted network, no monetization/security hardening required)

> Purpose: give a naive AI agent everything needed to understand **what the database stores**, **why it exists**, and **how it supports the current Forge and future gameplay ecosystem**.

---

## 1. Context and product intent

### 1.1 What this project is
Captain Jawa Forge is a **game designer & player toolkit** for “The Adventures of Captain Jawa”:
- Designers create **cards** (units/items/spells/etc) as JSON + logic graphs.
- Players build **decks** and **scenarios** that reference those cards.
- A server (later the Arbiter) will run authoritative gameplay; **today** we need a local API to:
  - persist content reliably (not localStorage)
  - store images/assets without CORS pain
  - support agent automation (AI posting new cards/graphs/scenarios)
  - run graphs for testing/debugging

### 1.2 Why SQLite
SQLite provides:
- single-file portability (good for local use and GitHub-pages dev via optional mock)
- fast iteration and easy backup
- a stable schema for future migrations

### 1.3 Operating modes supported by DB
1) **Forge authoring**: cards/graphs/tools, asset library, catalogs (factions/types/attributes)
2) **Deck building**: deck objects referencing cards; search indexes; deck validation later
3) **Scenario building**: scenarios referencing cards + decks + triggers + story beats
4) **Graph runtime/testing**: store graph runs and debug traces
5) **Agent automation**: create/update content through API endpoints

---

## 2. Non-goals (for this phase)
- Multi-tenant users, roles, payments
- Remote auth beyond a simple token
- Full gameplay state storage (that’s Arbiter/Redis later)
- Complex full-text search engines (SQLite FTS is enough)

---

## 3. Core design principles
1) **Content-addressed assets**: store binary blobs or file-paths with sha256 to dedupe.
2) **Versioned JSON payloads**: store canonical JSON plus extracted metadata for search.
3) **Soft delete**: preserve history and allow undo/restore.
4) **Migrations required**: schema evolves; data is migrated forward automatically.
5) **Deterministic IDs**: UUIDv4 or ULID; never rely on auto-increment IDs for external references.
6) **Separation of concerns**:
   - Cards are immutable-ish content definitions.
   - Graphs are authoring-time program definitions.
   - Tools are reusable external “capabilities” invoked by graphs.
   - Decks and scenarios reference cards/graphs; do not duplicate card content.

---

## 4. Database file layout
Recommended:
- `data/captain-jawa.sqlite` (main DB file)
- `data/assets/` (optional file store if you do not store BLOBs in DB)
- `data/backups/` (timestamped copies)

If storing assets as files:
- store only **relative paths** in DB, never absolute paths
- write a “content store” helper that maps sha256 → file path

---

## 5. Entity model overview

### 5.1 Entities
- **cards**: CJ card JSON definitions
- **graphs**: CJ graph JSON (card abilities, scenario events, deck events)
- **tools**: reusable custom tool definitions invoked by graph nodes
- **decks**: deck JSON referencing cards
- **scenarios**: scenario JSON referencing decks/cards/graphs
- **catalogs**: lists for faction/type/attributes/token keys/etc (editable)
- **assets**: images and other media (png/jpg/webp, video, audio)
- **libraries**: reusable fragments (steps, abilities, targeting profiles, node macros)
- **projects**: optional bundling of related cards/decks/scenarios for export/import
- **runs**: graph test executions and debug traces

### 5.2 Relationships
- deck.cards[] → cards.id
- scenario.setup.sides[].deckId → decks.id
- card.components[ABILITY].graphId (optional) → graphs.id
- graph.nodes[TOOL_CALL].toolId → tools.id
- card.visuals.cardImage → assets.id (or file path)
- catalogs provide pick-lists for faction/type/attribute and validation

---

## 6. SQL schema (recommended)

> Notes:
> - The DB stores the **canonical JSON** in a `json` column.
> - It also stores **denormalized searchable fields** (name, type, faction, tags, etc.)
> - You can add SQLite FTS tables once basics work.

### 6.1 Shared columns pattern
Use on most content tables:
- `id TEXT PRIMARY KEY` (ULID/UUID)
- `schemaVersion TEXT NOT NULL`
- `name TEXT NOT NULL`
- `json TEXT NOT NULL` (stringified JSON)
- `hash TEXT` (sha256 of json for dedupe)
- `createdAt INTEGER NOT NULL` (unix ms)
- `updatedAt INTEGER NOT NULL` (unix ms)
- `deletedAt INTEGER` (null = active)

### 6.2 Table: `cards`
Purpose: store all card definitions (UNIT/ITEM/SPELL/ENVIRONMENT/TOKEN).

Suggested columns:
- `id`, `schemaVersion`, `name`, `type`
- `faction` (nullable)
- `subTypes TEXT` (JSON array)
- `attributes TEXT` (JSON array)
- `tags TEXT` (JSON array)
- `cardImageAssetId TEXT` (nullable, FK → assets.id)
- `json`, `hash`, `createdAt`, `updatedAt`, `deletedAt`

Indexes:
- `(type)`, `(faction)`, `(name)`
- optional: `(deletedAt)` partial index for active rows

### 6.3 Table: `graphs`
Purpose: store graph programs for:
- card actions/abilities
- deck events
- scenario events
- UI mini-flows / subsystems

Columns:
- `id`, `schemaVersion`, `name`
- `kind TEXT NOT NULL` (CARD_ABILITY | SCENARIO_EVENT | DECK_EVENT | TOOL | MACRO)
- `ownerEntityType TEXT` (CARD | SCENARIO | DECK | NONE)
- `ownerEntityId TEXT` (nullable)
- `json`, `hash`, timestamps

Indexes:
- `(kind)`
- `(ownerEntityType, ownerEntityId)`

### 6.4 Table: `tools`
Purpose: store “custom tools” callable from graphs.

Columns:
- `id`, `schemaVersion`, `name`
- `toolType TEXT NOT NULL` (e.g. CODE_JS, UI_FLOW, WEBHOOK, EFFECT_OVERLAY, TIMER, MODEL_VIEWER)
- `configJson TEXT NOT NULL` (tool schema; runtime uses it)
- `entrypoint TEXT` (for scripts), `uiComponentId TEXT` (for UI flows), etc.
- timestamps

### 6.5 Table: `assets`
Purpose: store images/video/audio. Supports two storage modes:
A) BLOB storage in DB  
B) file-path storage with DB metadata

Columns:
- `id TEXT PRIMARY KEY`
- `kind TEXT` (IMAGE | VIDEO | AUDIO | JSON | OTHER)
- `mimeType TEXT`
- `sha256 TEXT NOT NULL`
- `byteSize INTEGER NOT NULL`
- `width INTEGER`, `height INTEGER` (for images)
- `storage TEXT NOT NULL` (BLOB | FILE)
- `blob BLOB` (nullable)
- `path TEXT` (nullable)
- `createdAt`, `deletedAt`

Indexes:
- `(sha256)` unique (dedupe)
- `(kind)`

### 6.6 Table: `decks`
Purpose: store deck lists and metadata.

Columns:
- `id`, `schemaVersion`, `name`
- `faction TEXT` (nullable)
- `description TEXT` (nullable)
- `json`, `hash`, timestamps

Indexes:
- `(faction)`, `(name)`

### 6.7 Table: `scenarios`
Purpose: store scenario setups, triggers, victory conditions, story beats.

Columns:
- `id`, `schemaVersion`, `name`
- `playerCountMin INTEGER`, `playerCountMax INTEGER`
- `json`, timestamps

### 6.8 Table: `catalogs`
Purpose: replace hardcoded picklists (factions/types/attributes/status/damage types/etc).

Columns:
- `id TEXT PRIMARY KEY` (e.g. "FACTIONS", "UNIT_TYPES", "ATTRIBUTES")
- `schemaVersion TEXT NOT NULL` (CATALOG-1.0)
- `json TEXT NOT NULL` (list items, icons, color, validation rules)
- timestamps

### 6.9 Table: `library_entries`
Purpose: reusable snippets.
- ability templates, step templates, targeting profiles, macros, graph fragments.

Columns:
- `id`, `schemaVersion`, `name`
- `entryType TEXT` (ABILITY | STEP | PROFILE | MACRO | GRAPH_FRAGMENT)
- `json`, timestamps

### 6.10 Table: `graph_runs`
Purpose: debug/test execution runs from the graph view.

Columns:
- `id TEXT PRIMARY KEY`
- `graphId TEXT NOT NULL`
- `requestedBy TEXT` (optional)
- `inputJson TEXT` (runtime inputs)
- `resultJson TEXT` (outputs)
- `traceJson TEXT` (node-by-node trace)
- `status TEXT` (SUCCESS | ERROR)
- `startedAt`, `finishedAt`

Indexes:
- `(graphId)`, `(startedAt)`

---

## 7. Data validation and invariants

### 7.1 JSON schema versions
- Latest versions are authoritative for storage.
- Older versions are import-only and must be migrated before insert/update.

Invariant:
- **No row may store deprecated schemaVersion** after successful import.

### 7.2 Referential integrity checks
The DB should support “best-effort” FK behavior (SQLite FKs optional).
At the API layer:
- Deck must reference existing card ids.
- Scenario must reference existing deck ids.
- Graph tool nodes must reference existing tool ids.

### 7.3 Soft delete rules
- `deletedAt` set → item hidden by default, but restorable.
- All list endpoints default to `includeDeleted=false`.

---

## 8. Search and indexing

### 8.1 Minimum viable search
- name contains
- filter by type, faction, tags, subtypes, attributes

### 8.2 Future: SQLite FTS
Add `cards_fts`:
- `name`, `rulesText` (computed), `tags`, `subTypes`, `abilitiesText`
Keep FTS in sync on insert/update.

---

## 9. Import/export bundles
Support a portable bundle format:
- `CJ-BUNDLE-1.0`
- contains arrays: cards, graphs, decks, scenarios, assets (or asset references)

Rules:
- import bundle migrates content to latest before storing
- assets are deduped by sha256

---

## 10. Backup, restore, and “clear slate”
- Export DB file + assets folder
- Also support JSON bundle export for sharing
- Provide UI button: “Archive & Reset”:
  - exports a CJ-BUNDLE
  - clears tables (or creates new DB file)
  - initializes catalogs + empty content

---

## 11. Implementation notes (recommended library choices)
- `better-sqlite3` for local desktop performance OR `sqlite3` for easier CI.
- If CI keeps breaking for native builds, use:
  - `sqlite3` + `knex` or `drizzle-orm` or `kysely`
  - or a WASM sqlite layer for browser mode (later)

---

## 12. Definition of Done checklist
- [ ] DB schema exists with migrations
- [ ] Server can create/read/update/delete (soft) for cards/decks/scenarios/graphs/tools/assets/catalogs
- [ ] Import migrates to latest and never stores old schema versions
- [ ] Assets can be uploaded and served without CORS issues
- [ ] Graph runs are stored with trace output
- [ ] Smoke test script verifies CRUD + run endpoints
