# Captain Jawa Forge – Pages and Component Breakdown (Assembly/Subassembly)

This document enumerates **all user-facing pages** (screens) and the **assemblies/subassemblies** on each page.  
It is designed for rapid onboarding, UX mapping, and to ensure edge cases are accounted for before server/gameplay implementation.

> Conventions:
> - **Assembly** = a major screen section (e.g., “Inspector Panel”)
> - **Subassembly** = a cohesive component cluster inside an assembly
> - **Part** = a specific UI control / editor / widget

---

## Page Index

| Page | Route/Mode | Primary Goal |
|---|---|---|
| Forge | `mode=FORGE` | Create/edit card JSON (CJ-1.x) and abilities/steps |
| Card Preview | modal | View printable/digital templates; validate readability |
| Import/Export | modal | Load/save card JSON and project JSON |
| Action Library | modal | Store reusable abilities/steps/profiles |
| AI Image Generator | modal | Generate art; attach to `visuals.cardImage` |
| Card Library Manager | `mode=LIBRARY` | Manage a library of cards (bulk import/export, search) |
| Deck Builder | `mode=DECKS` | Create decks referencing card IDs; validate constraints |
| Scenario Builder | `mode=SCENARIOS` | Create scenarios with triggers, events, victory conditions |

---

# Forge Page (Card Builder)

## Assembly Overview

| Assembly | Location | Purpose |
|---|---|---|
| Top Bar | top | Navigation, global actions, status |
| Palette Panel | left | Add steps/abilities; save to library |
| Logic Canvas | center | Visual graph of ability execution |
| Inspector Panel | right-top | Edit selected node/ability/card fields |
| Preview JSON Panel | right-middle | Read-only JSON snapshot |
| Compile Panel | right-bottom | Validation errors/warnings |

---

## Top Bar (Forge)

| Subassembly | Components | Functional Description | Technical Notes |
|---|---|---|---|
| Navigation Tabs | `ModeTabs` | Switch between Forge/Library/Decks/Scenarios | In `App.tsx`, state `mode` controls render branch |
| Global Actions | `Preview`, `AI Image`, `Library`, `Import`, `Export`, `Add Ability`, `Reset` | Primary workflow controls | Each opens modal or triggers file download |
| Status Badges | `schemaVersion`, error count | Immediate feedback on validity | Error count comes from `validateCard` |

### User Journeys
| Journey | Steps | Edge Cases |
|---|---|---|
| Start new card | New Card → edit fields → add abilities/steps | Ensure default ability exists |
| Import card | Import modal → paste JSON → validate → load | Unknown steps should recover if registry updated |
| Export card | Export → download JSON | Avoid including large Data URLs in production |

---

## Palette Panel

| Subassembly | Parts | Functional Description | Technical Notes |
|---|---|---|---|
| Active Ability Selector | `<select>` | Choose which ability graph is shown/edited | `activeAbilityIdx` maintained via `findAbilityIndexes()` |
| Save to Library | Buttons | Save current ability or selected step | Uses `upsertAbility`, `upsertStep` |
| Step Accordion | `StepGroupAccordion` | Lists step types grouped by category | Source is `blockRegistry.steps.groups` |

### Interaction Table
| Interaction | Input | Output | Related Data |
|---|---|---|---|
| Click step | step type | Appends step to execution list | `ability.execution.steps.push(...)` |
| Save ability | ability JSON | stored in library | `cj_action_library` |
| Save step | selected step | stored in library | `cj_action_library` |

---

## Logic Canvas (React Flow)

| Subassembly | Parts | Functional Description | Technical Notes |
|---|---|---|---|
| Node Graph | `ReactFlow` | Show ability root, meta nodes, execution node, steps | Derived via `canonicalToGraph(card)` |
| Node Selection | node click | Select and show inspector | Use stable `selectedNodeId` to prevent losing selection on edits |
| Visual Helpers | `MiniMap`, `Controls`, `Background` | Navigation & orientation | Must not reset selection on state updates |

### Edge Cases
| Case | Expected Behavior | Implementation Note |
|---|---|---|
| Editing in inspector changes node list | Selection persists | Persist by `selectedNodeId` + patch node `selected` |
| Node disappears after deleting step | Selection cleared safely | Cleanup effect: if node id not found, set null |

---

## Inspector Panel

Inspector edits depend on selection type:
- `CARD` (always available at top)
- `ABILITY_ROOT`
- `COST`
- `TARGETING` (Target Profiles editor)
- `STEP`

