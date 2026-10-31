<img src="media/icon.png" alt="Hesperus" width="160">

# Hesperus

Two descriptions of one system, kept honest. You write what the system **should** be in `.hesp` files; Hesperus extracts what the code **is**; the viewer shows both as one graph and marks every difference like a diff.

```hesp
hesperus 0.1

system shop "Web shop" {
  src: "src/**"

  component api {
    src: "src/api/**"
  }
  ingress web {
    protocol: http
  }
  store db {
    engine: "postgres"
  }

  web -> api: http
  api -> db: reads

  forbid web -> db
}
```

## Install

Download the `.vsix` for your platform from the [latest release](https://github.com/pmghartman/hesperus/releases/latest) and in VS Code choose Extensions → `…` → **Install from VSIX**. The package carries everything it needs; no Rust or Node install.

## Use

1. Write an intent file like the one above (`hesp` highlighting, completion, hover, go-to-definition, rename and formatting work as you type; errors come with fixes).
2. **Hesperus: Emit Actual From Code** reads your TypeScript repository and writes `.hesperus/actual/*.hesp`, a generated description of what the code does: imports, HTTP routes, outbound requests, databases, WebSockets, filesystem and process use. Never edit those files.
3. **Hesperus: Open Viewer** (the icon in the editor title) shows the graph in three modes:

| Mode | Shows |
|---|---|
| Intent | the description you wrote |
| Actual | what the extractor found |
| Unified | both, coloured: **match**, **intent-only** (declared, not built: work), **actual-only** (built, not declared: drift), **conflict** |

Click a node to inspect it; double-click a container to drill down (edges aggregate at every level); Ctrl/Cmd-click opens its `.hesp` declaration; evidence links open the source line. `require` and `forbid` lines are checked against the code and listed in the inspector.

Settings: `hesperus.intent` (master file; defaults to the one the open `.hesp` belongs to), `hesperus.sourceRoot` (the repository the actual files describe; defaults to the workspace), `hesperus.actualDir` (default `.hesperus/actual`). `hesperus.hespPath`, `hesperus.serverPath` and `hesperus.extractorPath` replace the bundled tools with your own.

Agents get the same workflow from [`skill/SKILL.md`](skill/SKILL.md); each release also carries it as `hesperus.skill`, which Claude installs from the download. The command line is the same engine:

```bash
hesp check intent.hesp        # parse and validate, with fixes
hesp fmt .                    # format in place (generated files are left alone)
hesp emit --lang ts <repo> --intent intent.hesp
hesp diff intent.hesp .hesperus/actual/intent.hesp
```

## Inside

| | |
|---|---|
| `src/`, `media/`, `syntaxes/` | the extension: language client and the viewer |
| `crates/hesperus-core`, `crates/hesp`, `crates/hesperus-lsp` | the language (lexer, parser, IR, printer, formatter, differ), the CLI and the language server, in Rust |
| `hesperus-ts/` | the TypeScript extractor: a neutral fact stream plus a rule table (`src/rules.ts`); adding a framework is adding rows |
| `docs/` | [the language spec](docs/SPEC.md) (every example is a test), [the IR schema](docs/ir.schema.json), [design decisions](docs/DECISIONS.md) |

Develop with `cargo test --workspace`, `npm test` here and in `hesperus-ts/`, `scripts/package-vsix.sh` to build the package for your machine and `scripts/package-skill.sh` for the skill bundle. Pushing a `v*` tag builds and publishes all platforms plus the skill.

Apache-2.0.
