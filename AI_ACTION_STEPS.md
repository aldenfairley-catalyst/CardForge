# AI_ACTION_STEPS.md
Version: CJ Docs 1.2 (AI-first, comprehensive) • Updated: 2025-12-20

This reference is designed so an AI agent can **author correct, importable CJ JSON** without guessing.
If a step/type is missing here, treat it as unsafe unless `blockRegistry.json` includes it.

---

## Step anatomy (universal)
Every step is an object with:
- `type` *(string, required)*: discriminator
- Additional step-specific fields
- Optional `saveAs` *(string)*: writes a variable ref into the ability execution context

**Nested steps** appear inside:
- `IF_ELSE.then`, `IF_ELSE.elseIf[].then`, `IF_ELSE.else`
- `FOR_EACH_TARGET.do`
- `OPPONENT_SAVE.onFail / onSuccess`
- `REGISTER_INTERRUPTS.onInterrupt`
- `PROPERTY_CONTEST.onWin / onLose`
- `SCHEDULE_STEPS.steps` *(executed later, in a future timing window)*

---

## Targeting & refs
Entity references (EntityRef):
- `{"type":"SELF"}`
- `{"type":"TARGET"}` (single selected target in current context)
- `{"type":"ITERATION_TARGET"}` (only valid *inside* `FOR_EACH_TARGET.do`)
- `{"type":"ENTITY_ID","id":"..."}`
- `{"type":"FROM_REF","ref":"someVar"}` (subsystem outputs)

Target sets (TargetSet) are stored under variable refs and consumed by `FOR_EACH_TARGET`.

---

# Master step list (table)
Columns:
- **Step**: `type` value
- **Purpose**
- **Required fields**
- **Optional fields**
- **Writes**: variables produced

> Note: “Expressions” use the expression AST described in AI_VARIABLES.md.

