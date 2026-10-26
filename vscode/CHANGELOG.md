# Changelog

## Unreleased

- Symbols and references now come from the editor's language servers, per language. SCIP indexers, their downloads and the `hesperus` CLI are removed.
- Rust, C#, C/C++ and Dart/Flutter support, alongside Go and JavaScript/TypeScript.
- A missing language extension is offered for install; if skipped or silent, that language's files appear as unindexed nodes (a sidebar toggle) and the rest of the repo still builds.

## 0.1.0

- First release: activity bar entry, graph tab with zoom and pan, sidebar with status, find, and edge filters.
- Go and JavaScript/TypeScript, with indexers downloaded on first use.
