# REPO_AUDIT_AGENT_PLAYBOOK.md
Captain Jawa Forge — Full Repository Audit Instructions (Conflicts / Orphans / Incomplete / Duplicates)
Version: 1.1
Purpose: Give an agent a highly detailed, step-by-step process to inspect the entire repository and produce a structured report listing:
- Conflicting behaviors (logic/UI/data/schemas out of sync)
- Orphaned functions/files (unused exports, dead code, unreachable paths)
- Incomplete functionality (stubs, TODOs, UI not wired, partial schema support)
- Duplicated functionality (same feature implemented twice, parallel systems)
- Documentation drift (docs describe features that code does not implement)
- ENVIRONMENT-DRIVEN false negatives (npm/proxy/registry restrictions) — NEW

Output requirement: The agent must return a single Markdown report with evidence, reasoning, tables, and actionable recommendations.

---

## 0) Audit Principles (Non-negotiable)
1) Evidence-first: every finding must include file path(s) + proof (snippet, symbol, CLI output).
2) Explain impact: what breaks for designer/player/AI import/export and why it matters.
3) Classify severity:
   - P0: build/install/schema blocks core workflows
   - P1: a major feature cannot be used
   - P2: UX/maintainability issues that create drift risk
   - P3: cleanup / tech debt
4) Cross-check all layers: UI ↔ Types ↔ Schemas ↔ Registries ↔ Storage ↔ Docs.
5) Separate repository issues from environment issues (NEW):
   - Repo issue: reproducible on CI and clean machine
   - Env issue: only on this machine/network, must be flagged explicitly
6) Don’t “fix” in this task. Inspect + report only.

---

## 1) Setup & Environment Sanity (NEW: prevents invalid audits)

### 1.1 Record environment baseline
Capture in report:
- OS + CPU (e.g., macOS M1)
- Node: `node -v`
- npm: `npm -v`
- Git branch + commit: `git rev-parse --abbrev-ref HEAD && git rev-parse HEAD`

### 1.2 Force consistency with CI
CI uses Node 20 (per GH Actions). Local audits must match:
- If using nvm: `nvm install 20 && nvm use 20`
- Confirm: `node -v` shows v20.x

If the agent cannot change Node version, **label all build/type/test findings as “may be env-skewed”**.

### 1.3 Detect proxy/registry config that can break installs (critical)
Run and paste outputs:
- `npm config get registry`
- `npm config list -l | rg -n "proxy|http-proxy|https-proxy|always-auth|auth|_auth|token"`
- `env | rg -n "HTTP_PROXY|HTTPS_PROXY|NPM_CONFIG|NODE_EXTRA_CA_CERTS|SSL"`

If the output shows unknown env config warnings (e.g. http-proxy / always-auth) OR registry returns 403, flag as ENV-BLOCKER.

### 1.4 Confirm npm can actually install dependencies
Do NOT proceed until installs succeed.
Run:
- `rm -rf node_modules package-lock.json` ONLY if instructed; otherwise keep lock.
- `npm ci --no-audit --no-fund --foreground-scripts`

Then verify the toolchain exists:
- `ls -la node_modules/.bin | head -50`
Expect to see `vite`, `vitest`, `tsc`. If missing, the audit cannot proceed reliably.

If `npm ci` hangs > 3 minutes:
- Run: `npm ci --ignore-scripts` (diagnostic)
- Then run: `npm ci --foreground-scripts` and capture the LAST log lines.
- Identify which script or dependency is hanging (postinstall, native build, network retry).
- Mark as P0 ENV-BLOCKER and stop deeper analysis.

### 1.5 Avoid “npx downloads” on restricted registries (NEW)
Some environments block `npx` fetching packages (403).
Therefore:
- Prefer running repo-pinned tools via `npm run <script>` or `npm exec <tool>` ONLY IF it exists in devDependencies.
- If madge/depcheck/ts-prune are not installed locally and registry blocks them, use manual alternatives:
  - `tsc -p tsconfig.json --noEmit`
  - `rg`/`git grep`
  - `eslint` if present
Document the limitation explicitly.

Checkpoint: The audit only continues if `npm ci` completes and `.bin` exists.

---

## 2) Ground Truth Capture (Repo Snapshots)

