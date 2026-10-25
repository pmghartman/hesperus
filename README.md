<p align="center">
  <img src="vscode/media/icon.png" alt="Hesperus" width="128" height="128">
</p>

<h1 align="center">Hesperus</h1>

<p align="center">A read-only, zoomable graph of a codebase's structure, calls, and data flow, built by static analysis.</p>

Hesperus compiles source "up" into a graph an engineer can question: packages, files, types, and functions, with the calls and data flow between them. It is made for reviewing architecture, including AI-written code, without trusting an agent-drawn diagram.

- **Analysis only.** Nodes and edges come from [SCIP](https://github.com/sourcegraph/scip) indexers and tree-sitter. No model creates, removes, or reweights anything.
- **Honest about unknowns.** Every edge is `resolved`, `may` (dynamic dispatch, function values), or `unresolved` (reflection, injection). Unknowns are drawn, never dropped.
- **Zoomable.** Start from the whole repo. Expanding a box splits its edges in place; every rollup traces to the edges beneath it.
- **Deterministic.** The same commit and pinned toolchain give byte-identical output.
- **Read-only.** The only thing written to the analyzed repo is the `.hesperus/` cache.

## Languages

| Language | Indexer | Requires |
| --- | --- | --- |
| Go | scip-go 0.2.9 | Go toolchain |
| JavaScript, TypeScript | scip-typescript 0.5.2 | Node.js 22.13+ with npm |

Other languages are counted and not analyzed.

## VS Code extension

Click the Hesperus icon in the activity bar. On first use it detects languages, downloads the pinned indexers into the extension's storage, indexes the repo into `.hesperus/` (untracked, safe to delete), and opens the graph.

- Scroll to zoom, drag to pan. Click a box to expand it.
- Cmd/Ctrl-click or double-click opens the source.
- Hover to focus a box's connections or see the counts behind an edge.
- The sidebar shows status, finds nodes by name, filters calls, data flow, overrides, and state transitions, lists the state machines found, and re-indexes.

A stale cache (new commit, lockfile, or tool version) fails loudly, then re-indexes.

## CLI

The extension's `hesperus` CLI runs with no editor, agent, or network access (the extension downloads indexers).

```
hesperus index  <repo>                     # run each detected language's indexer
hesperus status <repo>                     # cache state: ready, stale, or missing
hesperus graph  <repo>                     # canonical graph JSON
hesperus view   <repo> [--expand <id>]...  # rollups for an expansion state
hesperus tools  <repo>                     # languages found and indexers needed
hesperus schema                            # graph JSON schema
```

`skill/SKILL.md` lets coding agents read the graph the same way.

## Layout

| Path | Contents |
| --- | --- |
| `vscode/src/core` | IR, SCIP ingestion, aggregation, cache, canonical serialization |
| `vscode/src/lang` | tree-sitter syntax facts for Go and JavaScript/TypeScript |
| `vscode/src/cli.ts` | CLI; doubles as the test harness |
| `vscode/src/extension.ts`, `layout.ts` | webview extension; deterministic ELK layout |
| `vscode/schema/graph.schema.json` | versioned graph schema |
| `fixtures/` | small Go and JS repos with committed SCIP indexes |

TypeScript on Node, one npm package, no native code (tree-sitter runs as WebAssembly). See [CLAUDE.md](CLAUDE.md) for invariants and design.

## Development

```
cd vscode && npm ci && npm run build
npm test                 # determinism, golden snapshots, extension; UPDATE_GOLDEN=1 refreshes snapshots
scripts/dev.sh           # macOS: build, make a QA repo at ~/hesperus-qa, open VS Code with the extension
```

## License

Apache-2.0.
