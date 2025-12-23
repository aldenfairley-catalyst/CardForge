# REPO_AUDIT_AGENT_PLAYBOOK.md
Captain Jawa Forge — Expanded Repository Audit Instructions (CI-first, Functional Outcomes, Deep Cross-checks)
Version: 1.1  
Primary goal: give an agent a **repeatable CI-first** audit that finds the *real gaps* between:
UI ↔ Types ↔ Schemas ↔ Registries ↔ Compiler/Graph ↔ Persistence ↔ Docs ↔ GitHub Pages runtime.

**Output requirement:** agent returns a single Markdown report with **evidence**, **reasoning**, **tables**, and **actionable recommendations**.

---

## 0) Audit mindset
### 0.1 “Functional outcomes” lens (why we’re auditing)
All findings must tie back to at least one of these outcomes:

**Builder outcomes**
- Create/edit card, abilities, steps, targeting profiles, custom states
- Preview card reliably (image, costs, tokens, stats)
- Import JSON (card + forge project)
- Export JSON (card + forge project)

**Play-support outcomes**
- Deck builder loads, searches, filters, validates
- Scenario builder loads, defines triggers, start units, victory, story slides
- Shared registries enable AI + validation without drift

**Engineering outcomes**
- CI builds + deploys to GitHub Pages
- Versioning/migrations protect future changes
- No silent behavior differences between layers (especially steps)

> Every issue must explain: “Which outcome does this break or risk?”

### 0.2 Severity model (non-negotiable)
- **P0**: breaks CI/build/install, blocks running app or validation
- **P1**: feature claims exist but don’t work end-to-end
- **P2**: maintainability/UX drift, partial implementations, confusing duplicates
- **P3**: cleanup (orphan exports/files) and minor improvements

### 0.3 Evidence-first rules
For every finding:
- file path(s)
- line numbers (or function name if line numbers not practical)
- snippet OR CLI/CI log excerpt
- impact on functional outcomes
- suggested remediation (not necessarily the full fix)

---

## 1) CI-first setup (GitHub Actions / Pages)
> The agent is auditing for GitHub pipeline correctness first. Local runs are optional and secondary.

### 1.1 Capture CI workflow ground truth
Inspect:
- `.github/workflows/pages.yml` (or equivalent)
- any other CI workflows
Record:
- Node version used
- install command (`npm ci` vs `npm install`)
- build command
- publish folder and base path

**Checkpoint:** A “CI Workflow Summary” section exists in the report.

### 1.2 CI logs as primary evidence
If you have access to logs:
- copy the relevant sections for install/typecheck/test/build/deploy
- include them in the report appendix

