# Hesperus language specification, version 0.1

Hesperus is a non-executable, non-Turing-complete descriptor language for software systems. A `.hesp` file describes a graph: nested containers (system, subsystem, component), boundaries (ingress, egress, store, external, network, hardware) and typed edges between them. Every file lowers to a canonical JSON intermediate representation (IR, schema in `ir.schema.json`); the parser, printer, formatter, differ, extractors, language server and viewer all speak IR.

Two descriptions of one system exist side by side. **Intent** files are written by people or agents and tracked in git. **Actual** files are emitted by an extractor from the code, carry a `generated` header, are gitignored and are never edited. The differ merges them into a **unified** graph in which every node and edge is `match`, `intent-only`, `actual-only` or `conflict`.

Everything is deterministic: the same input produces byte-identical output on any machine. There are no coordinates, layout hints or timestamps anywhere in the language or IR.

Every fenced block in this document tagged `hesp` is parsed by the test suite. A block tagged `hesp` alone must round-trip source → IR → printer to exactly itself. A block tagged `hesp` followed by a block tagged `hesp canonical` must print to exactly that canonical block. Consecutive blocks tagged `hesp file=NAME` form one multi-file example. Blocks tagged `hesp error=E001,E002` must produce exactly those error codes. Blocks tagged `hesp fragment` are illustrative only.

## 1. Lexical structure

- **Encoding**: UTF-8, `\n` line endings. The formatter rewrites `\r\n` to `\n`; a leading byte order mark is accepted and removed. A file that is not valid UTF-8 is E034.
- **Comments**: `#` to end of line, including after the version line and after a closing `}`. Comments are never semantic: the formatter keeps them (except inside a multi-line list, where it drops them), the IR drops them.
- **Newlines** terminate statements. A block's `{` stays on its statement's line; `}` stands on its own line.
- **Identifiers**: `[A-Za-z_][A-Za-z0-9_-]*`, where every `-` must be followed by an identifier character (so `a->b` lexes as `a`, `->`, `b`). Case-sensitive. Reserved words cannot be identifiers: `hesperus generated import require forbid let template each in true false`. Kind names are not reserved: `store`, `network` or `host` are ordinary node names.
- **Strings**: double-quoted. Escapes: `\"` `\\` `\n` `\t` `\$`. Strings cannot span lines.
- **Version number**: the token after `hesperus` on line one, `MAJOR.MINOR`.
- **Interpolation**: inside a `template` or `each` body, `$name` or `${name}` in an identifier, path segment or string is replaced by the bound value (section 7). Outside those bodies, `$` is an error (E028).

## 2. Grammar (EBNF)

```
file        = version [ generated ] { definition } root ;
version     = "hesperus" NUMBER NEWLINE ;                    (* "hesperus 0.1" *)
generated   = "generated" STRING NEWLINE ;                   (* emitted files only *)
definition  = let | template ;
root        = node ;                                          (* exactly one root node *)

node        = kind IDENT [ STRING ] [ block ] NEWLINE ;
kind        = "system" | "subsystem" | "component"
            | "ingress" | "egress" | "store" | "external" | "network" | "hardware" ;
block       = "{" NEWLINE { item } "}" ;
item        = property | import | node | edge | constraint | each | call ;

property    = key ":" value NEWLINE ;
key         = "desc" | "src" | "protocol" | "host" | "engine" | "at" | "resolved" ;
value       = STRING | IDENT | "true" | "false" | list ;
list        = "[" [ value { "," value } [ "," ] ] "]" ;      (* may span lines *)

import      = "import" STRING NEWLINE ;

edge        = path "->" path [ ":" edgekind ] [ STRING ] [ block ] NEWLINE ;
edgekind    = "calls" | "reads" | "writes" | "http" | "ws" | "io" ;
constraint  = ( "require" | "forbid" ) path "->" path [ ":" edgekind ] NEWLINE ;
path        = IDENT { "." IDENT } ;

let         = "let" IDENT "=" list NEWLINE ;
template    = "template" IDENT "(" [ IDENT { "," IDENT } ] ")" block NEWLINE ;
each        = "each" IDENT "in" ( IDENT | list ) block NEWLINE ;
call        = IDENT "(" [ value { "," value } ] ")" NEWLINE ;
```

An edge block may only contain properties (`desc`, `at`, `resolved`). A node block may contain everything in `item`. Blank lines are allowed anywhere between statements.

## 3. Files, roots and imports

Every file begins with `hesperus 0.1`. A file holds `let` and `template` definitions followed by exactly one root node (E015). The master file's root is a `system`; `system` may appear nowhere else (E031). A subsystem file can also be checked on its own, in which case its root is the project's root. Blocks nest at most 64 levels deep (E035).

