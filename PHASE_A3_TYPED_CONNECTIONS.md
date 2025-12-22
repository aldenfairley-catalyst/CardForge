# PHASE_A3_TYPED_CONNECTIONS.md
Captain Jawa Forge — Graph/Node Rebuild  
Phase: A3 — Typed Connections + Edge Rules + Connection UX  
Version: 1.0 (implementation-ready specification)

> A3 builds on A1 (registry-driven nodes) + A2 (config editor + dynamic pins + edge reconciliation).  
> Goal: allow designers to draw connections **safely** with clear semantics:
> - **CONTROL** flow connections (execution order)
> - **DATA** connections (values/expressions)
> and prevent invalid wiring automatically.

---

## 0) Phase A3 Outcomes (Definition of Done)
A3 is complete when all of the following are true:

1. Users can connect pins by dragging handles (ReactFlow `onConnect` enabled).
2. Invalid connections are blocked with a clear, specific message.
3. The system enforces:
   - CONTROL → CONTROL only
   - DATA → DATA only
   - Direction rules (OUT → IN only)
   - DataType rules (boolean→boolean, number→number, etc.)
   - Pin multiplicity rules (default: IN pins accept one edge unless `multi:true`)
4. Edges are stored in Graph IR with:
   - stable ids
   - `edgeKind` (`CONTROL|DATA`)
   - optional `dataType` for DATA edges
   - `from/to` handles (pin ids)
5. Node selection remains stable while connecting.
6. Visual clarity:
   - control edges are visually distinct from data edges (style only; no hardcoded colors required but should differ)
7. Docs updated: `CJ_GRAPH_SPEC.md`, `AI_JSON_GUIDE.md`, `RELEASE_NOTES.md`.

---

## 1) New Concepts Introduced
### 1.1 Pin Multiplicity
Pins can accept:
- `multi: false` (default): IN pins accept at most one incoming edge
- `multi: true`: IN pins accept many incoming edges

Definition source: pin definition in `nodeRegistry.json`.

### 1.2 Data Types
DATA pins may declare `dataType`:
- `boolean`
- `number`
- `string`
- `entityRef`
- `targetSet`
- `tokenMap`
- `any` (wildcard, compatible with anything)
Rules are enforced at connect time.

### 1.3 Edge Kind
Edges are classified as:
- `CONTROL` (exec flow)
- `DATA` (value flow)

---

## 2) Required Changes to Registry (CJ-NODEDEF-1.0)
### 2.1 Pin definitions must include enough info for validation
PinDef additions (static + dynamic):
- `kind: "CONTROL" | "DATA"` (already assumed)
- `direction: "IN" | "OUT"`
- `dataType?: string` (DATA pins only; optional = treated as "any")
- `multi?: boolean` (IN pins only; default false)
- `maxConnections?: number` (optional refinement; overrides multi)
- `optional?: boolean` (optional for validation later; A3 uses it only for messaging)

### 2.2 Node registry cross-check
For each node type in registry:
- every pin id must be unique within the node (including dynamic pins)
- dynamic pins must generate stable ids (A2 already requires)

**A3 Checkpoint REG-1:** Node registry pins include `kind`, `direction`, and for DATA pins at least `dataType` or implied `any`.

---

## 3) Graph IR Updates (CJ-GRAPH-1.0 → CJ-GRAPH-1.1)
> This is an editor-only version bump. It prevents ambiguity later.

### 3.1 Edge shape
Update GraphEdge to include:
- `edgeKind: "CONTROL" | "DATA"`
- `dataType?: string` (only for DATA edges)
- `createdAt?: string` (optional, helpful for debugging)

### 3.2 Graph version
- bump to `graphVersion: "CJ-GRAPH-1.1"` if you persist graph JSON
- if graph isn’t persisted yet, still update types and document the future version

**A3 Checkpoint IR-1:** Edges have edgeKind and dataType tracked consistently.

---

## 4) Core Behavior: Connection Validation Rules
These rules apply in `onConnect` before an edge is created.

### 4.1 Basic structural rules
Reject if:
- source pin missing
- target pin missing
- source pin direction != OUT
- target pin direction != IN
- sourceNodeId == targetNodeId AND connecting would create a self-edge (policy choice; default reject for MVP)

### 4.2 Kind compatibility rules
Reject if:
- source.kind != target.kind

### 4.3 DataType compatibility rules (DATA edges)
Let `S = source.dataType || "any"`
Let `T = target.dataType || "any"`

Compatible if:
- S == "any" OR T == "any"
- OR S == T

Optional (stretch rule):
- allow `"integer"` as subtype of `"number"` if you use integer typing.

Reject otherwise, with message:
> “Type mismatch: cannot connect DATA(number) → DATA(boolean)”

### 4.4 Multiplicity rules (target IN pin)
Determine `maxIn`:
- if `pin.maxConnections` exists use that
- else if `pin.multi === true` then `Infinity`
- else default `1`

If number of existing incoming edges into (targetNodeId, targetPinId) >= maxIn:
- reject and message:
> “Pin already connected (max 1). Set pin.multi=true to allow more.”

### 4.5 CONTROL edge rules (execution graph)
A3 should enforce a minimal rule:
- Exec OUT pins may connect to many exec IN pins (fan-out allowed)
- Exec IN pins usually accept one incoming edge (default), unless registry says otherwise
This makes flow graphs predictable for compilation later.

