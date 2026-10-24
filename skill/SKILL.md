---
name: hesperus-graph
description: Read a repo's Hesperus graph (structure, calls, overrides, data flow) to answer architecture questions from analysis, not guesses. Use when asked how parts of a codebase connect, who calls what, or where data goes.
---

# Reading the Hesperus graph

The graph comes from code analysis. Do not add, remove, or reweight nodes or edges, and do not present your own diagram as the graph.

`hesperus` below is the CLI: `node <extension dir>/out/cli.js` (in a checkout, `vscode/out/cli.js`).

1. Make sure a cache exists: `hesperus graph <repo>` prints the canonical graph JSON, or fails with why the cache is stale. If it fails, tell the user; do not work from stale data.
2. Zoom: `hesperus view <repo> [--expand <node-id>]...` returns visible nodes and weighted rollups. Each rollup lists `edges`, indices into the graph's `edges` array, so any claim can be traced to leaf edges.
3. Cite provenance. Every edge is `resolved`, `may` (dispatch, function values), or `unresolved` (reflection, DI, calls through unknown values). Report unresolved edges as unknowns; never fill them in.
4. Node IDs are fully qualified symbols. `path` and `range` on a node point at its definition (0-based lines).
5. Agent labels live in a separate layer and never replace the base `name`, `signature`, `doc`.

Edge kinds: `contains` (hierarchy), `call`, `override`, `flow` (argument to parameter, `return`, `fn:` for function values). Schema: `hesperus schema`.
