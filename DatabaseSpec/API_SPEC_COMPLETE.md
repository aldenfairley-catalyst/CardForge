# Captain Jawa Forge — API Specifications (Complete)
Version: 1.0  
Date: 2025-12-23  
Applies to: **Local API server** (`server/`) + frontend provider `src/lib/providers/localApiProvider.ts`

> Purpose: give a naive AI agent a complete technical + functional blueprint for the HTTP API:
> - CRUD for cards/decks/scenarios/graphs/tools/catalogs/assets/library
> - import/export bundles
> - run/trace graph executions
> - AI helper endpoints (image generation + text assistance) via server proxy

---

## 1. API principles
1) JSON-first: request/response is JSON except for asset upload/download.
2) Version-aware: every content object includes `schemaVersion`.
3) Import boundary migration: old versions accepted only in import routes and migrated to latest.
4) Soft delete by default.
5) Stable IDs: client supplies UUID/ULID; server validates uniqueness.

---

## 2. Base URL and routing
- Dev: `http://localhost:PORT/api`
- Recommended: `/api/v1` as a stable prefix (optional; but pick one)

---

## 3. Authentication (trusted network)
Minimal “shared token” header:
- `Authorization: Bearer <TOKEN>`
or
- `X-CJ-TOKEN: <TOKEN>`

Rules:
- GET list endpoints may be open in dev mode.
- Mutation endpoints require a token when `CJ_REQUIRE_TOKEN=true`.

---

## 4. Common conventions

### 4.1 Pagination
Query params:
- `limit` (default 50, max 200)
- `cursor` (opaque)
Return:
```json
{"items":[...],"nextCursor":"..."}
```

### 4.2 Sorting and filtering
Common query params:
- `q` free-text
- `type`, `faction`, `tag`, `subType`, `attribute`
- `includeDeleted=true|false`

### 4.3 Error format
```json
{
  "error": {
    "code": "SCHEMA_VERSION_UNSUPPORTED",
    "message": "schemaVersion must be CJ-2.0",
    "details": { "path": "schemaVersion" }
  }
}
```

---

## 5. Endpoints

## 5.1 Health and meta
### GET `/health`
Returns server status and versions:
```json
{"ok":true,"db":"connected","versions":{"card":"CJ-2.0","graph":"CJ-GRAPH-2.0"}}
```

### GET `/meta/catalogs`
Returns known catalog IDs and versions.

---

## 5.2 Cards
### GET `/cards`
Filters: `q,type,faction,tag,subType,attribute,limit,cursor,includeDeleted`
Response:
```json
{"items":[{"id":"...","name":"...","type":"UNIT","schemaVersion":"CJ-2.0"}], "nextCursor":null}
```

### GET `/cards/:id`
Returns full card object (latest).

### POST `/cards`
Creates card (latest schema only).
Body: full card JSON.

### PUT `/cards/:id`
Replace card (latest schema only).

### PATCH `/cards/:id`
Partial update:
- server loads latest
- merges patch
- re-validates
- writes

### DELETE `/cards/:id`
Soft delete.

### POST `/cards/import`
Accepts any supported import version:
Body:
```json
{"card":{...},"mode":"migrate"}
```
Response:
```json
{"imported":{...latest...},"migration":{"from":"CJ-1.1","to":"CJ-2.0"}}
```

---

## 5.3 Graphs
### GET `/graphs`
Filters: `q,kind,ownerEntityType,ownerEntityId`

### GET `/graphs/:id`
### POST `/graphs`
### PUT `/graphs/:id`
### DELETE `/graphs/:id`

### POST `/graphs/import`
Imports old graph versions, migrates to latest.

---

## 5.4 Tools
### GET `/tools`
### GET `/tools/:id`
### POST `/tools`
### PUT `/tools/:id`
### DELETE `/tools/:id`

---