If not, reproduce the workflow steps locally in a clean environment using:
- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run build`

But the audit should assume GitHub Actions is the truth source.

---

## 2) Repo map snapshot (system inventory)
### 2.1 Inventory file list
Run:
- `git ls-files > audit_files.txt`
- `git ls-files | wc -l`

### 2.2 Identify major folders + purpose
At minimum, map:
- `src/`
- `src/lib/`
- `src/components/`
- `src/features/`
- `src/assets/`
- `server/` (if present)
- root docs (`*.md`, `README.md`)
- tests (`tests/`)

**Checkpoint:** include a “Repo Structure” section with a bullet list of major dirs and what they appear to do.

---

## 3) System map (source of truth per domain)
Create a table mapping domain → source-of-truth → dependents → duplicates.

Mandatory domains:
- Card schema + validation (schemas.ts)
- Card model types (types.ts)
- Step registry/palette (blockRegistry.json + registry.ts)
- Graph/node registry (nodeRegistry.json + node types)
- Graph compiler / IR (graphIR/*)
- Import/export formats (card JSON vs forge project JSON)
- Persistence (localStorage modules vs provider vs server sqlite)
- Deck builder
- Scenario builder
- Action library / card library
- Assets/images (upload, URL, serving)
- AI endpoints (if referenced)

**Checkpoint:** a “Domain System Map” table is filled before deeper audit.

---

## 4) CI & build correctness audit (GitHub Pages specifics)
These are common “agent assumption” gaps that cause features to “not load” on Pages.

### 4.1 Vite base path / routing
Check:
- `vite.config.*`
- build output paths
- whether `base` is set for GitHub Pages (e.g. `/repo-name/`)
- whether you use hash routing vs browser routing

Cross-check:
- If using React Router with browser history, pages refresh can 404 unless configured.

**Record as Conflict** if:
- app works locally but not on Pages due to base path/routing mismatch

### 4.2 Asset paths
Check:
- `public/` usage
- card images referenced as `/cards/...` vs relative
- whether assets are bundled or expected at runtime

**Record**:
- any absolute paths that break under Pages base

### 4.3 TypeScript configuration compatibility
Check:
- `tsconfig.json`
- `server/tsconfig.json` if present

Verify:
- module / moduleResolution compatibility for the chosen TS version
- no environment-specific configs that only work locally

---

## 5) Automated architecture checks (dependency + orphan + drift)
> Avoid using `npx` in CI unless the tool is a dependency. Prefer devDependencies + `npm run`.

### 5.1 Dependency graph / circular deps
If `madge` is a devDependency, run:
- `npm run audit:madge` or `npx madge ...` only if allowed
Capture:
- circular dependencies
- isolated subtrees
- orphan modules

### 5.2 Unused exports
Run:
- `ts-prune` (prefer devDependency)
Capture:
- unused exports with file:line

### 5.3 Dependency drift
Run:
- `depcheck` (prefer devDependency)
Capture:
- unused deps
- missing deps

**Checkpoint:** Put raw outputs into an appendix and summarize in tables.

---

## 6) “Truth alignment” cross-checks (the biggest hidden gaps)
This section is the most important for your project because your system is registry/schema/type-driven.

### 6.1 Schema version compatibility matrix
Cross-check:
- `src/lib/schemas.ts` accepted schema versions
- `makeDefaultCard()` schemaVersion
- export functions schemaVersion
- import acceptance logic in App
- docs references to CJ-1.0/1.1/1.2

**Record as Conflict** if:
- UI exports a version schema rejects
- import accepts but schema rejects
- docs instruct a version that fails in-app

### 6.2 Step type alignment matrix (CRITICAL)
Build a table that checks for each step type:
- exists in `blockRegistry.steps.types`
- exists in TS `Step` union
- exists in schemas validator
- has an Inspector editor OR fallback editor
- has graph/node representation (if graph is authoritative)
- is compiled correctly (if compiler exists)

**Record as Conflict** if:
- a step appears in palette but becomes UNKNOWN_STEP
- step exists in types/schema but not in registry
- step exists in registry but has no editor and requires raw JSON
- graph compiler drops/ignores step content (silent freeze)

### 6.3 Targeting profile alignment
Cross-check:
- schema rules: targetingProfiles uniqueness, profileId references, FOR_EACH_TARGET scoping
- editor behavior: can the user add/edit multiple profiles? do selection steps validate?

**Record as Conflict** if:
- SELECT_TARGETS allows profileId that doesn’t exist
- ITERATION_TARGET allowed outside FOR_EACH_TARGET subtree
- editor has no way to create required references

### 6.4 Library schema collisions (action vs card library)
Cross-check:
- version strings
- storage keys
- import/export filenames and error messages

**Record** any ambiguity that could cause the wrong file to be imported successfully but interpreted incorrectly.

### 6.5 Persistence drift (localStorage vs provider vs server)
Cross-check:
- which modules actually read/write cards/decks/scenarios
- whether server APIs exist but are unused
- whether provider abstraction exists but unused

**Record as Duplicate/Drift** if:
- two persistence paths exist for same object type
- UI uses localStorage but docs claim sqlite/API
- server writes are never called by UI

---

## 7) UI wiring / “feature not loading” audit (very common)
This is where agents often assume routing exists when it doesn’t.

### 7.1 Confirm screen entry points
Search and verify:
- `DeckBuilder` is not only imported but actually mounted/rendered
- `ScenarioBuilder` mounted/rendered
- `CardLibraryManager` mounted/rendered
- any tabs/router state exists in App

**Record as Conflict** if:
- feature components exist but never render due to missing routing/tabs

### 7.2 Console/runtime error scan
When the app is running (Pages or dev):
- open browser console
- capture any red errors
- especially missing imports, JSON parse errors, undefined registry keys

**Record** console errors with stack traces and file references.

---

## 8) Import/export round-trip tests (functional proof)
Agents often stop at “types compile”. This repo needs **behavioral round-trip proofs**.

### 8.1 Card round-trip
Create a minimal card JSON and a maximal card JSON:
- minimal: name/type/one ability/show_text
- maximal: multiple abilities, multiple targetingProfiles, nested IF_ELSE elseIf branches, SELECT_TARGETS + FOR_EACH_TARGET + ITERATION_TARGET, token costs, custom states

Verify:
- export → import returns identical structure
- unknown steps preserved (or safely wrapped) without loss
- schema validates after import

### 8.2 Deck round-trip
- deck with faction grouping
- cards assigned to units/items/spells with constraints
- export/import and validate

### 8.3 Scenario round-trip
- scenario with triggers, story slides, deck swap/empty hand actions
- export/import and validate

**Checkpoint:** include a “Round-trip Verification” section with pass/fail and evidence.

---

## 9) Documentation drift audit (AI agent readiness)
Because you rely heavily on AI-generated JSON, doc drift is catastrophic.

Cross-check:
- `AI_JSON_GUIDE.md`
- `AI_VARIABLES.md`
- `AI_PLAY_GUIDE.md`
- `AI_SYMBOLS_WEBHOOKS.md`
- any deck/scenario schema docs

Verify:
- docs reflect current schema versions
- docs list all step types and correct fields
- docs explain scoping rules (ITERATION_TARGET, refs)
- docs mention where to find registries and how to update them
- docs mention CI/Pipeline requirements for Pages

**Record as Doc Drift** with: claim → code reality → impact.

---

## 10) Report structure (what the agent must deliver)
### 10.1 Executive Summary
- counts by severity P0/P1/P2/P3
- top 5 risks
- top 5 recommended fixes (ordered)

### 10.2 CI Workflow Summary
- what workflow does and where it breaks
- required changes to unblock

### 10.3 Domain System Map (source-of-truth)
- filled table

### 10.4 Findings Tables (mandatory)
Use the templates in §11.

### 10.5 Functional Outcome Impact Map (MANDATORY)
Add a table mapping findings to outcomes:
- “Deck builder not loading” → breaks deck building outcome
- “schema mismatch” → breaks import/export + AI generation
- “step editor missing” → breaks ability authoring

### 10.6 Appendix
- raw tool outputs
- raw CI log excerpts
- console errors
- any generated graphs

---

## 11) Mandatory tables (copy into report)
### Table A — Domain System Map
| Domain | Source of Truth File(s) | Dependent Files | Duplicate/Alt Implementations | Drift Risk | Notes |
|---|---|---|---|---|---|

### Table B — Conflict Matrix
| ID | Type (CI/Schema/Registry/UI/Storage/Docs) | Symptom | Evidence | Root Cause | Functional Outcome Impact | Severity | Suggested Fix |
|---|---|---|---|---|---|---|---|

### Table C — Orphan Inventory
| ID | File/Symbol | Evidence (ts-prune/madge/grep) | Why orphaned | Risk of removal | Recommendation |
|---|---|---|---|---|---|

### Table D — Incomplete Functionality
| ID | Feature | Expected | Current | Evidence | Blocker | Severity | Recommendation |
|---|---|---|---|---|---|---|---|

### Table E — Duplicated / Double-up Functionality
| ID | Pair | Overlap | Divergence | Evidence | Risk | Severity | Consolidation Plan |
|---|---|---|---|---|---|---|---|

### Table F — Doc Drift
| Doc File | Claim | Code Reality | Evidence | Impact | Fix |
|---|---|---|---|---|---|

### Table G — Step/Registry/Schema Alignment (Critical)
| Step Type | In blockRegistry | In Step union (types.ts) | In schemas.ts | Has UI editor | Has fallback editor | Has node def | Compiler supports | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|

### Table H — Functional Outcome Impact Map (NEW)
| Outcome | What “done” looks like | Current blockers found | Evidence | Severity | Next action |
|---|---|---|---|---|---|

---

## 12) Extra “agent assumption” checks (often missed)
Add these explicitly:
- Verify **Pages base path** in Vite config matches repo name
- Verify feature components are **mounted**, not just imported
- Verify no “silent fallback” in graph compiler (steps not compiled but not errored)
- Verify unknown steps are preserved losslessly
- Verify docs for AI reflect actual accepted versions and required fields
- Verify CI does not rely on `npx` for tools blocked by registry policies (use devDependencies)

---

## 13) Deliverable
Return one Markdown file:
`REPO_AUDIT_REPORT.md`

No fixes, only analysis + recommendations.

---

## 14) How this relates to functional outcomes (context for the agent)
This repo is not a typical React app:
- it’s a **rules-program authoring tool**
- correctness depends on **alignment across registry/schema/types/editor/compiler**
- “it builds” is insufficient; we must prove:
  - author → export → import → validate → render preview is consistent
  - steps and references behave deterministically

If the agent cannot tie a finding to an outcome, it should not be prioritized.