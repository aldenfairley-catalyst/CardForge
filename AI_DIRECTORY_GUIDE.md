# AI_DIRECTORY_GUIDE.md
Version: CJ Docs 1.2 (AI-first, comprehensive) • Updated: 2025-12-20

This is meant to help AI agents modify the codebase safely.

## High-level architecture
- **Forge** (this app): authoring tool for cards/decks/scenarios.
- **Arbiter** (future): authoritative rules engine for full digital mode.
- **Hybrid mode**: Forge can act as the rules assistant while humans enforce board legality.

## Directories
### /src
- `App.tsx`: top-level navigation + Forge UI
- `components/*`: editors (ExpressionEditor, ConditionEditor, CardPreview, targeting tools)
- `features/library/*`: Catalog + card library manager
- `features/decks/*`: Deck builder UI + deck JSON persistence
- `features/scenarios/*`: Scenario builder UI + scenario JSON persistence
- `lib/types.ts`: TypeScript schema types (cards/decks/scenarios/steps)
- `lib/schemas.ts`: Zod schemas + invariant checks
- `lib/migrations.ts`: schema migrations (CJ-1.0/1.1 -> CJ-1.2)
- `lib/graph.ts`: canonical card → ReactFlow graph nodes/edges
- `lib/storage.ts`: local persistence of cards/projects
- `lib/repository.ts`: action library repository (save/load/export/relink)

### /src/assets
- `blockRegistry.json`: authoritative step/type lists, key enums, UI flows

### /public
- `/cards/*`: images referenced by `visuals.cardImage`

## Migration policy
- Never delete fields abruptly.
- Add fields as optional; write migration that fills defaults.
- Keep schemas `.passthrough()` at top-level; validate critical invariants separately.