### Inspector – Card Identity Subassembly
| Part | Field | User Purpose | Technical Notes |
|---|---|---|---|
| Name | `card.name` | Display name | Required |
| Type | `card.type` | Unit/Item/Spell/etc | Drives preview template and stats visibility |
| Art URL | `card.visuals.cardImage` | Reference image path or Data URL | Prefer URL/path long term |
| Image Upload | file input | Quick MVP art attach | Stores Data URL; can hit localStorage limits |
| Image Align/Fit | dropdowns | Align / crop within preview | Applies to preview CSS `object-position/object-fit` |

### Inspector – Unit Stats Subassembly (only if `card.type=UNIT`)
| Part | Field | Description | Edge Cases |
|---|---|---|---|
| HP | `stats.hp.max` | Max HP | Ensure current ≤ max |
| AP | `stats.ap.max` | Actions per round | Current ≤ max |
| MOVE | `stats.movement` | Tiles per round | Used later by pathfinding |
| SIZE | `stats.size` | Affects AoE & targeting | Must be ≥1 |

---

## Target Profiles Editor (Inspector: TARGETING)

**Purpose:** Allows complex attacks (primary + secondary targets, cones, AoE, global casts) and supports loops via `SELECT_TARGETS` + `FOR_EACH_TARGET`.

### Target Profiles Table (Subassembly)

| Component | Function | JSON Path | Notes |
|---|---|---|---|
| Profile List | Choose active profile | `ability.targetingProfiles[]` | Enforce unique `id` |
| Add Profile | Add new profile | append | auto-generate unique id |
| Remove Profile | remove profile | splice | keep at least one profile |
| Profile Editor (future) | Edit type/origin/range/LoS/AoE | active profile | currently raw JSON option or partial editor |

### Cross-Component Relationships
| Related Step | Constraint | Why |
|---|---|---|
| `SELECT_TARGETS.profileId` | must match a profile id | ensures deterministic selection |
| `FOR_EACH_TARGET.targetSet.ref` | should reference `saveAs` output | loops over selected set |
| `ITERATION_TARGET` | only inside `FOR_EACH_TARGET.do` | prevents ambiguous target |

---

## Step Inspector (Inspector: STEP)

### Supported Step Editors (current + planned)
| Step Type | Editor Coverage | Notes |
|---|---|---|
| `SHOW_TEXT` | full | edits text |
| `ROLL_D6/D20` | partial | saveAs |
| `SET_VARIABLE` | full | expression editor |
| `IF_ELSE` | partial → planned nested editor | needs nested list editors for then/elseIf/else |
| `SELECT_TARGETS` | partial | profileId + saveAs |
| `FOR_EACH_TARGET` | partial → planned nested editor | edit targetSet.ref + nested steps |
| `DEAL_DAMAGE` | partial | damageType + amountExpr |
| `APPLY_STATUS` | partial | status + duration |
| `PROPERTY_CONTEST` | partial | policy UI + nested onWin/onLose |

### Nested Steps Editor (Planned Subassembly)
| Requirement | UX | Technical |
|---|---|---|
| Edit arrays of steps | inline step list with add/move/delete | recursion-safe editors |
| elseIf branches | list of branch blocks | each has condition + then steps |
| saveAs management | show defined vars, pick by dropdown | requires output tracking in UI |

---

# Modals

## Card Preview Modal
| Assembly | Purpose | Notes |
|---|---|---|
| Template Renderer | Shows one of 5 templates | Units include faction/type icons |
| Rules Tooltip | Hover for ability type/cost meaning | Use a rules glossary table |

---

## Import/Export Modal
| Part | Purpose | Technical Notes |
|---|---|---|
| Text area | Paste CJ JSON | `JSON.parse` + coercion |
| Unknown Step coercion | Preserve unsupported data | `UNKNOWN_STEP.raw` or recovery |
| Version handling | Accept CJ-1.0/1.1/1.2 | `schemas.ts` controls |

---

## Action Library Modal
| Assembly | Purpose | Technical Notes |
|---|---|---|
| List Abilities | reusable designs | inserted into current card |
| List Steps | saved primitives | later allow “insert step” button |
| Relink URL | connect to remote JSON | fetch + set source |
| Import file | load JSON | FileReader -> parse |

---

## AI Image Generator Modal
| Assembly | Purpose | Technical Notes |
|---|---|---|
| Provider/Model | OpenAI/Gemini and model string | stored in localStorage |
| Proxy URL | avoid CORS + key exposure | backend should call provider |
| Prompt + Negative | art spec | include card name/faction in system prompt |
| Reference images | select files -> Data URLs | sent to proxy as attachments |
| Output attach | writes to `visuals.cardImage` | prefer returning URL long-term |