`import "relative/path.hesp"` inside a container's block splices the imported file's root node in as a child of that container. The imported root must be a `subsystem` (E014). Paths are relative to the importing file and use `/`. A file may be imported once per project (E013 also covers cycles). Definitions (`let`, `template`) are file-local.

```hesp file=shop.hesp
hesperus 0.1

system shop "Web shop" {
  import "./catalog.hesp"

  ingress web "Storefront" {
    protocol: http
  }

  web -> catalog: http
}
```

```hesp file=catalog.hesp
hesperus 0.1

subsystem catalog "Product catalog" {
  src: "src/catalog/**"

  component api
  component search {
    src: "src/catalog/search/**"
  }
  store products {
    engine: "postgres"
  }

  api -> products: reads
  api -> search: calls
}
```

## 4. Nodes and identifiers

A node is `kind name "optional label" { ... }`. The **label** is free text shown in the viewer and never diffed. The node's **id** is its fully qualified path: the names of its ancestors and itself joined by `.`, so `search` above has id `shop.catalog.search`. Ids must be unique (E010); the differ matches on them. A child of the root may not share the root's name (E033), so that the root's name always means the root in a path.

Kinds form a closed set:

| kind | role | may contain nodes |
|---|---|---|
| `system` | the root of the master file | yes |
| `subsystem` | a part of the system, usually one file | yes |
| `component` | a unit of code | yes |
| `ingress` | traffic entering the system (HTTP server, WebSocket server, queue consumer) | no |
| `egress` | traffic leaving the system to an unspecified party | no |
| `store` | a database or other persistent store | no |
| `external` | a third-party API or service | no |
| `network` | a network or an unresolved network target | no |
| `hardware` | a physical or OS-level resource: filesystem, processes, devices | no |

Boundary kinds (the last six) cannot contain nodes (E030).

### Properties

| property | type | allowed on | diffed |
|---|---|---|---|
| `desc` | string | any node, any edge | no |
| `src` | string or list of strings | system, subsystem, component | no |
| `protocol` | one of `http ws grpc tcp udp ssh other` | ingress, egress, external, network | yes |
| `host` | string | external, network | yes |
| `engine` | string | store | yes |
| `at` | list of `"path:line"` strings | any node, any edge | no |
| `resolved` | `true` or `false`, default `true` | edges | no |

Unknown keys are E007; keys on the wrong kind are E008; wrong value types are E009; an unknown protocol is E023.

`src` is a **binding**: a list of path globs (`*`, `**`, `?`, `{a,b}`) relative to the repository root. The extractor assigns every source file to the bound node whose glob has the longest literal prefix match (ties: the deeper node, then the longer pattern); files that match nothing go to the `unbound` subsystem. Bindings are intent-only; the extractor copies none of them into actual files, except that each component of the synthesized `unbound` subsystem carries the directory glob it was grouped by, so a reader can turn it into a binding.

`at` is **evidence**: `"path:line"` into the repository, written by extractors so viewers can jump to source. The differ ignores it.

```hesp
hesperus 0.1

system billing "Billing" {
  desc: "Invoices and payments"
  src: ["src/billing/**", "src/shared/money.ts"]

  component invoices
  ingress api {
    desc: "Public REST API"
    protocol: http
  }
  store ledger "Ledger database" {
    engine: "postgres"
  }
  external stripe {
    protocol: http
    host: "api.stripe.com"
  }
  hardware filesystem

  api -> invoices: http
  invoices -> filesystem: io
  invoices -> ledger: writes
  invoices -> stripe: http
}
```

## 5. Paths and references

Edges and constraints name nodes by **path**: identifiers joined by `.`. A path is resolved lexically: starting at the container whose block holds the statement, the first segment must name a child of that container and each further segment a child of the previous; if that fails, the same is tried at each enclosing container up to the root; finally, a path whose first segment is the root system's name is resolved from the root, so a fully qualified id is always a valid path. The innermost match wins. An unresolvable path is E011, with the nearest existing name suggested.

```hesp
hesperus 0.1

system mesh {
  subsystem peers {
    component accept
    component dial
    ingress link {
      protocol: ws
    }

    link -> accept: ws
  }
  subsystem store {
    component log
  }

  peers.accept -> store.log: writes
  peers.dial -> store.log: reads
}
```

In canonical form an edge is printed in the block of the lowest common ancestor of its two endpoints, with both paths relative to that block; when one endpoint *is* that ancestor (an edge between a container and something inside it), the edge is printed one block up, in the ancestor's parent, where the container's name is unambiguous. The example above is already canonical.

## 6. Edges and constraints

`from -> to: kind "optional label" { properties }`. The kind defaults to `calls` when omitted; the canonical form always prints it. Edge kinds form a closed set:

