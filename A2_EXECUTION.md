# NEXT_STEP_A2_EXECUTION.md
Phase A2 (Config Editor + Dynamic Pins) — Immediate Next Step Checklist

## 1) Create a new branch
- `git checkout -b feature/graph-a2-config-editor`

## 2) Add the new files (empty skeletons first)
Create:
- `src/components/NodeConfigForm.tsx`
- `src/lib/graphIR/reconcile.ts`

Commit message: `chore(a2): add config form + reconcile skeletons`

---

## 3) Implement NodeConfigForm.tsx (MVP fields)
In `NodeConfigForm.tsx`, implement a generic form generator that supports:
- object schema with `properties`
- field types: string, number, integer, boolean
- enum → select
- required → inline warning

**Acceptance check**
- Given IF node config schema, it renders `elseIfCount` as an integer input.

Commit message: `feat(a2): generic NodeConfigForm from configSchema`

---

## 4) Add edge reconciliation helper
In `src/lib/graphIR/reconcile.ts` implement:

### `reconcileEdgesForPinRemoval(...)`
Inputs:
- `nodeId`
- `oldPinIds: string[]`
- `newPinIds: string[]`
- `edges` (ReactFlow edges or GraphIR edges)

Behavior:
- remove edges whose `sourceHandle` or `targetHandle` is in removedPins for that node

Commit message: `feat(a2): reconcile edges when dynamic pins removed`

---

## 5) Fix the “editing deselects node” issue (App.tsx refactor)
This is the most important A2 change.

### 5.1 Switch Graph canvas to controlled ReactFlow state
In `App.tsx` (graph mode / graph canvas):
- Use ReactFlow helpers:
  - `useNodesState`
  - `useEdgesState`
- Store selection separately:
  - `selectedNodeId: string | null`

**Do NOT** rebuild the graph nodes array from scratch on every render.
Only update the one node being edited.

### 5.2 Add selection handler
- `onSelectionChange` sets `selectedNodeId` (only if exactly one node selected)

### 5.3 Render the inspector panel
When `selectedNodeId` exists:
- load node: `nodes.find(n => n.id === selectedNodeId)`
- load nodeDef: `getNodeDef(node.data.nodeType)`
- show `NodeConfigForm` with:
  - schema: nodeDef.configSchema
  - config: node.data.config

Commit message: `refactor(a2): controlled graph nodes/edges + stable selection`

---

## 6) Implement updateNodeConfig() in App.tsx (dynamic pins + reconcile edges)
Add function:

1) Find node by id
2) Compute `oldPins = materializePins(nodeType, oldConfig)`
3) Compute `newPins = materializePins(nodeType, nextConfig)`
4) Update node data:
   - `config: nextConfig`
   - optionally `pinsCache: newPins.map(p=>p.id)`
5) Reconcile edges using helper (remove edges referencing removed pins)
6) Call `setNodes` + `setEdges` (functional updates)
7) DO NOT touch `selectedNodeId`

Commit message: `feat(a2): config updates drive dynamic pins + edge reconciliation`

---

## 7) Add debug panels in inspector (fast troubleshooting)
In the inspector area:
- “Pins (debug)” → list output of `materializePins(nodeType, config)`
- “Node JSON (debug)” → `JSON.stringify(node.data, null, 2)`

Commit message: `chore(a2): add inspector debug (pins + json)`

---

## 8) Manual test checklist (must pass before moving on)
### A2-1 Config panel appears
- Add IF node → select it → config shows `elseIfCount`

### A2-2 Selection remains stable
- While typing `elseIfCount`, selection stays and inspector does not vanish

### A2-3 Dynamic pins appear/disappear
- Set elseIfCount 0 → 2 → pins appear instantly on node
- Set elseIfCount 2 → 1 → pins disappear

### A2-4 Edge reconciliation works
(Only if you already allow edges; otherwise you can simulate with dummy edges)
- Connect to `elseIfCondIn_1`
- Reduce elseIfCount to 1
- Edge referencing removed pin is removed automatically

---

## 9) Documentation updates (do after code works)
Update:
- `CJ_GRAPH_SPEC.md` (A2: config editor + pin reconciliation policy)
- `AI_JSON_GUIDE.md` (how node config + dynamic pins behave)
- `RELEASE_NOTES.md` (A2 shipped)

Commit message: `docs(a2): update graph spec + ai guide + release notes`

---

## 10) Stop point / handoff to A3
Once A2 is stable and passing the checklist, proceed to A3:
- enable `onConnect`
- validate wiring rules (CONTROL vs DATA, type matching, multiplicity, cycles)