### 4.6 Cycle prevention (MVP policy)
For CONTROL edges:
- prevent creating cycles (recommended in A3 to reduce future compiler complexity)
- Implementation:
  - if adding edge creates a reachable path from target back to source → reject

For DATA edges:
- cycles are usually okay in some systems but confusing; for MVP, also reject cycles if easy.

**Policy:** Reject cycles for CONTROL edges in A3; DATA cycles optional.

**A3 Checkpoint RULES-1:** Invalid wiring is blocked with specific messages.

---

## 5) Implementation Tasks (Files to Create/Modify)

### 5.1 Create: `src/lib/graphIR/edgeRules.ts`
Exports:
- `validateConnect(params): { ok: true, edge: GraphEdge } | { ok:false, reason: string, code: string }`
Inputs include:
- nodes
- edges
- sourceNodeId, sourcePinId
- targetNodeId, targetPinId
- registry access (materializePins)

### 5.2 Create: `src/lib/graphIR/cycle.ts`
Exports:
- `wouldCreateCycle(nodes, edges, newEdge): boolean`
Only needs to consider CONTROL edges for MVP.

### 5.3 Modify: `src/App.tsx`
- Enable ReactFlow `onConnect`
- Use `validateConnect` to gate edge creation
- Add UI toast/banner for connection errors
- Keep selection stable (no selection reset)
- Store edges in Graph IR (with edgeKind + dataType)

### 5.4 Modify: `src/components/GraphNode.tsx`
- Distinguish handles for CONTROL vs DATA:
  - optional CSS class per pin kind (e.g., `handle--control`, `handle--data`)
- Optional: small inline pin type label or icon in debug mode

### 5.5 (Optional) Add: `src/components/Toast.tsx`
- Minimal toast queue for showing “connection blocked” messages.

---

## 6) UX: Connection Feedback & Debugging
### 6.1 User messages (must be specific)
Messages must include:
- which rule failed
- which pin types were involved
Examples:
- “Cannot connect CONTROL → DATA”
- “Type mismatch: number → boolean”
- “Target pin already has 1 connection (max 1)”
- “Would create a CONTROL cycle (not allowed)”

### 6.2 Edge display
Edges should visually differ:
- CONTROL edges: thicker / solid line
- DATA edges: thinner / dashed line
(Implementation detail; final styling can evolve later.)

### 6.3 Inspector additions
When a node is selected, inspector should show:
- Incoming edges list
- Outgoing edges list
- For each edge: edgeKind, dataType, fromPin, toPin, other node label

This makes debugging graphs far easier.

---

## 7) Cross-checks Against Future Compiler Needs
A3 rules should make A5 compiler simpler:
- CONTROL graph is mostly a DAG (if cycles blocked)
- Each exec IN pin accepts one incoming edge (unless explicitly multi)
- Branching is controlled via explicit OUT pins (IF then/else/elseif)

**A3 Compiler-Readiness Check:**  
You can traverse from EXEC_START execOut along CONTROL edges deterministically.

---

## 8) Tests (Highly Recommended)
### 8.1 Unit tests: edge validation
Add tests for:
- CONTROL → DATA rejects
- DATA(number) → DATA(boolean) rejects
- DATA(any) → DATA(boolean) accepts
- OUT→OUT rejects, IN→IN rejects
- multiplicity rejects when max reached
- unknown pin id rejects
- cycle detection rejects for CONTROL

### 8.2 Integration (manual) test script
Checklist:
1. Add EXEC_START + SHOW_TEXT
2. Connect EXEC_START.execOut → SHOW_TEXT.execIn (accept)
3. Add CONST_BOOL + IF
4. Connect CONST_BOOL.valueOut → IF.ifCondIn (accept)
5. Try connecting EXEC_START.execOut → IF.ifCondIn (reject kind mismatch)
6. Increase IF elseIfCount and connect an elseIfCond pin
7. Reduce elseIfCount and verify edge removal (A2) still works
8. Try to create a cycle in control graph (reject)

---

## 9) Documentation Updates (Mandatory)
Update:
- `CJ_GRAPH_SPEC.md`
  - pin kind/type rules
  - edgeKind semantics
  - multiplicity rules
  - cycle policy
- `AI_JSON_GUIDE.md`
  - how to represent edges and pins in graph JSON
  - how agent should wire graphs correctly
- `RELEASE_NOTES.md`
  - A3 features + what remains (A4 validation engine, A5 compiler)

---

## 10) Phase A3 Checkpoints (Hard Gates)
### A3-1: Connect enabled
- You can draw edges between handles.

### A3-2: Rules enforce correctly
- Invalid connections blocked with clear messages.

### A3-3: Edge metadata stored
- New edges include edgeKind and dataType.

### A3-4: Multiplicity enforced
- IN pin cannot accept more than allowed.

### A3-5: Cycle policy enforced
- CONTROL cycles rejected.

### A3-6: No regressions
- A2 config editor still works; selection stable.
- Dynamic pins and edge reconciliation still work.

---

## 11) Output Required for Review
When agent finishes A3, they must provide:
1. List of modified/created files
2. A table of enforced rules with examples
3. Confirmation of checkpoints A3-1 through A3-6
4. Known limitations (e.g., arrays/complex types not yet supported)

---
