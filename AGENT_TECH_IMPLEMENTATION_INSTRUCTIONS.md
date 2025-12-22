# AGENT_TECH_IMPLEMENTATION_INSTRUCTIONS.md

**Captain Jawa Forge — Graph/Node Architecture Rebuild (JSON-first)** **Version:** 1.0  
**Target platform:** Local-first (Mac M1), but keep browser-only fallback working.  
**Primary goal:** Keep Graph/Node view (ReactFlow) while making **every node fully configurable**, nestable, and reliably compiled into canonical `ability.execution.steps[]` (CJ-1.x).

---

## 0) Non-negotiables
1.  **JSON-first:** node/port definitions live in `src/assets/nodeRegistry.json` (no hardcoding in App.tsx).
2.  **Single truth per layer:**
    -   Editor truth: **CJ-FORGE-PROJECT-1.0** (card + graphs + ui)
    -   Runtime truth: **CJ-1.x card JSON** with `ability.execution.steps[]` (canonical IR)
3.  **Graph must compile:** saving a project always updates canonical steps (debounced).
4.  **Graph validation blocks invalid graphs:** kind/type mismatches and missing required pins must be caught.
5.  **Dynamic pins must be deterministic:** stable ids; edge reconciliation must be correct.
6.  **Import/export must round-trip** without losing graph layout.

---

## 1) Repository analysis required before coding
Agent must:
-   Read root docs: `AI_JSON_GUIDE.md`, `AI_VARIABLES.md`, `AI_PLAY_GUIDE.md`, `AI_SYMBOLS_WEBHOOKS.md`
-   Inspect current source files:
    -   `src/App.tsx` (current hardcoded step editor + ReactFlow usage)
    -   `src/lib/types.ts` (Step, Ability, CardEntity)
    -   `src/lib/schemas.ts` (validateCard, schemaVersion rules)
    -   `src/assets/blockRegistry.json` (existing palette/steps)
-   Identify current schema version(s) in use and confirm import logic.

**Deliverable:** a short “impact report” describing what will be replaced vs reused.

---

## 2) Implementation plan overview (phased)

### Phase A (MVP Graph IR end-to-end)
-   **A1)** Add node registry JSON + loader
-   **A2)** Graph IR types + storage in app state
-   **A3)** Generic node renderer (pins grouped; handles)
-   **A4)** Config form from configSchema
-   **A5)** Edge creation rules (type checking)
-   **A6)** Graph validation + compiler for `EXEC_START`, `SHOW_TEXT`, `IF` + boolean constants
-   **A7)** Export/import Forge Project JSON
-   **A8)** Tests + pipeline gate (registry+compiler sanity)

### Phase B (Core gameplay nodes)
-   **B1)** `SELECT_TARGETS`, `FOR_EACH_TARGET`, `DEAL_DAMAGE`, `APPLY_STATUS`
-   **B2)** `OPPONENT_SAVE` (branch outputs)
-   **B3)** distance/LoS helper nodes
-   **B4)** Target profile editor integrated with graph

### Phase C (Advanced)
-   **C1)** Subgraphs + macros
-   **C2)** Script node (local server sandbox)
-   **C3)** Deck/scenario builder integration + triggers that compile into scenario scripts

---

## 3) Add JSON registries (source of truth)

### 3.1 Create files
-   `src/assets/nodeRegistry.json` (node definitions)
-   `src/assets/graphSchema.json` (JSON Schema for CJ-FORGE-PROJECT-1.0)

> **Do not** delete `blockRegistry.json` yet. Keep it for canonical step lists until migration is complete.

### 3.2 nodeRegistry.json structure requirements
Each node definition must include:
-   `nodeType` (stable id)
-   `label`, `category`, `description`
-   `configSchema` (JSON Schema subset: object properties, defaults, enums, min/max)
-   `pins.static[]` list of pins:
    -   `id`, `kind` (CONTROL|DATA), `direction` (IN|OUT), `label`, `group`
    -   `dataType` for DATA pins
    -   `required` and `defaultValue` where relevant
-   `pins.dynamic` optional deterministic generator:
    -   at MVP: `ELSEIF_PINS` based on `elseIfCount`
