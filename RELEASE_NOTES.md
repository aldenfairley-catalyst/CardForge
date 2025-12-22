# RELEASE_NOTES

# RELEASE_NOTES

# Phase A2 Config Editor + Dynamic Pins (refresh 2025-12-30)
### Added
- `NodeConfigForm` now renders a generic schema-driven form (string/number/integer/boolean/enum) with required warnings so IF `elseIfCount` appears as an integer input without bespoke wiring.
- Config edits recompute dynamic pins, refresh each node’s `pinsCache`, and run `reconcileEdgesForPinRemoval` to drop edges that referenced removed handles.
- Inspector tabs keep selection stable while editing and expose debug panels for `materializePins` output and the raw node `data` JSON to speed up troubleshooting.

### Changed
- Graph canvas relies on controlled React Flow state (`useNodesState`/`useEdgesState` + `selectedNodeId` from `onSelectionChange`) and updates only the edited node, preventing deselection flicker while typing.

## Phase A2 Config Editor + Dynamic Pins (refresh 2025-12-28)
### Added
- Shared config schema helpers (`src/lib/nodes/configSchema.ts`) now power the inspector’s default merging, coercion, and validation so every registry field uses the same clamping/required logic.
- Documentation clarifies the A2-supported configSchema facets (string/number/integer/boolean/enum with title/description/default/min/max) and calls out that deeper object/array/oneOf structures remain outside the current form generator.

### Changed
- Inspector messaging and docs reiterate that the Node JSON tab is the fallback for unsupported schema shapes while keeping selection stable during edits.

## Phase A3 Typed Connections + Edge Rules (refresh 2025-12-27)
### Added
- React Flow `onConnect` now funnels every new edge through `validateConnect`, returning clear toasts for kind/direction mismatches, data type errors, multiplicity caps, duplicates, and CONTROL cycle attempts while preserving the current selection.
- DATA edges inherit `dataType` into Graph IR and React Flow labels for quick scanning; handle badges show `multi`/`max` hints so designers can see fan-in policy without opening the registry JSON.
- Edge rules are documented across `CJ_GRAPH_SPEC.md` and `AI_JSON_GUIDE.md`, including the default `graphVersion = "CJ-GRAPH-1.1"` and the new edge metadata (`edgeKind`, `dataType?`, `createdAt?`) expected in exports.
- Additional edgeRule tests cover `multi:true` fan-in and explicit `maxConnections` caps to guard against regressions.

### Changed
- Dynamic pin materialization now carries `multi`, `maxConnections`, and optional metadata from templates so ELSEIF branches can opt into richer connection policies as the registry evolves.

### Known Missing / Not Yet Implemented
- Data-edge cycle detection and richer type lattices (e.g., integer subtypes) remain out of scope for this refresh; compiler coverage is still scoped to the MVP node set.

## Phase A1 Registry Palette Stabilization (2025-12-23)
### Added
- React Flow adapters (`src/lib/graphIR/adapters.ts`) map CJ-GRAPH-1.x nodes/edges to canvas shapes while preserving registry-driven `data` payloads and cached pin ids, keeping the palette renderer generic.
- Graph schema now accepts `graphVersion` `"CJ-GRAPH-1.0"` (A1 baseline) or `"CJ-GRAPH-1.1"` (typed edge metadata), warning on older versions instead of hard-failing validation to keep legacy exports loadable.
- Documentation refreshed across `CJ_GRAPH_SPEC.md`, `AI_JSON_GUIDE.md`, and `AI_PLAY_GUIDE.md` to reiterate that the palette is JSON-first and Graph IR remains editor-only in A1.

### Changed
- `tsconfig.json` switches `moduleResolution` to `NodeNext` so `npm run typecheck` resolves React/ReactFlow types consistently in CI runners that struggled with the `Bundler` mode.
- Graph/react-flow adapters are now used inside `App.tsx` so new nodes prime their `pinsCache` from the registry and edges reuse a single conversion path for styling and persistence.

### Known Missing / Not Yet Implemented
- Compiler/output validation expansions, schema-driven config editing beyond the existing inspector, and persistence beyond in-memory graphs remain future work.

### Checkpoint Outcomes
- Checkpoint 0 pre-flight installs attempted (`npm ci` / `npm install`) but blocked by upstream 403s when fetching `@types/react` in this environment.
- Checkpoints A1-1 through A1-4 continue to pass: registry lists the MVP nodes, palette renders from JSON categories, the generic renderer shows grouped pins (including IF dynamic pins), and drag/add flows update Graph IR state while flagging unknown node types visibly.

## Phase A3 Typed Connections + Edge Rules (2025-12-22)
### Added
- Graph IR bumped to **CJ-GRAPH-1.1** with edge metadata (`edgeKind`, optional `dataType`, `createdAt`) persisted through project exports.
- Connection guardrail helper `validateConnect` enforces pin kind/direction, dataType compatibility, multiplicity (`multi`/`maxConnections`), duplicate prevention, and CONTROL cycle detection with clearer error messaging (pin ids, direction details).
- React Flow onConnect now uses the validator and surfaces specific error toasts; control vs data edges render with distinct stroke styles while preserving selection. Handles and badges differentiate CONTROL vs DATA pins inline.
- Inspector panels list incoming/outgoing edges with kind + dataType context to speed up debugging; new tests cover direction errors, missing pins, multiplicity, and cycle prevention.
- Documentation updated (`CJ_GRAPH_SPEC.md`, `AI_JSON_GUIDE.md`) to spell out typed connection rules, multiplicity defaults, and cycle policies for agents.

### Changed
- Graph export/import paths carry edge dataType/create timestamps, and React Flow adapters set styling based on edge kind for visual clarity. DATA compatibility now treats absent `dataType` as `any` without extra wildcards.

### Known Missing / Not Yet Implemented
- Broader dataType lattice (e.g., integer subtype) and optional DATA cycles are out of scope for A3; compiler still covers the existing MVP nodes only.

## Phase A2 Config Editor + Dynamic Pins (2025-12-22)
### Added
- Schema-driven node inspector renders Config/Pins/Node JSON tabs, generating fields from `configSchema` (string/number/integer/boolean/enum) and keeping selection stable while editing.
- Dynamic pins now re-materialize live when config changes (e.g., IF `elseIfCount`), caching pin ids on each node for debugging and export.
- Edge reconciliation removes edges that reference pins removed by config changes to prevent dangling handles.
- Docs now spell out schema-driven config expectations, pin caching, and how graphs encode config/pinsCache for AI authors.
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
