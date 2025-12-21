# Captain Jawa Forge – Directory Structure Reference (CJ-Forge)

This document describes the intended **project directory structure**, what each area is responsible for, and how data flows between them.  
It is written to help engineers (and AI agents) quickly locate implementation points for card building, deck/scenario building, rules execution, validation, and future server/client split.

> Status: Builder-first (Forge / Decks / Scenarios) with shared **Core Logic + Schema**.

---

## Top-Level Layout

| Path | Purpose | Notes / Ownership |
|---|---|---|
| `/.github/workflows/` | CI/CD pipelines | GitHub Pages deploy, lint/test/build steps |
| `/public/` | Static assets | Card art placeholders, faction icons, template images |
| `/public/cards/` | Card art library (recommended) | Prefer URLs/paths over Data URLs in card JSON long term |
| `/public/factions/` | Faction symbols and template overlays | e.g. `pirates.svg`, `undead.svg` |
| `/src/` | React application source | All UI + client-side state + local persistence |
| `/src/assets/` | Static JSON registries and default catalogs | `blockRegistry.json`, default `catalog.json` etc. |
| `/src/components/` | Shared UI components | Editors, preview widgets, modals |
| `/src/features/` | Feature modules (screens) | Library, Forge, Decks, Scenarios |
| `/src/lib/` | Core logic library (TypeScript) | Schema types, validation, graph, repository, storage |
| `/src/styles/` (optional) | Styling | if you later split CSS out |
| `/src/main.tsx` | App bootstrap | React root mounting |
| `/src/App.tsx` | Primary shell + routing (tabs) | Switches Forge/Decks/Scenarios/Library, hosts modals |
| `/src/index.css` | Global CSS variables and base styles | Defines `--accent`, panels, nodes, etc. |

---

## `src/` Details

### `src/App.tsx`
**Role:** Application shell, navigation between major modes, and the main Forge canvas experience.

**Responsibilities**
- Mode routing: `FORGE | LIBRARY | DECKS | SCENARIOS`
- Holds modals: Import/Export, Preview, Action Library, AI Image generation
- Hosts ReactFlow canvas and Inspector
- Connects editors to schema objects via `setCard`, `setAbility`, `setStep`

**Should NOT contain**
- Deep schema rules beyond UI-level constraints (belongs in `src/lib/schemas.ts`)
- Game runtime execution (belongs in server / Arbiter or shared engine later)

---

## `src/features/` Modules (Screens)

| Module | Path | Purpose |
|---|---|---|
| Card Library | `src/features/library/` | Browse cards, import/export card sets, manage catalogs |
| Deck Builder | `src/features/decks/` | Build decks, validate constraints, search/filter cards |
| Scenario Builder | `src/features/scenarios/` | Create scenarios: triggers, events, victory conditions, deck swaps |
| Forge (optional split) | `src/features/forge/` | If/when you split Forge out of `App.tsx` |

### Recommended sub-structure
Each feature folder should follow:

```
features/<feature>/
  index.ts                # export public components
  <FeaturePage>.tsx       # screen-level component
  components/             # feature-only components
  hooks/                  # feature-only hooks
  utils/                  # feature-only helpers
  types.ts                # feature-specific types (not global schema)
```

---

## `src/components/` Shared UI Components

| Component | Purpose | Notes |
|---|---|---|
| `CardPreview.tsx` | Render 1 of 5 templates | uses `card.presentation` + tokens/abilities |
| `ExpressionEditor.tsx` | Build expression AST | numeric ops, variables, refs |
| `ConditionEditor.tsx` | Build condition AST | tag checks, counts, distance constraints |
| `HexGridSelector.tsx` (recommended) | Target range/AoE selection | supports barriers/LoS in preview tooling |
| `Modal.tsx` (optional) | Reusable modal | can replace inline modal function in `App.tsx` |

---

## `src/lib/` Core Logic Library

This is the critical shared layer. The game server (Arbiter) should eventually import these modules.