-   `compile.kind` describes compilation strategy:
    -   `SUBGRAPH_ENTRY`, `CANONICAL_STEP`, `VALUE_EXPR`, `CONDITION_EXPR`, etc.
    -   For `CANONICAL_STEP`, include `stepType`

### 3.3 Minimal MVP nodes
Must exist at MVP:
-   EXEC_START
-   SHOW_TEXT
-   IF (dynamic elseIf pins)
-   CONST_BOOL (DATA boolean out)
-   CONST_NUMBER (DATA number out) — optional but recommended

---

## 4) Add Graph IR types

### 4.1 Create `src/lib/graphIR/types.ts`
Define:
-   `ForgeProject` (CJ-FORGE-PROJECT-1.0)
-   `Graph` (CJ-GRAPH-1.0)
-   `GraphNode` (id, nodeType, position, config)
-   `GraphEdge` (id, edgeKind CONTROL|DATA, from {nodeId,pinId}, to {nodeId,pinId})
-   UI metadata:
    -   active graph id, collapsed nodes/panels, etc.

### 4.2 Data model decisions (MVP)
-   Maintain graph state in React state (like card state).
-   The card JSON stored in the project must be valid CJ-1.x.
-   When graph compiles, update `ability.execution.steps[]` in card.

---

## 5) Implement node registry loader and pin materialization

### 5.1 Create `src/lib/nodes/registry.ts`
Responsibilities:
-   Import `nodeRegistry.json`
-   Expose:
    -   `getNodeDef(nodeType)`
    -   `listNodeDefs()` and `listNodesByCategory()`
    -   `materializePins(nodeType, config)`:
        -   start with static pins
        -   apply dynamic pins deterministically:
            -   IF elseIfCount -> generate stable ids: `elseIfCondIn_0`, `elseIfExecOut_0`, ...
        -   return ordered pin list + grouped by panels

### 5.2 Compatibility and pin typing rules
Create helper:
-   `pinsCompatible(outPin, inPin)`:
    -   kind must match
    -   if DATA: dataType must match
    -   allow `json` as wildcard input only if explicitly intended (MVP: avoid wildcard unless necessary)

---

## 6) Replace hardcoded nodes with a generic GraphNode renderer

### 6.1 Create `src/components/GraphNode.tsx`
Render:
-   Title area: label + category badge
-   Pin panels:
    -   group pins by `group` string (Flow, Conditions, Value, Branches, etc.)
    -   show section headers
-   Handles:
    -   CONTROL pins: thicker, unique style
    -   DATA pins: smaller, color by dataType (keep a map in code)

**Important:** handles must be stable by `pin.id`.

### 6.2 Update ReactFlow nodeTypes mapping
-   Use a single ReactFlow node type, e.g. `genericNode`.
-   Each node’s `data` includes:
    -   `nodeType` (from registry)
    -   optionally a cached materialized pin list (or compute inside GraphNode)

---

## 7) Build config editor from `configSchema`

### 7.1 Create `src/components/NodeConfigForm.tsx`
MVP form generator supports:
-   string
-   number / integer
-   boolean
-   enums
-   min/max + defaults

Inputs update `node.config`.

### 7.2 Inspector behavior (selection stability)
Fix a known UX failure mode:
-   Editing config must NOT clear selection.
-   Avoid resetting selection state in any `useEffect` that responds to card/graph updates.
-   When updating a node config, update only that node in graph state; do not recreate the entire nodes array if avoidable.

### 7.3 Dynamic pins reconciliation
When config changes:
-   recompute pins
-   if a pin id no longer exists, remove edges connected to it
-   preserve unaffected edges

Implement helper:
-   `reconcileEdgesAfterPinChange(graph, nodeId, oldPins, newPins)`

---

## 8) Enforce connection rules at edge creation time

### 8.1 ReactFlow onConnect handler
On attempted connect:
-   lookup pin defs for both endpoints
-   reject if:
    -   kind mismatch (CONTROL->DATA)
    -   direction mismatch
    -   dataType mismatch
-   if accepted:
    -   create edge with `edgeKind`
    -   optionally store `sourceHandle`/`targetHandle` as `pinId` for ReactFlow compatibility

