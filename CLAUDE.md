# Hesperus

Provisional name. Keep it in one constant per package so a rename is cheap.

## What this is

A read-only code comprehension tool, delivered as a VS Code extension. It compiles source "up" into a zoomable graph of structure and data flow, so an expert engineer can question architecture and design. The graph is a source of truth. It comes from analysis of the code, never from a model.

Target user: an engineer reviewing architecture, often of AI-written code, who distrusts agent-drawn diagrams.

## Invariants (never violate)

1. **Deterministic given the same language-server answers.** Core output is canonical: sort every record (qualified symbol, then repo-relative path, then position); no timestamps, absolute paths, hash-map iteration order, or thread-order dependence. Symbols and references come from the editor's language servers, so output can differ between machines with different servers or versions; the header records `editor-lsp`.
2. **Edges come from analysis only.** No model creates, removes, or reweights a node or edge.
3. **Every edge carries provenance:** `resolved`, `may`, or `unresolved`. Unknowns are shown, never dropped or guessed. Reflection, DI, dynamic dispatch, and callbacks leave stubs marked `unresolved`.
4. **Labels are layered.** The base layer is deterministic (names, signatures, doc comments). Agent labels live in a separate layer with provenance and never overwrite the base.
5. **Read-only toward the analyzed repo.** Only the cache is written.
6. **Core imports nothing from `vscode`.** Only `editor.ts` and `extension.ts` touch the editor API. No model, no network. The SCIP indexers and the CLI are removed; the extension is the product.
7. **No framework pattern catalogs.** Entry points are functions with no in-repo callers. External sinks are calls that resolve outside the repo, labeled by package. Do not add per-framework knowledge.

## Architecture

- TypeScript on Node, one npm package in `vscode/`. No native code; tree-sitter runs as WebAssembly.
- `vscode/src/core`: owns the IR, graph building, aggregation, cache, and canonical serialization. Imports nothing from `vscode` or `src/lang`. `core/scip.ts` holds the SCIP data model the builder reads (types and symbol grammar only; no SCIP indexers or decoder). `core/bridge.ts` turns document symbols and find-references answers into that model.
- `vscode/src/engine.ts`: frontend registry, repo scan, per-language results to graph, cache state. Called in-process by the extension.
- `vscode/src/editor.ts`: reads symbols and references from the editor's language servers (`vscode.executeDocumentSymbolProvider`, `executeReferenceProvider`) and offers to install a missing language extension.
- Language frontends (`vscode/src/lang`) supply tree-sitter syntax for calls and def-use inside bodies and name the editor extension that resolves the language. Implemented: Go, JavaScript/TypeScript, Rust, C#, C/C++, Dart/Flutter, Python, Java, Kotlin, PHP, Ruby. Extension ids: `golang.go`, built-in TypeScript, `rust-lang.rust-analyzer`, `ms-dotnettools.csharp`, `ms-vscode.cpptools`, `Dart-Code.dart-code`, `ms-python.python`, `redhat.java`, `fwcd.kotlin`, `bmewburn.vscode-intelephense-client`, `Shopify.ruby-lsp`. State machines from equality guards in all; `switch`/`when` only in Java and Kotlin. Kotlin's wasm comes from `tree-sitter-wasms` (npm ships none); Swift's build ran out of memory when parsing, so Swift is generic only.
- Generic fallback: files no frontend owns (minus a data/markup/binary extension list) are tried per extension through the editor's language server, accepted only if it finds functions or types. They have no syntax facts, so there are no call sites: a reference to an in-repo callable from inside another callable is a `may` edge (`generic` flag in `core/build.ts`). A failed generic extension is left out, not shown as unindexed.
- Each language is indexed on its own. One that fails (extension missing or declined, server silent) becomes unindexed file nodes (`unindexed` on the node, `doc` says why); the rest of the repo still builds. The sidebar toggles them and offers the install.
- Extension (`vscode/src/extension.ts`, `layout.ts`, `media/`): activity-bar sidebar plus a graph webview tab. Layout is precomputed deterministically with ELK. Cmd/Ctrl-click or double-click opens a node's source range.
- CI: `.github/workflows/release.yml` builds, runs `scripts/smoke.js`, builds one VSIX, publishes to the Marketplace, tags the release. Version lives in tags only.

The analyzed language is independent of the implementation language. Many OOP languages and many repos must work. Any single repo, including phosphorus (Go and JS), is only a fixture. No language-specific logic in core.

