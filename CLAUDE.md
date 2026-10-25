# Hesperus

Provisional name. Keep it in one constant per package so a rename is cheap.

## What this is

A read-only code comprehension tool. It compiles source "up" into a zoomable graph of structure and data flow, so an expert engineer can question architecture and design. The graph is a source of truth. It comes from analysis of the code, never from a model.

Target user: an engineer reviewing architecture, often of AI-written code, who distrusts agent-drawn diagrams.

## Invariants (never violate)

1. **Deterministic.** Same repo, same commit, same pinned toolchain gives byte-identical output on any machine. Sort every output canonically (qualified symbol, then repo-relative path, then position). No timestamps, absolute paths, hash-map iteration order, or thread-order dependence in output.
2. **Edges come from analysis only.** No model creates, removes, or reweights a node or edge.
3. **Every edge carries provenance:** `resolved`, `may`, or `unresolved`. Unknowns are shown, never dropped or guessed. Reflection, DI, dynamic dispatch, and callbacks leave stubs marked `unresolved`.
4. **Labels are layered.** The base layer is deterministic (names, signatures, doc comments). Agent labels live in a separate layer with provenance and never overwrite the base.
5. **Read-only toward the analyzed repo.** Only the cache is written.
6. **Core runs with no agent, no network, no editor.** The extension and agent skill are consumers of the graph file.
7. **No framework pattern catalogs.** Entry points are functions with no in-repo callers. External sinks are calls that resolve outside the repo, labeled by package. Do not add per-framework knowledge.

## Architecture

- TypeScript on Node, one npm package in `vscode/`. No native code; tree-sitter runs as WebAssembly.
- `vscode/src/core`: owns the IR, merging, aggregation, cache, and canonical serialization. Imports nothing from `vscode` or `src/lang`.
- `vscode/src/cli.ts`: thin wrapper over core (`hesperus`). Doubles as the test harness. The extension runs it on the editor's own Node.
- `vscode/src/engine.ts`, `tools.ts`: orchestration. `tools.ts` downloads the pinned SCIP indexers; the CLI itself never touches the network.
- Language frontends (`vscode/src/lang`) emit the IR. Implemented: Go and JavaScript/TypeScript.
  - SCIP indexer output is the symbol resolver (scip-go 0.2.9, scip-typescript 0.5.2).
  - tree-sitter (`lang/treesitter.ts`) supplies syntax for calls and def-use inside bodies, resolved through SCIP definitions.
  - Planned, not built: headless LSP fallback where no SCIP indexer exists; native per-language analyzers as optional frontends.
- Extension (`vscode/src/extension.ts`, `layout.ts`, `media/`): activity-bar sidebar plus a graph webview tab. Layout is precomputed deterministically with ELK. Cmd/Ctrl-click or double-click opens a node's source range.
- `skill/SKILL.md`: lets agents read the graph through the CLI.
- CI: `.github/workflows/release.yml` tests, builds one VSIX, publishes to the Marketplace, tags the release. Version lives in tags only.

The analyzed language is independent of the implementation language. Many OOP languages and many repos must work. Any single repo, including phosphorus (Go and JS), is only a fixture. No language-specific logic in core.

## Graph model

- Hierarchy is containment, taken from code structure: repo, directory, package or module, file, class, method. A directory with one child folds into its parent. Stable node IDs are fully qualified symbols. Content hashes mark staleness only.
- The graph is not a DAG. Store cycles as cycles. SCC collapse is a view option.
- Edge kinds: `contains`, `call`, `override`, `flow` (`EDGE_KINDS` in `core/ir.ts`). Flow edges bind arguments to parameters and returns to assignments across call edges.
- Container edges are weighted rollups of the underlying edges. Expanding a node splits its edges in place. Every rollup is inspectable down to the edges beneath it. Aggregation rules live once in core and every consumer shares them.
- Async, futures, and callbacks resolve through types where possible. Function values passed as arguments are flow, and calls through them get `may` edges.
- Initial view is the whole repo flow graph. Zooming refines nodes and edges. Terminal nodes are the definitions in source.

## Cache

`.hesperus/` in the analyzed repo: untracked, a cache, safe to delete. `header.json` records tool version, schema version, indexer versions, lockfile hash, and commit. A mismatch fails loudly with an explanation and never reuses silently. Sharded per package under `shards/` so the viewer loads subtrees lazily. The graph is cache only; no committed graph file.

## Determinism rules for code you write

- Never let `Map`, `Set`, or object insertion order reach output unless it was inserted sorted. Sort with `cmpStr` (code point order, as UTF-8 bytes), never `<` or `localeCompare`.
- Build output records with the constructors in `core/ir.ts`; key order is serialization order.
- Servers answer asynchronously. Wait for indexing to finish, collect, then sort.
- Normalize paths to repo-relative with forward slashes.
- Keep a test that runs the pipeline twice, and on a fresh checkout, and diffs the bytes.

## Conventions

- Schema first. The IR is a versioned schema (`vscode/schema/graph.schema.json`) mirrored by `core/ir.ts`. Change both deliberately.
- Golden snapshot tests on small fixture repos per language, plus hand-checked flow edges. Tests: `cd vscode && npm test`; `UPDATE_GOLDEN=1` refreshes snapshots.
- Few dependencies. Justify each. No native modules.
- Match existing project conventions once they exist.
- Comment only where the reason is non-obvious. Two lines max, fragments.
- Do not report work as done until the determinism test and the relevant snapshot tests have run and passed. State what ran.

## Git

Never create, switch, rename, or delete a branch, and never commit, push, open or update a PR, or merge, unless I request that exact action. In cloud sessions, work on main.

## Decided

- Cache only, no committed graph file.
- Fixtures: `fixtures/go-basic`, `go-fsm`, `js-fsm`, with committed SCIP indexes. Any repo (including phosphorus) is only a fixture.
- Name stays Hesperus, one constant (`TOOL_NAME` in `core/ir.ts`), until renamed.
- Flow edges bind arguments to parameters, returns (`return`), and function values (`fn:`).

## Ask before deciding

These are open. Ask one question if a wrong guess is costly. Otherwise state the assumption in one line.

- Flow granularity: variable, field, or entity.
- Whether SCIP enclosing ranges suffice for call edges in every language added.
- Adding the LSP fallback and which languages come next.

## Non-goals

- Editing the diagram to regenerate code.
- Agent-drawn or Mermaid diagrams as a source of truth.
- Framework-aware heuristics.
- Runtime tracing.
