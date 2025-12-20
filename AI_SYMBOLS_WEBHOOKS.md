# Captain Jawa Digital — Symbols, Events, Hooks, Policies, and UI Triggers (AI-first)

This document connects the “rule language” (steps/conditions) to runtime engine concepts (events, hooks, UI requests).

---

## 1) Symbols / Abbreviations
Token abbreviations (canonical):
- UMB, AET, CRD, CHR, STR, RES, WIS, INT, SPD, AWR

Common stats abbreviations:
- HP (hit points)
- AP (action points)
- MOVE (movement per action/turn)
- SIZE (footprint / targeting interactions)

---

## 2) Events (“webhooks” concept)
In local single-player/hybrid mode, these are internal events (not network webhooks).
In multiplayer later, these become server events over sockets.

### 2.1 Scenario Trigger Events (Director)
| Event | When it fires | Payload (suggested) |
|---|---|---|
| `ON_SCENARIO_START` | scenario begins | scenarioId |
| `ON_ROUND_START` | round begins | roundNumber |
| `ON_TURN_START` | side starts turn | sideId |
| `ON_UNIT_DEATH` | unit removed | unitInstanceId, cardId, sideId |
| `ON_ENV_VAR_CHANGED` | env changes | key, oldValue, newValue |
| `ON_CUSTOM_EVENT` | scenario-defined | name, payload |

### 2.2 Ability Lifecycle Events (future)
| Event | Meaning |
|---|---|
| `ABILITY_REQUESTED` | player tries to use ability |
| `COST_PAID` | cost deducted |
| `TARGETS_SELECTED` | targets locked |
| `REACTION_WINDOW_OPEN` | opponent may react |
| `DAMAGE_RESOLVED` | damage applied |
| `ABILITY_COMPLETE` | script finished |

---

## 3) Policies (rules that vary by mode)
Policies are configurable rule modules.

### 3.1 Line of Sight Policies
Examples:
- `LOS_STANDARD`: walls block, units may or may not block (config)
- `LOS_IGNORE_UNITS`: units don’t block
- `LOS_ARCING`: ignores low obstacles
- `LOS_SPECTRAL`: ignores walls tagged ETHEREAL

Targeting profiles may reference:
- `lineOfSight: true`
- optional `losPolicyId`

### 3.2 AoE Propagation Policies
For area radius with barriers:
- `AOE_FLOOD_FILL_BLOCKED_BY_WALLS`
- `AOE_STOPS_AT_BARRIER_COLOR`
- `AOE_IGNORES_BARRIER_IF_ATTRIBUTE_FIRE` (example)

---

## 4) Custom UI Triggers (miniflows / subsystems)
Some steps require a dedicated UI:
- template picker (line/cone/area)
- property contest minigame
- cinematic/story playback
- “choose order” UI (put cards on top in any order)

Recommended step:
```json
{
  "type": "REQUEST_UI",
  "uiId": "PROPERTY_CONTEST",
  "input": { "...": "..." },
  "saveAs": "uiResult"
}
```

If unimplemented:
```json
{ "type":"UNKNOWN_STEP", "raw": { "type":"REQUEST_UI", "uiId":"...", "input":{...} } }
```

---

## 5) Classes / Modules (conceptual mapping)
Even if implemented in TS files, AI should understand roles:

- **CardEntity**: static card definition
- **AbilityComponent**: logic container on card
- **TargetingProfile**: reusable selection rule
- **Step**: atomic action in execution
- **Expr/Cond**: AST for arithmetic and boolean logic
- **Director**: scenario trigger runner
- **ZoneManager**: deck/hand/discard/lost operations
- **LoSService**: raycast / blockers / policy evaluation
- **TemplateService**: compute affected tiles/hexes for AoE/line/cone
- **RNGService**: server-authoritative randomness

---

## 6) I/O boundaries (what trusts what)
Assisted Physical:
- Player provides some truths (e.g., “yes LoS exists”)
- App provides RNG and state tracking
Full Digital:
- Server validates everything
- Client only requests actions; server computes result

---

## 7) “Don’t break the game” rules for AI
1) Never create duplicate IDs  
2) Never reference a cardId not present in the library  
3) Never reference profileId or targetSet names that don’t exist  
4) Distinguish printed token value vs activation cost  
5) Preserve unknown mechanics as UNKNOWN_STEP (raw intent kept)