| kind | meaning |
|---|---|
| `calls` | code calls, imports or depends on code |
| `reads` | reads from a store |
| `writes` | writes to a store |
| `http` | an HTTP request or route |
| `ws` | a WebSocket connection |
| `io` | filesystem, process or device I/O |

An edge's identity is `(from, to, kind)`; the same triple written twice is one edge (E032). An edge cannot connect a node to itself (E036). A property may be set once per block (E037). Labels and `desc` are free text. `resolved: false` marks an edge an extractor emitted without being able to resolve its target statically; its target is then usually the `network` node `unresolved`.

Constraints are checked by the differ against the **actual** graph. `forbid a -> b` fails if any actual edge runs from `a` or a descendant of `a` to `b` or a descendant of `b`; with `: kind` only edges of that kind count. `require a -> b` fails if no such edge exists. A violated constraint makes `hesp diff` exit 1.

```hesp
hesperus 0.1

system app {
  subsystem api {
    component handlers
  }
  subsystem ui {
    component pages
  }
  store db {
    engine: "sqlite"
  }

  api.handlers -> db: reads
  api.handlers -> db: writes
  ui.pages -> api.handlers: http

  forbid ui -> db
  require api -> db: writes
}
```

## 7. Repetition: `let`, `template`, `each`

Hesperus has no loops over anything unbounded, no conditionals and no recursion. Repetition exists only through total constructs that expand before linking:

- `let name = [a, b, "c"]` binds a name to a finite list of identifiers and strings. Lists hold at most 256 items (E021).
- `template name(p1, p2) { items }` defines a parameterized body. Templates are called as `name(arg, ...)` inside a block; the body is spliced in with each `$p` replaced by the argument. Arguments are identifiers, strings or lists; a list argument may only be iterated by `each` (E009). Arity must match (E018).
- `each x in list { items }` splices the body once per element with `$x` bound to it. The list is a literal, a `let` name, or a list parameter of the enclosing template (`parts` or `$parts`). A bound variable is passed on as an argument by writing it `$x`; a bare identifier is a literal name.

A template body may call only templates defined **earlier in the file** (E019), so expansion always terminates. Bodies nest at most 4 levels deep and a file expands to at most 10,000 statements (E021). Interpolated identifiers must be valid identifiers after substitution (E022). Definitions live at the top of the file, before the root node, and are local to it.

```hesp
hesperus 0.1

let regions = [eu, us]

template region(r) {
  subsystem $r "Region $r" {
    src: "deploy/$r/**"

    component gateway
    store cache {
      engine: "redis"
    }

    gateway -> cache: reads
  }
}

system cdn {
  each r in regions {
    region($r)
  }
  ingress edge {
    protocol: http
  }

  edge -> eu.gateway: http
  edge -> us.gateway: http
}
```

```hesp canonical
hesperus 0.1

system cdn {
  subsystem eu "Region eu" {
    src: "deploy/eu/**"

    component gateway
    store cache {
      engine: "redis"
    }

    gateway -> cache: reads
  }
  subsystem us "Region us" {
    src: "deploy/us/**"

    component gateway
    store cache {
      engine: "redis"
    }

    gateway -> cache: reads
  }
  ingress edge {
    protocol: http
  }

  edge -> eu.gateway: http
  edge -> us.gateway: http
}
```

The IR holds only the expanded graph. `hesp fmt` formats the source as written and keeps the templates; `hesp ir` and the printer work on the expansion.

## 8. Generated files

An extractor's output starts with a `generated` line naming the extractor. Such a file is a fact about the code, not an opinion: `hesp fmt` never rewrites it (its content is already canonical, so `--check` passes), the language server reports an information diagnostic on it and refuses rename and formatting edits, and the skill tells agents never to touch it.

```hesp
hesperus 0.1
generated "hesperus-ts"

system demo {
  component api
  hardware filesystem

  api -> filesystem: io {
    at: ["src/api/files.ts:12", "src/api/files.ts:40"]
  }
}
```

## 9. Comments and formatting

Comments and blank lines are kept by `hesp fmt` and dropped by the IR. The formatter normalizes indentation to two spaces, one space around `->` and after `:`, double quotes, no trailing commas, runs of blank lines to one, and places a `{` on its statement's line and `}` on its own. Formatting is idempotent: `fmt(fmt(x)) == fmt(x)`.

```hesp
hesperus 0.1

# The shop, with notes.
system shop {
  component api # serves the storefront

  # not built yet
  component recommendations

  api -> recommendations: calls
}
```

```hesp canonical
hesperus 0.1

system shop {
  component api
  component recommendations

  api -> recommendations: calls
}
```

## 10. Canonical form