---

# Card Library Manager Page

> Goal: Manage a **collection** of cards and catalogs that Deck/Scenario builders can reference.

## Assemblies
| Assembly | Purpose | Related Data |
|---|---|---|
| Library Source | choose local vs URL | repository/catalog |
| Card List | search/sort/filter | index by name/type/faction/tags |
| Bulk Import | import JSON array/zip | create/update cards |
| Export | download library | used by Deck/Scenario builders |

## Key Edge Cases
| Case | Handling |
|---|---|
| Duplicate card IDs | offer overwrite/rename |
| Missing schemaVersion | reject or attempt migration |
| Unsupported steps | keep as UNKNOWN_STEP |

---

# Deck Builder Page

> Goal: Build decks that reference card IDs and satisfy constraints.

## Assemblies
| Assembly | Purpose | Components |
|---|---|---|
| Deck List (by faction) | browse decks | deck groups, search |
| Deck Editor | edit selected deck | name, faction, slots |
| Card Search Panel | find cards to add | filters, query, type toggles |
| Deck Validation | points/limits | scenario-specific rules later |

## Subassembly Detail Tables

### Deck List (Assembly)
| Component | Function | Notes |
|---|---|---|
| Faction Group Accordion | group decks | faction comes from catalog |
| Search “decks containing card” | reverse lookup | requires index: cardId -> deckIds |

### Deck Editor (Assembly)
| Component | Function | Notes |
|---|---|---|
| Drag/drop slots | add/remove cards | supports multi-count |
| Slot rules | enforce by card type | e.g. max items per unit later |
| Export deck JSON | download CJ-DECK-1.0 | scenario references deckId |

### Card Search Panel (Assembly)
| Filter | Type | Example |
|---|---|---|
| Text search | input | name contains “musket” |
| Type filter | toggle | UNIT/ITEM/SPELL |
| Faction filter | dropdown | Pirates |
| Tag filter | chips | BARRIER, UNDEAD |
| Step filter | advanced | cards containing `PROPERTY_CONTEST` |

---

# Scenario Builder Page

> Goal: Create robust scenarios with triggers, event steps, and deck operations.

## Assemblies
| Assembly | Purpose | Components |
|---|---|---|
| Scenario List | choose scenario | grouped by campaign/arc |
| Scenario Meta | players, map, intro/outro | story slides & media |
| Setup | starting units & decks | spawn lists, deck assignment |
| Event Triggers | define triggers | condition editor + event actions |
| Victory Conditions | end states | conditions + messaging |

## Event Trigger Subassembly
| Field | Purpose | Technical Notes |
|---|---|---|
| Trigger Type | ON_TURN_START/ON_DEATH/... | uses registry trigger enum |
| Condition | when it fires | `ConditionEditor` AST |
| Actions | what happens | steps array supports SWAP_DECK, EMPTY_HAND, SPAWN_ENTITY |

## Scenario Actions Supported (Step Examples)
| Action | Step Type | Notes |
|---|---|---|
| swap deck | `SWAP_DECK` | replaces actor deck with scenario deck |
| empty hand | `EMPTY_HAND` | discard/banish etc |
| add/remove cards | `ADD_CARDS_TO_DECK`, `REMOVE_CARDS_FROM_DECK` | supports counts |
| place/remove unit | `SPAWN_ENTITY`, `DESPAWN_ENTITY` | map placement modes |
| environmental variable | `SET_ENTITY_STATE` or scenario variable step (future) | water level, fog |

---

# Cross-Page Integration Matrix

| Feature | Forge | Library | Decks | Scenarios |
|---|---:|---:|---:|---:|
| Card JSON authoring | ✅ | view/import | referenced | referenced |
| Catalogs (factions/types) | partial | ✅ (recommended home) | ✅ | ✅ |
| Action library | ✅ | optional | optional | optional |
| Deck JSON | referenced | used to load cards | ✅ | referenced |
| Scenario JSON | referenced | optional | optional | ✅ |

---

# Implementation Priorities (Suggested)

1. **Catalog system** (factions/types/attributes) used by Forge + Decks + Scenarios  
2. **Nested step editor** (IF_ELSE, FOR_EACH_TARGET, OPPONENT_SAVE, PROPERTY_CONTEST)  
3. **Scenario trigger executor** (client simulation, later server arbiter)  
4. **Deck validation rules** (scenario-specific constraints, per-unit item locks)  
5. **Migration pipeline** (CJ-1.2 -> CJ-1.3 etc)

---
