# REPO_AUDIT_AGENT_PLAYBOOK.md
Captain Jawa Forge — Full Repository Audit Instructions (Conflicts / Orphans / Incomplete / Duplicates)
Version: 1.0  
Purpose: Give an agent a **highly detailed, step-by-step** process to inspect the entire repository and produce a **structured report** listing:
- Conflicting behaviors (logic/UI/data/schemas out of sync)
- Orphaned functions/files (unused exports, dead code, unreachable paths)
- Incomplete functionality (stubs, TODOs, UI not wired, partial schema support)
- Duplicated functionality (same feature implemented twice, parallel systems)
- Documentation drift (docs describe features that code does not implement)

**Output requirement:** The agent must return a single Markdown report with **evidence**, **reasoning**, **tables**, and **actionable recommendations**.

---

## 0) Audit Principles (Non-negotiable)
1) **Evidence-first**: every finding must include file path(s) + what proves it (snippet, symbol, imports, CLI output).
2) **Explain impact**: what breaks for designer/player/AI import/export and why it matters.
3) **Classify severity**: P0 (breaks build/data), P1 (breaks feature), P2 (UX/maintainability), P3 (cleanup).
4) **Cross-check all layers**: UI ↔ Types ↔ Schemas ↔ Registries ↔ Storage ↔ Docs.
5) **Don’t “fix”** in this task. The agent’s job is to inspect and report, not refactor.

---

## 1) Setup & Ground Truth Capture
### 1.1 Environment baseline
Record:
- OS: macOS (M1)
- Node version: `node -v`
- NPM version: `npm -v`

### 1.2 Clean install and build signals
Run (capture output):
- `npm ci` (or `npm install` if no lock file, but note it as a risk)
- `npm run typecheck` (if exists)
- `npm test` (if exists)
- `npm run build`

**If any command fails**: log it under “Build/CI Failures” with full error text.

### 1.3 Repository map snapshot
Generate a file tree overview:
- `git ls-files > audit_files.txt`
- `git ls-files | wc -l`
- Identify major folders:
  - `src/`, `src/lib/`, `src/components/`, `src/features/`, `src/assets/`, root docs

**Checkpoint:** You have a list of all tracked files.

**Doc reminder:** At the end of the audit, verify root docs exist and match current architecture.

---

## 2) Create a “System Map” (Who owns what?)
This repository likely contains **two overlapping architectures** (legacy step-based + new graph-based). The agent must explicitly map boundaries.

### 2.1 Identify “Core domains”
Create a table row for each domain:
- Card model & schema validation
- Ability logic model
- Step registry/palette
- Graph/node registry/palette
- Import/export formats (CJ card JSON vs Forge project JSON)
- Storage (localStorage vs planned SQLite)
- Deck builder module
- Scenario builder module
- Action library / repository system
- Image handling (URL, upload, AI generation)

### 2.2 Produce a “Source of Truth” declaration per domain
For each domain, declare:
- “Source of truth file(s)”
- “Dependent files”
- “Known alternative/duplicate implementations”

**Example:**  
- Step registry source: `src/assets/blockRegistry.json`  
- Node registry source: `src/assets/nodeRegistry.json` (if added)  
- Risk: both exist → two palettes → drift

**Checkpoint:** A clear map exists before deeper inspection.

---

## 3) Full-file Cross-check Procedure (Do this systematically)
The agent must review *every file* and classify it.

### 3.1 Create a master inventory table
For each file in `git ls-files`, fill:
- File path
- Type: UI / Types / Schema / Asset / Feature / Utility / Docs / Test
- Primary responsibility
- Imported by (who uses it)
- Exports (key symbols)
- Status: ACTIVE / POSSIBLY ORPHAN / ORPHAN / DUPLICATE / STUB
- Notes

Use tools below to speed up “imported by” and “exports”.

### 3.2 Automated “import graph” extraction
Run:
- `npx madge --ts-config ./tsconfig.json --circular ./src`
- `npx madge --ts-config ./tsconfig.json ./src --image madge_graph.svg` (optional)
Capture:
- circular deps
- isolated subtrees
- orphan modules (never referenced)

**Checkpoint:** Identify files with zero inbound dependencies.

### 3.3 Unused export detection
Run:
- `npx ts-prune -p tsconfig.json`
Capture output lines:
- `path:line - exported symbol is never used`

**Checkpoint:** Build a table of unused exports.

### 3.4 Dependency drift
Run:
- `npx depcheck`
Capture:
- unused dependencies
- missing dependencies

