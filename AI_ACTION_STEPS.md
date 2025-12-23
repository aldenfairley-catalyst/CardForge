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
- `REGISTER_LISTENER.then`
- `REQUIRE.onFail`
- `PROPERTY_CONTEST.onWin / onLose`
- *(Planned)* `SCHEDULE_STEPS.steps` *(future timing window; not in runtime yet)*

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
| SHOW_TEXT | Show narrative/log text | `text` | — | — |
| ROLL_D6 / ROLL_D20 | Roll dice | — (include `saveAs` to capture) | `saveAs` | number |
| SET_VARIABLE | Evaluate expression into a ref | `saveAs`, `valueExpr` | — | any |
| IF_ELSE | Conditional branching | `condition`, `then[]` | `elseIf[]`, `else[]` | — |
| OPPONENT_SAVE | Opponent makes a save | `stat`, `difficulty`, `onFail[]`, `onSuccess[]` | — | — |
| SELECT_TARGETS | Open targeting UI using a profile | `profileId`, `saveAs` | `originRef` | TargetSet |
| FOR_EACH_TARGET | Iterate a TargetSet | `targetSet`, `do[]` | — | iteration context |
| DEAL_DAMAGE | Deal typed damage to target | `target`, `amountExpr`, `damageType` | — | — |
| HEAL | Heal HP | `target`, `amountExpr` | — | — |
| APPLY_STATUS | Apply a status | `target`, `status` | `duration` | — |
| REMOVE_STATUS | Remove a status | `target`, `status` | — | — |
| MOVE_ENTITY | Move an entity | `target`, `to`, `maxTiles` | — | — |
| MOVE_WITH_PATH_CAPTURE | Move and capture entities passed through | `target`, `maxTiles`, `savePassedEnemiesAs` | `ignoreReactions` | TargetSet |
| OPEN_REACTION_WINDOW | Reaction timing window | `timing`, `windowId` | — | — |
| CALC_DISTANCE | Compute distance between entities/tiles | `metric`, `from`, `to`, `saveAs` | — | number |
| DRAW_CARDS | Draw cards from a zone | `from`, `to`, `count` | `faceUp`, `saveAs` | CardSet |
| MOVE_CARDS | Move cards between zones | `from`, `to`, `selector` | `saveAs` | CardSet |
| SHUFFLE_ZONE | Shuffle a zone | `zone` | — | — |
| PUT_ON_TOP_ORDERED | Put cards on top in chosen order | `zone`, `cardsRef` | — | — |
| END_TURN_IMMEDIATELY | End the current turn | — | — | — |
| EMPTY_HAND | Empty a hand into another zone | `handZone`, `to` | — | — |
| ADD_CARDS_TO_DECK | Add card ids to a deck zone | `deckZone`, `cardIds` | `countEach`, `shuffleIn` | — |
| REMOVE_CARDS_FROM_DECK | Remove card ids from a deck zone | `deckZone`, `cardIds` | `countEach`, `to` | — |
| SWAP_DECK | Swap which deck is active | `actor`, `slot`, `newDeckId` | `policy.onSwap` | — |
| SET_ENTITY_STATE | Set custom state on entity | `entity`, `key`, `value` | — | — |
| TOGGLE_ENTITY_STATE | Toggle boolean-ish state | `entity`, `key` | — | — |
| CLEAR_ENTITY_STATE | Clear state key | `entity`, `key` | — | — |
| FIND_ENTITIES | Query entities by selector | `selector`, `saveAs` | — | TargetSet |
| COUNT_ENTITIES | Count members of a target set | `targetSet`, `saveAs` | — | number |
| FILTER_TARGET_SET | Filter a target set by predicate | `source`, `filter`, `saveAs` | — | TargetSet |
| SPAWN_ENTITY | Spawn a card into play | `cardId` | `owner`, `at`, `saveAs` | entity ref |
| DESPAWN_ENTITY | Remove an entity | `target` | — | — |
| OPEN_UI_FLOW | Open custom UI/miniflow | `flowId` | `payload`, `saveAs` | any |
| REQUEST_PLAYER_CHOICE | Prompt player choice | `prompt`, `choices`, `saveAs` | — | string/id |
| REGISTER_INTERRUPTS | Listen for events until scope end | `scope`, `events`, `onInterrupt[]` | — | — |
| REGISTER_LISTENER | Register a listener with a conditional gate | `listenerId`, `events`, `then[]` | `scope`, `when` (Condition) | — |
| REQUIRE | Guard execution by condition | `condition` | `mode` (`ABORT`\|`CONTINUE`\|`BRANCH`), `onFail[]` | — |
| CALL_TOOL | Invoke a tool from CJ-TOOLS-1.0 | `toolId` | `input`, `await`, `timeoutMs`, `saveAs` | tool output |
| RUN_INLINE_CODE | Power-user inline JS | `runtime`, `language`, `code` | `saveAs` | any |
| PROPERTY_CONTEST | Run the contest subsystem | `variant`, `io`, `onWin[]`, `onLose[]` | `policy`, `ui` | winner refs |
| WEBHOOK_CALL | Call external endpoint | `url`, `eventName` | `method`, `payload`, `timeoutMs` | — |
| EMIT_EVENT | Emit internal event | `eventName` | `payload` | — |
| AI_REQUEST | Send structured request to AI | `systemPrompt`, `userPrompt`, `saveAs` | `input`, `outputJsonSchema` | any |

## Planned / not implemented in runtime (do not emit unless added to blockRegistry.json)
- ROLL_DN, WHILE
- PULL_TOWARD, TURN_ENTITY, MOVE_VEHICLE, RAM_COLLISION_RESOLVE
- NEGATE_DAMAGE, REDUCE_DAMAGE, MODIFY_PENDING_DAMAGE
- SCHEDULE_STEPS, CANCEL_SCHEDULED, SUBSYSTEM_RUN
- Legacy finders (FIND_ENTITIES_IN_AREA / FIND_ADJACENT_ENTITIES / FIND_ENTITIES_BY_TAG) — use FIND_ENTITIES instead

---

# Important “stress test” patterns

## A) Secondary targets (primary + up to two adjacent)
Use computed sets:
1) SELECT_TARGETS → `primary`
2) FIND_ENTITIES (selector: radius 1 around `primary`) → `adj`
3) REQUEST_PLAYER_CHOICE to pick up to 2 (or filter via FILTER_TARGET_SET)

## B) Global environment counters (Storm Cloud)
Represent global cards as:
- ENVIRONMENT with `environment.placementMode="GLOBAL"`
- Runtime increments `GLOBAL_COUNTERS.STORM_CLOUD += 1` while active

Needed primitives:
- `COUNT_GLOBAL` expression
- `INCREMENT_GLOBAL_COUNTER` step *(recommended addition if not present)*

## C) Delayed AoE with scatter (Storm Call) — planned
Runtime lacks SCHEDULE_STEPS; model as two abilities or a custom UI flow until scheduler support lands.
