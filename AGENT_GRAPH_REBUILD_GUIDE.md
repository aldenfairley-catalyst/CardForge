# AGENT_GRAPH_REBUILD_GUIDE.md
Captain Jawa Forge — Graph/Node Rebuild (JSON-first) Agent Instructions
Version: 1.0
Goal: Keep the Graph/Node view, but make every node fully configurable, nestable, and compile-able into canonical `ability.execution.steps[]`.

---

## 0) What “done” looks like (acceptance criteria)
1) Node palette is driven by **JSON node registry** (no hardcoded lists in App.tsx).
2) Node pins are **typed** and separated into **CONTROL vs DATA**.
3) Nodes show pins grouped into labeled sections (Panels).
4) IF node supports:
   - setting condition via DATA boolean input
   - defining THEN / multiple ELSEIF / ELSE pathways
   - ELSEIF count changes dynamically (pins update deterministically)
5) Nested flow works (branches contain full sub-chains of nodes).
6) Export/Import supports a **Forge Project JSON** containing:
   - canonical card JSON (CJ-1.x)
   - graph JSON (CJ-GRAPH-1.0)
   - UI metadata (positions, collapsed panels)
7) A compiler produces canonical `execution.steps[]` from the graph.
8) Validation catches:
   - wrong pin connections (data→control etc.)
   - missing required pins
   - unknown node types
   - invalid references (profileId, targetSet.ref, saveAs scope)
9) No more “missing configurability” by design: node forms come from registry configSchema.

---

## 1) Create the JSON-first registries (source of truth)

### 1.1 Add these files
- `src/assets/nodeRegistry.json`          (node definitions, pins, config schemas, categories)
- `src/assets/graphSchema.json`           (JSON schema for graph projects; used by validation and agents)
- `src/assets/compileMap.json` (optional) (maps nodeType → canonical stepType + field mapping hints)

**Rule:** Any new node must be added to nodeRegistry.json OR it can’t appear in the palette.

### 1.2 nodeRegistry.json requirements
Each node must define:
- `nodeType`: stable ID
- `label`, `category`, `description`
- `configSchema`: JSON Schema (subset) with defaults
- `pins.static`: list of pins (id, kind, direction, dataType, group, required, defaultValue)
- `pins.dynamic`: deterministic pin generation definition (e.g. ELSEIF pins)
- `compile`: strategy name (e.g. `CONTROL_STEP`, `DATA_CONDITION`, `DATA_EXPR`, `SUBGRAPH`, `MACRO_CALL`, `SCRIPT`)

Dynamic pins must be deterministic from config:
- Example: IF node has config `{ elseIfCount: 2 }` → generates elseIfCondIn_0, elseIfExecOut_0, elseIfCondIn_1, elseIfExecOut_1.

---

## 2) Add Graph IR types (editor “program” format)

### 2.1 Create types
Create `src/lib/graphIR/types.ts` with:
- `ForgeProject` (CJ-FORGE-PROJECT-1.0)
- `Graph` (CJ-GRAPH-1.0)
- `GraphNode` (nodeType + config + position)
- `GraphEdge` (edgeKind CONTROL|DATA + endpoints)
- `PinEndpoint` (nodeId + pinId)

### 2.2 Graph JSON rules
- CONTROL edges: connect CONTROL OUT → CONTROL IN
- DATA edges: connect DATA OUT → DATA IN
- `EXEC_START` must exist in each graph and have `execOut` connected.
- Nodes must have stable `id` strings.
- Graph supports nested graphs via a `SUBGRAPH` node that references `subgraphId`.

---

## 3) Implement node registry loader + helpers

### 3.1 Loader
Create `src/lib/nodes/registry.ts` that:
- imports `nodeRegistry.json`
- exposes:
  - `getNodeDef(nodeType)`
  - `listNodesByCategory()`
  - `materializePins(nodeType, config)` → static + dynamic pins

### 3.2 Pin typing
Define TS enums:
- PinKind = CONTROL | DATA
- DataType = number|string|boolean|entityRef|targetSet|position|tokenMap|damageType|statusKey|tokenKey|zoneKey|distanceMetric|json

