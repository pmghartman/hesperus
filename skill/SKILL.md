---
name: hesperus
description: Answer "what happens when this request comes in", "what does this change affect" and "does this code break an architectural rule" for a TypeScript repository from its flow (entry points → calls in source order → stores, hosts, filesystem, processes). Use when a task mentions Hesperus, `.hesp` files, flow.json, entry points or blast radius, or before and after editing code in a repository that has a `.hesperus/` directory or a `.hesp` file.
---

# Hesperus

Hesperus reads a TypeScript repository and writes its **flow**: every entry point (route handlers, `main`, `bin`/shebang modules, CLI command handlers, `activate` in a VS Code extension), the functions each one reaches in source order, and where each path leaves the program (a store, an external host, the filesystem, a process, the program's own ingress). Nothing is inferred: names come from declarations, order from source position, boundaries from a rule table, and a call is a step only when its callee resolves to a declaration in the repository.

The tool is `hesperus-ts` (`hesperus-ts` on `PATH`, `$HESPERUS_TS`, or `extractor/cli.js` inside the installed VS Code extension; run `.js` paths with `node`). The same questions are available as an MCP server: `hesperus-ts mcp <repo>` on stdio, tools `entries`, `flow`, `reaches`, `boundaries`, `check`, `dump`. Prefer the MCP tools when they are connected; the commands below are the same answers.

## The workflow

1. **Before touching a file**: `hesperus-ts reaches <repo> <file[:line]>` lists the entry points whose paths pass through it and the functions on the way. Read those entries with `flow` before changing shared code; a file under no entry point is reached by nothing the extractor can see (a test, dead code, or code reached only through something the rules do not know).
2. **To learn what the program does**: `hesperus-ts entries <repo>`, then `hesperus-ts flow <repo> "<entry>"` for one of them (an id from `entries`, or a label like `POST /orders`). Read it top to bottom: each line is `function [component]  @call site -> declaration`, each `->` line is where the path leaves the program. `[cycle]`, `[seen]`, `[depth]`, `[steps]` mark callees not expanded there.
3. **On your diff, before finishing**: `hesperus-ts boundaries <repo> --since <rev>` (`HEAD` for uncommitted work, the base branch for a PR) reports what the change newly reaches outside the program per entry point (a new host, a new store write, filesystem or process use), new or removed entry points, constraints whose result changed, and which entries each changed file sits under. Report every `+` line to the user: a new external host or store write that the task did not ask for is the finding.
4. **Constraints**: `hesperus-ts check <repo>` prints each `require`/`forbid` line of the intent with `ok` or `x` and the witness sites; it exits 1 on a violation. Never leave a violation unreported.

Every answer carries `path:line`; open those lines rather than guessing. `--json` on any command gives the data; `--fresh` recomputes when the cached `.hesperus/actual/flow.json` might be stale (it is reused only while it is newer than every source file).

## The intent file

An optional `.hesp` file (tracked in git) names the parts of the system and states rules. It is read for three things, nothing else:

```hesp
hesperus 0.1

system shop "Web shop" {
  src: "src/**"

  component api {
    src: "src/api/**"         # binding: functions in these files are shown under `api`
  }
  store db {
    engine: "postgres"        # names the detected store `db` instead of `postgres`
  }
  external stripe {
    protocol: http
    host: "api.stripe.com"    # names the detected host
  }

  forbid api -> db: writes    # a rule: checked against every function by `check`
  require api -> stripe: http
}
```

`hesp init --lang ts <repo>` writes one from the code (a component per source directory, every store and host found) to `<repo>/.hesperus/`, then the flow, and reports the entry count; `hesp emit --lang ts <repo> --intent <master>` reads the code and writes only `<repo>/.hesperus/actual/flow.json` (`--out <dir>` for elsewhere; never edit it). Hesperus writes nothing outside `.hesperus/`, and that folder carries a `.gitignore` of `*`, printing its path. `hesp fmt` and `hesp check <master>` keep the file tidy and valid; fix every diagnostic. Edges between components (`api -> db: reads`) are legal but no longer read: the flow shows what the code does, the intent only names and constrains it.

## Reading flow.json directly

Shape in `docs/flow.schema.json`. `entries[]` hold `steps` in source order: `{ "call": "src/db/users.ts#findUsers", "at": "src/handlers/users.ts:4", "steps": [...] }` for a call into the repository and `{ "boundary": "store", "node": "shop.db", "edge": "reads", "at": "src/db/users.ts:3" }` where the path leaves. `units[]` map each `file#name` to its lines and the component that owns the file; `components[]` carry the intent's names; `constraints[]` carry the results with witnesses.

## What it does not see

Store and host detection is per file: `import { pool } from "./pool"; pool.query(...)` is not a store crossing because the origin is `./pool`, not `pg`; the crossing shows in the file that constructs the client. Calls through values the checker cannot resolve (dynamic dispatch, callbacks stored in maps) are not steps. Say so when a question depends on them.