The printer (IR → text) emits exactly one layout:

1. `hesperus 0.1`, then `generated "..."` if present, then a blank line.
2. The root node. Inside every block, in this order and separated by one blank line between non-empty groups: properties (`desc`, `src`, `protocol`, `host`, `engine`, `resolved`, `at`), imports sorted by path, child nodes, edges, constraints.
3. Child nodes sorted by kind in the order `system subsystem component ingress egress store external network hardware`, then by name. Edges sorted by `(from, to, kind)`; constraints by `(rule, from, to, kind)`.
4. A one-item list prints as a bare value; an empty block prints no braces; the edge kind is always explicit.
5. Nodes live in the file whose root is their nearest file-root ancestor; edges and constraints live in the block of their lowest common ancestor (its parent when an endpoint is the ancestor itself) and use the shortest relative paths from there.
6. Two-space indentation, `\n` line endings, one trailing newline.

A template-free file whose statements already follow this order is its own canonical form.

## 11. IR

The IR is JSON as described by `ir.schema.json`. Canonical IR has keys in schema order, two-space indentation, nodes sorted by `id`, edges by `(from, to, kind)`, constraints by `(rule, from, to, kind)`, `src` and `at` lists sorted, a trailing newline. Every node carries `id`, `kind`, `name`, `parent`, `label`, `desc`, `src`, `protocol`, `host`, `engine`, `at`; every edge `from`, `to`, `kind`, `label`, `desc`, `resolved`, `at`; the document carries `hesperus`, `generated`, `root`, `files`, `nodes`, `edges`, `constraints`. `files` records which node is the root of which file so the printer can split the graph back into the same files. `hesp ir --locations` adds an optional `locations` map from node id to `path:line` of its declaration, for editors; it is not part of the canonical IR and the printer ignores it.

## 12. The unified graph

`hesp diff intent.hesp actual.hesp` loads both projects and matches nodes by id and edges by `(from, to, kind)`:

| status | meaning | text mark |
|---|---|---|
| `match` | both sides, diffed properties agree | `=` |
| `intent-only` | declared, not built: work for an agent | `-` |
| `actual-only` | code nobody declared: drift | `+` |
| `conflict` | both sides, `kind`, `protocol`, `host` or `engine` disagree (only when both sides set the property) | `!` |

Constraints come from the intent and are evaluated against the actual (`ok` or `x`). With `--depth N` edges are aggregated to the nodes visible at depth N: an aggregated edge carries the count of underlying edges and the worst status among them (`conflict` > `actual-only` > `intent-only` > `match`). `--json` prints the unified graph as JSON; `--all` includes matches in the text output, which otherwise lists differences only.

## 13. Diagnostics

The parser recovers at the next newline or `}` and reports every error it finds. Each diagnostic has a code, a message, a span (file, line, column, length) and optionally a fix (replacement text for the span).

| code | message |
|---|---|
| E001 | missing version line (fix: insert `hesperus 0.1`) |
| E002 | unsupported version |
| E003 | unexpected token |
| E004 | unterminated string |
| E005 | unknown node kind (fix: nearest kind) |
| E006 | unknown edge kind (fix: nearest kind) |
| E007 | unknown property (fix: nearest key) |
| E008 | property not allowed on this kind |
| E009 | wrong value type for property or argument |
| E010 | duplicate node id |
| E011 | unresolved reference (fix: nearest id) |
| E012 | import not found |
| E013 | file imported twice or import cycle |
| E014 | imported root must be a subsystem |
| E015 | a file must hold exactly one root node |
| E017 | undefined template |
| E018 | template arity mismatch |
| E019 | template calls a template defined later (or itself) |
| E020 | undefined variable or list |
| E021 | expansion limit exceeded |
| E022 | interpolation does not produce a valid identifier |
| E023 | unknown protocol |
| E027 | `let` or `template` redefined |
| E028 | `$` outside a template or `each` body |
| E029 | bad string escape |
| E030 | boundary nodes cannot contain nodes |
| E031 | `system` only at the root of the master file |
| E032 | duplicate edge |
| E033 | a child of the root shares the root's name |
| E034 | file is not valid UTF-8 |
| E035 | blocks nest deeper than 64 levels |
| E036 | an edge connects a node to itself |
| E037 | property set twice |
| E038 | a hand-written file imports a generated one |
| E039 | statement in the wrong place (`let`/`template` inside a block, `import` inside a template or `each` body, a node item at the top level) |

```hesp error=E005,E007,E011
hesperus 0.1

system broken {
  componet api
  component web {
    sources: "web/**"
  }

  web -> ap: http
}
```

```hesp error=E001,E006
system noversion {
  component a
  component b

  a -> b: invokes
}
```