**Checkpoint:** Flag missing deps that could explain “feature not loading”.

### 3.5 Search-based orphan checks (manual)
Use ripgrep (`rg`) or `git grep`:
- `rg "TODO|FIXME|HACK|TEMP|WIP" -n`
- `rg "UNKNOWN_STEP" -n src`
- `rg "schemaVersion" -n src`
- `rg "CJ-1\.0|CJ-1\.1|CJ-1\.2|CJ-FORGE|CJ-GRAPH" -n`
- `rg "DeckBuilder|ScenarioBuilder|CardLibraryManager" -n src`
- `rg "nodeRegistry|blockRegistry" -n src`
- `rg "exportLibrary|importLibrary|relinkLibrary" -n src`

**Checkpoint:** You have a list of all TODOs + schema version hardcodes + module entry points.

---

## 4) Conflicting Behavior Audit (Top Priority)
Conflicts are where the app “looks like it supports something” but runtime rejects it, or multiple systems disagree.

### 4.1 Schema version conflicts (known pain point)
Inspect:
- `src/lib/schemas.ts` (where schemaVersion is validated)
- `src/lib/types.ts` (which versions are implied by types)
- `src/App.tsx` import/export logic (allowed schema versions)
- any migration functions

Cross-check questions:
- Does `App.tsx` export `CJ-1.2` while schemas.ts only accepts CJ-1.0/CJ-1.1?
- Does the docs say CJ-1.2 exists but schema blocks it?
- Are there multiple schema validators?

**Record as Conflict** if:
- UI creates cards the validator rejects
- import accepts but validator rejects
- export generates a version not accepted by import or schema

### 4.2 Registry conflicts (steps vs nodes)
Inspect:
- `src/assets/blockRegistry.json` and `src/lib/registry.ts`
- any `src/assets/nodeRegistry.json` + loader file
- step type checks: `isStepTypeAllowed()`
Cross-check:
- Are steps shown in palette but treated as UNKNOWN_STEP due to registry mismatch?
- Are new steps added in UI but missing from blockRegistry?
- Are there two palettes producing incompatible JSON?

**Record as Conflict** if:
- a step exists in types/schema but not in registry
- or in registry but not in schema/types

### 4.3 UI wiring conflicts (feature not loading)
Inspect the “feature modules”:
- `src/features/library/CardLibraryManager`
- `src/features/decks/DeckBuilder`
- `src/features/scenarios/ScenarioBuilder`
Cross-check:
- Are they imported but never rendered?
- Are they behind a route/tab that doesn’t exist?
- Are required props missing so they error silently?

**Record as Conflict** if:
- feature exists but no entry point renders it

### 4.4 Storage conflicts
Inspect:
- `src/lib/storage.ts`
- `src/lib/repository.ts`
Cross-check:
- multiple storage keys for same concept?
- card saved under one key, loaded under another?
- large JSON breaking localStorage causing partial state?

**Record as Conflict** if:
- save and load are asymmetrical
- reset clears one store but not others

**Checkpoint:** Produce a “Conflict Matrix” table (template below).

---

## 5) Orphaned Functionality Audit
Orphans include:
- unused exports
- unused files
- UI components never mounted
- features that were started but not integrated

### 5.1 From ts-prune output
For each unused export:
- locate file
- confirm it is truly unused (search symbol usage)
- classify:
  - safe to remove
  - intended future use (document it)
  - missing integration (bug)

### 5.2 From madge isolated modules
For each module with no inbound dependencies:
- verify whether it is expected (e.g., entry file, CLI)
- if not expected → orphan candidate

### 5.3 Manual “entry path” check
Find:
- `src/main.tsx` or equivalent
- ensure App mounts the expected composition

**Checkpoint:** Create an “Orphan Inventory” table.

---

## 6) Incomplete Functionality Audit
Incomplete includes:
- TODOs/FIXMEs
- UI placeholders (“edit raw JSON for now”)
- schema stubs without UI
- steps defined but no editor
- editors without schema support

### 6.1 Catalog all TODO/FIXME
Use search output and group by area:
- Graph editor
- Step editor
- Targeting profiles
- Deck/scenario
- Image handling / AI

### 6.2 “Promises vs reality” audit
Cross-check docs vs code:
- Docs claim AI image gen tool exists → verify UI exists and is wired
- Docs list step types → verify in blockRegistry + types + schema + UI editor
- Docs describe scenario triggers → verify there is a scenario data model + editor + export

**Checkpoint:** Create “Incomplete Features” table with severity + blockers.

