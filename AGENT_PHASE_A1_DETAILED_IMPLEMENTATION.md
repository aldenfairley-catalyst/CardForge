# AGENT_PHASE_A1_DETAILED_IMPLEMENTATION.md
Captain Jawa Forge — Graph/Node Architecture Rebuild (JSON-first)
Phase: A1 — Registry-Driven Graph Palette + Generic Node Rendering (No Compiler Yet)
Version: 1.0 (Comprehensive Execution Instructions)

> This document is intentionally exhaustive. It must be followed step-by-step.
> After EACH checkpoint, update the root docs listed in “Doc Update Reminder” blocks.

---

## 0) Phase A1 Purpose in the Final Product
The final product needs a **graph-first editor** where:
- Nodes and their ports are defined in JSON (so the system is extensible and AI-friendly)
- The UI never hardcodes step configuration
- The same definitions drive:
  - palette contents
  - node appearance (pins/sections)
  - validation rules
  - compiler behavior (later)

Phase A1 builds the **foundation**: the app can load `nodeRegistry.json`, render a node palette, place nodes on canvas, and render pins/handles correctly.  
**No compilation, no schema bumps, no data migrations** in this phase—only additive UI + data structures.

---

## 1) Scope and Non-Scope
### In Scope (must implement)
1. Add `src/assets/nodeRegistry.json` (MVP nodes)
2. Add registry loader + pin materialization (`src/lib/nodes/registry.ts`)
3. Add minimal Graph IR types (`src/lib/graphIR/types.ts`)
4. Add a generic ReactFlow node renderer (`src/components/GraphNode.tsx`)
5. Update `src/App.tsx` to:
   - show a “Graph Nodes” palette driven by nodeRegistry JSON
   - allow placing nodes on the canvas
   - render placed nodes using the generic renderer
   - maintain graph node/edge state (editor IR)

### Out of Scope (must NOT implement yet)
- Compiler: graph → canonical steps (Phase A5/A6)
- Graph validation rules (Phase A4/A5)
- Edge connection enforcement rules (Phase A3/A4)
- Config editor form generation (Phase A2)
- Import/export of forge projects (Phase A6/A7)
- Local server + SQLite persistence (later track)

---

## 2) Pre-flight Checklist (before coding)
1. Pull latest repo state and create a branch:
   - `feature/graph-a1-registry-palette`
2. Run:
   - `npm ci` (or `npm install`)
   - `npm run dev`
   - confirm current app loads and you can still build cards
3. Identify current ReactFlow usage:
   - Find where `nodes` and `edges` are computed and passed to `<ReactFlow>`
4. Identify existing storage:
   - `src/lib/storage.ts` (localStorage) and how it currently saves cards
5. Confirm you are NOT breaking existing behavior:
   - This phase is additive: old builder may remain functional for now

**Checkpoint 0 (must pass):** app currently runs cleanly before any changes.

**Doc Update Reminder (after pre-flight):**
- Add a short “Phase A1 kickoff” note to `RELEASE_NOTES.md` (planned work).

---

## 3) New Data Contracts Introduced in Phase A1
This phase introduces **Editor Graph IR** (not runtime IR).

### 3.1 Node Registry JSON (CJ-NODEDEF-1.0)
Authoritative definition of:
- node types in palette
- config schema
- pin definitions + dynamic pins rules
- compilation strategy metadata (placeholder for later phases)

File: `src/assets/nodeRegistry.json`

### 3.2 Graph IR Types (CJ-GRAPH-1.0)
Graph state stored in UI (memory for now).
File: `src/lib/graphIR/types.ts`

> IMPORTANT: This graph IR is editor-only. It will later compile into canonical runtime steps.

---

## 4) File Tree Changes (Phase A1)
### New files to create
- `src/assets/nodeRegistry.json`
- `src/lib/nodes/registry.ts`
- `src/lib/graphIR/types.ts`
- `src/components/GraphNode.tsx`

### Existing files to modify
- `src/App.tsx` (graph palette + graph canvas integration)
- (Optional) `src/App.css` (only if needed for layout; keep minimal)

**Checkpoint 1 (must pass):** project builds after adding files (even before wiring UI).

**Doc Update Reminder:**
- Update `CJ_GRAPH_SPEC.md` to add:
  - nodeRegistry.json as the authoritative node list
  - Graph IR is editor-only in Phase A1

---

## 5) Implement `src/assets/nodeRegistry.json`
### 5.1 Requirements
The JSON must contain at minimum these node types:
- `EXEC_START`
- `SHOW_TEXT`
- `IF`
- `CONST_BOOL`
- `CONST_NUMBER`

The IF node must have:
- `configSchema` with integer `elseIfCount`
- `pins.static` including:
  - `execIn` CONTROL IN (required)
  - `thenExecOut` CONTROL OUT
  - `elseExecOut` CONTROL OUT
  - `ifCondIn` DATA boolean IN (required)