Add helper:
- `arePinsCompatible(outPin, inPin)` (kind must match, dataType must match unless inPin accepts “json” or a declared union)

---

## 4) Implement Graph validation (before compile)

Create `src/lib/graphIR/validateGraph.ts`:
Validation checks:
1) Unknown nodeType → ERROR
2) Missing required pins (unconnected + no defaultValue) → ERROR
3) Pin kind mismatch (CONTROL->DATA etc.) → ERROR
4) Data type mismatch (number->boolean etc.) → ERROR (or WARN if you allow coercion later)
5) Exec flow:
   - `EXEC_START` must exist
   - must have at least one reachable path
   - cycles are forbidden unless explicitly modeled by LOOP nodes (later)
6) Reference validation (phase 2):
   - `SELECT_TARGETS.profileId` must match ability.targetingProfiles[].id
   - `FOR_EACH_TARGET.targetSet.ref` must reference a prior `saveAs`
   - `ITERATION_TARGET` only in FOR_EACH_TARGET scope (canonical validation already exists; mirror it at graph level later)

Return issues in your existing `ValidationIssue` shape.

---

## 5) Implement Graph → Canonical Steps compiler

### 5.1 Create compiler entrypoint
Create `src/lib/graphIR/compiler.ts`:
- `compileAbilityGraph({ graph, ability, card }) → { steps: Step[], issues: ValidationIssue[] }`

### 5.2 Compilation strategy (MVP)
- Follow CONTROL edges starting at EXEC_START.execOut
- Each node compiles into:
  - a canonical step (for control-step nodes)
  - or contributes data/condition/expression into another node via DATA pins

### 5.3 MVP node compilation set
Implement compile support for these nodeTypes first:
- EXEC_START (no step, just entry)
- SHOW_TEXT → `{ type:"SHOW_TEXT", text }`
- IF → `{ type:"IF_ELSE", condition, then, elseIf, else }`
- CONST_BOOL → compiles to Condition AST `{ type:"CONST_BOOL", value:true }` (or maps to existing ConditionEditor AST)
- (Optional) COMPARE_NUMBER → compiles to Condition AST `{ type:"COMPARE", op, leftExpr, rightExpr }`
- CONST_NUMBER → Expression AST `{ type:"CONST_NUMBER", value }`

Important: keep Condition/Expression ASTs aligned with your existing `ConditionEditor`/`ExpressionEditor` structures.

### 5.4 Branch compilation for IF node
- IF has DATA pin `ifCondIn` for base condition
- THEN branch begins at CONTROL pin `thenExecOut`
- ELSE branch begins at `elseExecOut`
- ELSEIF branches begin at `elseIfExecOut_i` each paired with `elseIfCondIn_i`
- Compile each branch path into a `steps[]` array until the branch chain ends.

---

## 6) Update the UI: ReactFlow nodes driven by registry

### 6.1 Replace hardcoded node renderers
Update App/Canvas to use a generic Node component:
- Node header: label + category badge
- Sections (Panels): group pins by `group` field
- Each pin becomes a ReactFlow `Handle`:
  - CONTROL handles: one color/style, larger
  - DATA handles: color derived from dataType
- Node config editor:
  - auto-render based on node.configSchema (simple form generator)

### 6.2 Edge creation rules
In ReactFlow `onConnect`:
- look up pin defs for source+target
- deny invalid kind/type connections (show toast)
- store edgeKind (CONTROL/DATA)

### 6.3 Dynamic pin updates
When node config changes:
- re-run `materializePins()`
- reconcile edges:
  - if pin removed, remove edges connected to it
  - if pin ids shift, keep stable ids (do NOT renumber existing pins; use deterministic ids)

---

## 7) Storage format: Forge Project JSON

### 7.1 Add export/import
- Export:
  - `CJ-FORGE-PROJECT-1.0` containing `card` + `graphs` + `ui`
- Import:
  - if project JSON → load graph + card
  - if plain card JSON → generate a simple linear graph (decompiler MVP)