---

## 7) Duplicate/Double-up Functionality Audit
Duplicates are common when transitioning architectures.

### 7.1 Identify overlapping systems
Look for multiple versions of:
- registry loaders (blockRegistry vs nodeRegistry)
- validators (zod/ajv/manual)
- import/export formats
- multiple “default card” makers
- separate state stores for same entity

### 7.2 Detect duplication heuristics
Search patterns:
- multiple functions with similar names: `makeDefaultCard`, `defaultLibrary`, `load*`, `save*`, `export*`
- similar data transforms: `canonicalToGraph`, `graphToCanonical`, `compile*`

### 7.3 Evaluate duplication outcomes
For each suspected duplicate:
- Are they used in different places intentionally?
- Do they produce different outputs?
- Which one should be source-of-truth?

**Checkpoint:** Create “Duplication & Divergence” table.

---

## 8) Produce the Final Audit Report (Markdown Required)
The agent must output a single Markdown report with these sections:

### 8.1 Executive summary
- Key findings count by severity (P0/P1/P2/P3)
- Top 5 risks

### 8.2 Build/CI failures
- Exact errors and root causes (hypotheses allowed but label them as hypotheses)

### 8.3 System map (source-of-truth)
- Domain → SoT file(s) → dependents → duplicates

### 8.4 Findings tables (mandatory)
Include all tables below, filled.

### 8.5 Recommendations & action list
- Quick wins (1–2 days)
- Medium refactors (1–2 weeks)
- Architectural moves (graph compiler, SQLite local server)

### 8.6 “Stop-the-line” conflicts
List conflicts that must be resolved before adding more features (e.g., schema version mismatch).

---

## 9) Required Tables (Copy these templates into your report)

### Table A — Domain System Map
| Domain | Source of Truth File(s) | Dependent Files | Duplicate/Alt Implementations | Drift Risk | Notes |
|---|---|---|---|---|---|

### Table B — Conflict Matrix
| ID | Type (Schema/Registry/UI/Storage/Docs) | Symptom | Evidence (files/lines) | Root Cause | Impact | Severity | Suggested Fix |
|---|---|---|---|---|---|---|---|

### Table C — Orphan Inventory
| ID | File/Symbol | Evidence (ts-prune/madge/grep) | Why it’s orphaned | Risk of removal | Recommendation |
|---|---|---|---|---|---|

### Table D — Incomplete Functionality
| ID | Feature | Expected Behavior | Current Behavior | Evidence | Blocker | Severity | Recommendation |
|---|---|---|---|---|---|---|---|

### Table E — Duplicated / Double-up Functionality
| ID | Function/Module Pair | Overlap Description | Divergence | Evidence | Risk | Severity | Proposed Consolidation |
|---|---|---|---|---|---|---|---|

### Table F — Doc Drift
| Doc File | Claim | Code Reality | Evidence | Impact | Fix (doc/code) |
|---|---|---|---|---|---|

### Table G — Step/Registry/Schema Alignment (Critical)
For each step/node type, confirm presence across layers.
| Type | In blockRegistry.json | In nodeRegistry.json | In types.ts | In schemas.ts | Has UI editor | Notes |
|---|---:|---:|---:|---:|---:|---|

---

## 10) Evidence Requirements (Every finding must include)
- File path(s)
- Line numbers (or nearest function name)
- Snippet or CLI output line
- Explanation:
  - what behavior is expected
  - what the code does instead
  - why this is a conflict/orphan/incomplete/duplicate
- Impact assessment:
  - who is affected (designer/player/AI import/export)
  - what breaks (compile, export, validation, UI, etc.)

---

## 11) Final “Cross-check Everything” Checklist
Before submitting the report, the agent must verify:
- `src/App.tsx` actually renders deck/scenario/library entry points (or not)
- `schemas.ts` accepts every schemaVersion emitted by export and default card
- every step in palette is known to schema/types (no UNKNOWN_STEP)
- every doc file in root matches reality (especially AI guides)
- no hidden runtime error in console when loading main screens

---

## 12) Deliverable
Return a single Markdown document titled:
`REPO_AUDIT_REPORT.md`
containing:
- all sections in §8
- all filled tables in §9
- CLI outputs appended in an “Appendix” section

---

## 13) After the audit (for your next ChatGPT review)
Once you paste `REPO_AUDIT_REPORT.md` back into chat:
- We will convert findings → prioritized action list
- We will choose a consolidation path (legacy steps vs graph-first)
- We will schedule schema/registry alignment and remove dead code safely