- `pins.dynamic` rule:
  - based on `elseIfCount`
  - pins per index:
    - `elseIfCondIn_{i}` DATA boolean IN required
    - `elseIfExecOut_{i}` CONTROL OUT

### 5.2 Determinism Rule (critical)
Dynamic pins must be generated deterministically:
- elseIf pins always appended in order (0..n-1)
- IDs must not change when count changes (only add/remove at end)

### 5.3 Validation expectations (later)
Even though validation is out-of-scope, the registry must be ready for it:
- no duplicate pin ids
- pins have group labels for UI grouping
- compile metadata exists (even if unused in A1)

**Checkpoint 2 (must pass):**
- JSON parses without error
- It contains all required nodes and fields

**Doc Update Reminder:**
- Update `AI_JSON_GUIDE.md`:
  - add a small section describing `nodeRegistry.json` purpose and node fields

---

## 6) Implement `src/lib/nodes/registry.ts`
### 6.1 Purpose
Provide a stable API for:
- retrieving node definitions
- listing palette categories
- materializing pins (static + dynamic) given node config

### 6.2 Public API (must implement)
Export functions:
- `getNodeDef(nodeType: string): NodeDef | null`
- `listNodesByCategory(): Array<{ category: string; nodes: NodeDef[] }>`
- `materializePins(nodeType: string, config: any): PinDef[]`
- `getDefaultConfig(nodeType: string): any`
  - reads defaults from configSchema (properties[].default)
  - ensures required fields have defaults where possible

### 6.3 Data Types (recommendations)
Define TS types in this file or co-locate with Graph IR:
- `PinKind = "CONTROL" | "DATA"`
- `PinDirection = "IN" | "OUT"`
- `DataType = "number" | "string" | "boolean" | ...`
- `PinDef = { id, kind, direction, label, group, dataType?, required?, defaultValue? }`
- `NodeDef = { nodeType, label, category, description?, configSchema, pins }`

### 6.4 Materialization logic
#### Static pins:
- return in exactly the order stored in JSON
#### Dynamic pins:
- only support one dynamic kind in A1: `ELSEIF_PINS`
- algorithm:
  1. Read `count = clampInt(config[sourceField], 0..max)`
  2. For i=0..count-1, generate pins using templates:
     - replace `{i}` with i
     - replace `{n}` with i+1 for labels
  3. Append generated pins after static pins

### 6.5 Cross-checks
- Determinism: same inputs produce same output
- No duplicates:
  - If duplicate ids are produced, throw error (fail fast)
- Defaults:
  - `getDefaultConfig("IF")` must return `{ elseIfCount: 0 }`

**Checkpoint 3 (must pass):**
- A quick local test inside App or console logs:
  - `materializePins("IF", { elseIfCount: 2 })` returns pins with correct IDs

**Doc Update Reminder:**
- Update `CJ_GRAPH_SPEC.md`:
  - define pin materialization rules and determinism requirement

---

## 7) Implement `src/lib/graphIR/types.ts`
### 7.1 Purpose
Provide a stable internal representation of graph projects:
- nodes and edges
- minimal metadata needed for ReactFlow
- future-proof for compilation

### 7.2 Types required (must implement)
- `export type EdgeKind = "CONTROL" | "DATA";`
- `export type GraphNode = { id: string; nodeType: string; position: { x:number; y:number }; config: any; };`
- `export type GraphEdge = { id: string; edgeKind: EdgeKind; from: { nodeId: string; pinId: string }; to: { nodeId: string; pinId: string }; };`
- `export type Graph = { graphVersion: "CJ-GRAPH-1.0"; id: string; label?: string; nodes: GraphNode[]; edges: GraphEdge[]; };`

### 7.3 Relationship to ReactFlow objects
ReactFlow expects:
- nodes: `{ id, type, position, data }`
- edges: `{ id, source, target, sourceHandle, targetHandle }`

In Phase A1, define explicit adapter mapping functions in App or a helper:
- `graphNodeToReactFlowNode(graphNode) -> RFNode`
- `graphEdgeToReactFlowEdge(graphEdge) -> RFEdge`

**Checkpoint 4 (must pass):**
- TypeScript compiles with new types
- No circular dependencies introduced

**Doc Update Reminder:**
- Update `CJ_GRAPH_SPEC.md` with Graph IR fields and relationship to ReactFlow.

---

## 8) Implement `src/components/GraphNode.tsx` (Generic Node Renderer)
### 8.1 Purpose in the final product
This replaces “one component per node type” with a single renderer that:
- reads node definition from registry
- renders pins in groups (panels)
- later supports dynamic pin changes and config-driven UI

