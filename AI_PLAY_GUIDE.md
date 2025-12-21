# AI_PLAY_GUIDE.md
Version: CJ Docs 1.2 (AI-first, comprehensive) • Updated: 2025-12-20

This is a **rules & timing** reference for AI agents to generate content that doesn’t break gameplay.

---

## 1) Core resources
- **AP** (Action Points): per-round budget used by abilities.
- **HP**: health.
- **MOVE**: how many tiles per round a unit can move.
- **SIZE**: affects collisions, hazards, targeting exceptions.
- **Tokens** (UMB/AET/etc): costs and printed contest values.

---

## 2) Turn loop (authoritative)
1. START_OF_TURN triggers fire
2. Scheduled effects resolve (those due now)
3. Player actions (any order):
   - Move (may cost AP or be free; depends on rules)
   - Play card / activate ability
   - Reactions windows open at specified timings
4. END_OF_TURN triggers fire
5. Scenario victory conditions evaluated

---

## 3) Timing windows (recommended)
- BEFORE_ACTION (cost check)
- AFTER_COST_PAID
- BEFORE_TARGETING
- AFTER_TARGETING
- BEFORE_DAMAGE_APPLIED
- AFTER_DAMAGE_APPLIED / ON_DAMAGE_TAKEN
- END_OF_TURN
- START_OF_OPPONENT_TURN

---

## 4) Hybrid vs Digital enforcement
Hybrid mode:
- LoS and exact distance may be “player confirmed”.
- The app should still compute and show suggested legal tiles/targets.
- Provide “override” reasons.

Full digital mode:
- Movement/path/LoS must be computed.
- Barriers block range/aoe according to profile.los rules.

---

## 5) Environment model
Environment can be:
- **Tile-based** (occupies a tile)
- **Global** (e.g., Storm Cloud as global weather state)

Global environment should contribute to counters like:
- `GLOBAL_COUNTERS.STORM_CLOUD`

---

## 6) Events (scenario + passives)
Common events:
- ON_SCENARIO_START / ON_SCENARIO_END
- ON_TURN_START / ON_TURN_END
- ON_UNIT_SPAWNED / ON_UNIT_REMOVED
- ON_DAMAGE_DEALT / ON_DAMAGE_TAKEN
- ON_CARD_MOVED_ZONE
- ON_GLOBAL_COUNTER_CHANGED
- ON_TILE_HIT (damage affects tile)

Scenarios use triggers:
```json
{"id":"t","when":{"event":"ON_DAMAGE_DEALT","filter":{"damageType":"ELECTRIC"}},"do":[ ...steps... ]}
```

---

## 7) Status definitions (baseline)
Recommended standard statuses (extendable):
- PRONE (movement penalty; may remove reactions)
- STUNNED (lose AP next turn)
- SLOWED (movement reduced)
- IMMOBILE, SILENCED, DISARMED

---

## 8) Vehicles / facing (Gunboat)
Vehicles require:
- Facing/orientation state (0..5 in hex or 0/90/180/270 in square)
- Movement constraints (no diagonal/side-slip)
- Collision and ram resolution steps

