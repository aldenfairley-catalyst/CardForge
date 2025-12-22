# API_SPEC.md
Captain Jawa Forge — Local API (SQLite + Assets) Specification  
Version: 1.0  
Status: Design for local-first Mac (M1) deployment  
Base URL (default): `http://127.0.0.1:4173/api` (example; actual port configurable)

## 1) Purpose
This API exists to support:
- **AI agents** that can POST JSON to create/update cards, decks, scenarios, and interactions.
- **The Forge UI** to persist data locally (SQLite) and store assets (images/videos) on disk.
- **Validation + compilation as a service**, ensuring cards/scenarios created by tools are correct and consistent with the game rules.

The API is **local-first**:
- Default bind: `127.0.0.1` only (safe on a laptop).
- Optional LAN mode can be enabled by binding to `0.0.0.0`.

## 2) Shared Rule: One Source of Truth
The API must use the same shared logic as the UI for:
- schema validation (`validateCard`, `validateDeck`, `validateScenario`, etc.)
- step registry alignment (blockRegistry.json)
- node registry alignment (nodeRegistry.json)
- graph compilation (when introduced)

## 3) Content Types
- JSON APIs: `application/json`
- File upload: `multipart/form-data` for image/video/assets
- Streaming download: `application/octet-stream` for exports

## 4) Auth & Access Control (Local-first)
Not required for home use, but the API supports an **optional** simple key:
- Header: `X-API-Key: <string>`
- If enabled in config, endpoints reject missing key with `401`.

## 5) Standard Response Shapes
### 5.1 Success envelope
```json
{
  "ok": true,
  "data": {},
  "warnings": []
}
```

