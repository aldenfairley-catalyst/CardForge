Captain Jawa Forge — Agent Implementation Instructions (Local Run + SQLite + AI Proxy)
Version: 1.0

## A) Read First
1) Read all root docs:
- `AI_JSON_GUIDE.md`, `AI_VARIABLES.md`, `AI_PLAY_GUIDE.md`, `AI_SYMBOLS_WEBHOOKS.md`, `AGENT_UPDATE_PLAYBOOK.md`
2) Run the app and note current behavior.
3) Identify current storage system usage:
- `src/lib/storage.ts` (localStorage)
- any repository modules for action library
- any deck/scenario storage (likely currently local)

---

## B) Implementation Plan (Must Follow This Order)

### Step 1 — Add a `server/` workspace
Create:

server/
src/
index.ts
db.ts
migrate.ts
routes/
cards.ts
decks.ts
scenarios.ts
assets.ts
catalogs.ts
library.ts
ai.ts
project.ts
package.json
tsconfig.json


Use:
- Express or Fastify
- `better-sqlite3` (simple, fast, no async complexity)
- `multer` (for multipart uploads) OR JSON Data URLs for MVP

Add env support:
- `.env` loaded by server only (`dotenv`)
- `OPENAI_API_KEY`, `GEMINI_API_KEY`

### Step 2 — Implement SQLite migrations
Create a minimal migration system:
- `server/src/migrate.ts`:
  - Create tables if not exist
  - Store `meta.dbVersion = CJ-PROJECT-DB-1.0`

Tables to create (minimum):
- `meta`, `cards`, `decks`, `scenarios`, `assets`, `catalogs`, `action_library`

### Step 3 — Implement API routes
Implement REST routes per `LOCAL_RUN_SPEC.md`.
Important:
- Always store canonical JSON in `json TEXT`
- Store summary fields (name/type/faction) separately for listing performance

### Step 4 — Assets storage
Implement:
- `POST /api/assets`:
  - accept multipart upload OR dataUrl
  - store file in `<projectFolder>/assets/<assetId>.<ext>`
  - write record in `assets` table
- `GET /api/assets/:id`:
  - serve file bytes

### Step 5 — AI proxy endpoints
Implement:
- `POST /api/ai/image`:
  - receives prompt + references
  - calls OpenAI/Gemini server-side
  - returns `imageDataUrl` (simplest) or store as asset and return `/api/assets/:id`
- `POST /api/ai/text`:
  - calls model server-side and returns JSON

Add CORS:
- In local mode, the browser will hit the same origin via Vite proxy, so CORS is minimal.
- Still set permissive CORS on API (`cors()`).

### Step 6 — Vite proxy
In `vite.config.ts`, set:
- proxy `/api` → `http://localhost:8787`

### Step 7 — Introduce Data Provider Interface in client
Create `src/lib/dataProvider.ts` with methods for:
- cards, decks, scenarios, assets, catalogs, library

Create:
- `src/lib/providers/localApiProvider.ts`
- `src/lib/providers/browserProvider.ts` (existing localStorage/IndexedDB fallback)

### Step 8 — Refactor UI to use providers (minimum viable)
Targets:
- Card builder save/load currently uses `src/lib/storage.ts` → replace with provider calls:
  - load card by `activeCardId` from DB
  - autosave card (debounced) to DB
- Card library manager lists from DB
- Deck builder reads cards from DB + saves decks
- Scenario builder reads decks/cards and saves scenarios

### Step 9 — Add Startup Screen (Project selection)
Create `src/features/startup/StartupScreen.tsx`
States:
- Choose mode:
  - Local Project (SQLite)
  - Browser Storage
- Local Project:
  - Show “Open project”:
    - text field: sqlite path OR project folder
    - calls `/api/project/open` or `/api/project/new`
  - Save last used project path in localStorage (client-only)

Backend: implement project open logic:
- Keep a singleton `currentDb` connection
- When project changes, close old DB, open new
- Update `meta.lastOpenedAt`

### Step 10 — Images: remove Data URLs long-term
Change card image workflow:
- File upload → `/api/assets` returns assetId
- set `card.visuals.cardImage = "/api/assets/<assetId>"`
- (Optional) keep `card.visuals.assetId = assetId`

### Step 11 — Update schema + docs
- If schema changes are required (CJ-1.2, etc.), update:
  - `src/lib/types.ts`
  - `src/lib/schemas.ts`
  - `src/assets/blockRegistry.json`
  - root markdown docs
- Add a new doc:
  - `LOCAL_RUN_SPEC.md` (from provided spec)
  - `AGENT_LOCAL_IMPLEMENTATION_GUIDE.md`

### Step 12 — CI improvements (local build + tests)
- Add tests (Vitest) for registry/schema drift.
- Update GitHub Actions:
  - `npm ci`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - deploy Pages only if tests pass

---

## C) Key Engineering Rules (Do Not Break)

1) If a new step exists anywhere:
- Add it to `blockRegistry.json`
- Add it to `types.ts`
- Add validation in `schemas.ts`
- Add docs in `AI_JSON_GUIDE.md`

2) Never store API keys in client code.
- Always call `/api/ai/*` for AI actions.

3) DB is the source of truth in local mode.
- localStorage only stores UI preferences + last project path.

4) Maintain GitHub Pages compatibility.
- Keep BrowserProvider working.

---

## D) Local Run (Mac) Instructions to Include in README
Provide these commands:
1) Install Node 20
2) `npm install`
3) `npm run dev` (runs client+server)
4) Open `http://localhost:5173`

---

## E) Deliverables Checklist (Agent must produce)
- `server/` backend with working SQLite persistence
- Vite proxy configured
- Client switched to provider pattern
- Startup screen for project selection
- AI proxy endpoints working with env keys
- Updated docs in root
- Release notes updated
