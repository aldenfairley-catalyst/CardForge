# RELEASE_NOTES

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
