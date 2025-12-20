# Captain Jawa Digital — AI JSON Guide (Forge / Library / Decks / Scenarios)
Version: CJ Docs 1.0 (AI-first)

This document is designed for AI agents that generate **importable JSON** for the Captain Jawa ecosystem without breaking rules or introducing schema-invalid fields.

---

## 0) Mental Model (how everything fits)
There are 4 layers of “data” and they must stay consistent:

1) **Card Definitions** (static design-time):  
   - `CardEntity` JSON: what a card *is* (stats, abilities, tags, printed token values, state schema).
   - Created in Forge and stored in a Library.

2) **Deck Definitions** (collection rules):  
   - Deck JSON: list of card IDs + quantities + metadata.

3) **Scenario Definitions** (director layer):  
   - Scenario JSON: setup (starting units), triggers (events), victory conditions, story beats, deck assignment & deck switching actions.

4) **Runtime Game State** (session / match):  
   - Not stored in card JSON. The server stores instantiated entities (unit instances, equipped items, zones, variables, environment).

Cards/Decks/Scenarios are all **references by ID** into each other.

---

## 1) JSON Bundles and Import/Export Formats

### 1.1 Card JSON (CJ Card)
Used for: card import/export and library storage.

Minimum shape:
```json
{
  "schemaVersion": "CJ-1.0",
  "id": "cj.unit.example",
  "name": "Example Unit",
  "type": "UNIT",
  "subType": [],
  "visuals": { "cardImage": "/cards/example.png" },
  "stats": {
    "hp": { "current": 10, "max": 10 },
    "ap": { "current": 2, "max": 2 },
    "movement": 4,
    "resilience": 0,
    "size": 1
  },
  "resources": {},
  "tags": [],
  "components": []
}
```

> AI rule: If unsure, keep fields minimal and valid; do **not** invent new top-level keys that the validator rejects.

---

### 1.2 Forge Project JSON (FORGE project)
Used for: saving UI layout state (node positions, selected ability, editor metadata).

Shape:
```json
{
  "projectVersion": "FORGE-1.0",
  "card": { "...CJ card JSON..." },
  "ui": {
    "activeAbilityIdx": 3,
    "nodes": [
      { "id": "n1", "x": 123, "y": 456, "kind": "STEP" }
    ]
  }
}
```

Import rules:
- If `projectVersion === "FORGE-1.0"`, Forge should import `card` as the canonical CardEntity.
- Unknown step types must become `UNKNOWN_STEP` (see 7.4).

---

### 1.3 Library Bundle JSON (Local Catalog)
Used for: “Card Library Manager” import/export.

Two acceptable formats:
```json
{ "schemaVersion": "CJ-LIB-1.0", "cards": [ { "...card..." } ] }
```
or just:
```json
[ { "...card..." }, { "...card..." } ]
```

---

### 1.4 Deck JSON
Used for: deck editor import/export and scenario deck assignment.

See `AI_DECKS` section below for full spec.

---

### 1.5 Scenario JSON
Used for: Scenario Builder import/export.

See `AI_SCENARIOS` section below.

---

## 2) CardEntity: Full Conceptual Schema (AI-oriented)

### 2.1 Identity and Classification
| Field | Type | Meaning / Notes |
|---|---|---|
| `schemaVersion` | `"CJ-1.0"` | Version of the card schema |
| `id` | string | Stable ID used by decks/scenarios. Must be unique |
| `name` | string | Display name |
| `type` | `"UNIT" \| "ITEM" \| "ENVIRONMENT" \| "SPELL" \| "TOKEN"` | Card’s major category |
| `subType` | string[] | Unit/item types (e.g., HUMAN, BEAST, UNDEAD, JAWA, SPECTRAL) |
| `faction?` | string | Optional faction alignment |
| `attributes?` | string[] | Elemental/material affinities (e.g., FIRE, WATER, STEEL, WOOD) |
| `tags` | string[] | Rules tags (BIOLOGICAL, FLAMMABLE, ARMORED, SPECTRAL, etc.) |

**AI safety rules**
- `id` must be stable and consistent across cards and decks.
- `subType`, `attributes`, `tags` are NOT interchangeable:
  - `subType`: classification (what it is)
  - `attributes`: elemental/material (what it’s aligned with)
  - `tags`: mechanical flags (how rules treat it)

---

### 2.2 Visuals and Presentation
| Field | Type | Notes |
|---|---|---|
| `visuals.cardImage` | string | Prefer `/public/cards/...` path; avoid Data URLs in long term |
| `visuals.tokenImage?` | string | Optional top-down token |
| `visuals.model3d?` | string | Optional 3D model |
| `presentation?` | object | Optional UI template controls (preview styling) |

