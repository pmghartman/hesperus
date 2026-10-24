# hesperus
A graph view of your repo.

Compiles source into a zoomable graph of structure and data flow, from analysis only (SCIP + tree-sitter). See `CLAUDE.md` for invariants.

All TypeScript on Node, in one npm package under `vscode/`; tree-sitter runs as WebAssembly, so nothing is native.

- `vscode/src/core`: IR, SCIP ingestion, aggregation, cache, canonical serialization.
- `vscode/src/lang`: tree-sitter syntax facts (calls, parameters) for Go and JavaScript/TypeScript.
- `vscode/src/cli.ts`: `hesperus index|tools|status|graph|view|schema`; also the test harness.
- `vscode/src/extension.ts`: webview extension; layout via ELK.
- `skill`: agent skill for reading the graph.
- `vscode/schema/graph.schema.json`, `fixtures/`.

```
cd vscode && npm ci && npm run build
node vscode/out/cli.js index <repo>                 # runs each detected language's pinned indexer
node vscode/out/cli.js view <repo> --expand pkg:...
```

Tests: `cd vscode && npm test` (determinism, golden snapshots, extension). `UPDATE_GOLDEN=1 npm test` refreshes snapshots.

Dev (macOS): `scripts/dev.sh` builds everything, makes a QA repo at `~/hesperus-qa`, and opens VS Code with the extension. Also `build`, `test`, `qa`.