### 5.2 Error envelope
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human readable error",
    "details": []
  }
}
```

### 5.3 Validation issue format (matches Forge)
```json
{
  "severity": "ERROR",
  "code": "SCHEMA_VERSION",
  "message": "schemaVersion must be CJ-1.0 or CJ-1.1",
  "path": "schemaVersion"
}
```

## 6) Versioning
### 6.1 API version
- Header `X-CJ-API-Version: 1`
- Path versioning is optional; default is stable for local use.

### 6.2 Data schema versions
Data objects carry their own schema versions:
- Card: `CJ-1.x` (e.g., CJ-1.0, CJ-1.1, CJ-1.2)
- Forge Project (graph): `CJ-FORGE-PROJECT-1.0`
- Deck: `CJ-DECK-1.0`
- Scenario: `CJ-SCENARIO-1.0` (recommended)

**Rule:** `/api/meta/versions` must return exactly what the server accepts.

## 7) Core Resources
### 7.1 Card
- Stores canonical card JSON (`CJ-1.x`).
- May additionally store an editor project JSON (graph + layout) if posted.

### 7.2 Deck
- Stores deck JSON (`CJ-DECK-1.0`), includes card references and loadouts.

### 7.3 Scenario
- Stores scenario JSON (`CJ-SCENARIO-1.0`): setup, triggers, victory, story slides, deck assignment/switching.

### 7.4 Asset
- Stores binary files in filesystem + metadata in SQLite.
- Cards reference assets by URL/path, not Data URLs.

## 8) Endpoints

---
# 8A) Health & Metadata

## GET /api/health
**Purpose:** service readiness, used by UI startup screen.
**Response**
```json
{ "ok": true, "data": { "status": "up", "time": "2026-01-01T00:00:00.000Z" } }
```

## GET /api/meta/versions
**Purpose:** tell agents what schema versions are accepted.
**Response**
```json
{
  "ok": true,
  "data": {
    "apiVersion": 1,
    "accepted": {
      "cardSchemaVersions": ["CJ-1.0", "CJ-1.1", "CJ-1.2"],
      "forgeProjectVersion": "CJ-FORGE-PROJECT-1.0",
      "deckSchemaVersions": ["CJ-DECK-1.0"],
      "scenarioSchemaVersions": ["CJ-SCENARIO-1.0"]
    }
  }
}
```

## GET /api/meta/registries
**Purpose:** agents + UI can fetch registries (steps, node defs, enums).
**Response**
```json
{
  "ok": true,
  "data": {
    "blockRegistry": { "...": "..." },
    "nodeRegistry": { "...": "..." },
    "enums": {
      "TokenKey": ["UMB","AET","CRD","CHR","STR","RES","WIS","INT","SPD","AWR"],
      "DamageType": ["PHYSICAL","FIRE","COLD","LIGHTNING","POISON","ARCANE"],
      "StatusKey": ["SLOWED","STUNNED","BURNING","FROZEN","POISONED"]
    }
  }
}
```

## GET /api/meta/schemas
**Purpose:** agents can retrieve JSON Schemas used by server (optional but recommended).
**Response**
```json
{ "ok": true, "data": { "cardSchema": {}, "deckSchema": {}, "scenarioSchema": {}, "forgeProjectSchema": {} } }
```

---
# 8B) Validate / Compile (Service Endpoints)

## POST /api/validate/card
**Purpose:** validate a card without storing it.
**Body**
```json
{ "payload": { "schemaVersion": "CJ-1.1", "...": "..." } }
```
**Response**
```json
{ "ok": true, "data": { "issues": [] } }
```

## POST /api/validate/deck
## POST /api/validate/scenario
Same structure: `{ payload }` → `{ issues }`.

## POST /api/compile/ability-graph
**Purpose:** compile a graph into canonical `ability.execution.steps[]`.
**Body**
```json
{
  "ability": { "componentType": "ABILITY", "...": "..." },
  "graph": { "graphVersion": "CJ-GRAPH-1.0", "...": "..." },
  "options": { "strict": false }
}
```
**Response**
```json
{
  "ok": true,
  "data": {
    "steps": [ { "type": "SHOW_TEXT", "text": "..." } ],
    "issues": []
  }
}
```

---
# 8C) Cards

## POST /api/cards
**Purpose:** create or upsert a card. Agents use this most.
**Body (envelope)**
```json
{
  "mode": "canonical|forgeProject",
  "payload": { "...": "..." },
  "options": {
    "upsert": true,
    "validate": true,
    "compileGraphs": false,
    "storeProject": true
  }
}
```
**Behavior**
- If `mode=canonical`: `payload` must be `CJ-1.x` card JSON.
- If `mode=forgeProject`: `payload` must be `CJ-FORGE-PROJECT-1.0` and server extracts the canonical card from it.
- When `options.compileGraphs=true`, server compiles embedded graphs and updates canonical steps before storing.
- Stores:
  - `cards` row with canonical JSON
  - optional `projects` row with forge project JSON

**Response**
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "storedAs": "CJ-1.1",
    "issues": [],
    "warnings": [],
    "links": { "card": "/api/cards/uuid" }
  }
}
```

## GET /api/cards/:id
Returns stored canonical card + optional project metadata.
```json
{ "ok": true, "data": { "card": {}, "project": null } }
```

## PUT /api/cards/:id
Upserts a canonical card (same validation rules as POST).

## GET /api/cards
**Query params**
- `query` (full text search by name/id/tags)
- `type` (UNIT/ITEM/SPELL/etc)
- `faction`
- `subType` (repeatable)
- `tag` (repeatable)
- `limit`, `offset`
**Response**
```json
{ "ok": true, "data": { "items": [ { "id":"...", "name":"...", "type":"UNIT", "faction":"..." } ], "total": 123 } }
```

## DELETE /api/cards/:id
Deletes the card and optionally its project/asset references (configurable).

---
# 8D) Decks

## POST /api/decks
**Body**
```json
{
  "payload": { "schemaVersion": "CJ-DECK-1.0", "id":"uuid", "name":"...", "faction":"...", "cards":[...], "loadouts":[...] },
  "options": { "upsert": true, "validate": true }
}
```