### Schema + Types
| File | Purpose |
|---|---|
| `types.ts` | Canonical TS types for CJ schemas (cards, abilities, steps, decks, scenarios, catalogs) |
| `schemas.ts` | Validation rules (structural + cross-field invariants) |
| `migrations.ts` (recommended) | Schema migrations e.g. `CJ-1.1 -> CJ-1.2` |

### Builder logic
| File | Purpose |
|---|---|
| `graph.ts` | Canonical card -> ReactFlow graph mapping, summaries |
| `registry.ts` | Loads `assets/blockRegistry.json`, helpers (`isStepTypeAllowed`, step groups) |
| `storage.ts` | LocalStorage persistence for drafts |

### Repository & Catalogs
| File | Purpose |
|---|---|
| `repository.ts` | Local “Action Library” store: abilities/steps/profiles |
| `catalog.ts` (recommended) | Factions/types/attributes catalogs; editable and importable |
| `search.ts` (recommended) | Index cards for fast filtering by name/faction/tags/steps |

---

## `src/assets/` Registries

| File | Purpose |
|---|---|
| `blockRegistry.json` | Authoritative list of step types, triggers, enums, UI flows |
| `defaultCatalog.json` (recommended) | Default factions/types/attributes + icons |
| `sampleCards/` (optional) | Seed cards for demos |

**Important:** `blockRegistry.json` is how the UI decides what is “known” vs `UNKNOWN_STEP`.  
If steps show as unknown, ensure they are listed here **and** in `schemas.ts` invariants if they have cross-field rules.

---

## Data Models Stored Locally (Current MVP)

| Store | Key | Source |
|---|---|---|
| Card draft | `cj_card_json` (example) | `src/lib/storage.ts` |
| Action library | `cj_action_library` | `src/lib/repository.ts` |
| Catalogs | `cj_catalog` | recommended `src/lib/catalog.ts` |
| Decks | `cj_decks` | `features/decks` storage |
| Scenarios | `cj_scenarios` | `features/scenarios` storage |

---

## Data Flow Summary

### Card Authoring (Forge)
1. User edits via Inspector / editors
2. `setCard()` mutates in-memory JSON
3. `validateCard(card)` runs on change
4. LocalStorage auto-saves
5. Export outputs pure `CardEntity` JSON (CJ-1.x)

### Action Library
1. Save ability/step into repository
2. Export library JSON (portable)
3. Import / relink library from URL

### Deck Builder
1. Loads cards from Library storage
2. Builds deck JSON referencing card IDs
3. Validates against catalog/scenario constraints

### Scenario Builder
1. Defines triggers/events/victory conditions
2. References decks (by ID) and cards (by ID)
3. Can use action steps like `SWAP_DECK`, `EMPTY_HAND`, `SPAWN_ENTITY`

---

## Planned Separation (Future)
When you introduce the Arbiter server:
- Move runtime execution to `packages/core` (shared) + `apps/server` (arbiter)
- Keep Forge/Decks/Scenarios in `apps/forge`

Suggested monorepo layout:

```
/packages/core        # schemas, engine, validators, step runtime
/apps/forge           # UI (this project)
/apps/arbiter         # server
```

---

## Quick “Where do I change X?”

| Change | File(s) |
|---|---|
| Add a new step type | `src/assets/blockRegistry.json` + `src/lib/types.ts` + `src/lib/schemas.ts` + UI editor in `App.tsx` |
| Fix schemaVersion errors | `src/lib/schemas.ts` (allowed versions) + migration if needed |
| Add new token keys / enums | `blockRegistry.json` + `types.ts` + any UI dropdowns |
| Add new page/screen | `src/features/<feature>/<FeaturePage>.tsx` + hook into `App.tsx` mode routing |
| Add new catalog items | `src/assets/defaultCatalog.json` + `src/lib/catalog.ts` + catalog UI page |
| Make deck/scenario steps work | `types.ts` + `schemas.ts` + scenario builder UI + (later) server executor |

---
