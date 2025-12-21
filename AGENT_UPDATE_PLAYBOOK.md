**Captain Jawa Forge / CardForge – Agent Update Playbook (Root Instructions)**  
Version: 1.0

This document is the **standard operating procedure** for any AI agent or developer making updates to this codebase. It is designed to prevent regressions, avoid schema/version drift, and keep docs and tooling aligned.

---

## 0) Purpose & Non-Negotiables

### What this repo is
A multi-tool ecosystem (Forge/Card Builder, Library, Deck Builder, Scenario Builder) that shares a single rules system and schemas.

### Non-negotiables (must hold after every change)
1. **Import/Export compatibility**: previously exported JSON must still import (or migrate cleanly).
2. **No silent schema drift**: if schema changes, update validators + types + docs + sample JSON + version notes.
3. **Registry parity**: any new step type/enum must be added to blockRegistry (so it does not become `UNKNOWN_STEP`).
4. **Validation parity**: schema validator rules must match gameplay constraints (not just shape-checks).
5. **Docs parity**: root markdown docs must always describe the current truth.

---

## 1) First Actions: Review Documentation & Build Context

### 1.1 Read ALL root docs (required)
Open and scan:
- `AI_JSON_GUIDE.md`
- `AI_VARIABLES.md`
- `AI_PLAY_GUIDE.md`
- `AI_SYMBOLS_WEBHOOKS.md`
- Any deck/scenario schema docs (e.g., `CJ-DECK-1.0` description files)
- Any `RELEASE_NOTES.md` or `CHANGELOG.md` (if present)

**Goal**: Identify what the system *claims* it supports vs what code *actually* supports.

### 1.2 Load the app and reproduce current behavior
- Run locally and confirm:
  - Card creation + editing
  - Import/export card JSON
  - Ability editing (profiles + nested steps)
  - Palette step list
  - Deck builder loads
  - Scenario builder loads
- Note the exact console errors and the exact validation errors.

---

## 2) Develop a Plan

### 2.1 Create a short plan (must include)
- **User story**: what capability is being added/fixed
- **Schema impact**: yes/no (and which versions affected)
- **Registry impact**: which steps/enums/uiFlows must be added
- **UI impact**: which screens/editors change
- **Validation impact**: which invariants need enforcement
- **Migration strategy**: if schema changes (CJ-1.1 → CJ-1.2), how imports are migrated

### 2.2 Critique your plan (must do)
Ask:
- Does this introduce new concepts that should be generalized (vs hardcoded)?
- Are we adding a one-off special case that should be a reusable “step” or “policy”?
- Can existing content import/export without manual editing?
- Are we duplicating logic (validator vs editor vs server rules)?
- Will future cards need a more generic design than we’re implementing?

---

## 3) Create/Update Functional Specifications

Before changing code, write or update a functional spec section in the relevant doc:
- For steps: update **Step Specs** in `AI_JSON_GUIDE.md`
- For variables/refs: update `AI_VARIABLES.md`
- For how it plays: update `AI_PLAY_GUIDE.md`
- For integrations (webhooks/AI): update `AI_SYMBOLS_WEBHOOKS.md`

Each feature spec must include:
- What the user does (inputs)
- What the system does (outputs/state changes)
- Edge cases
- Validation rules
- Import/export representation in JSON

---

## 4) Decide on Technical Design Changes

### 4.1 Schema versioning rules
- Schema changes must bump `schemaVersion` (e.g., CJ-1.1 → CJ-1.2).
- Add a **migration path**:
  - Import older schema
  - Transform to latest schema in memory
  - Export in latest schema

### 4.2 Where truth lives
- `src/lib/types.ts`: canonical TypeScript types
- `src/lib/schemas.ts`: runtime validation and invariants
- `src/assets/blockRegistry.json`: allowed steps/enums/ui flows & grouping for the UI
- `src/lib/registry.ts`: loader + helper functions (groups, isStepTypeAllowed)
- `src/App.tsx` and feature components: editors that must align with schema

**Never** add a step editor UI without updating:
- types.ts
- blockRegistry.json
- schemas.ts validation
- docs

---

## 5) Directory Structure Changes

Only change directories if it improves long-term clarity.

