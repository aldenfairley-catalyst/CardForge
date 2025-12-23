# AI_JSON_GUIDE.md
Version: CJ Docs 1.2 (AI-first, comprehensive) • Updated: 2025-12-20

This is the **comprehensive** guide for AI agents to generate **valid, importable** JSON across:
- Cards (CJ-1.2; imports migrate CJ-1.0/1.1 → CJ-1.2 automatically)
- Decks (CJ-DECK-1.0)
- Scenarios (CJ-SCENARIO-1.0)
- Action Library repository (CJ-ACTION-LIB-1.0)

---

# 1) Catalog-first (do not hardcode)
Forge should not hardcode:
- factions
- unit types/subtypes
- attributes
- tags/keywords

Instead, these are stored in a **Catalog schema** (CJ-CATALOG-1.0) that Deck Builder and Scenario Builder can validate against.

**If Catalog is missing** (early prototypes), you may still place strings, but:
- choose consistent casing
- treat them as ids (no spaces)
- document them in the catalog later

---

# 2) Card JSON (CJ-1.2)

## 2.1 Top-level structure
```json
{
  "schemaVersion":"CJ-1.2",
  "id":"storm_sprite",
  "name":"Storm Sprite",
  "type":"UNIT",
  "faction":"EMERALD_TIDE",
  "subType":["ELEMENTAL","SPRITE"],
  "attributes":["ELECTRIC","STORM"],
  "tags":["STORM_SPRITE","MAGICAL"],
  "visuals":{"cardImage":"/cards/storm_sprite.png","imageFit":"COVER","imageAlign":"CENTER"},
  "tokenValue":{"UMB":0,"AET":0,"CRD":0,"CHR":0,"STR":0,"RES":0,"WIS":0,"INT":0,"SPD":0,"AWR":0},
  "stats":{"hp":{"current":40,"max":40},"ap":{"current":3,"max":3},"movement":2,"size":2},
  "stateSchema":{"caught":{"type":"boolean","default":false}},
  "components":[ /* ABILITY components */ ]
}
```

### Required fields
- `schemaVersion`, `id`, `name`, `type`, `components[]`

### Strong recommendations
- Use `visuals.cardImage` as a **path** not a DataURL.
- Put text rules into abilities so they can be simulated.

---

## 2.2 AbilityComponent
```json
{
  "componentType":"ABILITY",
  "name":"Static Lash",
  "description":"Deal 10 electric damage; target saves or is stunned.",
  "trigger":"ACTIVE_ACTION",
  "cost":{"ap":2,"tokens":{"AET":0}},
  "requirements":{"type":"ALWAYS"},
  "targetingProfiles":[{ /* see below */ }],
  "execution":{"steps":[ /* see AI_ACTION_STEPS.md */ ]}
}
```

### Trigger (gameplay integration)
Triggers allow the same schema to support:
- active actions
- passives (auras, immunities)
- damage pipeline hooks
- scenario-level listeners

Recommended trigger set:
- ACTIVE_ACTION
- PASSIVE_AURA
- START_OF_TURN / END_OF_TURN
- BEFORE_DAMAGE_APPLIED / ON_DAMAGE_TAKEN
- ON_MOVE / ON_ATTACK_DECLARED

---

## 2.3 Targeting profiles (primary, secondary, global)
A profile defines UI selection rules *and* digital validation rules.

```json
{
  "id":"primary",
  "label":"Primary target",
  "type":"SINGLE_TARGET",
  "origin":"SOURCE",
  "range":{"min":2,"max":6,"base":6},
  "lineOfSight":true,
  "los":{"mode":"HEX_RAYCAST","required":true,"blockers":[{"policy":"BLOCK_ALL","tags":["BARRIER"]}]},
  "area":{"shape":"NONE"}
}
```

### Origin
- SOURCE (unit casting)
- ANYWHERE (global; grid selection may hide source range display)
- MARKER (from a stored marker)
- SELF (always self)

### Area
Area may be used to preview AoE:
- NONE
- RADIUS (hex radius)
- CONE
- LINE
- RECT

---

## 2.4 Execution patterns

### Pattern A: “single target + save for status”
```json
[
  {"type":"SELECT_TARGETS","profileId":"primary","saveAs":"t"},
  {"type":"FOR_EACH_TARGET","targetSet":{"ref":"t"},"do":[
    {"type":"DEAL_DAMAGE","target":{"type":"ITERATION_TARGET"},"amountExpr":{"type":"CONST_NUMBER","value":10},"damageType":"ELECTRIC"},
    {"type":"OPPONENT_SAVE","target":{"type":"ITERATION_TARGET"},"stat":"RESILIENCE","difficulty":12,
      "onFail":[{"type":"APPLY_STATUS","target":{"type":"ITERATION_TARGET"},"status":"STUNNED","duration":{"turns":1}}],
      "onSuccess":[]
    }
  ]}
]
```