## GET /api/decks/:id
## PUT /api/decks/:id
## GET /api/decks
Query support:
- `faction`, `query`, `hasCardId`, `limit`, `offset`

---
# 8E) Scenarios

## POST /api/scenarios
Stores scenario JSON.
**Body**
```json
{
  "payload": {
    "schemaVersion": "CJ-SCENARIO-1.0",
    "id": "uuid",
    "name": "Storm Convergence",
    "players": 2,
    "setup": { "startingUnits": [], "environment": {}, "decks": [] },
    "triggers": [],
    "victory": [],
    "storySlides": []
  },
  "options": { "upsert": true, "validate": true }
}
```

## GET /api/scenarios/:id
Returns scenario.

## GET /api/scenarios/:id/setup
Returns a derived setup package useful for UI and agents:
- starting units by side
- deck assignments
- environment variables
- trigger summary

## POST /api/scenarios/:id/simulate
**Purpose:** apply triggers to a test state to validate scenario logic before play.
**Body**
```json
{
  "state": { "turn": 1, "phase": "START", "env": { "waterLevel": 0 }, "units": [] },
  "event": { "type": "TURN_START", "payload": { "player": "P1" } }
}
```
**Response**
```json
{ "ok": true, "data": { "nextState": {}, "firedTriggers": [], "issues": [] } }
```

---
# 8F) Assets (Images / Video / Audio)

## POST /api/assets
Upload file and receive a stable URL.
- Content-Type: `multipart/form-data`
- Field: `file`
- Optional: `kind=image|video|audio|other`
**Response**
```json
{
  "ok": true,
  "data": {
    "assetId": "uuid",
    "kind": "image",
    "mime": "image/png",
    "url": "/assets/uuid.png",
    "sha256": "...."
  }
}
```

## GET /assets/:filename
Serves the file from disk (static route).

---
# 8G) Exports / Imports (Backup)

## GET /api/export/all
Downloads a zip or JSON bundle of:
- cards
- decks
- scenarios
- projects
- asset manifest

## POST /api/import/all
Imports a bundle and optionally re-links assets.

---
# 8H) AI Image Generation (optional future; stub allowed)
If you add AI image generation via server (recommended for CORS and key safety):
## POST /api/ai/image
Body:
```json
{
  "provider": "openai|gemini",
  "prompt": "....",
  "references": ["assetId1","assetId2"],
  "size": { "width": 768, "height": 1024 },
  "saveAsAsset": true
}
```
Response returns an asset URL.

> Note: provider integrations may be implemented later; API can return `501 NOT_IMPLEMENTED` until then.

---

## 9) SQLite Data Model (minimum)
Tables (suggested):
- `cards(id TEXT PK, name TEXT, type TEXT, faction TEXT, schemaVersion TEXT, json TEXT, updatedAt TEXT)`
- `projects(id TEXT PK, cardId TEXT, json TEXT, updatedAt TEXT)`
- `decks(id TEXT PK, name TEXT, faction TEXT, json TEXT, updatedAt TEXT)`
- `scenarios(id TEXT PK, name TEXT, json TEXT, updatedAt TEXT)`
- `assets(id TEXT PK, kind TEXT, mime TEXT, path TEXT, sha256 TEXT, createdAt TEXT)`

Indexes:
- cards(name), cards(type), cards(faction)
- decks(name), decks(faction)
- scenarios(name)

## 10) CORS
- Allow UI origin in dev (Vite)
- In local mode, allow `http://127.0.0.1:*` and `http://localhost:*`
- For LAN mode, configurable allowlist

## 11) Agent Usage Pattern (recommended)
Agents should follow:
1) `GET /api/meta/versions`
2) `GET /api/meta/registries`
3) Generate JSON
4) `POST /api/validate/*` until no ERROR
5) `POST /api/cards` / `/api/scenarios` / `/api/decks`
6) Query back with `GET /api/*/:id`
