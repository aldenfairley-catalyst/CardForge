# Deprecation Grep Patterns & Leak Gates
Use these commands to find deprecated schema/graph info leaking into runtime/editor/export paths.

## 1) Find deprecated schema versions (cards/graphs/projects)
```bash
rg -n '"CJ-1\.' .
rg -n '"CJ-GRAPH-1\.' .
rg -n '"CJ-FORGE-PROJECT-1\.' .
```

## 2) Find hardcoded version strings anywhere (should be rare)
```bash
rg -n 'schemaVersion"\s*:\s*"' src server tests .
rg -n 'CJ-[0-9]+' src server
```

## 3) Find legacy graph system references
```bash
rg -n 'nodeRegistry\.json|graphSchema\.json|canonicalToGraph|graphIR|validateGraph|compileGraph' src
```

## 4) Ensure deprecated strings only appear where allowed
Allowed locations:
- migration modules (e.g. `src/lib/migrations*`)
- `tests/fixtures/**`
- `docs/archive/**`

Example:
```bash
rg -n '"CJ-1\.' src server | rg -v 'migrations|tests/fixtures|docs/archive' && echo "LEAK FOUND"
```

## 5) Export gates (must be latest-only)
After building, run:
```bash
npm run typecheck
npm test
npm run build
```

Agent should add/extend tests:
- `tests/deprecationLeaks.spec.ts`
- `tests/exportLatest.spec.ts`
- `tests/migrationsRoundtrip.spec.ts`
