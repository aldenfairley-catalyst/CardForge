# Captain Jawa Forge — Agent Implementation Runbook (DB + API)
Version: 1.0  
Date: 2025-12-23  
Audience: AI agent implementing DB + API requirements end-to-end.

> This runbook is intentionally repetitive. A naive agent should be able to follow it without guessing.

---

## 0. Prime directive
**Do not implement features that change runtime schemas without:**
1) Updating types
2) Updating validators
3) Updating registries (if relevant)
4) Updating the API spec docs
5) Updating tests

---

## 1. Pre-flight checks
### 1.1 Confirm repo state
- `git status` must be clean (or commit current work to a branch).
- Read these docs first:
  - `DATABASE_AND_API_UPDATES_SPEC.md`
  - `API_SPEC.md`
  - `CI_GREEN_FIX_RUNSHEET.md`
  - `DEPRECATION_POLICY.md`

### 1.2 Tooling and commands
Run:
```bash
node -v
npm -v
npm ci
npm run typecheck
npm test
npm run build
```
If any fail, stop and fix CI-green issues first.

---

## 2. Decide storage mode for assets
Pick one:
- **A) DB BLOB**: simplest, single file, but DB grows fast.
- **B) file store**: store bytes in `data/assets/`, DB stores metadata + relative path.

**Recommendation:** B for images.

**Definition of Done**
- There is exactly one asset storage mode enabled by config:
  - `CJ_ASSET_STORAGE=BLOB|FILE`

---

## 3. Implement SQLite schema + migrations
### 3.1 Create migrations folder
Add:
- `server/migrations/0001_init.sql`
- `server/migrations/0002_fts.sql` (optional later)

`0001_init.sql` must create tables:
- cards, graphs, tools, decks, scenarios, catalogs, assets, library_entries, graph_runs

### 3.2 Migration runner
Add a migration runner in server startup:
- runs pending SQL files in order
- records applied migrations in `migrations` table

**Cross-check**
- if using `better-sqlite3`, wrap in transaction.
- ensure migrations are idempotent.

**Validation**
- `npm run server:dev` starts with empty DB and creates tables.
- add a `GET /api/health` check that confirms tables exist.

---

## 4. Implement server repository layer (DB access)
Create folder:
- `server/src/db/`

Add modules:
- `db.ts` (opens sqlite, runs migrations)
- `cardsRepo.ts`, `graphsRepo.ts`, `toolsRepo.ts`, `decksRepo.ts`, `scenariosRepo.ts`, `catalogsRepo.ts`, `assetsRepo.ts`, `libraryRepo.ts`, `runsRepo.ts`

Each repo must implement:
- `list(filters)`
- `get(id)`
- `create(obj)`
- `update(id,obj)`
- `softDelete(id)`

**Cross-check**
- Ensure repo uses *latest schema validation* before writes.
- Ensure `updatedAt` is always updated.
- Ensure `deletedAt` is respected in list.

**Validation**
- Add unit tests for each repo method using a temp db.

---

## 5. Implement API routes (Express)
Create folder:
- `server/src/routes/`

Routes:
- `/api/health`
- `/api/cards`, `/api/graphs`, `/api/tools`, `/api/decks`, `/api/scenarios`, `/api/catalogs`, `/api/assets`, `/api/library`, `/api/run/graph`, `/api/bundle`

**Cross-check**
- Ensure consistent error format.
- Ensure token enforcement on POST/PUT/PATCH/DELETE when enabled.

**Validation**
- Add supertest tests for:
  - happy path CRUD
  - invalid schemaVersion rejected
  - import old → migrated → stored as latest
  - deleted items not returned unless includeDeleted=true

---

## 6. Implement import/migration boundary behavior
### 6.1 Centralize versions
Create: `src/lib/versions.ts` and server mirror `server/src/versions.ts`.

Must include:
- `LATEST_CARD_VERSION`
- `LATEST_GRAPH_VERSION`
- `isSupportedForImport(version)`
- `isSupportedForAuthoring(version)`

### 6.2 Server import endpoints
For each entity type:
- accept old versions
- migrate to latest
- validate latest
- store latest
- return migration summary

**Validation**
- fixture files under `tests/fixtures/` for CJ-1.0 and CJ-1.1 cards
- test: import fixture → server returns latest version.

---

## 7. Implement asset upload/serving
### 7.1 Upload
- accept multipart upload
- compute sha256
- dedupe by sha256
- store bytes (BLOB) or write file (FILE)

### 7.2 Serving
- `GET /api/assets/:id` returns bytes with correct content-type
- allow `?download=1`

**Cross-check**
- CORS headers correct for local dev.
- Files are not overwritten; use sha256 in filename.

**Validation**
- test upload + fetch
- ensure returned asset id can be referenced by card visuals

---

## 8. Implement bundle import/export
### 8.1 Export
- returns `CJ-BUNDLE-1.0`
- can include asset references or embed assets if zip export is enabled

### 8.2 Import
- migrates all entities
- preserves IDs unless collision
- dedupes assets by sha256

**Validation**
- test export then wipe db then import export → counts match.

---

## 9. Implement graph run endpoint (debug runner)
### 9.1 Minimum viable runner
- Validate graph exists
- Execute nodes from entry node id
- Emit trace events per node
- Return outputs
- Persist run if requested

### 9.2 Trace format
Ensure trace includes:
- nodeId
- status (START/OK/ERROR/SKIP)
- timestamps
- optional payload

**Cross-check**
- Ensure loops have max-iteration guard.
- Ensure tool nodes can be mocked or executed.

**Validation**
- add a sample graph fixture and run it in tests.
- verify trace includes each node.

---

## 10. Frontend integration
### 10.1 localApiProvider
Update `src/lib/providers/localApiProvider.ts` to call the new endpoints.
Cross-check it matches API spec routes.

### 10.2 Provider selection UI
Ensure user can select:
- Browser storage (localStorage)
- Local API (sqlite)

**Validation**
- In UI, create a card → appears in server DB → reload → still there.

---

## 11. Documentation updates (mandatory after each batch)
After completing each major section above:
- update `API_SPEC.md` and `DATABASE_AND_API_UPDATES_SPEC.md` if routes/fields changed
- update AI docs if JSON shapes changed
- update release notes: `RELEASE_NOTES.md` (or add it)

---

## 12. CI and pipeline improvements
- add `server` tests to CI
- ensure `npm ci` doesn’t break on native modules:
  - prefer `sqlite3` if GitHub Actions struggles with better-sqlite3
- ensure `npm run build` produces `dist/`

**Validation**
- GitHub Actions pipeline green:
  - `npm ci`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - upload to Pages

---

## 13. Definition of Done (end-to-end)
- [ ] Server starts, runs migrations, `/health` OK
- [ ] CRUD endpoints exist and validated
- [ ] Import endpoints migrate old versions to latest
- [ ] Assets upload and serve
- [ ] Bundle export/import roundtrip works
- [ ] Graph run returns trace and persists run
- [ ] Frontend localApiProvider works in app
- [ ] Tests cover all critical endpoints
- [ ] Docs updated and accurate