### 8.2 Inputs/Outputs (must document in code comments)
Input props from ReactFlow:
- `data`: must include:
  - `nodeType` (string)
  - `config` (object)
- `selected`: boolean
- `id`: node id

Output:
- renders UI: header + grouped pin panels + Handles

### 8.3 Rendering rules
1. Load node definition:
   - `def = getNodeDef(data.nodeType)`
2. Materialize pins:
   - `pins = materializePins(data.nodeType, data.config)`
3. Group pins by `pin.group`:
   - Each group renders:
     - group title
     - pins within that group
4. For each pin render:
   - a label
   - a ReactFlow `<Handle>`
   - handle type mapping:
     - direction IN => `type="target"`
     - direction OUT => `type="source"`
   - handle position mapping:
     - IN pins: left
     - OUT pins: right
   - Use `id={pin.id}` on Handle (critical)

### 8.4 Visual semantics (minimal in A1)
- Control pins should be visually distinct:
  - larger dot or border
- Data pins can be uniform in A1
- Do NOT spend time on final styling in Phase A1; only functional clarity

### 8.5 Error handling UI
If nodeType is unknown:
- Render a red error node:
  - “Unknown nodeType: X”
- This is a visible indicator for registry drift

**Checkpoint 5 (must pass):**
- Dropping an IF node shows:
  - Flow section with exec pins
  - Conditions section with boolean condition pin

**Doc Update Reminder:**
- Update `AI_PLAY_GUIDE.md`:
  - “Graph nodes are generic and driven by nodeRegistry definitions.”

---

## 9) Modify `src/App.tsx` (Graph Palette + Graph Canvas State)
### 9.1 Purpose
This step wires the registry-driven node palette to ReactFlow, enabling:
- adding graph nodes
- rendering nodes with GraphNode
- tracking graphNodes/graphEdges in state

### 9.2 New UI/Interaction Requirements (must implement)
#### UI: New palette area
- Add a new panel section: “Graph Nodes (CJ-NODEDEF-1.0)”
- Show categories from registry:
  - Control, Core, Data, etc.
- Each node entry is clickable:
  - click => adds node to graph canvas

#### Interaction: Add node
When user clicks a node in palette:
- create new GraphNode:
  - id: stable unique (recommend `crypto.randomUUID()` if available; fallback to `n_${Date.now()}_${Math.random()}`)
  - nodeType: from registry
  - position: default placement
    - recommended: place near center or stagger
  - config: defaults from `getDefaultConfig(nodeType)`
- append to graph state

**Expected Result:**
- node appears on canvas
- can be dragged (ReactFlow default)

### 9.3 State shape (must document in code)
Add React state in App:
- `const [graph, setGraph] = useState<Graph>(...)`
  - or separate:
    - `graphNodes` (GraphNode[])
    - `graphEdges` (GraphEdge[])

Recommended minimal initial graph:
- Start with an empty graph OR include EXEC_START automatically.
Best UX: create an initial graph containing EXEC_START.

### 9.4 ReactFlow adapter mapping (must implement)
Render ReactFlow using transformed nodes/edges:
- `rfNodes = graph.nodes.map(n => ({ id:n.id, type:"genericNode", position:n.position, data:{ nodeType:n.nodeType, config:n.config } }))`
- `rfEdges = graph.edges.map(e => ({ id:e.id, source:e.from.nodeId, target:e.to.nodeId, sourceHandle:e.from.pinId, targetHandle:e.to.pinId }))`

### 9.5 Required interactions to support now
Even though enforcement/validation is later, A1 must not break basic interactions:
- drag nodes to reposition
- selection highlight works
- zoom/pan works

Minimum event handlers:
- `onNodesChange` should update graph node positions
- `onEdgesChange` can be a no-op for now if user cannot create edges yet (depends on whether you allow connections in A1)

**Important:** It is OK in A1 to disable edge creation by not providing `onConnect`.  
If you DO allow it:
- store edges as GraphEdge with edgeKind TBD (Phase A3 adds enforcement)

### 9.6 Checkpoint: ensure you did not break existing card builder
You may keep the old card builder and step graph intact.  
A1 should be additive:
- Graph panel can be a new tab, or an extra section in the existing canvas.

**Checkpoint 6 (must pass):**
- App loads
- Graph palette shows nodes from nodeRegistry JSON
- Clicking adds nodes
- Nodes render pins
- Node dragging updates position and persists (in state)

**Doc Update Reminder:**
- Update `CJ_GRAPH_SPEC.md`:
  - how App stores graph state in Phase A1
- Update `RELEASE_NOTES.md`:
  - Phase A1 shipped features list and “not yet implemented” list

---

## 10) Interaction Matrix (Phase A1) — every interaction documented
This section is the “must-implement” behavior contract for Phase A1.