UI must show error feedback (toast or inline).

---

## 9) Implement Graph validation

### 9.1 Create `src/lib/graphIR/validateGraph.ts`
Return `ValidationIssue[]` compatible with existing UI.

MVP checks:
1.  Unknown nodeType -> ERROR
2.  Missing EXEC_START -> ERROR
3.  Required pin missing connection and no defaultValue -> ERROR
4.  Edge pin kind mismatch -> ERROR
5.  Edge DATA type mismatch -> ERROR
6.  Exec reachability:
    -   EXEC_START execOut must connect somewhere OR allow empty graph but warn
7.  Remove invalid edges automatically? (MVP: better to error; optionally auto-clean on load)

---

## 10) Implement compiler: Graph → Canonical steps

### 10.1 Create `src/lib/graphIR/compiler.ts`
Entry:
-   `compileAbilityFromGraph({ graph, ability, card }): { steps: Step[], issues: ValidationIssue[] }`

### 10.2 Compiler approach (MVP)
-   Follow CONTROL flow from EXEC_START.execOut.
-   Each node yields:
    -   a canonical step (SHOW_TEXT, IF_ELSE)
    -   OR contributes a condition/expression (CONST_BOOL) used by another node via DATA edges.

### 10.3 Data compilation
Implement:
-   `compileBooleanInput(nodeId, pinId)`:
    -   find DATA edge feeding that pin
    -   compile from source node:
        -   CONST_BOOL -> Condition AST `{ type:"CONST_BOOL", value }`
    -   if missing and required -> issue error

Make sure your Condition AST matches your existing condition system.
If current condition system lacks CONST_BOOL, add it consistently:
-   Update `types.ts` for condition union
-   Update `ConditionEditor` to support it (or treat ALWAYS/NEVER as bool constants)

### 10.4 IF node compilation (core requirement)
Given IF node:
-   condition: from `ifCondIn` boolean input
-   THEN branch: compile chain starting at `thenExecOut`
-   ELSE branch: chain from `elseExecOut`
-   ELSEIF:
    -   for i in [0..elseIfCount-1]:
        -   condition from `elseIfCondIn_i`
        -   branch from `elseIfExecOut_i`