### 7.2 Canonical steps remain authoritative at runtime
After compilation:
- set `ability.execution.steps = compiledSteps`
- keep graph in project (not necessarily inside card JSON)

---

## 8) Local-first persistence preparation
(You can implement after the graph MVP works, but design for it now.)
- Graph projects, cards, decks, scenarios are stored in SQLite via a local server.
- Images stored on disk as assets and referenced by URL/path.
- The editor should store:
  - the Forge project JSON blob in DB
  - plus extracted searchable fields (name/type/faction)

---

## 9) Minimal file list the agent should create/change

### New files (MVP)
- `src/assets/nodeRegistry.json`
- `src/assets/graphSchema.json`
- `src/lib/graphIR/types.ts`
- `src/lib/graphIR/validateGraph.ts`
- `src/lib/graphIR/compiler.ts`
- `src/lib/nodes/registry.ts`
- `src/components/NodeConfigForm.tsx` (schema-driven config editor)
- `src/components/GraphNode.tsx` (generic node renderer)

### Files to modify (MVP)
- `src/App.tsx`
  - swap old hardcoded nodes for generic node type
  - export/import project JSON
  - compile graph into ability.steps on change (debounced)
- `src/lib/schemas.ts`
  - add CJ-1.2+ allowed schema versions if needed
  - keep canonical validation
- `src/assets/blockRegistry.json`
  - may remain for canonical step palette, OR eventually replaced by nodeRegistry.json

---

## 10) Implementation sequence (do in this order)
1) Add nodeRegistry.json with EXEC_START, SHOW_TEXT, IF, CONST_BOOL, CONST_NUMBER
2) Implement registry loader + pin materialization
3) Implement generic node renderer that displays grouped pins
4) Implement graph validation (pins, kinds, required)
5) Implement compiler for SHOW_TEXT + IF with nested branches
6) Add project export/import and wire compilation into App state
7) Add decompiler fallback (optional)
8) Expand node set to cover targeting + damage loop patterns

---

## 11) Common pitfalls to avoid
- Don’t store dynamic pins without stable IDs (will break edges on config change).
- Don’t hardcode editor controls for each node; use configSchema-driven forms.
- Don’t let graph become the runtime truth without a compiler; keep canonical steps stable.
- Don’t allow CONTROL edges to connect to DATA pins (enforce strictly).
- Don’t rely on localStorage for large projects (local server later).

---