## 5.5 Decks
### GET `/decks`
Filters: `q,faction,cardId` (find decks containing card)
### GET `/decks/:id`
### POST `/decks`
### PUT `/decks/:id`
### DELETE `/decks/:id`
### POST `/decks/import`

---

## 5.6 Scenarios
### GET `/scenarios`
Filters: `q,playerCount`
### GET `/scenarios/:id`
### POST `/scenarios`
### PUT `/scenarios/:id`
### DELETE `/scenarios/:id`
### POST `/scenarios/import`

---

## 5.7 Catalogs
Catalogs store editable lists used by the UI and validation.

### GET `/catalogs`
### GET `/catalogs/:id`
### PUT `/catalogs/:id` (replace)
### PATCH `/catalogs/:id` (partial edit)

Expected catalog JSON structure example:
```json
{
  "schemaVersion":"CATALOG-1.0",
  "id":"FACTIONS",
  "items":[
    {"id":"JAWA","label":"Jawa","iconAssetId":"...","theme":"SAND"},
    {"id":"UNDEAD","label":"Undead","iconAssetId":"...","theme":"BONE"}
  ]
}
```

---

## 5.8 Assets
### POST `/assets/upload`
Multipart form-data:
- `file` (required)
- `kind` (optional)

Response:
```json
{"asset":{"id":"...","mimeType":"image/png","sha256":"...","width":512,"height":768}}
```

### GET `/assets/:id`
Returns file bytes with correct content-type.
Support `?download=1`.

### GET `/assets`
List assets, filter by kind/mime.

### DELETE `/assets/:id`
Soft delete (or hard delete; pick one).

---

## 5.9 Library entries
### GET `/library`
Filters: `entryType,q`
### POST `/library`
### PUT `/library/:id`
### DELETE `/library/:id`

---

## 5.10 Bundles (import/export)
### GET `/bundle/export`
Query:
- `cards=1&graphs=1&decks=1&scenarios=1&assets=1`
Response:
- JSON bundle OR zip (if you include assets)

### POST `/bundle/import`
Body:
```json
{"bundle":{"schemaVersion":"CJ-BUNDLE-1.0","cards":[...],"...":...}}
```
Response:
- counts + migration summaries

---

## 5.11 Graph execution (debug/test runner)
### POST `/run/graph`
Purpose: execute a graph on the server and return a trace.

Body:
```json
{
  "graphId":"...",
  "entryNodeId":"optional",
  "inputs":{"actorCardId":"...","targetCardIds":["..."]},
  "mode":"DEBUG",
  "persistRun":true
}
```

Response:
```json
{
  "runId":"...",
  "status":"SUCCESS",
  "outputs":{"damage":12},
  "trace":[
    {"nodeId":"n1","status":"START","t":0},
    {"nodeId":"n2","status":"OK","t":12,"data":{"value":4}}
  ]
}
```

### GET `/run/graph/:runId`
Returns stored trace/output.

---

## 5.12 AI proxy endpoints
> The UI should call the server to avoid CORS and to keep keys out of the browser when running locally.

### POST `/ai/image`
Request:
```json
{
  "provider":"openai|gemini",
  "prompt":"...",
  "size":{"width":768,"height":1024},
  "referenceAssetIds":["..."],
  "options":{"style":"lego","seed":123}
}
```

Response:
- either returns an `assetId` created on success:
```json
{"assetId":"...","provider":"gemini","meta":{"model":"...","cost":0}}
```

### POST `/ai/text`
For structured JSON generation (cards/scenarios/graphs), returns strict JSON only.

---

## 6. Definition of Done
- [ ] CRUD endpoints exist for cards, graphs, tools, decks, scenarios, catalogs, assets, library
- [ ] Import endpoints migrate to latest
- [ ] Bundle import/export works
- [ ] Graph run endpoint returns trace and stores runs
- [ ] Frontend provider can switch to local API mode and function end-to-end
- [ ] Vitest/supertest coverage exists for critical endpoints
