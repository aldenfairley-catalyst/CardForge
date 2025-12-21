Captain Jawa Forge — Local Run Specification (MacBook M1)
Version: 1.0 (Architecture + Implementation Target)

## 1) What “Local Run” Means
This spec defines a **locally hosted** version of the Forge ecosystem that runs on a MacBook (M1) with:
- A **local Node.js backend** (webserver)
- A **local SQLite database** for persistence (cards, images, decks, scenarios, catalogs, ability library)
- A **proxy layer** for AI calls (OpenAI / Gemini) to avoid browser CORS and keep API keys off the client
- A **React front-end** (existing Forge UI) that talks to the backend via HTTP

This is NOT Electron (yet). The UI runs in a normal browser, but all storage is handled by the local server + SQLite.

> Optional future extension: package as Electron to allow OS-native file pickers & “choose folder/volume” UX.

---

## 2) Goals / Non-Goals

### Goals
- Save/load everything from a local SQLite DB (portable project file).
- Store images as files on disk (preferred) and reference by ID in DB.
- Provide a clean API for:
  - Cards (CRUD)
  - Decks (CRUD, validation hooks)
  - Scenarios (CRUD, triggers definition)
  - Catalogs (factions/types/attributes/statuses/etc.)
  - Action Library (abilities/steps/profiles snippets)
  - AI proxy endpoints (text + image)
- Avoid CORS issues by calling AI services from local server.
- Keep the front-end able to run in GitHub Pages mode (optional) with a fallback storage adapter.

### Non-goals (for now)
- Monetization
- Multiplayer server authoritative simulation
- Authentication, user accounts
- Full encryption / key vault (local env vars acceptable)

---

## 3) High-Level Architecture

### Components
1) **Client (React/Vite)**
   - Existing Forge UI + Deck Builder + Scenario Builder
   - Uses `DataProvider` interface to store/load entities

2) **Local Backend (Node.js + Express/Fastify)**
   - REST API + optional WebSocket events
   - Reads/writes SQLite
   - Stores images/assets on disk
   - Proxies AI requests

3) **SQLite DB (Project File)**
   - One project = one `.sqlite` database file
   - Optional companion folder for assets: `<project>.assets/`

### Runtime Ports (defaults)
- Client dev server: `http://localhost:5173`
- Backend API server: `http://localhost:8787`
- Production (optional): backend serves built client from `/dist` on `http://localhost:8787`

---

## 4) Project File + Local Storage Layout

### Recommended project layout (portable)
User creates a “project folder” (manual or via CLI):
CaptainJawaProjects/
MyCampaign/
forge.sqlite
assets/
<assetId>.png
<assetId>.jpg
exports/
imports/

### Why assets as files (not DB blobs)?
- Faster browsing
- Easier backups
- Keeps SQLite small
- Allows future Git LFS compatibility

---

## 5) SQLite Data Model (CJ-PROJECT-DB-1.0)

### Core tables
#### `meta`
- `key TEXT PRIMARY KEY`
- `value TEXT`
Used for: schema versions, createdAt, lastOpenedAt, etc.

#### `cards`
- `id TEXT PRIMARY KEY`
- `name TEXT`
- `type TEXT`
- `faction TEXT NULL`
- `schemaVersion TEXT`
- `json TEXT` (full CardEntity JSON)
- `createdAt INTEGER`
- `updatedAt INTEGER`

Indexes:
- `idx_cards_name`
- `idx_cards_type`
- `idx_cards_faction`

Optional:
- FTS5 table for fast search: `cards_fts(name, jsonText)` + triggers.

#### `decks`
- `id TEXT PRIMARY KEY`
- `name TEXT`
- `faction TEXT NULL`
- `schemaVersion TEXT` (e.g., CJ-DECK-1.0)
- `json TEXT`
- `createdAt INTEGER`
- `updatedAt INTEGER`

#### `scenarios`
- `id TEXT PRIMARY KEY`
- `name TEXT`
- `schemaVersion TEXT` (e.g., CJ-SCENARIO-1.0)
- `json TEXT`
- `createdAt INTEGER`
- `updatedAt INTEGER`

#### `assets`
- `id TEXT PRIMARY KEY` (UUID or content-hash)
- `mime TEXT`
- `ext TEXT`
- `sha256 TEXT`
- `byteSize INTEGER`
- `path TEXT` (relative path like `assets/<id>.png`)
- `createdAt INTEGER`

#### `catalogs`
Stores dynamic options (factions, unit types, attributes, etc.)
- `namespace TEXT` (e.g. `factions`, `unitTypes`, `attributes`, `statusKeys`)
- `key TEXT`
- `json TEXT`
- `PRIMARY KEY(namespace, key)`

