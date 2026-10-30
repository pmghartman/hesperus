# Hesperus

A descriptor language for software systems, and the tools that keep two descriptions of one system honest with each other.

- **Intent** is written by people or agents and tracked in git: what the system should be.
- **Actual** is emitted from the code by an extractor, gitignored: what the repository is.
- The **unified** graph merges them and marks every node and edge `match`, `intent-only` (declared, not built: work), `actual-only` (undeclared code: drift) or `conflict`, like a diff.

The name is Frege's: *Hesperus is Phosphorus*, two descriptions, one referent.

```hesp
hesperus 0.1

system shop "Web shop" {
  import "./catalog.hesp"

  ingress web "Storefront" {
    protocol: http
  }
  store db {
    engine: "postgres"
  }

  web -> catalog.api: http
  catalog.api -> db: reads

  forbid web -> db
}
```

`.hesp` is terse and declarative, non-Turing-complete (repetition only through templates and `each` over finite lists), with a canonical JSON IR under it ([schema](docs/ir.schema.json)). Node kinds and edge kinds are closed sets; labels are free text; there are no coordinates. Everything is deterministic: same input, byte-identical output. The language is specified in [docs/SPEC.md](docs/SPEC.md); every example there is a test.

## Pieces

| | |
|---|---|
| `crates/hesperus-core` | lexer, error-tolerant parser (every error, with span and fix), templates, linker, validator, IR, canonical printer, idempotent formatter, differ |
| `crates/hesp` | CLI: `check`, `fmt`, `ir`, `print`, `emit --lang ts`, `diff` |
| `crates/hesperus-lsp` | language server (tower-lsp): diagnostics, completion, hover, go-to-definition across imports, rename, formatting |
| `hesperus-ts` | the TypeScript extractor: a ts-morph frontend emits a neutral fact stream, a rule table (`src/rules.ts`, one row per library pattern, one fixture per row) maps facts to effects, and the engine assembles the actual IR. Files map to intent nodes through `src` bindings, imports become `calls`, rows detect HTTP routes, outbound HTTP, database clients, WebSockets, filesystem and process use; everything it cannot resolve is `resolved: false`. Adding a framework is adding rows; adding a language is a new frontend for the same table |
| `vscode-hesperus` | VS Code extension: grammar, LSP client, viewer with Intent / Actual / Unified modes, drill-down with edge aggregation, legend, click-through to `.hesp` and to source |
| `skill/SKILL.md` | teaches agents the syntax and the workflow |
| `examples/phosphorus` | the intent description of [Phosphorus](https://github.com/pmghartman/phosphorus), the first test codebase |

## Use

```bash
cargo build --release                      # hesp, hesperus-lsp in target/release
(cd hesperus-ts && npm install && npm run build)

hesp check examples/phosphorus/phosphorus.hesp
hesp fmt examples/phosphorus
HESPERUS_TS=$PWD/hesperus-ts/dist/cli.js \
  hesp emit --lang ts ../phosphorus --intent examples/phosphorus/phosphorus.hesp
hesp diff examples/phosphorus/phosphorus.hesp .hesperus/actual/phosphorus.hesp
```

`hesp emit` writes `.hesperus/actual/*.hesp`, mirroring the intent's files (a subsystem file whose bindings matched no code is left out), with a `generated` header; `hesp diff` exits 1 when a `require` or `forbid` constraint is violated. `hesp ir` prints the IR; `hesp diff --json` prints the unified graph; `--depth N` aggregates edges to the nodes at that depth.

## Develop

```bash
cargo test --workspace                      # core goldens, differ goldens, LSP integration tests
(cd hesperus-ts && npm test)                # one fixture per extractor heuristic, schema validation
(cd vscode-hesperus && npm install && npm test && npm run package)   # viewer render tests, .vsix
```

Golden files are updated with `UPDATE_GOLDEN=1`. Design choices and their alternatives are in [docs/DECISIONS.md](docs/DECISIONS.md).

Apache-2.0.