### 2.1 Repository file map
- `git ls-files > audit_files.txt`
- `git ls-files | wc -l`
- Identify major folders:
  - `src/`
  - `server/` (if present)
  - `tests/`
  - `src/assets/`
  - root docs: AI_*.md, API spec, phase guides, etc.

### 2.2 Capture key “source-of-truth” files verbatim (NEW)
Paste into report (or attach as appendix excerpts):
- `package.json` (scripts + deps)
- `tsconfig.json`
- `vite.config.ts`
- `.github/workflows/*.yml`
- `src/assets/blockRegistry.json`
- `src/assets/nodeRegistry.json`
- `src/lib/types.ts`
- `src/lib/schemas.ts`

Reason: these are where drift usually begins.

---

## 3) “System Map” — Who owns what? (Plus functional outcomes)

Create a Domain Map table. For EACH domain, add: “Primary user-facing outcome”.

Domains to include:
- Card authoring (Forge)
- Ability/Step authoring (Graph + fallback)
- Registry (blockRegistry)
- Node registry (nodeRegistry)
- Graph compiler/IR validator
- Import/export formats (CJ card vs Forge project)
- Storage providers (localStorage vs server API)
- Deck builder
- Scenario builder
- AI agent docs + JSON guides
- Image handling (upload/path/AI generation)

Checkpoint: Every domain maps to at least one user journey:
- “Designer can create a card with 3 abilities and export CJ card JSON that validates.”
- “Designer can create a deck grouped by faction with search.”
- “Designer can create scenario triggers that mutate decks/board state.”

---

## 4) Stop-the-line Checks (do these BEFORE deep feature review)

### 4.1 CI parity commands
Run and capture outputs:
- `npm run typecheck`
- `npm test`
- `npm run build`

If ANY fails: record as P0 and stop deeper “feature correctness” analysis until root causes are identified.

### 4.2 Script/CLI compatibility checks (Vite flags, etc.)
Inspect `package.json` scripts:
- Identify unsupported flags (example: Vite 5 rejects some CLI flags).
- If build script calls unsupported flags, report as P0 repo issue.
Also check server scripts do not run during client install unexpectedly.

### 4.3 Schema version agreement check (critical)
Search:
- `rg -n "CJ-1\\.|schemaVersion" src tests`
Cross-check:
- default card uses what schema?
- export emits what schema?
- validator accepts what schema?
- migration supports what schema?

If mismatch: report as P0, because it breaks AI import/export and designer confidence.

---

## 5) Registry ↔ Types ↔ Schemas ↔ UI Cross-check (Expanded)

This is the most important functional audit for your game ecosystem.

### 5.1 Build the Step Alignment Table (MANDATORY)
For each step type in `src/assets/blockRegistry.json`:
Confirm presence across layers:
- In blockRegistry.json
- In Step union in `src/lib/types.ts`
- In `src/lib/schemas.ts` validator
- Has Step Factory default in `src/lib/stepFactory.ts`
- Has a UI editor:
  - Graph node config schema OR
  - Fallback form editor OR
  - Raw JSON editor (explicitly acknowledged)

Also confirm:
- Graph compiler can emit this step type (if graph is the authoring tool).

If the graph system cannot represent most steps, that is P1 (feature unusable), and the repo must either:
A) Expand nodes/compiler, OR
B) Reintroduce fallback editor and mark graph as “optional view”.

### 5.2 Node registry drift check
Compare nodeRegistry vs blockRegistry:
- nodeRegistry should either:
  - represent all steps (preferred), OR
  - represent only a subset but the UI must route “unsupported steps” to fallback editor.

If neither is true: report as P1 with functional impact (“authors cannot create core mechanics”).

### 5.3 Graph compiler coverage check
Inspect `src/lib/graphIR/compiler.ts`:
- Count supported node types vs registry step types.
- If compiler only handles a small subset, mark incomplete unless fallback exists.

Checkpoint: The report MUST clearly state which system is the actual authoring path today.

---

## 6) Feature Loading / Entry Point Verification (NEW)
Many “feature exists but doesn’t load” bugs are simply “imported but not rendered.”

