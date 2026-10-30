---
name: hesperus
description: Read and write Hesperus `.hesp` system descriptions. Use when a task mentions Hesperus, `.hesp` files, a system's intent vs actual architecture, `hesp check`, `hesp diff`, or asks what a repository's architecture should be or has drifted to.
---

# Hesperus

Hesperus describes a software system as a graph in `.hesp` files. Two descriptions exist for one system:

- **Intent** (`examples/<system>/*.hesp` or wherever the project keeps them, tracked in git): what the system *should* be. You may edit these.
- **Actual** (`.hesperus/actual/*.hesp`, gitignored, header line `generated "hesperus-ts"`): what the code *is*, emitted by `hesp emit`. **Never edit a generated file.** Change the code or the intent instead and re-emit.

`hesp diff intent.hesp .hesperus/actual/intent.hesp` merges them. It prints a summary line, then only the differences (`--all` adds the `=` matches), then every constraint (`ok` with its witness edge, or `x`). An edge the extractor could not resolve ends its line with the word `unresolved` (in the IR it is `resolved: false`; the viewer draws it dashed). It exits 0 unless a constraint fails. Read the statuses as:

| status | meaning | what you do |
|---|---|---|
| `match` (`=`) | declared and built | nothing |
| `intent-only` (`-`) | declared, not built | **a task**: build it (or remove the declaration if the plan changed) |
| `actual-only` (`+`) | built, never declared | **drift**: report it; add it to the intent only if it is wanted |
| `conflict` (`!`) | both exist, `kind`/`protocol`/`host`/`engine` disagree | **drift**: report it; fix the code or the intent, whichever is wrong |
| constraint `x` | a `forbid` has a witness or a `require` has none | **violation**: report it; it fails the build (`hesp diff` exits 1) |

Two nodes in actual files are synthesized by the extractor, not declared by anyone: `subsystem unbound` holds one component per directory of code no intent `src` binds (`unbound.scripts` means "add a `src:` binding for `scripts/**` to the right node, or it is genuinely stray code"), and `network unresolved` is the sink for edges whose target the extractor could not identify (dynamic URLs, dynamic imports). Do not declare either in the intent. Generated files also carry `at: ["path:line", ...]` evidence on nodes and edges; intent files never need it.

## After every edit

```
hesp fmt <dir-or-file>   # formats in place; never touches generated files
hesp check <master>      # parses the master and every import; prints `ok (N nodes, N edges, N files)` and exits 0 when clean
```

`hesp fmt` keeps your order; it does not sort. Convention in the examples: imports, edges and constraints alphabetical. Labels (the quoted string after a name) are optional everywhere.

Fix every diagnostic. Each one names a code (`E011`), a position and often a fix (`help: replace with ...`). Never leave a file that fails `hesp check`.

## Syntax in one page

```hesp
hesperus 0.1 # every file starts with this line

system shop "Web shop" { # the master's root: a system; one root per file
  desc: "Free text, never diffed"
  src: ["src/**", "lib/money.ts"] # binding: which code belongs here (globs)

  import "./catalog.hesp" # splices that file's subsystem in as a child

  component api # containers: system, subsystem, component
  ingress web "Storefront" { # boundaries: ingress egress store external network hardware
    protocol: http # http ws grpc tcp udp ssh other
  }
  store db {
    engine: "postgres" # free string; the extractor emits postgres, mysql, sqlite, mongodb, redis
  }
  external stripe {
    protocol: http
    host: "api.stripe.com" # binds the detected external with this host
  }
  hardware filesystem # extractor names: filesystem, processes; network: unresolved

  web -> api: http # edge kinds: calls reads writes http ws io (default calls)
  api -> db: reads
  api -> db: writes
  api -> stripe: http
  api -> filesystem: io

  forbid web -> db # no edge from web (or anything inside) to db
  require api -> db: writes # at least one such edge must exist in the code
}
```

The master above imports `catalog.hesp`; the two files go together (a master whose import target is missing fails `hesp check` with E012):

```hesp
hesperus 0.1

subsystem catalog "Product catalog" {
  src: "src/catalog/**"

  component listing
  component search {
    src: "src/catalog/search/**" # more specific globs win
  }

  listing -> search: calls
}
```

Rules that bite:

- Ids are paths: `shop.catalog.search`. Edges name nodes by path, resolved from the enclosing block outward, so inside `catalog` write `search`, at the root write `catalog.search`; the fully qualified id always works.
- A node must exist before an edge can name it; there is no implicit creation. `hesp check` says `E011` otherwise.
- Comments start with `#`. Labels (the quoted string after the name) are free text and never diffed. A literal dollar sign in a string is written `\$` (a bare `$` means interpolation and is an error outside templates).
- Boundary nodes (`ingress`, `store`, ...) hold no children.
- Edge identity is `(from, to, kind)`: `api -> db: reads` and `api -> db: writes` are two edges.
- Repetition only through `let x = [a, b]`, `template name(p) { ... }` called as `name($x)`, and `each x in list { ... }`, all at most 4 levels deep; templates may only call templates defined earlier in the file. Interpolate with `$p` or `${p}`.
- Reserved words: `hesperus generated import require forbid let template each in true false`. Kind names (`store`, `network`) are fine as node names.

## Adding a subsystem

1. Create `name.hesp` with `hesperus 0.1` and a `subsystem name "Label" { src: "path/**" ... }` root.
2. Add `import "./name.hesp"` inside the master's `system` block.
3. Add edges at the lowest block that contains both endpoints (cross-subsystem edges go in the master).
4. Run `hesp fmt` and `hesp check` on the master. Then `hesp emit --lang ts <repo> --intent <master>` (`<repo>` is the root of the code the intent describes; output lands in `.hesperus/actual/` under the current directory, or `--out <dir>`) and `hesp diff <master> .hesperus/actual/<master name>` to see what the code already provides. `hesp emit` needs the TypeScript extractor: `hesperus-ts` on `PATH`, or `HESPERUS_TS=<path to hesperus-ts/dist/cli.js>` in the environment, or `--extractor <command>`.

## Reading a diff for someone

Summarize in this order: violations (constraints marked `x`), conflicts, actual-only nodes and edges (drift, grouped by subsystem), intent-only items (open work). Mention `unresolved` edges (dashed, `resolved: false`) as "the code reaches somewhere the extractor could not identify", not as drift to fix. Give counts from the first line of `hesp diff` output.