**Recommendation for AI:** always set `visuals.cardImage` to a path, not a base64 Data URL.

---

### 2.3 Stats (Units and Destructible Entities)
Stats are for entities that exist on the board.

| Field | Type | Applies | Meaning |
|---|---|---|---|
| `stats.hp.current/max` | number | UNIT/ENV/TOKEN | Current and max HP |
| `stats.ap.current/max` | number | UNIT | Action points per round |
| `stats.movement` | number | UNIT | Tiles (or hexes) per move action |
| `stats.resilience` | number | UNIT/ENV | Defensive trait used by some saves |
| `stats.size` | number | UNIT | Size footprint (1 = 1 tile/hex) |

**AI rule:** Items and spells generally should not have full unit stats unless they become board entities.

---

### 2.4 Printed Token Value vs Spendable Costs (IMPORTANT)
There are two different “token concepts”:

1) **Printed token value** on a card used by minigames/contests:
- Example: “Token Count” in Property Contest.
- Should be stored as something like `tokenValue` (recommended future field).

2) **Token costs** used to activate abilities:
- Stored under `ABILITY.cost.tokens`.

**If your current schema uses `resources` only**, keep that for now, but do not mix:
- `resources` printed value ≠ cost
- costs belong in ability cost

---

### 2.5 State Schema (custom booleans/values like “loaded”)
To support “musket loaded”, “aiming”, “overheated”, etc. you need:
- a **definition** of state keys on the card (design-time)
- a **runtime state** per entity instance (match-time)

Recommended card field:
```json
"stateSchema": {
  "loaded": { "type": "boolean", "default": false },
  "aiming": { "type": "boolean", "default": false },
  "heat": { "type": "number", "default": 0 }
}
```

And runtime step support (examples):
- `CHECK_STATE` condition
- `SET_STATE` step

If Forge validator rejects `stateSchema` today:
- you must either add it to schema,
- OR store it temporarily under a known extension area (recommended):
```json
"x": { "stateSchema": { "...": "..." } }
```
…but only if your validator allows `x`.

---

## 3) Components (CES approach)
A card is a list of components. “Unit” is not a unique class; it’s a set of components.

### 3.1 AbilityComponent
Abilities are the primary way to define gameplay logic.

Canonical fields:
| Field | Meaning |
|---|---|
| `componentType: "ABILITY"` | discriminant |
| `name`, `description` | text |
| `trigger` | when it activates (ACTIVE_ACTION, PASSIVE_AURA, REACTION, ON_EQUIP, ON_DRAW, ON_PLAY, ON_DEATH, etc.) |
| `cost` | AP + token cost + item requirements + cooldown |
| `targetingProfiles` | reusable targeting definitions |
| `execution.steps` | ordered script |

---

## 4) Targeting: Profiles, Selection, Multi-target logic

### 4.1 Targeting Profiles
A profile defines how you pick targets. Execution steps reference profiles.

Example:
```json
"targetingProfiles": [
  {
    "id": "primary_slash",
    "origin": "SELF",
    "type": "SINGLE_TARGET",
    "range": { "min": 1, "max": 1 },
    "lineOfSight": true,
    "shape": null
  },
  {
    "id": "secondary_adjacent",
    "origin": "PRIMARY_TARGET",
    "type": "MULTI_TARGET",
    "range": { "min": 0, "max": 1 },
    "maxTargets": 2,
    "adjacency": "HEX_ADJACENT",
    "lineOfSight": false
  }
]
```

**Key concepts**
- `origin`: where range is measured from (SELF, ANYWHERE, PRIMARY_TARGET)
- `type`: SINGLE_TARGET, AREA_RADIUS, LINE, CONE, MULTI_TARGET, etc.
- `range`: can have min/max; “range 0” means origin itself
- `LoS` can be true/false; if true it uses LoS policies.

### 4.2 Selecting targets at runtime
Use steps:
- `SELECT_TARGETS` -> saves a target set
- `FOR_EACH_TARGET` -> iterates the set and uses `ITERATION_TARGET`

Example (primary + secondary like claymore slash):
```json
{
  "type": "SELECT_TARGETS",
  "profileId": "primary_slash",
  "saveAs": "primary"
},
{
  "type": "SELECT_TARGETS",
  "profileId": "secondary_adjacent",
  "saveAs": "secondary"
},
{
  "type": "FOR_EACH_TARGET",
  "targetSet": { "ref": "primary" },
  "do": [
    { "type": "DEAL_DAMAGE", "target": { "type": "ITERATION_TARGET" }, "amountExpr": { "type": "CONST_NUMBER", "value": 40 }, "damageType": "PHYSICAL" }
  ]
},
{
  "type": "FOR_EACH_TARGET",
  "targetSet": { "ref": "secondary" },
  "do": [
    { "type": "DEAL_DAMAGE", "target": { "type": "ITERATION_TARGET" }, "amountExpr": { "type": "CONST_NUMBER", "value": 20 }, "damageType": "PHYSICAL" }
  ]
}
```

