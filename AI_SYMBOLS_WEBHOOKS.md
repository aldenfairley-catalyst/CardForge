# AI_SYMBOLS_WEBHOOKS.md
Version: CJ Docs 1.2 (AI-first, comprehensive) • Updated: 2025-12-20

---

## 1) Token keys (TokenKey)
| Key | Name | Typical use |
|---|---|---|
| UMB | Umbra | shadow/void resource |
| AET | Aether | magic/energy resource |
| CRD | Coordination | precision/technique |
| AWR | Awareness | perception/ranged |
| CHR | Charisma | influence/contests |
| STR | Strength | melee/impact |
| RES | Resilience | toughness/saves |
| WIS | Wisdom | insight/ritual |
| INT | Intelligence | planning |
| SPD | Speed | mobility/initiative |

---

## 2) Unit stats
- HP (hit points)
- AP (action points/round)
- MOVE (tiles/round)
- SIZE (collision/targeting rules)

---

## 3) Damage types (baseline)
PHYSICAL, ELECTRIC, FIRE, COLD, POISON, SIEGE, ARCANE

---

## 4) Zone keys (ZoneKey)
Action decks:
- ACTOR_ACTION_DECK / HAND / DISCARD / LOST
- OPPONENT_ACTION_DECK / HAND / DISCARD / LOST

Item decks (optional):
- ACTOR_ITEM_DECK / HAND / DISCARD / LOST

World:
- BATTLEFIELD
- GLOBAL_ENVIRONMENT

---

## 5) UI flows
UI flows are modal mini-interfaces invoked by steps:
- PROPERTY_CONTEST (minigame)
- STORM_CONVERGENCE (chain reaction resolver)
- STORY_SLIDE (narrative slideshow/video)
- TARGETING_HEX_TOOL (advanced targeting)
- DECK_SWAP (scenario trigger)

---

## 6) Webhooks and external events
`WEBHOOK_CALL` is intended for:
- server-authoritative multiplayer
- analytics telemetry
- external AI services

Recommended payload convention:
```json
{
  "eventName":"CARD_PLAYED",
  "matchId":"...",
  "playerId":"...",
  "cardId":"...",
  "abilityName":"...",
  "timestamp":"..."
}
```

---

## 7) Policies (contest + subsystems)
Subsystem steps should accept `policy` blocks that define:
- shuffling behavior
- card ownership
- UI permissions
- ordering options

## 8) Execution API (secure token)
- Backend exposes `POST /api/run` to execute a stored graph. Body: `{ "graphId": "uuid", "mode": "RUN_FROM_START|RUN_FROM_NODE", "startNodeId": "optional", "context": { "scenarioId": "...", "actorId": "...", "targets": [], "vars": {} } }`.
- Requests must include `Authorization: Bearer <CJ_AGENT_TOKEN>` when `CJ_AGENT_TOKEN` is set in the environment; otherwise calls are rejected with 401.
- Supporting endpoints: `GET/POST/PUT /api/graphs` (graph CRUD), `GET /api/cards`, `GET /api/decks`, `GET /api/scenarios`, `GET /api/actions` (action library summary).
