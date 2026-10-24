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

- `core`: Rust library. Owns the IR, merging, aggregation, cache, and canonical serialization.
- `cli`: thin wrapper over core. Doubles as the test harness.
- Language frontends emit the IR:
  - SCIP indexer output is the primary symbol resolver.
  - Headless LSP over stdio is the fallback where no SCIP indexer exists.
  - tree-sitter supplies syntax for def-use inside bodies, resolved through SCIP or LSP definitions.
  - Native per-language analyzers may be added later as optional frontends behind the same IR.
- `vscode`: TypeScript extension with a webview. Reads the graph file. Layout is precomputed deterministically with ELK. Clicking a terminal node opens its source range.
- `skill`: lets agents read the graph file.

The analyzed language is independent of the implementation language. Many OOP languages and many repos must work. Any single repo, including phosphorus (Go and JS), is only a fixture. No language-specific logic in core.

## Graph model

- Hierarchy is containment, taken from code structure: repo, package or module, file, class, method. Stable node IDs are fully qualified symbols. Content hashes mark staleness only.
- The graph is not a DAG. Store cycles as cycles. SCC collapse is a view option.
- Edge kinds include at least `contains`, `call`, `override`, and `flow`. Flow edges bind arguments to parameters and returns to assignments across call edges.
- Container edges are weighted rollups of the underlying edges. Expanding a node splits its edges in place. Every rollup is inspectable down to the edges beneath it. Aggregation rules live once in core and every consumer shares them.
- Async, futures, and callbacks resolve through types where possible. Function values passed as arguments are flow, and calls through them get `may` edges.
- Initial view is the whole repo flow graph. Zooming refines nodes and edges. Terminal nodes are the definitions in source.

## Cache

An untracked dot directory in the analyzed repo. It is a cache and safe to delete. The header records tool version, indexer and server versions, lockfile hash, and commit. A mismatch fails loudly with an explanation and never reuses silently. Shard per package so the viewer loads subtrees lazily.

## Determinism rules for code you write

- Never iterate a `HashMap` into output. Use `BTreeMap` or sort.
- Servers answer asynchronously. Wait for indexing to finish, collect, then sort.
- Normalize paths to repo-relative with forward slashes.
- Keep a test that runs the pipeline twice, and on a fresh checkout, and diffs the bytes.

## Conventions

- Schema first. The IR is defined as a versioned schema with shared or generated types for the TypeScript side. Change it deliberately.
- Golden snapshot tests on small fixture repos per language, plus hand-checked flow edges.
- Few dependencies. Justify each. Prefer a small static binary.
- Match existing project conventions once they exist.
- Comment only where the reason is non-obvious. Two lines max, fragments.
- Do not report work as done until the determinism test and the relevant snapshot tests have run and passed. State what ran.

## Git

Never create, switch, rename, or delete a branch, and never commit, push, open or update a PR, or merge, unless I request that exact action. In cloud sessions, work on main.

## Ask before deciding

These are open. Ask one question if a wrong guess is costly. Otherwise state the assumption in one line.

- Flow granularity: variable, field, or entity.
- How call edges are derived from SCIP, and whether enclosing ranges suffice.
- Final project name.
- Cache only, or a committed graph file.
- Which fixture languages and repos to use.

## Non-goals

- Editing the diagram to regenerate code.
- Agent-drawn or Mermaid diagrams as a source of truth.
- Framework-aware heuristics.
- Runtime tracing.
