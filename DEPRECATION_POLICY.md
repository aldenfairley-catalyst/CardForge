# Deprecation Policy
Captain Jawa Forge — Schema/Graph Deprecation & Compatibility Rules  
Version: 1.0  
Owner: Repo Maintainers  
Last updated: (fill in)

## 1) Purpose
This document defines:
- Which schema versions are **authoring/export** targets (the “clear slate”).
- Which schema versions are **import-only** (supported only through migrations).
- Which schema versions are **rejected**.
- The non-negotiable rule: **No deprecated schema is ever stored internally after load/import**.

## 2) Source of Truth
All version constants and compatibility decisions live in **one module**:

- `src/lib/versions.ts` (create if missing)

No other file is allowed to hardcode schema version strings except:
- migration fixtures under `tests/fixtures/`
- archived docs under `docs/archive/`

## 3) “Clear slate” versions (authoring/export targets)
Fill these in once you decide naming:

- Card: `CJ-2.0`
- Graph: `CJ-GRAPH-2.0`
- Forge Project: `CJ-FORGE-PROJECT-2.0`
- Tools: `CJ-TOOLS-1.0`
- Deck: `CJ-DECK-1.0` (unchanged unless you bump)
- Scenario: `CJ-SCENARIO-1.0` (unchanged unless you bump)

These are the only versions:
- created by “New …” buttons
- saved to storage/db by default
- produced by export actions
- returned by the API as “latest”

## 4) Import-only versions (migrate immediately)
These versions are accepted **only** at import/load boundaries and are migrated to latest:

- Cards: `CJ-1.0`, `CJ-1.1`, `CJ-1.2`, `CJ-1.x` (as implemented)
- Graphs: `CJ-GRAPH-1.0`, `CJ-GRAPH-1.1` (as implemented)
- Forge projects: prior `CJ-FORGE-PROJECT-1.x` (as implemented)

### Mandatory behavior
If an imported object is not already latest:
1) Parse (permissive)
2) Migrate → latest
3) Validate (strict latest)
4) Persist only latest

## 5) Hard rejected
Any object with:
- unknown schemaVersion
- missing schemaVersion
- schemaVersion not listed in §3 or §4

must be rejected with an explicit error:
- `SCHEMA_VERSION_UNSUPPORTED`

## 6) Validation boundaries
Implement two validators per entity:
- `validateImportX(any)` — permissive enough to parse old shapes
- `validateLatestX(latest)` — strict

Runtime/editor logic must only accept **latest** types internally.

## 7) Storage/DB rule
Internal storage must never retain deprecated versions.
After any successful import/load, the store is rewritten as latest.

Provide an “Archive & Reset” UI action:
- exports full store to a zip/json bundle
- clears store
- recreates blank latest store

## 8) CI “Deprecation gates”
CI must fail if deprecated versions leak into non-archive code.
Add tests:
- grep gate: deprecated strings appear only in migrators/fixtures/archive
- export gate: export outputs only latest schema versions
- roundtrip gate: import old → migrate → export latest

## 9) Removing import support (optional schedule)
Once stable, the project may remove import support for older versions.
When that happens:
- remove migrator code paths
- keep archived docs + fixtures (or archive them)
- bump this policy and add release notes
