# Hesperus

A read-only map of a codebase for reviewing its architecture. Hesperus compiles the code "up" into a zoomable graph of packages, files, types, and functions, with the calls and data flow between them.

Every node and edge comes from static analysis ([SCIP](https://github.com/sourcegraph/scip) indexers plus tree-sitter). No model creates, removes, or reweights anything. Edges carry their certainty: **resolved**, **may** (dynamic dispatch), or **unresolved**, and unknowns are drawn, never dropped.

## Use

Click the Hesperus icon in the activity bar. The first time, Hesperus:

1. detects the languages in the workspace,
2. downloads the pinned indexer for each into the extension's own storage,
3. indexes the repo into an untracked `.hesperus/` cache (safe to delete),
4. opens the graph in an editor tab.

The graph tab:

- Scroll to zoom, drag to pan. The view refits when the panel resizes.
- Click a box to expand it. Cmd/Ctrl-click or double-click opens its source.
- Hover a box to focus on its connections, or an edge to see the counts behind it.

The sidebar shows status and errors, finds nodes by name, toggles calls, data flow, overrides, and state transitions, lists the state machines found, and re-indexes.

## Languages

| Language | Indexer | Needs on your machine |
| --- | --- | --- |
| Go | scip-go 0.2.9 | Go toolchain |
| JavaScript, TypeScript | scip-typescript 0.5.2 | Node.js 22.13+ with npm |
| Rust | rust-analyzer 2026-10-19 (`scip`) | Rust toolchain (`cargo`) |
| C# | scip-dotnet 0.2.16 | .NET SDK |
| C, C++ | scip-clang v0.4.1 | A C/C++ compiler; `compile_commands.json` for non-trivial builds. macOS arm64 and Linux x64 only |
| Dart, Flutter | scip_dart 1.8.1 | Dart SDK (Flutter's for Flutter packages) |

Files in other languages are counted in the sidebar and not analyzed.

## Guarantees

- **Read-only.** Hesperus writes only its `.hesperus/` cache in the analyzed repo.
- **Deterministic.** Same commit and same indexer versions give byte-identical output.
- **Stale caches fail loudly.** A new commit, lockfile, or tool version re-indexes, and the sidebar says why.
