# Hesperus

A read-only map of a codebase for reviewing its architecture. Hesperus compiles the code "up" into a zoomable graph of packages, files, types, and functions, with the calls and data flow between them.

Every node and edge comes from static analysis (your editor's language servers plus tree-sitter). No model creates, removes, or reweights anything. Edges carry their certainty: **resolved**, **may** (dynamic dispatch), or **unresolved**, and unknowns are drawn, never dropped.

## Use

Click the Hesperus icon in the activity bar. The first time, Hesperus:

1. detects the languages in the workspace,
2. asks the editor's language server for each (offering to install its extension if missing),
3. builds the graph into an untracked `.hesperus/` cache (safe to delete),
4. opens the graph in an editor tab.

The graph tab:

- Scroll to zoom, drag to pan. The view refits when the panel resizes.
- Click a box to expand it. Cmd/Ctrl-click or double-click opens its source.
- Hover a box to focus on its connections, or an edge to see the counts behind it.

The sidebar shows status and errors, finds nodes by name, toggles calls, data flow, overrides, and state transitions, lists the state machines found, and re-indexes.

## Languages

| Language | Editor extension |
| --- | --- |
| Go | Go (`golang.go`) |
| JavaScript, TypeScript | Built in |
| Rust | rust-analyzer (`rust-lang.rust-analyzer`) |
| C# | C# (`ms-dotnettools.csharp`) |
| C, C++ | C/C++ (`ms-vscode.cpptools`) |
| Dart, Flutter | Dart (`Dart-Code.dart-code`) |
| Python | Python (`ms-python.python`) |
| Java | Language Support for Java (`redhat.java`) |
| Kotlin | Kotlin (`fwcd.kotlin`) |
| PHP | PHP Intelephense (`bmewburn.vscode-intelephense-client`) |
| Ruby | Ruby LSP (`Shopify.ruby-lsp`) |
| Anything else (Swift, Scala, Lua, Zig, ...) | Generic: whatever language server the editor has. Definitions and references only, calls shown as `may` |

Each language is indexed on its own. If its extension is missing or never answers, its files show as dashed **unindexed** nodes (toggle in the sidebar) with the reason and an install button, and the other languages still build. Files in other languages are counted and not analyzed.

## Guarantees

- **Read-only.** Hesperus writes only its `.hesperus/` cache in the analyzed repo.
- **Resolved by your language servers.** Output depends on the installed language-server extensions and their versions, so it can differ between machines.
- **Stale caches fail loudly.** A new commit, lockfile, or Hesperus version re-indexes, and the sidebar says why.
