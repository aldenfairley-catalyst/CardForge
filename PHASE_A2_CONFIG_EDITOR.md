# PHASE_A2_CONFIG_EDITOR.md
Captain Jawa Forge — Graph/Node Rebuild  
Phase: A2 — Config Editor + Dynamic Pins + Edge Reconciliation  
Version: 1.0 (high detail, implementation-ready)

> Goal: After A1 (registry-driven palette + generic node rendering), Phase A2 adds a **generic node config editor** driven by `configSchema` in `nodeRegistry.json`.  
> This phase also makes **dynamic pins live** (e.g., IF else-if count), and prevents edge/pin breakage by **reconciling edges** when pins change.  
> Also fixes a common UX bug: editing in inspector should NOT deselect the node.

---

## 0) Phase A2 Outcomes (what “done” means)
A2 is complete when:
1. Selecting a graph node opens a **Node Config** inspector panel.
2. The inspector form is **generated from nodeRegistry.json configSchema** (no hardcoded node-specific config UI).
3. Editing config updates the node **without losing selection**.
4. Dynamic pin rules work live:
   - Example: IF `elseIfCount` changes → pins appear/disappear instantly.
5. When pins disappear, edges referencing removed pins are **automatically removed** (or moved, if you choose a policy—see below).
6. A “Node JSON (read-only)” debug view exists for fast troubleshooting.
7. Docs updated: `CJ_GRAPH_SPEC.md`, `AI_JSON_GUIDE.md`, `RELEASE_NOTES.md`.

---

## 1) Assumptions from A1 (dependencies)
A1 created:
- `src/assets/nodeRegistry.json`
- `src/lib/nodes/registry.ts` exporting:
  - `getNodeDef(nodeType)`
  - `getDefaultConfig(nodeType)`
  - `materializePins(nodeType, config)`
- `Graph IR` types in `src/lib/graphIR/types.ts`
- ReactFlow nodes have:
  - `type: "genericNode"`
  - `data: { nodeType: string, config: object }`

If any of these differ, adjust A2 accordingly but **document it**.

---

## 2) UX / Screen behavior (exact)
### 2.1 Selection + Inspector behavior
- Clicking a node selects it.
- Inspector shows:
  - Node header: label + nodeType + nodeId
  - Config form (editable)
  - Optional debug sections (pins, node JSON)
- Changing any config field must:
  - update the node config
  - re-render node pins if dynamic
  - NOT clear selection (node remains selected)

### 2.2 Tabs (recommended)
Inspector has tabs:
- **Config**
- **Pins (debug)**
- **Node JSON (debug)**

This helps verify correctness during development and avoids future “where did that pin come from” confusion.

---

## 3) Data model changes (Phase A2)
No schema version bump required for A2, but internal “graph editor state” needs stronger guarantees.

### 3.1 Add cached pin list (recommended)
To reconcile edges, you need “before” pins and “after” pins.

Option A (recommended): store computed pins in node data
- In ReactFlow node `data`, store:
  - `pinsCache: string[]` (list of pin IDs) OR full pin objects.
- Update pinsCache whenever config changes.

Option B: compute old pins on the fly
- Recompute old pins using “previous config” captured during update
- This is valid but error-prone if updates aren’t atomic.

**Pick one and document it in `CJ_GRAPH_SPEC.md`.**

---

## 4) Implementation: files to create/modify
### Create
1. `src/components/NodeConfigForm.tsx`
2. `src/components/NodeConfigFields.tsx` (optional helper components)
3. `src/lib/nodes/configSchema.ts` (optional schema utilities)
4. `src/lib/graphIR/reconcile.ts` (edge reconciliation utilities)

### Modify
1. `src/App.tsx`  
   - selection state
   - inspector panel integration
   - config update handler
   - dynamic pin + edge reconciliation integration

---

## 5) NodeConfigForm.tsx (generic form generator)
### 5.1 Supported configSchema subset (A2 MVP)
Implement support for JSON-schema-like structures used by nodeRegistry:
- `type: "object"`
- `properties: { [fieldName]: { type, title, description, default, enum, minimum, maximum } }`
- `required: string[]` (optional)
- simple types:
  - `string` → text input
  - `number` / `integer` → numeric input (integer uses step=1 + rounding)
  - `boolean` → checkbox
  - `enum` → select dropdown

