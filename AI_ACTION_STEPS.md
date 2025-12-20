# Captain Jawa Forge — Action Step Options (CJ-1.1+)

Designed for AI agents + devs to quickly understand the action-step vocabulary.

> Steps execute in-order. Unknown steps must import safely as `UNKNOWN_STEP`.

## 1) Core Step Interface
| Field | Type | Notes |
|---|---:|---|
| `type` | string | Discriminant |
| `meta?` | object | UI hints |
| `comment?` | string | Designer notes |

## 2) Primary Steps

### Messaging / UX
| Step Type | Minimal Shape |
|---|---|
| `SHOW_TEXT` | `{ "type":"SHOW_TEXT", "text":"..." }` |

### RNG / Variables
| Step Type | Minimal Shape |
|---|---|
| `ROLL_D6` | `{ "type":"ROLL_D6", "saveAs":"d6" }` |
| `ROLL_D20` | `{ "type":"ROLL_D20", "saveAs":"d20" }` |
| `SET_VARIABLE` | `{ "type":"SET_VARIABLE", "saveAs":"x", "valueExpr": <Expr> }` |

### Branching / Control Flow
| Step Type | Minimal Shape |
|---|---|
| `IF_ELSE` | `{ "type":"IF_ELSE", "condition":<Cond>, "then":[<Step>], "elseIf":[{"condition":<Cond>,"then":[<Step>]}], "else":[<Step>] }` |

### Targeting (profiles)
| Step Type | Minimal Shape |
|---|---|
| `SELECT_TARGETS` | `{ "type":"SELECT_TARGETS", "profileId":"shot8", "saveAs":"primary" }` |
| `FOR_EACH_TARGET` | `{ "type":"FOR_EACH_TARGET", "targetSet":{ "ref":"primary" }, "do":[<Step>] }` |
| `ITERATION_TARGET` | pseudo-target used only inside `FOR_EACH_TARGET` |

### Combat / State
| Step Type | Minimal Shape |
|---|---|
| `DEAL_DAMAGE` | `{ "type":"DEAL_DAMAGE", "target":<TargetRef>, "amountExpr":<Expr>, "damageType":"PHYSICAL" }` |
| `HEAL` | `{ "type":"HEAL", "target":<TargetRef>, "amountExpr":<Expr> }` |
| `APPLY_STATUS` | `{ "type":"APPLY_STATUS", "target":<TargetRef>, "status":"PRONE", "duration":{ "turns":1 } }` |
| `REMOVE_STATUS` | `{ "type":"REMOVE_STATUS", "target":<TargetRef>, "status":"PRONE" }` |
| `MOVE_ENTITY` | `{ "type":"MOVE_ENTITY", "target":<TargetRef>, "to":{ "mode":"TARGET_POSITION" }, "maxTiles":4 }` |
| `SET_STATE` | `{ "type":"SET_STATE", "target":<TargetRef>, "key":"loaded", "value":true }` |

## 3) Advanced Steps (needed later)

### Zones / Decks / Hands
- `DRAW_CARDS`, `MOVE_CARDS`, `SHUFFLE_ZONE`, `PUT_ON_TOP_ORDERED`, `EMPTY_HAND`
- `ADD_CARDS_TO_DECK`, `REMOVE_CARDS_FROM_DECK`

### Flow
- `END_TURN_IMMEDIATELY`
- `OPEN_REACTION_WINDOW`
- `REGISTER_INTERRUPTS`

### Templates / AoE
- `SELECT_LINE_TEMPLATE`, `SELECT_AREA_TEMPLATE`

### Minigames
- `PROPERTY_CONTEST` (subsystem)

## 4) Unknown Step Contract
```json
{ "type":"UNKNOWN_STEP", "raw": { "type":"SOME_NEW_STEP", "...":"..." } }