## Graph model

- Hierarchy is containment, taken from code structure: repo, directory, package or module, file, class, method. A directory with one child folds into its parent. Stable node IDs are fully qualified symbols. Content hashes mark staleness only.
- The graph is not a DAG. Store cycles as cycles. SCC collapse is a view option.
- Unindexed files are file nodes with `unindexed: true`: no definitions or edges inside, drawn dashed, hidden by a view option (`withoutUnindexed` in `core/aggregate.ts`).
- Edge kinds: `contains`, `call`, `override`, `flow`, `transition` (`EDGE_KINDS` in `core/ir.ts`). Flow edges bind arguments to parameters and returns to assignments across call edges.
- State machines (`core/states.ts`): a field, variable, or local tested for equality against a constant and assigned two or more constants by statements. A local machine is a `variable` node `local:<function>:<name>` inside its function, with no flow edges; local constants (`const` declarations) can be its states. Its `state` children are those constants; `transition` edges run from the guarded state to the assigned one. Unguarded writes start at `any` (`may`); non-constant values end at `?` (`unresolved`).
- Container edges are weighted rollups of the underlying edges. Expanding a node splits its edges in place. Every rollup is inspectable down to the edges beneath it. Aggregation rules live once in core and every consumer shares them.
- Async, futures, and callbacks resolve through types where possible. Function values passed as arguments are flow, and calls through them get `may` edges.
- Initial view is the whole repo flow graph. Zooming refines nodes and edges. Terminal nodes are the definitions in source.
- The default view is the logic view: files are passed through, so packages and directories are boundaries around types and functions (`passThrough` in `core/aggregate.ts`; the sidebar's Files box and `view --files` draw them). Views also pass through a directory, package, or file that is its parent's only child. Top-level nodes are always drawn. The first view opens whole levels while it stays within `OVERVIEW_NODES` (`overview`). Rollups to nodes outside the repo are drawn as a named line on the calling box, not routed wires; the sidebar can drop them (`withoutExternal`).
- Semantic zoom (webview): zooming in opens the box under the cursor once it is large on screen; zooming out closes containers that have shrunk. Wires are routed orthogonally by ELK.

## Cache

`.hesperus/` in the analyzed repo: untracked, a cache, safe to delete. `header.json` records tool version, schema version, indexer (`editor-lsp`), lockfile hash, and commit. A mismatch fails loudly with an explanation and never reuses silently. Sharded per package under `shards/` so the viewer loads subtrees lazily. The graph is cache only; no committed graph file.

## Determinism rules for code you write

- Never let `Map`, `Set`, or object insertion order reach output unless it was inserted sorted. Sort with `cmpStr` (code point order, as UTF-8 bytes), never `<` or `localeCompare`.
- Build output records with the constructors in `core/ir.ts`; key order is serialization order.
- Servers answer asynchronously. Wait for indexing to finish, collect, then sort.
- Normalize paths to repo-relative with forward slashes.

## Conventions

- Schema first. The IR is a versioned schema (`vscode/schema/graph.schema.json`) mirrored by `core/ir.ts`. Change both deliberately.
- Tests were removed on purpose. CI runs one short smoke test (`vscode/scripts/smoke.js`): `cd vscode && npm test` builds and runs it.
- Few dependencies. Justify each. No native modules.
- Match existing project conventions once they exist.
- Comment only where the reason is non-obvious. Two lines max, fragments.
- Do not report work as done until `npm test` (build plus smoke) has passed. State what ran, and say what was not exercised in a real editor.

## Git

Never create, switch, rename, or delete a branch, and never commit, push, open or update a PR, or merge, unless I request that exact action. In cloud sessions, work on main.

## Decided

- Cache only, no committed graph file.
- Name stays Hesperus, one constant (`TOOL_NAME` in `core/ir.ts`), until renamed.
- Flow edges bind arguments to parameters, returns (`return`), and function values (`fn:`).
- Flow granularity is the field: `write` and `read` flow edges per field or variable, and a parameter written to a field carries the constant arguments of its resolved call sites (one hop).

## Ask before deciding

These are open. Ask one question if a wrong guess is costly. Otherwise state the assumption in one line.

- Which languages come next.

## Non-goals

- Editing the diagram to regenerate code.
- Agent-drawn or Mermaid diagrams as a source of truth.
- Framework-aware heuristics.
- Runtime tracing.