**Out of scope in A2** (can be stubbed with read-only JSON editor):
- nested objects
- arrays
- oneOf/anyOf
- pattern validation

### 5.2 API (props)
`NodeConfigForm` should accept:
- `nodeId: string`
- `nodeType: string`
- `config: object`
- `schema: object` (nodeDef.configSchema)
- `onChange(nextConfig: object): void`
- `onPatch(patch: object): void` (optional convenience)
- `errors?: Record<string, string>` (optional local validation)

### 5.3 Field rendering rules
For each property:
- label = `title` OR fieldName
- show description text if provided
- input control depends on type/enum
- when changed:
  - create new config object: `{ ...config, [field]: coercedValue }`
  - call `onChange(nextConfig)`

### 5.4 Coercion rules (important)
- integer: `Math.floor(Number(value))`, clamp min/max if present
- number: `Number(value)` clamp min/max
- boolean: `checked`
- string: raw
- if empty string for optional numeric fields → use default or `undefined` (choose policy)

**Policy recommendation:** keep config explicit, do not delete keys unless there’s a Reset button.

### 5.5 Local validation (lightweight in A2)
Implement minimal checks:
- required fields not null/undefined/empty
- min/max constraints for numbers
Show inline warnings but allow editing.

---

## 6) Prevent “editing deselects node” (critical UX fix)
This usually happens because:
- ReactFlow selection is lost when you replace the entire `nodes` array with new object identities
- or because your `nodes` are derived from a `useMemo()` transform every render

### 6.1 Required approach
In `App.tsx`, manage ReactFlow nodes via ReactFlow helpers:
- `useNodesState` and `useEdgesState` from `reactflow`
  OR
- maintain `nodes` in `useState` and update with functional setters that preserve stable node objects except the one being edited.

**Do NOT re-derive nodes from card state every render for the new graph editor.**  
Graph editor nodes must be stateful and updated incrementally.

### 6.2 Selection state storage
Add:
- `selectedNodeId: string | null`
- On selection change:
  - if exactly one node selected: setSelectedNodeId(node.id)
  - else set null

When applying config updates:
- do not call `setSelected(null)` or similar
- after updating nodes, keep `selectedNodeId` unchanged if node still exists

### 6.3 Optional hardening
Use ReactFlow controlled selection:
- mark the selected node with `selected: true` in node object (advanced)
- or call `setViewport` etc only if needed

---

## 7) Dynamic pins update (IF elseIfCount)
### 7.1 Trigger
When `config` changes for a node:
- call `materializePins(nodeType, nextConfig)`
- compare against previous pin list (from cache or computed)

### 7.2 Pin cache update
Update node data:
- `data.pinsCache = newPins.map(p => p.id)`

### 7.3 Node rerender
GraphNode renderer reads `data.config` (and possibly `pinsCache` for debug) and calls `materializePins`.
Pins appear/disappear immediately.

**Checkpoint A2-DYN-1:** IF elseIfCount 0→2 adds pins `elseIfCondIn_0`, `elseIfExecOut_0`, `elseIfCondIn_1`, `elseIfExecOut_1`.

---

## 8) Edge reconciliation when pins change (must implement)
If pins are removed, any edge pointing to removed pin IDs becomes invalid.

### 8.1 Reconciliation algorithm
Inputs:
- `nodeId`
- `oldPinIds: Set<string>`
- `newPinIds: Set<string>`
- `edges: GraphEdge[]` or ReactFlow `Edge[]`

Compute:
- `removed = oldPinIds - newPinIds`

Remove edges if:
- `edge.source === nodeId && removed.has(edge.sourceHandle)`
- OR `edge.target === nodeId && removed.has(edge.targetHandle)`

Output:
- filtered edges list

### 8.2 Policy options (pick one now)
- **Policy A (recommended): remove invalid edges automatically**
  - simplest, deterministic, safest
- Policy B: attempt to remap to nearest surviving pin (dangerous; can create wrong wiring)

Implement Policy A in A2.

