<p align="center">
  <img src="vscode/media/icon.png" alt="Hesperus" width="128" height="128">
</p>

<h1 align="center">Hesperus</h1>

<p align="center">A read-only, zoomable graph of a codebase's structure, calls, and data flow, built by static analysis.</p>

Hesperus compiles source "up" into a graph an engineer can question: packages, files, types, and functions, with the calls and data flow between them. It is made for reviewing architecture, including AI-written code, without trusting an agent-drawn diagram.

- **Analysis only.** Nodes and edges come from the editor's language servers and tree-sitter. No model creates, removes, or reweights anything.
- **Honest about unknowns.** Every edge is `resolved`, `may` (dynamic dispatch, function values), or `unresolved` (reflection, injection). Unknowns are drawn, never dropped.
- **Zoomable.** Start from the whole repo. Expanding a box splits its edges in place; every rollup traces to the edges beneath it.
- **Per-language.** Each language is indexed separately through its editor extension; a missing one leaves that language's files as unindexed nodes and the rest still builds.
- **Read-only.** The only thing written to the analyzed repo is the `.hesperus/` cache.

## Languages

| Language | Editor extension |
| --- | --- |
| Go | Go (`golang.go`) |
| JavaScript, TypeScript | Built in |
| Rust | rust-analyzer (`rust-lang.rust-analyzer`) |
| C# | C# (`ms-dotnettools.csharp`) |
| C, C++ | C/C++ (`ms-vscode.cpptools`) |
| Dart, Flutter | Dart (`Dart-Code.dart-code`) |

Other languages are counted and not analyzed.

## VS Code extension

Click the Hesperus icon in the activity bar. On first use it detects languages, asks each language's editor extension for symbols and references (offering to install a missing one), builds the graph into `.hesperus/` (untracked, safe to delete), and opens the graph.

- Scroll to zoom, drag to pan. Click a box to expand it.
- Cmd/Ctrl-click or double-click opens the source.
- Hover to focus a box's connections or see the counts behind an edge.
- The sidebar shows status, finds nodes by name, filters calls, data flow, overrides, and state transitions, lists the state machines found, and re-indexes.

A stale cache (new commit, lockfile, or tool version) fails loudly, then re-indexes.

## Layout

| Path | Contents |
| --- | --- |
| `vscode/src/core` | IR, graph building, aggregation, cache, canonical serialization |
| `vscode/src/lang` | tree-sitter syntax facts and editor extension per language |
| `vscode/src/editor.ts` | reads symbols and references from the editor's language servers |
| `vscode/src/extension.ts`, `layout.ts` | webview extension; deterministic ELK layout |
| `vscode/schema/graph.schema.json` | versioned graph schema |

TypeScript on Node, one npm package, no native code (tree-sitter runs as WebAssembly). See [CLAUDE.md](CLAUDE.md) for invariants and design.

## Development

```
cd vscode && npm ci && npm run build
npm test                 # build plus a short smoke test
```

## License

Apache-2.0.
