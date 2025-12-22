# RELEASE_NOTES

## Phase A2 Config Editor + Dynamic Pins (2025-12-22)
### Added
- Schema-driven node inspector renders Config/Pins/Node JSON tabs, generating fields from `configSchema` (string/number/integer/boolean/enum) and keeping selection stable while editing.
- Dynamic pins now re-materialize live when config changes (e.g., IF `elseIfCount`), caching pin ids on each node for debugging and export.
- Edge reconciliation removes edges that reference pins removed by config changes to prevent dangling handles.
### Changed
- Graph canvas state now uses controlled React Flow nodes/edges with selection mirrored into node objects to avoid deselection during edits.
- Project export/import round-trips the new `pinsCache` field on nodes for faster diagnostics.
### Known Missing / Not Yet Implemented
- Typed edge validation and multiplicity enforcement beyond control-out degree will land in Phase A3 alongside compiler enhancements.

## Phase A1 Kickoff (2025-12-22)
- Started Phase A1 to rebuild the graph palette around `src/assets/nodeRegistry.json` with generic rendering. This entry documents the planned scope for registry-driven nodes before wiring additional phases.

## Phase A1 Progress (2025-12-22)
### Added
- Registry-driven palette copy now highlights `CJ-NODEDEF-1.0`, and the generic node renderer resolves definitions + pins directly from `nodeRegistry.json`.
- Registry helpers expose deterministic pin materialization with duplicate checks and default config resolution for new graph nodes.

### Changed
- React Flow adapters now map CJ-GRAPH-1.0 graph nodes/edges into canvas nodes using `nodeType` + `config` payloads so rendering stays registry-driven.
- Unknown or invalid node types render an explicit error state on the canvas to surface registry drift early.

### Known Missing / Not Yet Implemented
- Config form auto-generation beyond the existing MVP, compiler/validation expansions, and stricter edge enforcement remain out of scope for this A1 slice.
- Graph editor state remains in-memory (export a project to preserve work across refreshes until persistence lands).

### Checkpoint Outcomes
- Checkpoint 0 (pre-flight installs): `npm ci` / `npm install` attempted but blocked by upstream 403 responses in this environment.
- Checkpoints A1-1 & A1-2: `nodeRegistry.json` present with EXEC_START, SHOW_TEXT, IF, CONST_BOOL, CONST_NUMBER and parses cleanly.
- Checkpoints A1-3 through A1-6: Palette is fully registry-driven, generic renderer shows grouped pins (including IF dynamic pins), and drag/add flows keep Graph IR state updated while handling unknown node types visibly.

## Phase A1 Polish (2025-12-22)
### Added
- Palette grouping now sorts categories and node labels alphabetically for deterministic presentation across sessions.
- Generic GraphNode renderer is documented inline to clarify required `data` payloads and its registry-driven error handling.

### Changed
- Root docs clarified the JSON-first palette contract, Graph IR storage notes, and the A1 in-memory persistence expectations.

### Checkpoint Outcomes
- Build/dev commands (`npm run dev`, `npm run build`) remain blocked without `node_modules` because registry access to `@types/react` returns HTTP 403 in this environment.
