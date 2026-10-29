# Changelog

## Unreleased

- An else-if ladder in the control flow chart is laid across: its decisions side by side, each passing on to the next from its right, its yes side beneath it and a final else in a column of its own, in rows as wide as the pane. A dispatch on a message's type is a few rows instead of a tall stack.
- The control flow no longer takes a function's decisions from another: a file edited since the index is read as having no syntax (its calls still show, in order) until it is indexed again, instead of its branches being read at the lines the old index gave.
- **Trace From Here** opens the chart beside the code instead of over it; a chart already open is brought up where it is.
- The chart's tab has its own icon, drawn for 16 pixels: whole-pixel strokes and no shadow or sheen, which smudged the η at that size.
- The graph lists the folders and files it has opened along its top: the flow view dissolves an opened one into what it holds, which left no box to close it by. Each chip closes its folder and what was opened inside it.

- **Index** draws the graph before it is complete: a first read resolves each call site with go-to-definition and draws the chart and its entry points from that; the whole read runs after it under the drawing and replaces it when done, taking the first one's files and answers instead of asking them again. Only the whole graph is written to `.hesperus/`.
- The whole read asks each name token where it is defined instead of each definition where it is used (find-references, which on a large repo kept a server busy for minutes to an hour, and timed out). Syntax lists the tokens named like a definition in the repo, or like a name a file imports from it under its own; each is asked once, however many definitions share its name. The occurrences are the same; definitions whose uses carry no name token (constructors, operators, `__add__`, Kotlin's `invoke`, Rust's `Add::add`) are still asked for their references. A re-index after an edit asks as before. Each language's phases, with counts and times, go to the Hesperus output channel.

- The boundary review is out for now: no policy file, no accepted baseline, no findings. The Problems diagnostics and their quick fixes, the status bar count, the `hesperus.policy` command, `hesperus check` and its flags, the `hesperus_check`, `hesperus_diff` and `hesperus_accept` tools, the `audit` prompt and the report resource are removed. The boundary crossings themselves stay: in the sidebar, on the boundary graph, as terminals of the control flow, and through `hesperus_boundaries`.
- **Trace From Here**, a button in the editor's title bar: the control flow chart from the entry point that reaches the code under the cursor, every call on the way opened, centred on the call into it. Code nothing reaches is traced from itself; module-level code is the file's on-load flow.
- Entry points list the name in full and cut the path from its start, so the file name stays readable.

- **Hide tests** in the sidebar leaves test files and folders (`test/`, `__tests__/`, `*.test.*`, `*_test.go`, `test_*.py`, …) out of the entry points; on by default, kept across sessions. Entries carry a `test` flag and sort after the rest, so `hesperus flow` and the MCP tools start from the program, not its tests.
- Indexing waits less: every language's server is started at once instead of one after another; a file type no installed extension declares is skipped instead of waited on; and a file whose syntax declares nothing is not asked again. Listeners hung on `on…` properties (`el.onclick = () => …`) are steps of the code that registers them, not entry points.
- The control flow chart reads down: a decision's no side is drawn under its yes side instead of in a column to its right, an else-if ladder keeps every decision level with the first, and the yes side's lines pass to the right of what is beneath them. The chart is never shrunk below a readable size: it fits the pane's width and scrolls when it is taller. A column is only opened when it carries a fair share of the steps. The sidebar's open-folder note and the status bar item are gone: the counts are in the sidebar and the Problems panel.
- The "this repo" launch config runs the development host with other extensions disabled, so their deprecation warnings stay out of the debug console.

- Entry points are callables reached from outside the repo: an uncalled callable in a file no other file loads, one handed to code outside the repo (a handler), or a file's own top-level code. Uncalled helpers in loaded files no longer count, so a repo lists a handful instead of dozens.
- The sidebar is pared to the tool: a Control flow / Boundary graph switch, Index, search, the entry points and the boundaries crossed, with the lint tally and a way to the Problems panel. The Review section, the Explain and Ask buttons, the assistant menu and their settings (`hesperus.assistant`, `hesperus.explainWith`) are gone; findings live in Problems with their quick fixes. Status notes are a few words, with the message in the tooltip.
- Nothing is read or written before the first **Index**: a stale cache (another version, the CLI, another commit) waits for the press instead of re-indexing on open.
- The control flow chart is laid out again and refitted whenever the pane changes shape.
- MCP: `prompts` (`explain`, `audit`, `impact`) carry the flow or the report into the agent's context, and `hesperus_narrate` lets an agent label a flow with a summary and phases, checked against the chart and drawn in the editor. The SVG export (`hesperus svg`, `check --svg`, `hesperus_svg`, the `view.svg` resource) is removed.
- The repository is the extension alone: the Claude Code plugin and the Claude Desktop bundle are retired, with their workflow and packaging, and the extension moves from `vscode/` to the root. The CLI and MCP server stay inside the extension.
- A language is served by whichever installed extension declares it, not only the one Hesperus names; the install prompt comes only when none does. The sidebar is redrawn to the editor's own conventions: a view switch, collapsible sections with counts, single-line rows.
- A watched change re-indexes only the files that changed: the rest of each language's index is kept in memory, and one listing of the repo serves a whole load.
- **Ask** in the sidebar sends the flow on screen, the findings and what the repo reaches to an AI assistant the editor has (Copilot Chat, Claude Code, Cline, Roo Code, Continue, Kilo Code), chosen from a menu and kept in `hesperus.assistant`.
- The policy moves to `.hesperus/hesperus.json`, untracked with the rest of the cache and kept across re-indexes. The sidebar writes nothing to the repo until **Index** is pressed (was Re-index). Flow and Map mark only the view that is up, and the entry points fold after the first few.
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