Compile into canonical step:
```json
{
  "type": "IF_ELSE",
  "condition": { ... },
  "then": [ ...steps ],
  "elseIf": [
    { "condition": { ... }, "then": [ ...steps ] }
  ],
  "else": [ ...steps ]
}
## 10.5 SHOW_TEXT Node Compilation (Far More Comprehensive)

### Why this exists in the final product
`SHOW_TEXT` is the simplest “observable effect” node. It serves as:
- A debugging aid (designers can see flow execution in logs)
- A narrative tool (scenario/story events can inject text)
- A “hello world” proof that graph → canonical compilation is functioning

It’s foundational because every other node can be validated against its behavior: stable pins, stable config, stable compilation.

### Canonical runtime representation
Compiled to (canonical step):
    { "type": "SHOW_TEXT", "text": "..." }

### Approaches

#### Approach A (recommended): direct mapping from node config
- **Input:** `node.config.text` from graph
- **Output:** canonical step `SHOW_TEXT` with `text` copied verbatim
- **Pros:** trivial, stable, minimal drift
- **Cons:** no dynamic formatting (yet)

#### Approach B: allow DATA input to override text (future)
- Add a DATA pin `textIn` (string) to `SHOW_TEXT`
- If connected, compile from the connected expression source
- **Pros:** dynamic text (e.g., “Dealt {damage} damage”)
- **Cons:** requires expression type `string` support and runtime interpolation rules

**MVP:** Use Approach A. Keep stable and predictable.

### Cross-checks to perform

#### `nodeRegistry.json`
- `SHOW_TEXT` must have `configSchema.properties.text` with a default
- Must have:
  - CONTROL `execIn` **required**
  - CONTROL `execOut` **optional**

#### Graph validation
- If `execIn` is required, ensure chain builder can reach it (or produce validation errors)

#### Compiler
- Ensure compilation uses node config and does **not** depend on pin connectivity

#### `schemas.ts`
- `SHOW_TEXT` must already be an allowed Step type in canonical schema; if not, add it

### Edge cases
- **Missing text in config**
  - Use schema defaults at config initialization time
  - If still missing, validation error: `MISSING_CONFIG:text`
- **Empty text**
  - Allowed (valid), but optionally warn for designer

### How it is used in the final product
- Story beats in scenario builder (“Narrator: The storm intensifies…”)
- Debugging complex macros (“Entered damage loop”, “Branch fail path chosen”)
- Communicating outcomes in multiplayer log

### Definition of Done (SHOW_TEXT)
- [ ] Node appears in palette (from `nodeRegistry`)
- [ ] Node renders with pins grouped under “Flow”
- [ ] Inspector edits text reliably without deselecting node
- [ ] Compilation produces `SHOW_TEXT` in canonical steps
- [ ] Export/import round-trips with text unchanged
- [ ] Unit test: `Start → Show Text` produces expected steps

### Doc Update Reminder (after implementing SHOW_TEXT)
Update:
- `AI_JSON_GUIDE.md` (SHOW_TEXT canonical step definition + example)
- `CJ_GRAPH_SPEC.md` (node compile mapping section)
- `AI_PLAY_GUIDE.md` (logging/narration usage)


## 10.6 Chain Termination Rules (Far More Comprehensive)

### Why this exists in the final product
Without explicit chain termination rules, designers get “mysterious” behavior:
- Steps silently stop executing
- Branches implicitly merge without intent
- Loops create accidental cycles

Clear termination rules are what make a graph a predictable “program”.

### Canonical mapping model
Graph control edges define the order and branching.

A chain ends when:
- There is no outgoing CONTROL edge from the node’s `execOut` pin, **or**
- Node is a terminal node (e.g., `END_TURN`) that explicitly terminates flow, **or**
- Node is a branch node and the branch output pin has no outgoing edge

### Approaches

#### Approach A (strict single-outgoing for non-branch nodes) — recommended MVP
- For nodes with `execOut`:
  - Allow **0 or 1** outgoing CONTROL edge
  - If **>1** outgoing, validation error `MULTIPLE_EXEC_OUT`
- Branch nodes:
  - Allow multiple outgoing because they have separate exec output pins

**Pros:**
- Eliminates ambiguity
- Easy to validate and compile

**Cons:**
- Doesn’t allow “fan-out” parallel flows (which you likely don’t want)

#### Approach B (implicit sequencing using ordering of multiple edges)
- If multiple outgoing edges exist, sort by edge creation order or y-position
- **Not recommended:** extremely fragile and confusing

### Branch merging
**MVP rule: no implicit merges**
- If two branches should rejoin, designer must connect them to an explicit `MERGE` node later (future feature).
- For now, each branch compiles into a nested `steps[]` array and ends independently.

### Cycles and loops
**MVP rule: no cycles permitted**
- If a cycle is detected in CONTROL edges, validation error `CYCLE_NOT_ALLOWED`
- Later, introduce explicit loop nodes like `FOR_EACH_TARGET` or `WHILE` that model cycles safely.

### Cross-checks
`validateGraph.ts` must detect:
- Multiple outgoing from a non-branch pin
- Cycles
- Missing `EXEC_START` connection

`compiler.ts` must:
- Never infinite recurse if cycles exist (always guard)

### Definition of Done (Chain Termination)
- [ ] Validation blocks multi-exec-out connections for non-branch nodes
- [ ] Validation blocks cycles
- [ ] Compiler halts cleanly at end-of-chain without errors
- [ ] Unit tests:
  - [ ] chain ends with no outgoing `execOut` (compiles to finite steps)
  - [ ] connecting two `execOut` edges triggers validation error

### Doc Update Reminder (after implementing Chain Rules)
Update:
- `CJ_GRAPH_SPEC.md` (control flow rules: termination, cycles)
- `AI_PLAY_GUIDE.md` (designer expectations: how flows end)


## 11) Integrate Compiler into the App (Far More Comprehensive)

### Why this exists in the final product
The final product needs:
- Designers build a graph (editor IR)
- Game engine executes canonical steps (runtime IR)

Therefore, compilation must happen continuously and reliably, without corrupting work.
This also allows AI agents to generate canonical cards while humans use graph editing.

### Approaches

#### Approach A (recommended): debounced compile-on-change with last-known-good steps
On any graph change:
- Validate graph
- If graph is valid enough: compile
- Store compiled steps in card ability
- Keep `lastGoodCompiledSteps` to restore when compilation fails
- Debounce 200–500ms to avoid compiling on every keystroke

#### Approach B: compile only on explicit “Compile” button
- Safer for performance
- Worse UX: designers forget to compile and export stale steps

**MVP:** Use Approach A with last-good fallback.

### Critical cross-check: Selection stability
Known issue: selection drops when arrays are recreated.

Rule:
- Graph edits must be localized updates:
  - update node config for selected node only
  - keep node ids stable
  - avoid re-generating entire node list from scratch

In ReactFlow:
- Prefer `useNodesState` / `useEdgesState` where possible
- Ensure `onNodesChange` doesn’t nuke selection

### Cross-checks
- `src/App.tsx`
  - Where graph state lives
  - Where compilation is called
  - Ensure compilation updates only card JSON, not graph nodes list
- `src/lib/graphIR/compiler.ts`
  - Must be pure (no mutation)
- `src/lib/graphIR/validateGraph.ts`
  - Must return deterministic issue lists

### Definition of Done (Compiler Integration)
- [ ] Editing config updates steps after debounce
- [ ] If graph invalid, UI shows errors but does not destroy graph
- [ ] Exported canonical card includes latest compiled steps
- [ ] Unit tests include compile integration logic at least for one ability

### Doc Update Reminder
Update:
- `AI_JSON_GUIDE.md` (canonical vs project, compile lifecycle)
- `CJ_GRAPH_SPEC.md` (compile-on-change rule)
- `AGENT_UPDATE_PLAYBOOK.md` (no merges without compile tests)


## 12) Expand Nodes After MVP (Phase B) (Far More Comprehensive)

### Why this exists in final product
MVP only proves architecture. Real card mechanics require:
- Target selection
- Iteration over multiple targets
- Damage/status application
- Saves with branches
- Distance/LoS checks

These are the “stress test” mechanics that make the system future-proof.

### Approach: implement nodes in “patterns”, not one-offs
Most combat abilities follow recurring patterns:
- Select targets (profile-based)
- For each target:
  - optional save/branch
  - deal damage/apply status
- Optionally spawn/despawn entities
- Modify states/tokens

Implement nodes to support these patterns first.

### Node expansion order (with reasoning)
- `SELECT_TARGETS`
  - Enables any targeted action
  - Also becomes the hub for AoE/secondary target systems later
- `FOR_EACH_TARGET`
  - Enables multi-target attacks, chain lightning, cleave, etc.
- `DEAL_DAMAGE`
  - Core combat resolution
- `APPLY_STATUS`
  - Core tactical mechanics
- `OPPONENT_SAVE`
  - Branching based on opponent roll/save
- `CALC_DISTANCE` / `LOS_CHECK`
  - Enables conditional targeting and edge-case rules

### Cross-checks for each new node
For every node type added:
- Add node definition to `src/assets/nodeRegistry.json`
- Add compilation support in `compiler.ts`
- Add validation rules in `validateGraph.ts`
- Ensure canonical schemas/types accept produced steps (`types.ts`, `schemas.ts`)
- Add documentation entry in `AI_JSON_GUIDE.md`
- Add at least one unit test in `tests/graphCompile.spec.ts`

### Definition of Done (Phase B)
- [ ] Can build a full ability:
  - select targets by profile
  - iterate targets
  - deal damage
  - apply status
  - opponent save determines branch
- [ ] No raw JSON editing required for those mechanics
- [ ] Exported canonical steps validate with `validateCard()` 
- [ ] At least 5 tests cover typical patterns

### Doc Update Reminder
Update:
- `AI_JSON_GUIDE.md` (node and canonical step tables)
- `AI_VARIABLES.md` (saveAs outputs and target set refs)
- `CJ_GRAPH_SPEC.md` (supported node set + compile rules)


## 13) Tests + Pipeline (Required) (Far More Comprehensive)

### Why this exists in final product
This architecture introduces multiple truth sources:
- `nodeRegistry.json`
- compiler
- schemas/types
- UI form generator

Tests are required to prevent drift and recurring UNKNOWN/invalid runtime.

### Testing approaches

#### Approach A (recommended): compiler contract tests
Given a small graph JSON input → expected canonical steps output.
This protects logic even if UI changes.

#### Approach B: registry invariants tests
No duplicates, all pins valid, dynamic generators valid.

#### Approach C: validation tests
Invalid edges produce correct errors.

### Must-have test cases

#### Registry sanity
- unique `nodeType`
- unique pin IDs per node
- dynamic generator references config fields that exist

#### Graph compile
- `Start → ShowText`
- `Start → IF (ConstBool) with Then/Else`
- `IF` with `elseIfCount=2` and correct branch mapping

#### Graph validation
- control/data mismatch
- missing required condition input on `IF`
- multiple `execOut` edges on non-branch node error

### Pipeline improvements
GitHub Actions should run:
- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run build`