// src/assets/nodeRegistry.json (MVP starter)
{
  "nodeRegistryVersion": "CJ-NODEDEF-1.0",
  "dataTypes": [
    "number","string","boolean",
    "tokenMap","entityRef","targetSet","position",
    "damageType","statusKey","tokenKey","zoneKey","distanceMetric",
    "json"
  ],
  "nodes": [
    {
      "nodeType": "EXEC_START",
      "label": "Start",
      "category": "Control",
      "description": "Entry point for an ability graph.",
      "configSchema": { "type": "object", "properties": {} },
      "pins": {
        "static": [
          { "id": "execOut", "kind": "CONTROL", "direction": "OUT", "label": "Exec", "group": "Flow" }
        ]
      },
      "compile": { "kind": "SUBGRAPH_ENTRY" }
    },
    {
      "nodeType": "SHOW_TEXT",
      "label": "Show Text",
      "category": "Core",
      "description": "Display text in the game log.",
      "configSchema": {
        "type": "object",
        "properties": { "text": { "type": "string", "default": "..." } },
        "required": ["text"]
      },
      "pins": {
        "static": [
          { "id": "execIn",  "kind": "CONTROL", "direction": "IN",  "label": "In",  "group": "Flow", "required": true },
          { "id": "execOut", "kind": "CONTROL", "direction": "OUT", "label": "Out", "group": "Flow" }
        ]
      },
      "compile": { "kind": "CANONICAL_STEP", "stepType": "SHOW_TEXT" }
    },
    {
      "nodeType": "CONST_BOOL",
      "label": "Boolean",
      "category": "Data",
      "description": "Boolean constant.",
      "configSchema": {
        "type": "object",
        "properties": { "value": { "type": "boolean", "default": true } },
        "required": ["value"]
      },
      "pins": {
        "static": [
          { "id": "out", "kind": "DATA", "dataType": "boolean", "direction": "OUT", "label": "Bool", "group": "Value" }
        ]
      },
      "compile": { "kind": "CONDITION_EXPR", "exprType": "CONST_BOOL" }
    },
    {
      "nodeType": "CONST_NUMBER",
      "label": "Number",
      "category": "Data",
      "description": "Number constant.",
      "configSchema": {
        "type": "object",
        "properties": { "value": { "type": "number", "default": 1 } },
        "required": ["value"]
      },
      "pins": {
        "static": [
          { "id": "out", "kind": "DATA", "dataType": "number", "direction": "OUT", "label": "Num", "group": "Value" }
        ]
      },
      "compile": { "kind": "VALUE_EXPR", "exprType": "CONST_NUMBER" }
    },
    {
      "nodeType": "IF",
      "label": "If / ElseIf / Else",
      "category": "Control",
      "description": "Branch execution based on a condition.",
      "configSchema": {
        "type": "object",
        "properties": { "elseIfCount": { "type": "integer", "minimum": 0, "maximum": 6, "default": 0 } },
        "required": ["elseIfCount"]
      },
      "pins": {
        "static": [
          { "id": "execIn",      "kind": "CONTROL", "direction": "IN",  "label": "In",   "group": "Flow", "required": true },
          { "id": "thenExecOut", "kind": "CONTROL", "direction": "OUT", "label": "Then", "group": "Branches" },
          { "id": "elseExecOut", "kind": "CONTROL", "direction": "OUT", "label": "Else", "group": "Branches" },

          { "id": "ifCondIn", "kind": "DATA", "dataType": "boolean", "direction": "IN", "label": "If", "group": "Conditions", "required": true }
        ],
        "dynamic": {
          "kind": "ELSEIF_PINS",
          "sourceField": "elseIfCount",
          "pinsPerIndex": [
            { "idTemplate": "elseIfCondIn_{i}",  "kind": "DATA", "dataType": "boolean", "direction": "IN",  "labelTemplate": "ElseIf {n}", "group": "Conditions", "required": true },
            { "idTemplate": "elseIfExecOut_{i}", "kind": "CONTROL", "direction": "OUT", "labelTemplate": "ElseIf {n}", "group": "Branches" }
          ]
        }
      },
      "compile": { "kind": "CANONICAL_STEP", "stepType": "IF_ELSE" }
    }
  ]
}

// src/assets/graphSchema.json (simplified JSON schema for CJ-FORGE-PROJECT-1.0)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CJ Forge Project",
  "type": "object",
  "required": ["schemaVersion", "card", "graphs"],
  "properties": {
    "schemaVersion": { "type": "string", "const": "CJ-FORGE-PROJECT-1.0" },
    "card": { "type": "object" },
    "graphs": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["graphVersion", "id", "nodes", "edges"],
        "properties": {
          "graphVersion": { "type": "string", "const": "CJ-GRAPH-1.0" },
          "id": { "type": "string" },
          "label": { "type": "string" },
          "nodes": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "nodeType", "position", "config"],
              "properties": {
                "id": { "type": "string" },
                "nodeType": { "type": "string" },
                "position": {
                  "type": "object",
                  "required": ["x", "y"],
                  "properties": { "x": { "type": "number" }, "y": { "type": "number" } }
                },
                "config": { "type": "object" }
              }
            }
          },
          "edges": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "edgeKind", "from", "to"],
              "properties": {
                "id": { "type": "string" },
                "edgeKind": { "type": "string", "enum": ["CONTROL", "DATA"] },
                "from": {
                  "type": "object",
                  "required": ["nodeId", "pinId"],
                  "properties": { "nodeId": { "type": "string" }, "pinId": { "type": "string" } }
                },
                "to": {
                  "type": "object",
                  "required": ["nodeId", "pinId"],
                  "properties": { "nodeId": { "type": "string" }, "pinId": { "type": "string" } }
                }
              }
            }
          }
        }
      }
    },
    "ui": { "type": "object" }
  }
}