### 6.1 Confirm App renders each feature
Search:
- `rg -n "DeckBuilder|ScenarioBuilder|CardLibraryManager" src`
Inspect `src/App.tsx`:
- Are there tabs/routes/modes to render these components?
- Are they behind state that defaults away from them?
- Are they crashing due to missing props/provider?

### 6.2 Browser console runtime check (NEW)
Run dev server and capture:
- Console errors on first load
- Errors when switching to Decks / Scenarios / Library
- Any failed fetches (404)
- Any schema validation failures on load

If a feature “does not appear to load,” the report must include:
- How to reproduce
- Which component should render
- What prevents it (routing, crash, missing state, CSS, etc.)

---

## 7) Docs Drift Audit (Expanded for AI agent reliability)

Because AI-generated JSON is a core workflow, docs drift is a functional bug.

### 7.1 Cross-check every AI_* doc against schema
For each doc file:
- Extract each JSON sample
- Validate it mentally against:
  - `types.ts`
  - `schemas.ts`
  - scenarioTypes/deckTypes
If mismatch: report as P2 (or P1 if it blocks import/export).

### 7.2 Required “AI Ready” criteria (NEW)
Docs are considered “AI-ready” only if:
- They describe the *current* schema version(s)
- Every sample is valid per validator
- They explicitly list:
  - required fields
  - optional fields
  - defaults
  - allowed enums
  - how migrations behave
  - how import treats unknown steps
- They explain relationships:
  - targetingProfiles ↔ SELECT_TARGETS
  - FOR_EACH_TARGET ↔ ITERATION_TARGET
  - zones/decks ↔ deck/scenario builder

---

## 8) Orphans / Duplicates / Incomplete (as before, plus clearer functional framing)

### 8.1 Orphans
- Unused UI components (never rendered)
- Unused adapters (canonicalToGraph etc.)
For each, indicate:
- Can it be removed safely?
- Or should it be reintroduced as fallback for missing graph coverage?

### 8.2 Duplicates
Look for parallel systems:
- card library vs action library
- browser provider vs local-api provider
- step registry vs node registry
For each duplication, explain the user confusion and drift risk.

### 8.3 Incomplete
Any “edit raw JSON for now” is a VALID MVP choice, but must be tracked as a roadmap item:
- which step types
- why it blocks real authoring
- the minimum editor required to unblock authoring

---

## 9) Deliverable: Report Structure & Tables (Updated)

Return a single Markdown file titled:
REPO_AUDIT_REPORT.md

Required sections:
1) Executive summary (counts by severity)
2) Environment sanity & install viability (NEW: explicit)
3) Build/CI parity results
4) Domain System Map (must include user outcomes)
5) Conflict Matrix
6) Step/Registry/Schema/Graph Alignment Table (expanded)
7) Feature Entry Points & runtime errors (NEW)
8) Orphans
9) Duplicates
10) Docs drift (AI impact)
11) Action list (stop-the-line first)

Required tables:
- Table A Domain System Map (+ outcome column)
- Table B Conflict Matrix
- Table C Orphan Inventory
- Table D Incomplete Functionality
- Table E Duplicates
- Table F Doc Drift
- Table G Step/Registry/Schema Alignment (critical)
- Table H Functional Outcome Impact Map (must be filled)

---

## 10) Definitions of Done (Audit is “complete” only if…)
The agent has:
- Verified installs complete and toolchain exists (vite/vitest/tsc present)
- Reproduced CI commands locally (or documented why not possible)
- Mapped each domain to a user outcome and tested navigation entry points
- Produced the Step Alignment table from blockRegistry as the master list
- Identified whether graph authoring is primary or needs fallback
- Audited docs for AI importability vs actual schemas
- Provided an ordered action list (P0 → P3) with file paths and evidence

---

## 11) Quick “Stop the Line” Checklist (print this in the report)
Before any new feature work:
- `npm ci` completes and `.bin` contains vite/vitest/tsc
- `npm run typecheck` passes
- `npm test` passes
- `npm run build` passes
- schema versions emitted by export are accepted by schemas.ts
- palette does not create UNKNOWN steps OR fallback editor exists
- docs samples validate against runtime schemas

---

## 12) Appendix: Evidence Pack
Attach:
- CLI outputs
- File excerpts for key “source-of-truth”
- Console error screenshots/logs (if any)
