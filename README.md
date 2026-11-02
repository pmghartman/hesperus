<img src="media/icon.png" alt="Hesperus" width="160">

# Hesperus

What happens when a request comes in. Hesperus reads a TypeScript repository and writes its **flow**: every entry point (route handlers, `main`, `bin` modules, CLI command handlers, event handlers, `activate` in a VS Code extension), the functions each one reaches in source order, and where each path leaves the program (a store, an external host, the filesystem, a process, a configuration variable, the program's own ingress). It answers four questions, for a developer in VS Code and for an agent on the command line or over MCP:

| Question | Command | MCP tool |
|---|---|---|
| What are the entry points and what does each one touch? | `hesperus-ts entries <repo>` | `entries` |
| What happens on `POST /orders`? | `hesperus-ts flow <repo> "POST /orders"` | `flow` |
| What does a change to this file affect? | `hesperus-ts reaches <repo> src/db/users.ts[:12]` | `reaches` |
| What does my diff newly reach outside the program? | `hesperus-ts boundaries <repo> --since main` | `boundaries` |
| Does the code break an architectural rule? | `hesperus-ts check <repo>` (exit 1 on a violation) | `check` |

Nothing is inferred: names come from declarations, order from source position, boundaries from a rule table (`hesperus-ts/src/rules.ts`), and a call is a step only when its callee resolves to a declaration in the repository. Every line carries a `path:line`.

```
route POST /orders  @src/server.ts:6
  src/handlers/orders.ts#createOrder [handlers]  @src/handlers/orders.ts:4
    charge [pay]  @src/handlers/orders.ts:5 -> src/pay/stripe.ts:1
      -> external api.stripe.com (shop.stripe) http  @src/pay/stripe.ts:2
    saveOrder [data]  @src/handlers/orders.ts:6 -> src/db/orders.ts:3
      -> store Orders and users (shop.db) writes  @src/db/orders.ts:4
    audit [handlers]  @src/handlers/orders.ts:7 -> src/handlers/audit.ts:2
      -> hardware Filesystem (shop.filesystem) io  @src/handlers/audit.ts:3
```

## Install

In VS Code, open Extensions, search **Hesperus** and install it ([Marketplace](https://marketplace.visualstudio.com/items?itemName=pmghartman.hesperus-vscode); [Open VSX](https://open-vsx.org/extension/pmghartman/hesperus-vscode) for VSCodium, Cursor and other forks). The package for macOS (Apple silicon), Linux x64 and Windows x64 carries `hesp`, the language server and the extractor, and runs the extractor on VS Code's own Node. No Rust, Node or `.vsix` download needed. The extractor alone is `hesperus-ts` (`extractor/cli.js` inside the installed extension; `npm run build:extractor` here).

## Use

1. **Hesperus: Create Intent From Code** (the sidebar's button, or the command palette) in a repository that has none: it writes a `.hesp` file naming a component per source directory and every store and host found, then reads the flow. Or write the file by hand (below). Either way it is optional: without one, functions are grouped by directory and there are no rules to check.
2. **Hesperus: Emit From Code** (Emit in the sidebar's title bar) reads the repository and writes `.hesperus/actual/flow.json` ([schema](docs/flow.schema.json)). Never edit it.
3. **Hesperus: Open Viewer** draws one entry point as a pipeline, left to right: the entry, the functions it reaches in call order (one column per call depth, tinted by the component that owns their file), and the boundaries each path ends in, dashed on the right. The inspector lists the entry points, the entries that pass through the file open in the editor, and the constraint results. Clicking a step opens its source line; Ctrl/Cmd-click opens the owning component in the `.hesp` file.

For agents, [`skill/SKILL.md`](skill/SKILL.md) is the workflow (`reaches` before editing, `flow` to read an entry, `boundaries` on the diff, `check` before finishing); each release also carries it as `hesperus.skill`. `hesperus-ts mcp <repo>` serves the same tools on stdio. Queries use the cached `flow.json` while it is newer than every source file and recompute otherwise (`--fresh` forces it); `boundaries --since` caches each revision's flow by commit.

Limits: 8 calls deep and 400 steps per entry; a callee already on the path is cut as `cycle`, one expanded earlier in the entry as `seen`. Store and host detection is per file: `import { pool } from "./pool"; pool.query()` is a crossing in the file that constructs the client, not in the caller. Calls through values the checker cannot resolve are not steps.

### The intent file

A `.hesp` file (tracked in git) names the parts of the system and states rules. Three things are read from it:

```hesp
hesperus 0.1

system shop "Web shop" {
  src: "src/**"

  component api {
    src: "src/api/**"         # binding: functions in these files are shown under `api`
  }
  store db {
    engine: "postgres"        # names the detected store `db`
  }
  external stripe {
    protocol: http
    host: "api.stripe.com"    # names the detected host
  }

  forbid api -> db: writes    # a rule, checked against every function in the repository
  require api -> stripe: http
}
```

Highlighting, completion, hover, go-to-definition, rename and formatting work as you type; `hesp check` finds errors and offers fixes. Edges between components (`api -> db: reads`) are still legal but no longer read: the flow shows what the code does, the intent only names and constrains it.

Settings: `hesperus.intent` (master file; defaults to the one the open `.hesp` belongs to), `hesperus.sourceRoot` (the repository the flow describes; defaults to the workspace), `hesperus.actualDir` (default `.hesperus/actual`). `hesperus.hespPath`, `hesperus.serverPath` and `hesperus.extractorPath` replace the bundled tools with your own.

The command line:

```bash
hesp init --lang ts <repo>                          # an intent from the code, plus the flow
hesp emit --lang ts <repo> --intent intent.hesp     # the flow (and the actual .hesp files hesp still prints)
hesp check intent.hesp && hesp fmt .                # validate and format the intent
hesperus-ts entries <repo>                          # the questions above; --json for data
hesperus-ts mcp <repo>                              # the same as an MCP server
```

## Inside

| | |
|---|---|
| `src/`, `media/`, `syntaxes/` | the extension: language client, the flow viewer, the sidebar |
| `hesperus-ts/` | the extractor: a neutral fact stream plus a rule table (`src/rules.ts`), the flow walker (`src/flow.ts`), the queries and MCP server (`src/query.ts`, `src/mcp.ts`) |
| `crates/hesperus-core`, `crates/hesp`, `crates/hesperus-lsp` | the `.hesp` language (lexer, parser, IR, printer, formatter), the CLI and the language server, in Rust |
| `docs/` | [the language spec](docs/SPEC.md) (every example is a test), [the flow schema](docs/flow.schema.json), [the IR schema](docs/ir.schema.json), [design decisions](docs/DECISIONS.md) |

Develop with `cargo test --workspace`, `npm test` here and in `hesperus-ts/`, `scripts/package-vsix.sh` to build the package for your machine and `scripts/package-skill.sh` for the skill bundle. Releasing is a button: Actions → **release** → Run workflow. The version is derived, not typed: one minor past the last release (or the next major when the box is checked), with the commit count as the patch number; the run stamps it into the files at build time, tests, builds all platforms plus the skill, publishes to the Marketplace and Open VSX, then tags and releases on GitHub.

Apache-2.0.