---

## 5) Expressions and Conditions (AI building blocks)
AI agents must treat expressions/conditions as **typed AST objects**, not strings.

### 5.1 Expressions (`Expr`)
Examples:
- constant number
- variable lookup
- arithmetic
- distance between two entities
- token sums

Examples:
```json
{ "type": "CONST_NUMBER", "value": 10 }
{ "type": "VAR", "name": "d20" }
{ "type": "ADD", "left": { "type": "VAR", "name": "d6" }, "right": { "type": "CONST_NUMBER", "value": 5 } }
{ "type": "DISTANCE", "from": { "type": "SELF" }, "to": { "type": "TARGET_SET", "ref": "primary" }, "metric": "HEX" }
```

### 5.2 Conditions (`Cond`)
Examples:
```json
{ "type": "ALWAYS" }
{ "type": "NOT", "cond": { "type": "ALWAYS" } }
{ "type": "COMPARE", "op": ">=", "left": { "type":"VAR","name":"d20" }, "right": { "type":"CONST_NUMBER","value": 10 } }
{ "type": "STATE_EQUALS", "target": { "type":"SELF" }, "key":"loaded", "value": true }
{ "type": "NO_ENEMY_WITHIN", "origin": { "type":"SELF" }, "range": 4 }
```

---

## 6) Steps: Execution scripts
Execution is an ordered array of step objects.

**AI MUST**
- keep steps deterministic except RNG steps
- avoid referencing undefined `saveAs` vars
- keep nested blocks valid (`IF_ELSE.then` etc.)

Unknown steps must be:
```json
{ "type":"UNKNOWN_STEP", "raw": { "type":"SOMETHING_NEW", "...":"..." } }
```

---

## 7) Subsystems / Minigames (Property Contest)
Some mechanics are “subsystems” that need UI and special resolution logic.

Recommended pattern:
- Step requests subsystem by `subsystemId`
- Subsystem produces structured result saved to variable(s)

Example:
```json
{
  "type": "RUN_SUBSYSTEM",
  "subsystemId": "PROPERTY_CONTEST",
  "input": {
    "mode": "STATUS_GAME",
    "drawCountExpr": { "type":"ROLL_D6_AS_NUMBER" },
    "countPolicy": "TOKEN_VALUE_SUM"
  },
  "saveAs": "contestResult"
}
```

If not implemented, store as UNKNOWN_STEP but preserve raw intent.

---

## AI_DECKS: Deck JSON (CJ-DECK-1.0) — Full Spec

### DeckDefinition
```json
{
  "schemaVersion": "CJ-DECK-1.0",
  "id": "deck.crimson_doom.florence_starter",
  "name": "Florence Starter Deck",
  "faction": "Crimson Doom",
  "tags": ["starter", "tutorial"],
  "notes": "Designed for Scenario 1",
  "cards": [
    { "cardId": "cj.unit.florence", "qty": 1 },
    { "cardId": "cj.item.goldbite", "qty": 1 },
    { "cardId": "cj.item.gold_purse", "qty": 1 }
  ]
}
```

### Invariants (do not break)
- `id` unique across decks
- `cards[].cardId` must exist in Library
- `qty >= 1`
- deck rules/limits are scenario-defined (points, max copies, etc.) and validated later.

### Zones (runtime)
Deck JSON is only the card list. Runtime zones:
- DRAW_PILE
- HAND
- DISCARD
- LOST (removed from game)
- IN_PLAY (for spells that persist)
- EQUIPPED (items attached to units)

Scenario actions manipulate these zones.

---

## AI_SCENARIOS: Scenario JSON (CJ-SCENARIO-1.0) — Full Spec
Scenarios define:
- sides
- starting units
- environment vars
- victory conditions
- triggers -> actions (director)
- story beats (slideshow/video)

Use IDs:
- `sideId`: "A","B"...
- `deckId`: references a deck

The director trigger system should be able to:
- swap decks
- empty hand
- add/remove cards from deck
- spawn/remove units
- change environment vars (water level, fog density)
- trigger story beats (slideshow/video)

(Exact action union may be expanded; keep unknown actions as `CUSTOM` until implemented.)

---

## 8) AI Output Checklist (before emitting JSON)
For each new card:
1) unique stable `id`
2) correct `type`
3) abilities stored as ABILITY components
4) steps reference existing targeting profile IDs
5) no dangling refs (targetSet ref, profileId, variables)
6) only use schema-allowed fields OR `UNKNOWN_STEP`
