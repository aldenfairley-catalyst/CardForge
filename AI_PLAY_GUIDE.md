# Captain Jawa Digital — How the Game is Played (AI-first)

This is a system play guide written for AI agents (and devs) to understand the intended tabletop + digital hybrid.

---

## 1) Two Modes of Play

### 1.1 Assisted Physical (Hybrid)
- Physical board + minis.
- Players handle some adjudication (e.g., exact LoS edge cases, “can I really see?”).
- App handles:
  - card library, decks, scenarios
  - draw/shuffle
  - RNG (d6/d20)
  - ability execution scripts
  - HP/AP/status/tokens tracking
  - scenario director triggers (story beats, deck swaps, spawns)

### 1.2 Full Digital
- The board is fully represented in the client.
- The server is authoritative:
  - validates LoS, range, AoE templates
  - executes steps deterministically + RNG
  - syncs state to clients

---

## 2) Turn Structure (typical)
1) Round start triggers (scenario director)
2) Player turn start triggers
3) Active player spends AP to:
   - move
   - use abilities
   - play spells / equip items (if allowed)
4) Reaction windows may occur (server pauses and allows responses)
5) Turn ends
6) Victory conditions checked continuously or at defined timing windows

---

## 3) Cards on the Table

### 3.1 UNIT cards
- Become entities on battlefield.
- Track HP/AP/MOVE/SIZE
- Have abilities and passives.

### 3.2 ITEM cards
- Equipped to units.
- May inject abilities or modify stats.
- May maintain local state (“loaded”) that abilities check.

### 3.3 SPELL cards
- Played from hand.
- Can create entities, apply effects, alter environment, or trigger subsystems.

### 3.4 ENVIRONMENT cards
- Walls, hazards, doors, fog, etc.
- May be destructible (HP).

### 3.5 TOKEN cards
- Summons, markers, ongoing effects represented on board.

---

## 4) The Director (Scenario System)
Scenarios are the narrative/gameplay layer:
- defines starting units for each side
- assigns decks
- defines victory conditions
- defines triggers that run actions:
  - spawn/remove units
  - switch decks
  - empty hand
  - add/remove cards from zones
  - change environment variables (water level, fog density)
  - trigger story beats (slideshow/video)

---

## 5) Stress-tested mechanics (must be supported)
This list captures the “novel mechanics” your game wants:
- multi-target attacks (primary + up to N secondary)
- dynamic targeting shapes (area radius, cone, line, adjacency)
- blockers/barriers that change AoE propagation
- custom entity state + state changes (loaded, aiming, overheated)
- subsystems/minigames (Property Contest)
- token-value sums across cards in hand (minigame requirements)
- deck swaps and zone manipulations based on triggers
- story slide/video triggers tied to gameplay events

AI agents generating card/scenario JSON should preserve unimplemented mechanics as `UNKNOWN_STEP` with raw intent.
