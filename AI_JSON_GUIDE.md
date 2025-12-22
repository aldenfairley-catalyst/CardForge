# AI_JSON_GUIDE.md
Version: CJ Docs 1.2 (AI-first, comprehensive) • Updated: 2025-12-20

This is the **comprehensive** guide for AI agents to generate **valid, importable** JSON across:
- Cards (CJ-1.2)
- Decks (CJ-DECK-1.0)
- Scenarios (CJ-SCENARIO-1.0)
- Action Library repository (CJ-LIB-1.0)

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
Use FIND_ADJACENT_ENTITIES then another FOR_EACH_TARGET.

### Pattern C: “delayed AoE” (Storm Call)
Use SCHEDULE_STEPS with stored marker + scatter.

### Pattern D: “minigame / complex loop” (Storm Convergence)
Use SUBSYSTEM_RUN with a dedicated resolver.

## 2.5 Graph + node config payloads (Forge project JSON)
- Forge projects store the authored graph under `graphs[graphId]` with nodes shaped as `{ id, nodeType, position, config, pinsCache? }`.
- Edges are `{ id, edgeKind: "CONTROL" | "DATA", dataType?, createdAt?, from { nodeId, pinId }, to { nodeId, pinId } }` with `edgeKind` and `dataType` mirrored in React Flow edge labels for debugging. New exports default to `graphVersion = "CJ-GRAPH-1.1"` but load `"CJ-GRAPH-1.0"` with a warning.
- Node config objects must follow the `configSchema` from `src/assets/nodeRegistry.json`; the editor auto-generates the inspector UI from this schema (supports string/number/integer/boolean/enum with min/max).
- Dynamic pins (e.g., IF `elseIfCount`) are recomputed from `config` and cached in `pinsCache` to reconcile edges on load/import. Keep config values explicit (do not drop keys) so agents and the inspector agree on pin shape.
- Edges reference pins by id (`from.pinId` / `to.pinId`); if a config change removes a pin, the editor automatically drops edges pointing at the missing handles.

---

# 3) Deck JSON (CJ-DECK-1.0)
Decks group card ids by faction and support loadouts.

```json
{
  "schemaVersion":"CJ-DECK-1.0",
  "id":"emerald_tide_fisherman_core",
  "name":"Fisherman Core",
  "faction":"EMERALD_TIDE",
  "cards":[
    {"cardId":"the_fisherman","count":1},
    {"cardId":"storm_cloud","count":6},
    {"cardId":"pyramid_crystal","count":1}
  ],
  "sideboard":[]
}
```

Recommended deck invariants:
- Unit unique cards count=1
- Respect faction filters (optional)

---

# 4) Scenario JSON (CJ-SCENARIO-1.0)
Scenarios define setup and a director-style trigger system.

```json
{
  "schemaVersion":"CJ-SCENARIO-1.0",
  "id":"storm_at_sea",
  "name":"Storm at Sea",
  "players":2,
  "sides":[
    {"sideId":"A","name":"Emerald Tide","deckId":"emerald_tide_fisherman_core","startUnits":[{"cardId":"the_fisherman","pos":{"q":0,"r":0}}]},
    {"sideId":"B","name":"Raiders","deckId":"raider_core","startUnits":[{"cardId":"raider_captain","pos":{"q":8,"r":0}}]}
  ],
  "environment":{"global":{"waterLevel":0}},
  "victory":[{"type":"DEFEAT_ALL_UNITS","sideId":"B"}],
  "triggers":[
    {
      "id":"intro",
      "when":{"event":"ON_SCENARIO_START"},
      "do":[{"type":"OPEN_UI_FLOW","flowId":"STORY_SLIDE","payload":{"slideDeckId":"storm_intro"}}]
    }
  ]
}
```

Trigger payload actions reuse **the same Step system** so scenarios can:
- swap decks
- add/remove cards from zones
- spawn/despawn units
- change environment vars
- trigger story slides/video

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
