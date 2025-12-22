# CJ Graph Spec (CJ-GRAPH-1.0)

Version: MVP (EXEC_START, SHOW_TEXT, IF/ELSEIF/ELSE, CONST_BOOL, CONST_NUMBER)

## Formats
- **Forge Project:** `schemaVersion = "CJ-FORGE-PROJECT-1.0"` containing `card`, `graphs`, and `ui` metadata.
- **Graph:** `graphVersion = "CJ-GRAPH-1.0"` with `nodes[]` + `edges[]`.
- **Node registry:** `src/assets/nodeRegistry.json` is the JSON-first source of truth (labels, pins, configSchema, compile hints).

## Control flow rules
- CONTROL vs DATA pins are enforced at edge creation.
- Each CONTROL **output pin** may have at most one outgoing edge (branching nodes expose multiple output pins instead).
- Cycles in CONTROL edges are invalid.
- `EXEC_START.execOut` must connect to at least one downstream control input.

## Compile mapping (MVP)
- `EXEC_START` → subgraph entry (no step emitted).
- `SHOW_TEXT` → `{ "type": "SHOW_TEXT", "text": node.config.text }`
- `CONST_BOOL` → condition AST `{ "type": "CONST_BOOL", "value": config.value }`
- `CONST_NUMBER` → expression AST `{ "type": "CONST_NUMBER", "value": config.value }`
- `IF` → `IF_ELSE` canonical step with:
  - `condition` from `ifCondIn` DATA edge
  - `then` branch from `thenExecOut`
  - `elseIf[]` pairs from dynamic `elseIfCondIn_{i}` + `elseIfExecOut_{i}`
  - `else` branch from `elseExecOut`

## Validation highlights
- Unknown node types and missing required pins are errors.
- DATA pins must match dataType; CONTROL pins must only connect CONTROL→CONTROL.
- Exec reachability is checked from `EXEC_START`; unreachable nodes are warned.
- Multiple CONTROL edges from the same output pin produce `MULTIPLE_EXEC_OUT` errors.
- Cycles raise `CONTROL_CYCLE` errors.

## Round-trip expectations
- Export/import of Forge Project JSON must preserve node positions and config.
- Compile is debounced in-app; invalid graphs keep the last known good `execution.steps[]`.