### 8.3 Where to run reconciliation
Run immediately after config update, in the same transaction:
1) update node config
2) compute oldPins/newPins
3) update node pinsCache
4) filter edges
5) setNodes + setEdges

**Checkpoint A2-EDGE-1:**  
Create an edge to `elseIfCondIn_1`, then reduce elseIfCount to 1 → edge is removed automatically and UI stays stable.

---

## 9) App.tsx integration (exact steps)
### 9.1 Add state for graph nodes/edges (if not already)
- `const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)`
- `const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)`
- `const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)`

### 9.2 Selection handler
Use ReactFlow:
- `onSelectionChange={(sel) => { ... }}`
Set selectedNodeId based on selected nodes.

### 9.3 Determine selected node + nodeDef
- `const selectedNode = nodes.find(n => n.id === selectedNodeId)`
- `const nodeDef = selectedNode ? getNodeDef(selectedNode.data.nodeType) : null`

### 9.4 Render inspector panel
If selectedNode and nodeDef:
- Render `NodeConfigForm`:
  - schema = nodeDef.configSchema
  - config = selectedNode.data.config
  - onChange calls `updateNodeConfig(nodeId, nextConfig)`

### 9.5 Implement updateNodeConfig(nodeId, nextConfig)
This function must:
1) find node
2) compute `oldPins = materializePins(nodeType, oldConfig)`
3) compute `newPins = materializePins(nodeType, nextConfig)`
4) update node data:
   - `config: nextConfig`
   - `pinsCache: newPins.map(p=>p.id)` (optional)
5) reconcile edges: remove any edges referencing removed pins
6) call `setNodes` and `setEdges` using functional updates
7) DO NOT touch selection state

**Checkpoint A2-SEL-1:** while typing in a field, selection does not drop.

---

## 10) Debug outputs (required for A2)
Add inspector debug sections:

### 10.1 Pins debug
Show:
- `materializePins(nodeType, config)` as a list:
  - id, kind, direction, group, dataType, required

### 10.2 Node JSON debug
Show:
- `JSON.stringify(selectedNode.data, null, 2)` read-only

These are extremely useful for diagnosing future “pin mismatch” issues quickly.

---

## 11) Tests (lightweight but recommended)
### 11.1 Unit tests for registry pin materialization
Add tests for:
- `materializePins("IF", { elseIfCount: 0 })` → base pins only
- `... elseIfCount: 2` → includes expected dynamic pins in expected order

### 11.2 Unit tests for edge reconciliation
- oldPins include elseIf pins, newPins remove them
- verify edges are removed

### 11.3 UI smoke test (manual checklist)
- Add IF node
- Increase elseIfCount
- Connect edges (if edge creation exists)
- Reduce elseIfCount
- Verify edges removed and node remains selected

---

## 12) Required documentation updates after A2
Update these files:
1) `CJ_GRAPH_SPEC.md`
   - add: “Config editor is schema-driven”
   - add: “Dynamic pins update and edge reconciliation policy”
2) `AI_JSON_GUIDE.md`
   - add: “How node config is represented in graph project JSON”
3) `RELEASE_NOTES.md`
   - add: A2 features, and what’s still missing (typed wiring enforcement, compiler)

---

## 13) Phase A2 Checkpoints (hard gates)
### A2-1: Config panel appears
- selecting node shows config fields generated from configSchema

### A2-2: Selection stability
- editing config does not deselect or reset inspector

### A2-3: Dynamic pins update
- IF elseIfCount adds/removes pins live

### A2-4: Edge reconciliation
- removing pins removes edges referencing them

### A2-5: Debug visibility
- inspector shows Pins + Node JSON debug views

---

## 14) What comes immediately after A2 (for planning)
Phase A3:
- enforce typed connections (CONTROL vs DATA)
- prevent invalid wiring
- pin multiplicity rules
- edgeKind and dataType stored on edges

---

## 15) Agent output required for review
When the agent finishes A2, they must return:
1) A short “diff summary” listing created/modified files
2) A table of supported configSchema features
3) Confirmation they passed checkpoints A2-1 to A2-5
4) Any known limitations / deferred schema types

---