| Step | Purpose | Required fields | Optional fields | Writes |
|---|---|---|---|---|
| SHOW_TEXT | Show narrative/log text | `text` | `style`, `speaker` | — |
| ROLL_DN | Roll an N-sided die | `sides`, `saveAs` | `label` | number |
| ROLL_D6 | Alias for ROLL_DN(6) | `saveAs` | — | number |
| ROLL_D20 | Alias for ROLL_DN(20) | `saveAs` | — | number |
| SET_VARIABLE | Set a variable from an expression | `saveAs`, `valueExpr` | — | any |
| CALC_DISTANCE | Compute distance between entities/tiles | `metric`, `from`, `to`, `saveAs` | `throughBarriersPolicy` | number |
| SELECT_TARGETS | Open targeting UI using a profile | `profileId`, `saveAs` | `prompt` | TargetSet |
| FOR_EACH_TARGET | Iterate a TargetSet | `targetSet.ref`, `do[]` | `saveIndexAs` | iteration context |
| FIND_ENTITIES_IN_AREA | Compute entities in a shape | `origin`, `shape`, `saveAs` | `filter` | TargetSet |
| FIND_ADJACENT_ENTITIES | Compute adjacent entities | `origin`, `saveAs` | `filter` | TargetSet |
| FIND_ENTITIES_BY_TAG | Find entities by tags | `tags`, `saveAs` | `scope`, `filter` | TargetSet |
| IF_ELSE | Conditional branching | `condition`, `then[]` | `elseIf[]`, `else[]` | — |
| WHILE | Looping (advanced) | `condition`, `do[]` | `maxIterations` | — |
| DEAL_DAMAGE | Deal typed damage to target | `target`, `amountExpr`, `damageType` | `tags`, `sourceTag` | — |
| HEAL | Heal HP | `target`, `amountExpr` | `capToMax` | — |
| APPLY_STATUS | Apply a status | `target`, `status` | `duration`, `stacks` | — |
| REMOVE_STATUS | Remove a status | `target`, `status` | — | — |
| OPEN_REACTION_WINDOW | Reaction timing window | `timing`, `windowId` | `allowedReactions` | — |
| OPPONENT_SAVE | Opponent makes a save | `stat`, `difficulty`, `onFail[]`, `onSuccess[]` | `target` | — |
| MOVE_ENTITY | Move an entity | `target`, `to`, `maxTiles` | `ignoreReactions`, `pathPolicy` | — |
| MOVE_WITH_PATH_CAPTURE | Move and record passed entities | `target`, `maxTiles`, `savePassedEnemiesAs` | `ignoreReactions` | TargetSet |
| PULL_TOWARD | Pull target toward another | `target`, `toward`, `maxTiles` | `saveLastSafeAs`, `barrierStops` | tile/entity |
| TURN_ENTITY | Rotate an entity/vehicle | `target`, `degrees` | — | — |
| MOVE_VEHICLE | Forward/back move with facing | `target`, `mode`, `tiles` | `noDiagonal`, `noSideSlip` | — |
| RAM_COLLISION_RESOLVE | Resolve vehicle ram | `attacker`, `target`, `impactDamage` | `shockwave` | — |
| SET_ENTITY_STATE | Set custom state on entity | `target`, `key`, `valueExpr` | — | — |
| CLEAR_ENTITY_STATE | Clear state key | `target`, `key` | — | — |
| NEGATE_DAMAGE | Cancel pending damage | — | `reason` | — |
| REDUCE_DAMAGE | Reduce pending damage | `amountExpr` | `minFinal` | — |
| MODIFY_PENDING_DAMAGE | Multiply/add pending damage | `mode` | `amountExpr`, `multiplierExpr` | — |
| DRAW_CARDS | Draw cards from a zone | `from`, `to`, `count` | `faceUp`, `saveAs` | CardSet |
| MOVE_CARDS | Move cards between zones | `from`, `to` | `cardsRef`, `selector`, `shuffle` | — |
| SEARCH_ZONE | Find cards in a zone | `zone`, `filter`, `saveAs` | `takeNExpr`, `sort` | CardSet |
| SHUFFLE_ZONE | Shuffle a zone | `zone` | — | — |
| PUT_ON_TOP_ORDERED | Put cards on top in chosen order | `zone`, `cardsRef` | `allowUI` | — |
| END_TURN_IMMEDIATELY | End the current turn | — | `reason` | — |
| OPEN_UI_FLOW | Open custom UI/miniflow | `flowId` | `payload`, `saveAs` | any |
| REQUEST_PLAYER_CHOICE | Prompt player choice | `prompt`, `choices`, `saveAs` | `allowCancel` | string/id |
| REGISTER_INTERRUPTS | Listen for events until scope end | `scope`, `events`, `onInterrupt[]` | `filter`, `saveAs` | — |
| EMIT_EVENT | Emit internal event | `eventName` | `payload` | — |
| WEBHOOK_CALL | Call external endpoint | `url`, `method`, `eventName` | `headers`, `payload`, `timeoutMs` | — |
| AI_REQUEST | Send structured request to AI | `systemPrompt`, `userPrompt`, `input`, `saveAs` | `outputJsonSchema` | any |
| PROPERTY_CONTEST | Run the contest subsystem | `variant`, `io`, `onWin[]`, `onLose[]` | `policy`, `ui` | winnerRef etc |
| SUBSYSTEM_RUN | Run a named subsystem/minigame | `subsystemId`, `input`, `saveAs` | `ui` | any |
| SCHEDULE_STEPS | Execute steps later | `timing`, `steps[]` | `saveTicketAs`, `label` | ticket |
| CANCEL_SCHEDULED | Cancel scheduled ticket | `ticketRef` | — | — |

---

# Important “stress test” patterns

## A) Secondary targets (primary + up to two adjacent)
Use computed sets:
1) SELECT_TARGETS → `primary`
2) FIND_ENTITIES_IN_AREA (radius 1 around primary) → `adj`
3) SELECT_FROM_SET (future step) OR REQUEST_PLAYER_CHOICE to pick up to 2

> If you need “pick up to N from computed targets”, add a step:
- `SELECT_FROM_TARGETSET` (UI step) with `maxN`, `saveAs`

## B) Global environment counters (Storm Cloud)
Represent global cards as:
- ENVIRONMENT with `environment.placementMode="GLOBAL"`
- Runtime increments `GLOBAL_COUNTERS.STORM_CLOUD += 1` while active

Needed primitives:
- `COUNT_GLOBAL` expression
- `INCREMENT_GLOBAL_COUNTER` step *(recommended addition if not present)*

## C) Delayed AoE with scatter (Storm Call)
Store:
- chosen marker tile/zone
- scheduled ticket
Resolve later:
- roll scatter
- move marker
- apply damage

Requires:
- SCHEDULE_STEPS
- a “scatter direction” helper:
  - either dice + IF_ELSE,
  - or a `SCATTER` subsystem.