Pages deploy only if above succeed.

### Definition of Done (Tests + Pipeline)
- [ ] CI fails if `nodeRegistry` breaks
- [ ] CI fails if compiler output shape changes unintentionally
- [ ] CI fails if schema versions drift
- [ ] Pages deployment gated

### Doc Update Reminder
Update:
- `AGENT_UPDATE_PLAYBOOK.md` (DoD includes tests)
- `RELEASE_NOTES.md` (pipeline changes)
- `AI_JSON_GUIDE.md` (test guarantees for agents)


## 14) Documentation Updates for AI Agents (Required) (Far More Comprehensive)

### Why this exists in final product
Your explicit goal is:
- AI agents generate importable JSON reliably

Agents must understand both:
- canonical card JSON
- forge project JSON (graph + layout)

Agents must understand constraints and typical patterns.

### Required doc structure changes

#### `AI_JSON_GUIDE.md` must include
- Two sections:
  - Canonical card JSON `CJ-1.x` (runtime)
  - Forge project JSON `CJ-FORGE-PROJECT-1.0` (editor)
- A “Mapping” chapter:
  - `NodeType → Canonical StepType` mapping
  - Example graphs and compiled steps side-by-side
- Full tables:
  - `nodeRegistry` nodes: config fields, pins, compile behavior

