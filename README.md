<img src="media/icon.png" alt="Hesperus" width="160">

# Hesperus

Static analysis for repos agents write. Hesperus indexes a repo through the editor's language servers (or from syntax alone, headless) and answers two questions without reading every diff:

- **Control flow.** From any entry point: the calls in source order, branches with their conditions, loops, catches, and every call that leaves the repo as a terminal. Expand a callee in place; click through to source.
- **Boundary graph.** Packages and files, with every call that leaves the repo grouped by what it reaches: database, network, AI models, cloud, queues, filesystem, processes, environment.

Nothing is inferred and no model draws an edge: an entry point is a callable reached from outside the repo, a step is a resolved call site, a terminal is a call the boundary table classifies.

**Index** in the sidebar builds the graph. Nothing is read through the language servers or written to the repo before that first press; the cache lives in `.hesperus/`, untracked. **Hide tests** keeps test files and folders out of the entry points. **Trace From Here** in an editor's title bar opens the chart at the code under the cursor, from the entry point that reaches it.

## Agents

`hesperus mcp` serves the repo over MCP; the extension registers the server with Claude Code (user scope) and the editor's MCP registry by itself. Tools: `hesperus_flow` (control flow from an entry point, to any depth), `hesperus_calls`, `hesperus_boundaries`, `hesperus_index`, `hesperus_narrate`. Prompts, which arrive with the chart already in them: `explain`, `impact`. An agent that explains a flow calls `hesperus_narrate` with a summary and titled phases; the chart draws them, after checking each phase against the steps it actually has.

`hesperus index` builds the graph from a terminal; `hesperus flow --entry NAME --depth N` prints a control flow.

**Works in** VS Code and its forks (Cursor, Windsurf, VSCodium via Open VSX). **Languages:** Go, JavaScript, TypeScript, Rust, C#, C, C++, Dart, Python, Java, Kotlin, PHP and Ruby, plus any language the editor has a language server for.

Runs locally, collects nothing ([privacy](PRIVACY.md)). Apache-2.0.