Guidelines:
- `src/features/<domain>/...` for large tool areas (decks, scenarios, library).
- `src/components/...` for reusable editors/widgets.
- `src/lib/...` for core shared logic (schemas, registry, storage, migrations, rules).
- `src/assets/...` for registry JSON, static templates, default catalogs.

If you move files:
- Update imports everywhere
- Update any doc that references paths
- Confirm build still works on GitHub Pages

---

## 6) Execute Code Changes (Implementation Phase)

### 6.1 Schema changes checklist
If you add or change schema:
- Update `src/lib/types.ts`
- Update `src/lib/schemas.ts` (validator + invariants)
- Update importer/exporter (usually in `App.tsx`, storage, migrations)
- Update sample JSON in docs
- Add migrations file(s): `src/lib/migrations.ts` (recommended)
- Update schema version rules everywhere that checks `schemaVersion`

### 6.2 Registry changes checklist
If you add a new step type or enum:
- Add it to `src/assets/blockRegistry.json`
- Ensure it appears in step groups (palette)
- Ensure dropdown enums exist in `keys.*` or other sections
- Ensure `isStepTypeAllowed()` recognizes it

### 6.3 UI changes checklist
- Add editor UI fields for new schema fields
- Avoid breaking selection behavior while editing (do not reset selection state)
- Keep the inspector readable (scrollable panes, fixed heights)
- Ensure new features are reachable from the tool navigation

---

## 7) Cross-Check All Related Files (Mandatory)

When any change is made, cross-check at least these:
- `types.ts` ↔ `schemas.ts` (shape and allowed values)
- `blockRegistry.json` ↔ `registry.ts` (allowed step types)
- `App.tsx` ↔ feature components (imports, route/mode selection)
- docs ↔ actual code behavior

**Rule**: If you add a thing in one place, it must exist in the other three:
1) Types  
2) Registry  
3) Validation  
4) Docs  

---

## 8) Validation & Testing Requirements

Minimum checks before finalizing:
- Import JSON created by older versions (CJ-1.0 / CJ-1.1) → should import and migrate (or show clear error).
- Export JSON → re-import it → should be identical or semantically equivalent.
- Add each new step from palette → no `UNKNOWN_STEP`.
- Validate that nested steps work (IF_ELSE, OPPONENT_SAVE, PROPERTY_CONTEST, REGISTER_INTERRUPTS).
- Deck/Scenario builders load without runtime errors and can save/export.

If GitHub Pages:
- Confirm build output includes updated `blockRegistry.json`
- Cache bust: change asset version / build hash as needed
- Hard-refresh test

---

## 9) Update Root Markdown Files (Required)

After code is correct, update:
- `AI_JSON_GUIDE.md`: new step types, example cards, import/export rules, migration notes.
- `AI_VARIABLES.md`: new refs, outputs (saveAs), target sets, states.
- `AI_PLAY_GUIDE.md`: how the feature behaves in both physical+digital and full digital modes.
- `AI_SYMBOLS_WEBHOOKS.md`: AI image generation, webhook payload shape, UI flows, subsystem triggers.

Docs must include:
- **Tables** of step types and fields
- **Examples** (minimal, standard, complex)
- **Edge cases** + how validation handles them

---

## 10) Release Version Notes (Required)

Create or update:
- `RELEASE_NOTES.md` (or `CHANGELOG.md`)

Template:

## CJ Forge Release X.Y.Z
**Date:** YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Schema
- Card schema: CJ-1.2 → CJ-1.3 (if changed)
- Migrations:
  - CJ-1.2 → CJ-1.3: <summary>

### Registry
- New steps:
  - ...

### Compatibility Notes
- Imports supported: CJ-1.0+ (migrates to latest)
- Breaking changes: none / list explicitly

### Known Issues
- ...

---

## 11) Definition of Done (DoD)

A change is only “done” when:
- App builds and runs (local + GH Pages if used)
- Import/export works for prior content
- No new `UNKNOWN_STEP` appears for valid steps
- Validation errors are accurate and actionable
- Docs updated and reflect current reality
- Release notes written

---

## 12) Optional: “Agent Self-Check” Questions

Before handing off:
- Did I add any new concept without making it generic?
- Did I update *every* place where schemaVersion is checked?
- Did I update block registry for each new step type?
- Are new fields editable in UI *and* validated?
- Could another agent generate valid JSON from the docs alone?

---
