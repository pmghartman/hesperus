---
name: hesperus
description: Read and write Hesperus `.hesp` system descriptions. Use when a task mentions Hesperus, `.hesp` files, a system's intent vs actual architecture, `hesp check`, `hesp diff`, or asks what a repository's architecture should be or has drifted to.
---

# Hesperus

Hesperus describes a software system as a graph in `.hesp` files. Two descriptions exist for one system:

- **Intent** (`examples/<system>/*.hesp` or wherever the project keeps them, tracked in git): what the system *should* be. You may edit these.
- **Actual** (`.hesperus/actual/*.hesp`, gitignored, header line `generated "hesperus-ts"`): what the code *is*, emitted by `hesp emit`. **Never edit a generated file.** Change the code or the intent instead and re-emit.

`hesp diff intent.hesp .hesperus/actual/intent.hesp` merges them. Read its statuses as:

| status | meaning | what you do |
|---|---|---|
| `match` (`=`) | declared and built | nothing |
| `intent-only` (`-`) | declared, not built | **a task**: build it (or remove the declaration if the plan changed) |
| `actual-only` (`+`) | built, never declared | **drift**: report it; add it to the intent only if it is wanted |
| `conflict` (`!`) | both exist, `kind`/`protocol`/`host`/`engine` disagree | **drift**: report it; fix the code or the intent, whichever is wrong |
| constraint `x` | a `forbid` has a witness or a `require` has none | **violation**: report it; it fails the build (`hesp diff` exits 1) |

## After every edit

```
hesp fmt <dir>        # formats in place; never touches generated files
hesp check <master>   # parses the master and every import; exit 0 means clean
```

Fix every diagnostic. Each one names a code (`E011`), a position and often a fix (`help: replace with ...`). Never leave a file that fails `hesp check`.

## Syntax in one page

```hesp
hesperus 0.1                       # every file starts with this line

system shop "Web shop" {           # the master's root: a system; one root per file
  desc: "Free text, never diffed"
  src: ["src/**", "lib/money.ts"]   # binding: which code belongs here (globs)

  import "./catalog.hesp"          # splices that file's subsystem in as a child

  component api                    # containers: system, subsystem, component
  ingress web "Storefront" {       # boundaries: ingress egress store external network hardware
    protocol: http                 # http ws grpc tcp udp ssh other
  }
  store db {
    engine: "postgres"             # free string; the extractor emits postgres, mysql, sqlite, mongodb, redis
  }
  external stripe {
    protocol: http
    host: "api.stripe.com"         # binds the detected external with this host
  }
  hardware filesystem              # extractor names: filesystem, processes; network: unresolved

  web -> api: http                 # edge kinds: calls reads writes http ws io (default calls)
  api -> db: reads
  api -> db: writes
  api -> stripe: http
  api -> filesystem: io

  forbid web -> db                 # no edge from web (or anything inside) to db
  require api -> db: writes        # at least one such edge must exist in the code
}
```

An imported file:

```hesp
hesperus 0.1

subsystem catalog "Product catalog" {
  src: "src/catalog/**"

  component search {
    src: "src/catalog/search/**"   # more specific globs win
  }
  component listing

  listing -> search: calls
}
```

Rules that bite:

- Ids are paths: `shop.catalog.search`. Edges name nodes by path, resolved from the enclosing block outward, so inside `catalog` write `search`, at the root write `catalog.search`; the fully qualified id always works.
- A node must exist before an edge can name it; there is no implicit creation. `hesp check` says `E011` otherwise.
- Comments start with `#`. Labels (the quoted string after the name) are free text and never diffed.
- Boundary nodes (`ingress`, `store`, ...) hold no children.
- Edge identity is `(from, to, kind)`: `api -> db: reads` and `api -> db: writes` are two edges.
- Repetition only through `let x = [a, b]`, `template name(p) { ... }` called as `name($x)`, and `each x in list { ... }`, all at most 4 levels deep; templates may only call templates defined earlier in the file. Interpolate with `$p` or `${p}`.
- Reserved words: `hesperus generated import require forbid let template each in true false`. Kind names (`store`, `network`) are fine as node names.

## Adding a subsystem

1. Create `name.hesp` with `hesperus 0.1` and a `subsystem name "Label" { src: "path/**" ... }` root.
2. Add `import "./name.hesp"` inside the master's `system` block.
3. Add edges at the lowest block that contains both endpoints (cross-subsystem edges go in the master).
4. Run `hesp fmt` and `hesp check` on the master. Then `hesp emit --lang ts <repo> --intent <master>` and `hesp diff` to see what the code already provides.

## Reading a diff for someone

Summarize in this order: violations (constraints marked `x`), conflicts, actual-only nodes and edges (drift, grouped by subsystem), intent-only items (open work). Mention `unresolved` edges (dashed, `resolved: false`) as "the code reaches somewhere the extractor could not identify", not as drift to fix. Give counts from the first line of `hesp diff` output.