### 10.1 Interaction: Open app
**User action:** load page  
**Expected:** graph palette loads from nodeRegistry  
**Data changes:** none persistent; in-memory graph initialized  
**Checks:**
- nodeRegistry is loaded
- default graph created (optional includes EXEC_START)

### 10.2 Interaction: Click palette node
**User action:** click “IF”  
**Expected:** IF node appears  
**Data changes:** graph.nodes append GraphNode  
**Relationship:** GraphNode.nodeType must exist in nodeRegistry  
**Checks:**
- config defaults applied
- pin materialization succeeds
- unknown nodeType triggers visible error node (not crash)

### 10.3 Interaction: Drag node
**User action:** drag node to new position  
**Expected:** node stays at position after drag  
**Data changes:** graph.nodes[n].position updated  
**Checks:**
- update only the dragged node
- do not recreate all nodes if avoidable

### 10.4 Interaction: Select node
**User action:** click node  
**Expected:** selection highlight; inspector can show selected node id/type (even if config form not yet)  
**Data changes:** selection state updated  
**Checks:**
- selection does not clear unexpectedly

### 10.5 Interaction: Refresh page (optional)
If you already persist to localStorage:
- You MAY store the graph in localStorage temporarily for A1 (optional).
- If you do:
  - load graph on startup
  - save graph on change (debounced)
If you do not, refresh resets graph (acceptable in A1 if documented).

**Doc Update Reminder:**
- Update `AI_PLAY_GUIDE.md`:
  - whether graph is persisted yet or not

---

## 11) Relationship Notes (how A1 connects to future phases)
### 11.1 nodeRegistry → UI → Compiler
- nodeRegistry defines pins and config
- GraphNode renders it now
- Later:
  - validator uses the same pins
  - compiler uses compile metadata

### 11.2 Graph IR → Forge Project JSON → SQLite
- Graph IR is the editor state that will be saved in:
  - Forge project export JSON (Phase A7)
  - local SQLite later (local server)

### 11.3 Canonical steps unaffected in A1
- Nothing in A1 should modify `ability.execution.steps[]` automatically.

**Doc Update Reminder:**
- Update `AI_JSON_GUIDE.md`: clarify “Graph IR is editor-only until compiler phase”.

---

## 12) Checkpoints (Hard Gates) — must not proceed if failing
### Checkpoint A1-1: Registry present
- nodeRegistry loads and lists 5 nodes

### Checkpoint A1-2: Palette driven by registry
- no hardcoded node list
- categories appear

### Checkpoint A1-3: Node render works generically
- pins shown for each node
- handles use stable ids from registry

### Checkpoint A1-4: Dragging updates state
- node positions update without crashing

### Checkpoint A1-5: No regressions to existing builder
- old editor still launches (if still in use)
- no build errors

After each checkpoint:
- run `npm run build` (at least once at the end)

**Doc Update Reminder:**
- Add “Checkpoint outcomes” summary to `RELEASE_NOTES.md` (short bullet list).

---

## 13) Definition of Done (Phase A1)
Phase A1 is DONE only when:
1. `nodeRegistry.json` exists and defines MVP nodes
2. Palette is generated from nodeRegistry categories
3. Clicking a palette entry adds a corresponding node to ReactFlow
4. GraphNode renders pins/handles grouped by `group`
5. Node dragging persists in state (not lost instantly)
6. Unknown nodeType shows a visible error node (no crash)
7. No existing major functionality is broken
8. Docs updated (CJ_GRAPH_SPEC + AI_JSON_GUIDE + RELEASE_NOTES)

---

## 14) End-of-Phase Mandatory Doc Updates (repeat intentionally)
At the end of Phase A1, agent MUST update:
- `CJ_GRAPH_SPEC.md`
  - node registry is authoritative
  - Graph IR fields
  - A1 supported nodes list
- `AI_JSON_GUIDE.md`
  - nodeRegistry format explanation (brief)
  - graph IR overview (brief)
- `AI_PLAY_GUIDE.md`
  - “Graph palette is JSON-driven”
- `RELEASE_NOTES.md`
  - Phase A1 feature list + known missing features (compiler/config editor/enforcement)

---

## 15) Handoff Notes to Phase A2
When A1 is complete, Phase A2 will add:
- NodeConfigForm (configSchema-driven)
- dynamic pins update live (IF elseIfCount)
- edge reconciliation when pins removed/added

To prepare, ensure:
- GraphNode uses registry pins and stable ids
- App state updates are localized (avoid re-creating node arrays unnecessarily)

---

# Appendix: Suggested MVP node set sanity checklist
- EXEC_START: has execOut CONTROL OUT
- SHOW_TEXT: execIn required + execOut
- IF: execIn required + then/else exec outs + boolean condition in + dynamic elseif pins
- CONST_BOOL: boolean OUT
- CONST_NUMBER: number OUT

If any are missing, stop and fix registry before proceeding.

---