Example namespaces:
- `factions`
- `unitTypes`
- `attributes`
- `damageTypes`
- `statusKeys`
- `tokenKeys`
- `templates` (card templates by faction/theme)

#### `action_library`
- `id TEXT PRIMARY KEY`
- `kind TEXT` (`ABILITY` | `STEP` | `TARGET_PROFILE`)
- `name TEXT`
- `json TEXT`
- `createdAt INTEGER`
- `updatedAt INTEGER`

---

## 6) Backend API Specification (REST)

Base URL: `/api`

### Cards
- `GET /api/cards?search=&type=&faction=` → list summaries
- `GET /api/cards/:id` → full card JSON
- `POST /api/cards` → create card
- `PUT /api/cards/:id` → update full card JSON
- `DELETE /api/cards/:id`

### Decks
- `GET /api/decks?search=&faction=` → list summaries
- `GET /api/decks/:id`
- `POST /api/decks`
- `PUT /api/decks/:id`
- `DELETE /api/decks/:id`

Extra:
- `POST /api/decks/:id/validate` → returns validation issues (server-side)

### Scenarios
- `GET /api/scenarios?search=` 
- `GET /api/scenarios/:id`
- `POST /api/scenarios`
- `PUT /api/scenarios/:id`
- `DELETE /api/scenarios/:id`

### Assets
- `POST /api/assets` (multipart form upload OR JSON dataUrl)
  - returns `{ assetId, url }`
- `GET /api/assets/:id` → returns image bytes
- `DELETE /api/assets/:id`

### Catalogs
- `GET /api/catalogs/:namespace`
- `PUT /api/catalogs/:namespace/:key`
- `DELETE /api/catalogs/:namespace/:key`

### Action Library
- `GET /api/library`
- `PUT /api/library/:id`
- `DELETE /api/library/:id`

### AI Proxy (CORS-safe)
#### Image generation
- `POST /api/ai/image`
Request:
```json
{
  "provider": "OPENAI|GEMINI",
  "model": "string",
  "size": { "width": 768, "height": 1024 },
  "prompt": "string",
  "negativePrompt": "string?",
  "references": [{ "name":"ref.png", "mime":"image/png", "dataUrl":"data:image/png;base64,..." }]
}

Response:
{ "imageDataUrl": "data:image/png;base64,...", "meta": { "provider":"...", "model":"..." } }
```

Text/rules assistant

POST /api/ai/text
Request:
{ "provider":"OPENAI|GEMINI", "model":"string", "systemPrompt":"...", "userPrompt":"...", "jsonSchema":{...} }

API keys must be read from backend environment variables.

7) Front-End Changes Required
7.1 Introduce a Storage/Data Provider interface

Create src/lib/dataProvider.ts:

CardProvider methods: list/get/upsert/delete

DeckProvider

ScenarioProvider

AssetProvider

CatalogProvider

LibraryProvider

Implementations:

LocalApiProvider (calls http://localhost:8787/api)

BrowserProvider fallback (IndexedDB/localStorage) for GitHub Pages mode

7.2 Startup Screen (Local Mode)

On first run, show “Startup / Project” screen:

Select mode:

Local Project (SQLite) (recommended)

Browser Storage (fallback)

In local mode:

Option A (simple): choose/enter project folder path in UI → sends to backend

Option B (future Electron): file picker dialog

Backend must support:

POST /api/project/open { "path": "/Users/.../MyCampaign/forge.sqlite" }

POST /api/project/new { "folder": "/Users/.../MyCampaign", "name":"MyCampaign" }

For pure browser UI, “choose folder” is not possible reliably; prefer typing path or providing a CLI that creates projects.

7.3 Images

Replace “store Data URL directly in card JSON” with:

upload asset to backend → get {assetId, url}

set card.visuals.cardImage = "/api/assets/<assetId>" (or absolute URL)

store assetId optionally in card.visuals.assetId

8) Local Development + Build Targets
Dev (two-process)

npm run dev runs:

Vite client

Node API server

Use Vite proxy to avoid CORS:

/ api/* → http://localhost:8787

Production (single-process option)

npm run build builds client

Node server serves /dist and /api/*

9) Mac (M1) Setup Requirements

Node.js 20.x (nvm recommended)

SQLite (bundled with macOS, but dev tools ok)

Optional: brew install sqlite for CLI convenience

10) Acceptance Criteria

Can create/edit cards/decks/scenarios and restart app → data persists in SQLite

Images persist as disk files and are served to UI

AI image generation works without CORS and without exposing API key to client

Switching between projects is possible (open another sqlite file)

GitHub Pages mode still works (BrowserProvider)
