# AGENT_API_IMPLEMENTATION_GUIDE.md
Captain Jawa Forge — Local API Server Implementation Guide (for an Agent)
Version: 1.0  
Goal: Implement a local API server that AI agents and the Forge UI can use to store and query cards/decks/scenarios/projects with SQLite + filesystem assets.

> Critical: This guide expects the agent to **cross-check** existing repo files before adding code, to avoid duplication and drift.

---

## 1) Read These First (mandatory)
Before coding, open and read:
- `src/lib/types.ts` (current canonical types)
- `src/lib/schemas.ts` (validator + allowed schema versions; current pain point)
- `src/assets/blockRegistry.json` (step palette, enums, keys)
- `src/assets/nodeRegistry.json` (if present) (graph node definitions)
- Root docs:
  - `AI_JSON_GUIDE.md`
  - `AI_VARIABLES.md`
  - `AI_PLAY_GUIDE.md`
  - `AI_SYMBOLS_WEBHOOKS.md`

Deliverable: a short note “What currently exists vs what we are adding” with paths.

---

## 2) Directory Structure (recommended)
Add a new `server/` folder (keeps UI build clean):

```
/server
  /src
    index.ts
    config.ts
    db.ts
    routes/
      health.ts
      meta.ts
      cards.ts
      decks.ts
      scenarios.ts
      assets.ts
      validate.ts
      compile.ts
      exportImport.ts
    services/
      cardService.ts
      deckService.ts
      scenarioService.ts
      assetService.ts
  README.md
/data
  cj.sqlite
  assets/
```

If the repo already has `features/` or other server scaffolding, document it and reconcile.

---

## 3) Decide the Shared-Code Strategy (important)
You must prevent validator drift.

### Option A (recommended): Move shared logic into `/shared`
- Create `/shared` folder containing:
  - types
  - schema validators
  - registries (blockRegistry/nodeRegistry)
- UI imports from `/shared`
- Server imports from `/shared`

Pros: one source of truth.  
Cons: refactor required.

### Option B (fastest): Server imports UI modules directly
- Server TS config allows importing from `../src/lib/schemas.ts`
- Server runtime must be able to resolve TS (use `tsx`)

Pros: minimal refactor.  
Cons: coupling; later reorganize.

Pick one and record in `server/README.md`.

---

## 4) Dependencies (recommended)
Use Fastify + better-sqlite3 for simplicity and speed.

Install:
- `fastify`
- `@fastify/cors`
- `@fastify/multipart`
- `better-sqlite3`
Dev tools:
- `tsx`
- `typescript`

---

## 5) Server Config
Create `server/src/config.ts`:
- bindHost: default `127.0.0.1`
- port: default `4173` or `3001`
- dataDir: `./data`
- sqlitePath: `./data/cj.sqlite`
- assetsDir: `./data/assets`
- optional apiKey: empty by default

---

## 6) Implement SQLite Layer
Create `server/src/db.ts`:
- open sqlite file (create if missing)
- create tables if not exist (cards/decks/scenarios/projects/assets)
- implement helper functions:
  - upsert/get/search for cards/decks/scenarios
  - insert/get for assets

Important cross-check:
- store raw JSON as TEXT
- also store searchable columns: name/type/faction/schemaVersion

---

## 7) Route Implementation (one-by-one with checkpoints)

### 7.1 Health route
File: `server/src/routes/health.ts`
- `GET /api/health`
Checkpoint: returns ok JSON.

### 7.2 Meta routes
File: `server/src/routes/meta.ts`
- `GET /api/meta/versions` (must match `schemas.ts` accepted versions)
- `GET /api/meta/registries` (returns blockRegistry + nodeRegistry + enums)
- `GET /api/meta/schemas` (optional)
Checkpoint: returns data for agents.

### 7.3 Validate routes
File: `server/src/routes/validate.ts`
- `POST /api/validate/card`
- `POST /api/validate/deck`
- `POST /api/validate/scenario`
Checkpoint: invalid card returns issues in same format as Forge.

### 7.4 Cards routes
File: `server/src/routes/cards.ts`
- `POST /api/cards` (mode canonical|forgeProject)
- `GET /api/cards/:id`
- `PUT /api/cards/:id`
- `GET /api/cards` with filters
Checkpoint: create+get works.

### 7.5 Assets routes
File: `server/src/routes/assets.ts`
- `POST /api/assets` multipart upload
- static `/assets/*`
Checkpoint: upload returns url that is fetchable.

### 7.6 Deck routes
File: `server/src/routes/decks.ts`
- `POST /api/decks`
- `GET /api/decks/:id`
- `GET /api/decks?hasCardId=...`
Checkpoint: can query decks containing a card.

### 7.7 Scenario routes
File: `server/src/routes/scenarios.ts`
- `POST /api/scenarios`
- `GET /api/scenarios/:id`
- `GET /api/scenarios/:id/setup`
- `POST /api/scenarios/:id/simulate` (optional stub allowed)
Checkpoint: setup returns derived view.

---

## 8) Vite Proxy Wiring (UI → server)
In `vite.config.ts`, add proxy:
- `/api` → `http://127.0.0.1:<serverPort>`
- `/assets` → `http://127.0.0.1:<serverPort>`

Checkpoint: UI calls `/api/health` without CORS.

---

## 9) Schema Version Problem Fix (critical)
If UI exports CJ-1.2 but schemas accepts only CJ-1.0/CJ-1.1:
- update `src/lib/schemas.ts` OR change export version
- ensure `/api/meta/versions` matches
- add a test: “exported schemaVersion is accepted by validateCard”

Checkpoint: SCHEMA_VERSION error disappears.

---

## 10) Documentation Updates (mandatory)
After implementation, update:
- `API_SPEC.md` (root)
- `AI_JSON_GUIDE.md` (agent flows)
- `AI_PLAY_GUIDE.md` (local-first architecture)
- `AI_SYMBOLS_WEBHOOKS.md` (endpoints + events)

Also add `server/README.md` run instructions.

---

## 11) Definition of Done (MVP server)
Done when:
- agent can GET versions/registries, POST validate, POST create card/scenario/deck
- assets upload returns stable url used by cards
- schema versions consistent across UI + server
