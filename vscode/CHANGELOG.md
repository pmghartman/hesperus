# Changelog

## Unreleased

- Claude Code plugin: the pane's map is drawn in character cells, laid out top to bottom and wrapped to the pane's width (`hesperus svg --portrait N`), with boxes that drag, select, open and close; where the pane cannot run it (the editor, the phone) the picture stays. `.hesperus/view.json` carries each box's cells and the wires. The plugin's version raises itself on `main`.
- `hesperus index`: the graph from syntax alone, no editor: tree-sitter outlines, same-file and same-package name lookup, imports for the rest (JavaScript/TypeScript, Python, Go, Rust, Java, Kotlin). `hesperus check --index` and `--svg`; `hesperus svg` draws the boundary overview.
- `hesperus mcp`: an MCP server over stdio with the lint, the diff since the last review, the crossings by boundary, callers and callees, accept, and the overview as a resource.
- The repository is a Claude Code plugin: the boundary map and findings in a pane that re-draws after each edit, a status line count, `/hesperus`, and the MCP server through `.mcp.json`.
- Calls the language server leaves unresolved resolve through the import that binds them (`fs.readFileSync` after `import * as fs from "node:fs"`, `requests.get`, `http.Get`, `fs::read_to_string`, `DriverManager.getConnection`): to the repo definition a relative import names, or to the package outside it. JavaScript/TypeScript, Python, Go, Rust, Java and Kotlin.
- Automaton view: states are the values of the program's state machines; inputs are callbacks handed to code outside the repo, values a handler dispatches on, and entry points. Independent locations are separate regions.
- Calls into libraries are external nodes under their package instead of unresolved.
- State machines include boolean flags (`if (busy)`, `x = !x`), count initializers, and read guards from `else` branches, early returns and ternaries.
- Zoomed-out views draw readable labels.
- Schema 5: `event` nodes and `guard` edges.

- Symbols and references now come from the editor's language servers, per language. SCIP indexers, their downloads and the `hesperus` CLI are removed.
- Rust, C#, C/C++, Dart/Flutter, Python, Java, Kotlin, PHP and Ruby support, alongside Go and JavaScript/TypeScript.
- Generic fallback for any other language the editor has a server for: definitions and references, with `may` call edges.
- A missing language extension is offered for install; if skipped or silent, that language's files appear as unindexed nodes (a sidebar toggle) and the rest of the repo still builds.

## 0.1.0

- First release: activity bar entry, graph tab with zoom and pan, sidebar with status, find, and edge filters.
- Go and JavaScript/TypeScript, with indexers downloaded on first use.