#### `AI_VARIABLES.md` must include
- What `saveAs` means in canonical and graph terms
- Scope rules for references:
  - branch scope
  - loop scope
- Common outputs from nodes:
  - `SELECT_TARGETS` outputs `targetSet` ref id
  - `CALC_DISTANCE` outputs number variable name
- Naming conventions (stable IDs vs human labels)

#### `AI_PLAY_GUIDE.md` must include
- How these graphs translate to physical play
- How logs and flows work
- What parts are “assistive” vs authoritative

### Definition of Done (Docs)
- [ ] A new agent can generate:
  - a full CJ card JSON
  - a CJ Forge project JSON
  - with correct `IF_ELSE` `elseIf` structure
- [ ] A new agent can add a node type without breaking tests, by following docs

### Doc Update Reminder
Update ALL root docs at the end of:
- MVP completion
- Each new node type added
- Each schema bump
- Each validation rule added


## 15) Deliverables Checklist (Agent must produce) (Far More Comprehensive)

### MVP deliverables (Phase A)
- [ ] `nodeRegistry.json` + loader
- [ ] Graph IR types
- [ ] Generic node renderer with grouped pins
- [ ] `configSchema`-driven inspector form
- [ ] Connection enforcement (kind/type)
- [ ] `validateGraph` + compiler for Start, ShowText, IF, ConstBool
- [ ] Export/import Forge Project JSON
- [ ] Tests + CI gating
- [ ] Docs updated + release notes

### Phase B deliverables
- [ ] `SELECT_TARGETS`, `FOR_EACH_TARGET`, `DEAL_DAMAGE`, `APPLY_STATUS`, `OPPONENT_SAVE` nodes
- [ ] Documentation tables expanded to include new nodes and canonical outputs
- [ ] Tests for each core node pattern

### Definition of Done (Deliverables)
- [ ] No major editor work requires raw JSON editing
- [ ] All exported content imports cleanly on a fresh browser profile
- [ ] All CI checks pass