### Pattern B: “primary + splash adjacency”
Use FIND_ENTITIES (selector: adjacent to primary) then another FOR_EACH_TARGET.

### Pattern C: “delayed AoE” (Storm Call) — planned
Needs a scheduler step (not in `blockRegistry` yet). For now, model as two separate abilities or mark as `CUSTOM`.

### Pattern D: “minigame / complex loop” (Storm Convergence) — planned
Would require a subsystem runner step (not in runtime); keep as `CUSTOM` text or drive via `OPEN_UI_FLOW`.

## 2.5 Graph + node config payloads (Forge project JSON)
- Forge projects store the authored graph under `graphs[graphId]` with nodes shaped as `{ id, nodeType, position, config, pinsCache? }`.
- Edges are `{ id, edgeKind: "CONTROL" | "DATA", dataType?, createdAt?, from { nodeId, pinId }, to { nodeId, pinId } }` with `edgeKind` and `dataType` mirrored in React Flow edge labels for debugging. New exports default to `graphVersion = "CJ-GRAPH-1.1"` but load `"CJ-GRAPH-1.0"` with a warning.
- Node config objects must follow the `configSchema` from `src/assets/nodeRegistry.json`; the editor auto-generates the inspector UI from this schema (supports string/number/integer/boolean/enum with min/max, titles, descriptions, defaults, and required warnings). Nested objects/arrays/oneOf are not yet rendered as fields in A2; keep configs flat or use the Node JSON debug tab to inspect raw data.
- Dynamic pins (e.g., IF `elseIfCount`) are recomputed from `config` and cached in `pinsCache` to reconcile edges on load/import. Keep config values explicit (do not drop keys) so agents and the inspector agree on pin shape.
- Inspector tabs: Config (schema-driven), Pins (debug list of `materializePins(nodeType, config)`), and Node JSON (debug read-only) provide quick validation of dynamic pin outputs and cached handles.
- Edges reference pins by id (`from.pinId` / `to.pinId`); if a config change removes a pin, the editor automatically drops edges pointing at the missing handles via pin-id reconciliation.

---

# 3) Deck JSON (CJ-DECK-1.0)
Decks group card ids by faction and support loadouts.

```json
{
  "schemaVersion":"CJ-DECK-1.0",
  "id":"emerald_tide_fisherman_core",
  "name":"Fisherman Core",
  "faction":"EMERALD_TIDE",
  "description":"Low-cost control tools for water maps.",
  "tags":["starter","water"],
  "notes":"Swap to v2 once tidecaller card ships.",
  "cards":[
    {"cardId":"the_fisherman","qty":1},
    {"cardId":"storm_cloud","qty":6},
    {"cardId":"pyramid_crystal","qty":1}
  ]
}
```

Recommended deck invariants:
- Unit unique cards count=1
- Respect faction filters (optional)

---

# 4) Scenario JSON (CJ-SCENARIO-1.0)
Scenarios define initial board state plus a trigger/action director. The runtime schema matches `src/lib/scenarioTypes.ts`.

```json
{
  "schemaVersion":"CJ-SCENARIO-1.0",
  "id":"storm_at_sea",
  "name":"Storm at Sea",
  "description":"Hold the raiders at bay while the tide rises.",
  "players":2,
  "mode":"ASSISTED_PHYSICAL",
  "setup":{
    "sides":[
      {
        "sideId":"A",
        "name":"Emerald Tide",
        "faction":"EMERALD_TIDE",
        "deckId":"emerald_tide_fisherman_core",
        "startingUnits":[{"cardId":"the_fisherman","pos":{"q":0,"r":0},"facing":0}]
      },
      {
        "sideId":"B",
        "name":"Raiders",
        "deckId":"raider_core",
        "startingUnits":[{"cardId":"raider_captain","pos":{"q":8,"r":0}}]
      }
    ],
    "env":{"waterLevel":0}
  },
  "victory":[{"type":"ELIMINATE_SIDE","sideId":"B"}],
  "story":[{"id":"intro_slide","type":"SLIDESHOW","src":"slides/intro.json","trigger":"ON_SCENARIO_START"}],
  "triggers":[
    {
      "id":"intro",
      "name":"Play intro slide",
      "enabled":true,
      "when":{"type":"ON_SCENARIO_START"},
      "actions":[{"type":"SHOW_STORY","beatId":"intro_slide"}]
    }
  ]
}
```

