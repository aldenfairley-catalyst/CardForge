# Captain Jawa Digital — Variables, Tokens, Zones, and References (AI-first)

This doc defines canonical variable names, token keys, and reference objects used in expressions/conditions/steps.

---

## 1) Token System

### 1.1 Canonical Token Keys and Abbreviations
These abbreviations should appear on card preview and be used in JSON.

| Token | Key | Abbrev | Notes |
|---|---|---|---|
| Umbra | `UMB` | UMB | shadow / dark |
| Aether | `AET` | AET | magic / arcane |
| Coordination | `CRD` | CRD | dexterity / precision |
| Charisma | `CHR` | CHR | influence / presence |
| Strength | `STR` | STR | power |
| Resilience | `RES` | RES | toughness |
| Wisdom | `WIS` | WIS | insight |
| Intelligence | `INT` | INT | planning / knowledge |
| Speed | `SPD` | SPD | reflex / save stat |
| Awareness | `AWR` | AWR | perception |

### 1.2 Printed Token Value vs Spend Cost (DO NOT MIX)
- Printed token value: used for contests / “token count” minigames.
- Spend cost: tokens paid to activate abilities.

**Recommended fields**
- Printed: `tokenValue: { UMB:0, ... }`
- Cost: `ability.cost.tokens: { UMB:1, CRD:1 }`

If current schema doesn’t yet include `tokenValue`, do not fake it in `resources` unless your rules engine explicitly uses `resources` as printed value.

---

## 2) Variables (`saveAs`) and Execution Scope

### 2.1 saveAs variables
Certain steps save outputs:
- `ROLL_D6.saveAs = "d6"`
- `ROLL_D20.saveAs = "d20"`
- `SET_VARIABLE.saveAs = "x"`

These are runtime script variables, not card fields.

### 2.2 Variable lifetimes
- Ability execution variables live during the execution of that ability.
- They should not persist unless explicitly written into entity state (`SET_STATE`) or status effects.

---

## 3) Runtime Zones and Piles
Zones are part of match state, not card JSON.

Canonical zones:
- `DRAW_PILE`
- `HAND`
- `DISCARD`
- `LOST` (removed from game permanently)
- `IN_PLAY` (persistent spell / ongoing effect)
- `EQUIPPED` (items attached to unit)
- `BATTLEFIELD` (unit/environment on board)

Scenario actions and future steps can move cards between zones.

---

## 4) Reference Objects (Targets, Entities, Sets)

### 4.1 TargetRef (what a step acts on)
| TargetRef | Meaning |
|---|---|
| `{ "type":"SELF" }` | source unit of the ability |
| `{ "type":"ITERATION_TARGET" }` | current target inside FOR_EACH_TARGET |
| `{ "type":"TARGET_SET", "ref":"primary" }` | refers to saved target set from SELECT_TARGETS |
| `{ "type":"EQUIPPED_ITEM", "itemId":"cj.item.rifle", "of": { "type":"SELF" } }` | a specific equipped item instance |

### 4.2 Target sets
Produced by:
- `SELECT_TARGETS.saveAs = "primary"`

Consumed by:
- `FOR_EACH_TARGET.targetSet.ref = "primary"`

**AI rule:** never reference a target set name that hasn’t been saved earlier in the same execution.

---

## 5) Distance, Range, and Line of Sight

### 5.1 Distance metrics
- Square grids: Manhattan or Chebyshev
- Hex grids: axial distance formula

Recommended expression:
```json
{ "type":"DISTANCE", "from": { "type":"SELF" }, "to": { "type":"ITERATION_TARGET" }, "metric": "HEX" }
```

### 5.2 LoS rules are policy-based
A targeting profile should specify:
- `lineOfSight: true/false`
- optional `losPolicyId` (future): NORMAL, IGNORE_SMOKE, IGNORE_UNITS, etc.
- attacks may have attributes that interact with blockers (e.g., “ARCING” ignores low barriers)

---

## 6) State Variables on Entities
Examples:
- `loaded` boolean
- `aiming` boolean
- `heat` number

State is checked via conditions:
```json
{ "type":"STATE_EQUALS", "target": { "type":"SELF" }, "key":"loaded", "value": true }
```

And modified via steps:
```json
{ "type":"SET_STATE", "target": { "type":"SELF" }, "key":"loaded", "value": false }
```

---

## 7) “Hand token sum” mechanics (stress test requirement)
Some rules need “player has 3 cards totaling 5 UMB and 1 STR”.

This requires:
- card tokenValue accessible for cards in HAND
- expression/condition that sums by token type

Recommended condition:
```json
{
  "type": "HAND_TOKEN_TOTAL_AT_LEAST",
  "side": "SELF_PLAYER",
  "requirements": { "UMB": 5, "STR": 1 },
  "countCards": 3
}
```

If not implemented, represent as `UNKNOWN_STEP` or `CUSTOM` with raw intent preserved.