### Doc Update Reminder
After producing deliverables, update:
- `RELEASE_NOTES.md`
- `AI_JSON_GUIDE.md` tables
- `CJ_GRAPH_SPEC.md` supported nodes section


## 16) Known Pitfalls (Avoid) (Far More Comprehensive)

### Pitfall: selection drops during edit
- **Cause:** replacing entire nodes array on config edit
- **Fix:** patch the selected node only; use stable ids; don’t re-run layout/graph rebuild on every state change

### Pitfall: dynamic pins break edges
- **Cause:** pin ids change when `elseIfCount` changes
- **Fix:** stable deterministic IDs; when removing pins, remove connected edges

### Pitfall: compiler mutates graph or card
- **Fix:** compiler is pure: input → output; apply results to state outside compiler

### Pitfall: nodeRegistry drift vs compiler
- **Fix:** tests that load `nodeRegistry` and ensure compiler supports required nodes

### Pitfall: docs become stale
- **Fix:** enforce “doc update reminder” at end of each step; add doc update checklist to PR template (optional)

### Doc Update Reminder
At the end of every pitfall fix, record it in:
- `AGENT_UPDATE_PLAYBOOK.md` “Common mistakes” section


## 17) Definition of Done for Phase A (MVP) (Far More Comprehensive)

### MVP feature set required
Graph canvas supports:
- add nodes from palette (registry-driven)
- connect pins with enforcement
- edit node config via `configSchema` form
- dynamic `elseIf` pins for `IF`

Graph compiles to canonical steps:
- `Start → ShowText`
- `Start → If → ShowText` branches
- `elseIf` supported with multiple branches

Export/import:
- Forge Project JSON contains graph + card
- Import restores graph layout and compiled steps

Validation:
- pin mismatches blocked
- missing required condition flagged
- multiple outgoing exec edges flagged
- cycles flagged

Tests + pipeline:
- registry integrity tests
- compile tests for `IF` + `ShowText`
- validation tests for mismatches
- CI gating build and deploy

### How MVP will be used immediately
Designers can build logic without raw JSON editing:
- `IF` conditions and branch flows are fully representable

This provides the foundation for:
- `OPPONENT_SAVE` branching
- scenario triggers and story flows
- macros and subgraphs

AI agents can:
- generate canonical steps
- optionally generate full project graphs for nicer UX

### Final Phase A Cross-check list (must do before calling it complete)
- [ ] Check these files:
  - `src/assets/nodeRegistry.json` (pins, configSchema, dynamic pins)
  - `src/lib/nodes/registry.ts` (materializePins deterministic)
  - `src/components/GraphNode.tsx` (handles stable ids, grouped panels)
  - `src/components/NodeConfigForm.tsx` (defaults, validation)
  - `src/lib/graphIR/validateGraph.ts` (pin checks, cycles)
  - `src/lib/graphIR/compiler.ts` (IF_ELSE mapping correct)
  - `src/App.tsx` (compile integration debounced, selection stable)
  - `src/lib/types.ts` and `src/lib/schemas.ts` (supports IF_ELSE elseIf structure)
  - `tests/*.spec.ts` (registry + compile + validate)
  - `.github/workflows/pages.yml` (CI gating)

- [ ] Run locally:
  - `npm test`
  - `npm run build`

- [ ] Test manual UX:
  - `IF elseIfCount` change keeps selection
  - Export/import project round-trip
  - No UNKNOWN node types

### Definition of Done (Phase A)
Phase A is complete ONLY when:
- A new user can build an IF branching logic entirely in graph UI
- Export project JSON, delete storage, import, and it still works
- Canonical steps validate with `validateCard()` with 0 errors
- Tests and CI pass

### Doc Update Reminder (final)
Update:
- `AI_JSON_GUIDE.md` (full examples + mapping)
- `AI_VARIABLES.md` (scope/ref rules)
- `CJ_GRAPH_SPEC.md` (Phase A supported nodes)
- `RELEASE_NOTES.md` (Phase A release + migration notes)
- `AGENT_UPDATE_PLAYBOOK.md` (pipeline + tests rules)
