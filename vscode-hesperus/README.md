# Hesperus for VS Code

Syntax highlighting, a language server and a viewer for `.hesp` files, the Hesperus system descriptor language.

- **Language**: `.hesp` files get highlighting, diagnostics with fixes, completion, hover, go-to-definition across imports, rename and formatting through `hesperus-lsp`.
- **Viewer** (`Hesperus: Open Viewer`): the system as a graph in three modes. *Intent* is the hand-written description, *Actual* is what the extractor emitted from the code, *Unified* colors every node and edge `match`, `intent-only`, `actual-only` or `conflict`, like a diff. Click a node to inspect it; double-click a container (or press Enter on it) to drill down; edges aggregate at every level. Ctrl/Cmd-click a node to open its declaration; evidence entries open the source file and line.
- **Emit** (`Hesperus: Emit Actual From Code`): runs `hesp emit --lang ts` on the configured repository.

The extension needs `hesp` and `hesperus-lsp` (from the Hesperus repository, `cargo build --release`) on `PATH` or configured through `hesperus.hespPath` and `hesperus.serverPath`, and the `hesperus-ts` extractor (`hesperus.extractorPath`) for emit.
