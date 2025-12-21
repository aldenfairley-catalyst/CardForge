# AI_VARIABLES.md
Version: CJ Docs 1.2 (AI-first, comprehensive) • Updated: 2025-12-20

This doc defines **all variable types**, how they are produced/consumed, and the expression/condition language used by steps.

---

## 1) Variable scopes
Variables exist in the **execution context** of an ability resolution.
- Local variables: set during one ability execution.
- Persisted state: stored on entities (card state / statuses / global counters).

---

## 2) Variable data types (canonical)
| Type | Description | Examples | Produced by |
|---|---|---|---|
| number | Numeric scalar | dice roll, distance | ROLL_DN, CALC_DISTANCE, COUNT_* |
| boolean | Truth value | `loaded==true` | SET_VARIABLE, conditions-as-expr |
| string | IDs, labels | choice id | REQUEST_PLAYER_CHOICE |
| TargetSet | list of targets | entity ids / tiles | SELECT_TARGETS, FIND_* |
| CardSet | list of card ids/instances | found cards | DRAW_CARDS, SEARCH_ZONE |
| Ticket | scheduled effect handle | cancel later | SCHEDULE_STEPS |
| SubsystemResult | arbitrary structured JSON | contest results | SUBSYSTEM_RUN, PROPERTY_CONTEST |
| TileCoord | a tile coordinate | q/r or x/y | targeting UI outputs |

---

## 3) Entity state vs variables
### 3.1 Variables
Transient for one resolution (e.g., `d6`, `targets`).

### 3.2 Entity custom state
Persistent keys defined on the card:
```json
"stateSchema": {
  "loaded": { "type":"boolean", "default": false, "description":"Weapon loaded" },
  "caught": { "type":"boolean", "default": false }
}
```
Write:
- SET_ENTITY_STATE / CLEAR_ENTITY_STATE  
Read (conditions):
- ENTITY_STATE_TRUE / ENTITY_STATE_EQUALS / ENTITY_STATE_COMPARE

---

## 4) Expression language (Expr)
Expressions are JSON AST nodes. Minimum set:

### Constants
```json
{"type":"CONST_NUMBER","value":10}
{"type":"CONST_BOOL","value":true}
{"type":"CONST_STRING","value":"foo"}
```

### Variable refs
```json
{"type":"VAR_NUMBER","ref":"d6"}
{"type":"VAR_BOOL","ref":"loadedOk"}
{"type":"VAR_STRING","ref":"choice"}
```

### Arithmetic
```json
{"type":"ADD","a":{"type":"CONST_NUMBER","value":30},"b":{"type":"MUL","a":{"type":"CONST_NUMBER","value":10},"b":{"type":"VAR_NUMBER","ref":"stormClouds"}}}
```
Supported ops (recommended):
- ADD, SUB, MUL, DIV
- MIN, MAX, CLAMP
- FLOOR, CEIL, ROUND

### Counts
```json
{"type":"COUNT_TARGETSET","ref":"caughtSprites"}
{"type":"COUNT_GLOBAL","key":"STORM_CLOUD"}
{"type":"COUNT_ZONE","zone":"ACTOR_ACTION_HAND","filter":{"tokenTotals":{"UMB":5,"STR":1}}}
```

---

## 5) Condition language (Condition)
Conditions are boolean AST nodes.

### Basics
- ALWAYS, NEVER
- NOT, AND, OR

### Checks (recommended core)
- COMPARE_NUMBERS: compare two Exprs
- ENTITY_STATE_TRUE / ENTITY_STATE_EQUALS
- HAS_STATUS
- DAMAGE_SOURCE_HAS_TAG
- TARGET_HAS_TAG / TARGET_HAS_EQUIPPED_TAG
- DISTANCE_LEQ (requires CALC_DISTANCE or inline distance Expr)
- COUNT_TARGETSET_GTE

Example:
```json
{
  "type":"AND",
  "conditions":[
    {"type":"ENTITY_STATE_TRUE","target":{"type":"SELF"},"key":"loaded"},
    {"type":"NO_ENEMIES_WITHIN","of":{"type":"SELF"},"radius":4}
  ]
}
```

---

## 6) Token counting in hand (stress test)
To support queries like:
> “Player has 3 cards with total value 5 UMB and 1 STR”

You need:
1) `COUNT_ZONE` expression (counts cards meeting a filter) **and/or**
2) `SUM_TOKEN_VALUES_IN_ZONE` expression (sum printed token values across cards)

Recommended expressions:
- `SUM_TOKENS_IN_ZONE` with fields:
  - zone
  - includeCardTypes
  - sumMode: PRINTED_TOKEN_VALUE vs RESOURCE_TOKEN_POOL
- `COUNT_CARDS_IN_ZONE`

Example:
```json
{
  "type":"AND",
  "conditions":[
    {"type":"COMPARE_NUMBERS","op":">=","a":{"type":"COUNT_CARDS_IN_ZONE","zone":"ACTOR_ACTION_HAND"},"b":{"type":"CONST_NUMBER","value":3}},
    {"type":"TOKENS_IN_ZONE_AT_LEAST","zone":"ACTOR_ACTION_HAND","tokens":{"UMB":5,"STR":1}}
  ]
}
```

If these nodes do not exist yet, **add them** to the registry/types/schemas.