### Required + common fields
- `schemaVersion`, `id`, `name`, `players`, `mode`, `setup.sides[]`, `setup.env`, `victory[]`, `story[]`, `triggers[]`.
- `setup.sides[].startingUnits[]` uses axial hex positions `{q,r}` and optional `facing` (0-5).
- Victory conditions: `ELIMINATE_SIDE`, `SURVIVE_ROUNDS`, `CONTROL_OBJECTIVES`, `CUSTOM`.
- Trigger timings (`when.type`): `ON_SCENARIO_START`, `ON_ROUND_START`, `ON_TURN_START`, `ON_UNIT_DEATH`, `ON_ENV_VAR_CHANGED`, `ON_CUSTOM_EVENT`.
- Trigger actions (see `ScenarioAction`): `SHOW_STORY`, `SET_ENV_VAR`, `INCREMENT_ENV_VAR`, `EMPTY_HAND`, `SWITCH_DECK`, `ADD_CARDS_TO_DECK`, `REMOVE_CARDS_FROM_DECK`, `SPAWN_UNIT`, `REMOVE_UNIT`, `CUSTOM`.

### Doc validation checklist
- Top-level `setup.sides`/`setup.env` exist (no legacy `sides`/`environment` keys).
- Every trigger has `id`, `name`, `enabled`, `when`, and `actions[]` matching the action list above.
- Story beats reference ids that triggers call via `SHOW_STORY`.

---

# 5) Import/export rules (future-proof)
- Prefer `.passthrough()` schemas at top-level with strict invariants for critical links.
- Include `schemaVersion` always.
- Provide migrations in `/src/lib/migrations.ts`.

---

# 6) Forge Project (graph editor) vs Canonical Card JSON
Forge now stores a **CJ-FORGE-PROJECT-1.0** that includes:
- `card` (canonical CJ-1.x card JSON — runtime truth)
- `graphs` (CJ-GRAPH-1.0 baseline with CJ-GRAPH-1.1 support) with nodes/edges/layout
- `ui` (active graph id + layout prefs)

Compile-on-change keeps `card.ability.execution.steps[]` in sync:
- Graph validation blocks pin kind/type mismatches and missing required inputs.
- Connections must be OUT → IN and CONTROL → CONTROL or DATA → DATA; mismatches surface specific toast errors naming the attempted pair.
- DATA pins require compatible `dataType` (boolean→boolean, number→number, `"any"` wildcard when a pin omits `dataType`). Mismatched pairs are rejected with a “Type mismatch” toast.
- Target IN pin multiplicity defaults to 1; `multi:true` or `maxConnections` increases the fan-in cap. CONTROL OUT pins can fan out freely; CONTROL cycles are rejected at connect-time for DAG-style execution graphs.
- `SHOW_TEXT`, `IF_ELSE`, `CONST_BOOL`, `CONST_NUMBER`, `EXEC_START` round-trip between graph and canonical steps.

Node definitions live in `src/assets/nodeRegistry.json` (JSON-first source of truth). Add new nodes there, then extend compiler/validation accordingly.

### 6.1 Node registry (CJ-NODEDEF-1.0)
- Authoritative palette + rendering source: `nodeType`, `label`, `category`, `description`.
- `configSchema` drives defaults; `pins.static[]` list control/data pins and their groups; `pins.dynamic` (Phase A1: ELSEIF generator) expands deterministic ids using `{i}` and labels using `{n}`.
- Includes placeholder `compile` metadata even when unused so compiler phases can align later.
- Default configs are derived from schema defaults (e.g., IF → `{ elseIfCount: 0 }`).
- Field summary for agents:
  - `nodeType`: stable id (palette key + ReactFlow renderer key)
  - `label` / `category`: palette display, categories sorted alphabetically in the UI
  - `configSchema`: JSON-schema-like object with `properties`, `required`, and defaults
  - `pins.static[]`: ordered pins with `id`, `kind` (CONTROL/DATA), `direction`, `group`, `dataType?`, `required?`
  - `pins.dynamic`: deterministic generator descriptor (A1 supports only `ELSEIF_PINS` from `elseIfCount`)
  - `compile`: stub metadata for later compiler phases

### 6.2 Graph IR is editor-only in Phase A1
- CJ-GRAPH-1.0 (A1) and CJ-GRAPH-1.1 (typed edge metadata) store `{ nodes, edges }` with `edgeKind: CONTROL | DATA`, `dataType?` (for DATA edges), and `createdAt?` metadata so the editor can style/control connections reliably.
- Canonical runtime truth remains the CJ card JSON; compilation will consume the graph in later phases. Graph IR currently lives in React state and is exported/imported with Forge Project JSON, but a browser refresh resets the canvas unless the project is reloaded.
- React Flow adapters (`src/lib/graphIR/adapters.ts`) convert between Graph IR and canvas nodes/edges so the UI stays registry-driven without duplicating mapping code.

### 6.3 Node config + pins cache (Phase A2)
- Each graph node persists `config` exactly as entered in the schema-driven inspector (types align with `configSchema` in `nodeRegistry.json`).
- Nodes may include `pinsCache: string[]` (ids) to capture the pin set produced by the last `materializePins` call; this is used to reconcile edges after config changes remove pins.
- Dynamic pin rules (e.g., IF `elseIfCount`) are applied immediately on config edits; edges targeting removed handles are pruned on save/update so exported graphs never contain dangling pin references.
