# Design decisions

Every choice made without Patrick in the room, with the options weighed. Review these first.

## Where v1 lives

**Chosen**: a fresh orphan branch `v1`, built in the git worktree `.claude/worktrees/v1`, so `main` (the earlier Hesperus: a TypeScript static-analysis extension) stays untouched until Patrick decides to merge or replace it.
**Options**: replace the files on `main` (destroys the current tool in the working checkout), a subdirectory of `main` (two unrelated projects in one tree, two READMEs), a new repository (loses the name and history).
**Why**: the brief describes a different product under the same name; a branch keeps both reachable and the switch reversible. The LICENSE (Apache-2.0) is carried over.

## Surface syntax

**Chosen**: D2-flavoured. `kind name "label" { ... }` for nodes, `a -> b: kind` for edges, `key: value` for properties, `#` comments, newline-terminated statements, dotted paths, lexical path resolution (innermost container first, then ancestors, then the root system's name as an absolute prefix).
**Options**: Mermaid-style (`A-->B`, implicit node creation), YAML, a Lisp-like s-expression form, D2 itself with an extension.
**Why**: D2 is terse and readable, and its container syntax maps directly onto nested subsystems. Implicit node creation (Mermaid) is rejected because an unresolved reference should be an error, not a new node; a typo must not silently create drift. YAML is verbose for edges. Reusing D2 would import its layout and styling vocabulary, which the brief rules out. D2's `_` parent reference is replaced by lexical resolution, which makes fully qualified ids valid everywhere and keeps the printer canonical.

## The edge kind defaults to `calls`

`a -> b` is legal and means `a -> b: calls`; the canonical form always prints the kind. One default keeps hand-written files short while the IR stays explicit.

## Kind names are not reserved

`store`, `network`, `host`, `system` are legal node names: real codebases (Phosphorus has a `store` package) use them, and the parser can tell `store x` (a node) from `store -> x` (an edge) by the next token. Only the structural words (`hesperus generated import require forbid let template each in true false`) are reserved.

## Node kinds

**Chosen**: `system subsystem component` (containers) and `ingress egress store external network hardware` (boundaries). Closed set.
**Options**: more granular boundaries (`queue`, `cache`, `cdn`, `browser`), a single `boundary` kind with a free `type` property.
**Why**: the brief lists exactly these six boundary roles. A `queue` or `cache` is a `store` with an `engine`; a CDN is an `external` with a `host`. A free-text type would move framework knowledge into the language.

## Edge kinds

**Chosen**: `calls reads writes http ws io`. Closed set.
**Options**: add `emits`/`listens` for events, `queue`, `grpc`, `depends`.
**Why**: these six cover everything the v1 extractor can detect (imports, routes, outbound HTTP, DB access, WebSockets, fs/process). `grpc` is a protocol on the node, not an edge kind. Events need runtime knowledge; out of scope.

## Properties and what is diffed

**Chosen**: `desc src protocol host engine at resolved`. Diffed: `kind`, `protocol`, `host`, `engine`, and only when both sides set the property. `protocol` is a closed set (`http ws grpc tcp udp ssh other`); `host` and `engine` are free strings.
**Options**: diff everything; a closed `engine` set (postgres, mysql, ...); a generic `props: {}` map.
**Why**: labels and descriptions are opinion. `src` is a binding instruction, meaningful only in intent. `at` is evidence, meaningful only in actual. A closed engine set would need updating for every database the extractor learns; a free string diffs fine. A generic map would let intent and actual invent incompatible vocabularies.

## Boundary bindings

**Chosen**: besides `src` globs on containers, an intent boundary node binds a detected boundary of the same kind when its binding key matches: `host` for `external`, `engine` for `store`, `protocol` for `ingress`/`egress`, the name for `network`/`hardware`. The actual node then takes the intent node's id (including its position in the tree). Unbound detections get extractor-generated names (`postgres`, `api_stripe_com`, `filesystem`, `processes`, `http`, `ws`, `unresolved`) under the root.
**Options**: match externals by generated name only (forces authors to spell `api_stripe_com`); let the differ match by property (contradicts "the differ matches on ids").
**Why**: the differ stays a pure id matcher; the extractor owns all heuristics, including how a detection is named.

## Required and forbidden edges

**Chosen**: `require a -> b [: kind]` and `forbid a -> b [: kind]`, evaluated by the differ against the actual graph, with container endpoints meaning "any descendant". A violation exits 1.
**Options**: evaluate against intent too; wildcard kinds; richer predicates.
**Why**: a declared intent edge missing from actual is already `intent-only`; `require` upgrades that to a failure. Structural constraints only, per the brief.

## Templates and comprehensions

**Chosen**: `let` lists, `template name(params) { }` called as `name(args)`, `each x in list { }`. A template may call only templates defined earlier in the file; bodies nest at most 4 deep; lists hold at most 256 items; a file expands to at most 10,000 statements. Definitions are file-local and precede the root node. Interpolation `$x` / `${x}` in identifiers, path segments and strings.
**Options**: no templates in v1; macros with conditionals; cross-file template imports.
**Why**: "defined earlier" is a syntactic guarantee of termination with no call-graph analysis. Conditionals would make files depend on evaluation; the brief wants declarations. Cross-file templates would make a subsystem file unreadable alone.

## Two printers

**Chosen**: `hesp fmt` formats the AST (keeps comments, order, templates). The printer turns IR into canonical text (sorted, expanded, comment-free). Both share one layout engine, so a template-free canonical-order file is a fixed point of both.
**Why**: the brief lists an idempotent formatter and a printer; a formatter that reordered a human's file or expanded their templates would be hostile, while a printer that kept source order would make extractor output depend on intent order.

## Canonical placement of edges

Edges and constraints print in the block of the endpoints' lowest common ancestor, with the shortest relative paths. This is the only placement that is a pure function of the graph.

## Multi-file layout

Master imports one file per subsystem with `import "./name.hesp"`; the imported file's root declares its own name. The IR's `files` array records the split so the printer reproduces it, and the extractor mirrors the intent's layout into `.hesperus/actual/`.
**Option rejected**: `import name from "file"`; redundant with the root declaration and a second place for the name to drift.

## IR shape

Flat sorted arrays of nodes (with `parent`) and edges, keyed by fully qualified id. Canonical JSON prints every field (nulls and empty lists included) so the output is a fixed layout; inputs may omit defaults. Chosen over a nested tree because the differ, aggregation and the viewer all index by id, and a flat array is trivially sorted.

## Unified diff text

`=` match, `-` intent-only, `+` actual-only, `!` conflict, `ok`/`x` for constraints, following `diff intent actual`. Differences only by default; `--all` adds matches; `--depth N` aggregates edges. Exit 0 unless a constraint is violated (or input fails to parse: exit 2). Drift alone is information, not failure.

## Extractor placement and invocation

`hesp emit --lang ts <repo>` runs the Node extractor as a subprocess (`--extractor <command>`, else `$HESPERUS_TS`, else `hesperus-ts` on `PATH`), feeding it the intent IR on stdin and reading actual IR from stdout, then prints `.hesp` files. Rust never parses TypeScript; TypeScript never prints `.hesp`.
**Option rejected**: a Node addon or embedding a JS engine in Rust (heavy, non-deterministic across platforms); writing actual files from TypeScript (two printers to keep byte-identical).

## `hesp emit` without `--intent`

`hesp emit --lang ts <repo>` runs without an intent: the extractor then has no bindings, every file lands in the `unbound` bucket, and the root is named after the repository directory. It prints a note saying so. The useful form passes `--intent <master>`; the brief's bare form still works.

## One unresolved sink

Edges whose target cannot be identified statically all point at `network unresolved` with `resolved: false`: outbound HTTP or WebSocket calls with dynamic URLs, and dynamic `import(expr)` / `require(expr)` with a non-literal specifier (a `calls` edge). One sink keeps the actual graph readable; the edge kind says what the code tried to do.

## Edges between a node and its own ancestor

The extractor emits them (a file bound to a subsystem that imports a file bound to one of its components yields `subsystem -> subsystem.component: calls`; a container's own code touching a boundary declared inside it yields `container -> container.boundary`). They are legal in the language, the differ keys them like any other edge, and the inspector lists them; the graph view folds edges to the visible level and so cannot draw an edge from a box to itself, which is the one place they stay invisible.

## Actual output location

`.hesperus/actual/` under the directory `hesp emit` is run in (`--out` overrides), never inside the analyzed repository unless that is the current directory. Keeps the tool from writing into someone else's checkout. Actual files mirror the intent's layout relative to the master; an intent that imports from outside the master's directory (`../shared/x.hesp`) cannot be mirrored and `hesp emit` refuses to write it rather than write outside `--out`.

## Multi-language direction: frameworks are rows in a table

Patrick's direction (relayed during the build): Hesperus will support many languages, and it should be built so that adding a language is as simple as adding rows to a table.

**Chosen**: the extractor is split in three. `hesperus-ts/src/facts.ts` is the TypeScript *frontend*: ts-morph walks one file and emits a neutral fact stream (imports; calls, constructions and tagged templates with the callee name, the receiver text, the receiver's *origin* as the import binding it came from or `<global>`, and each argument's static text; string comparisons; object properties). `hesperus-ts/src/rules.ts` is *the table*: every row maps an origin module and symbol plus a call-site name and an argument classification to one effect (ingress by protocol, external-by-url, store with engine and access, hardware by name). `hesperus-ts/src/engine.ts` applies the table to the facts and knows nothing about any library. Adding a framework is adding rows; `src/test/rules.test.ts` requires a fixture per row, so the Definition of done's "fixture per detection heuristic" is now "fixture per rule row" (the eight per-heuristic repository fixtures remain as integration goldens, and their output was byte-identical before and after the split). `hesperus-ts explain <file>` prints a file's facts and the rows they fire; `hesperus-ts rules` prints the table.

**The core stays Rust and language-neutral**: it speaks only IR, never parses a source language, and is the natural host for the planned second frontend: a Rust extractor over SCIP indexes (cross-file symbol resolution for TypeScript, Go, Python, Java, Rust, C#, Ruby) with tree-sitter for syntax-level patterns, emitting the same fact stream and reusing the same rule table (the table would move to a JSON file with a schema at that point; in v1 it is typed TypeScript so rows are checked at compile time).

**Honest limit**: edge quality is bounded by semantic resolution, not by the host language. Tree-sitter alone yields imports and literal routes; function-level `calls` across files and dynamic dispatch need SCIP or a type checker. The v1 frontend resolves imports itself (relative paths, tsconfig `paths`, workspace packages) and tracks value origins within a file only; a receiver whose origin crosses a file boundary (a `pool` exported from `db.ts`) is `<local>` at the call site and matches only `<any>` rows.

## Extractor heuristics (framework knowledge, extractor only)

The rows of the table, summarized. Three classifiers sit beside the table rather than in it, because they are not about any library: `classifyUrl` (host of a literal URL; loopback hosts are the repository's own server) and `sqlAccess` (SQL verb → reads/writes) in `engine.ts`, and the unbound-component naming and the 20-entry evidence cap in `extract.ts`/`ir.ts`; they have unit tests rather than per-row fixtures.

- Imports between files bound to different nodes: `calls`; type-only imports ignored; relative, tsconfig `paths`, and workspace-package (`package.json` name map) specifiers resolved; everything else ignored unless a boundary heuristic claims it.
- Routes: `app.get|post|put|delete|patch|options|head|all|use("/...")` on a value created by `express()`, `Router()`, `new Hono()`, `new Koa()`, `fastify()`; `Bun.serve(`, `Deno.serve(`, `http(s).createServer(`; and `pathname === "/..."` / `.startsWith("/...")` / `case "/...":` comparisons. All feed one `ingress http` node.
- Outbound HTTP: `fetch`, `axios`, `got`, `ky`, `undici.request`, `http(s).request|get`. A literal or static-prefixed URL yields `external <host>`; a root-relative path targets the own `ingress http`; anything else targets `network unresolved` with `resolved: false`.
- Stores: `pg`, `mysql2`, `mongodb`, `redis`/`ioredis`, `better-sqlite3`/`bun:sqlite`, `@prisma/client`. SQL verbs and method names decide `reads`/`writes`; an undecidable call emits both with `resolved: false`.
- WebSockets: `ws` (`WebSocketServer`), `socket.io`, Bun `upgrade(`/`websocket:` → `ingress ws`; `new WebSocket(url)` → `external` by host or `unresolved`.
- fs (`fs`, `node:fs`, `fs/promises`, `Bun.file/write`) → `hardware filesystem`, `io`; `child_process` (`spawn exec execFile fork`), `Bun.spawn` → `hardware processes`, `io`.
- Unbound files: `subsystem unbound` with one component per directory (first two path segments, `_`-joined; `root` for top-level files).
- Loopback hosts (`localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, `*.localhost`) count as the repository's own server and attach to its `ingress`, not to an `external`.
- Evidence lists are capped at 20 entries per node or edge, sorted by path and then numeric line (both the TypeScript and Rust canonicalizers use this order).

## Dependencies

Rust: `serde`/`serde_json` (IR), `clap` (CLI), `tower-lsp` + `tokio` (LSP; the brief names tower-lsp), `ropey`? no — line/column maps are computed from the source directly. No `insta`: golden files are plain files with `UPDATE_GOLDEN=1`. No `jsonschema` crate: schema conformance is checked in the TypeScript tests with `ajv` against `docs/ir.schema.json`, covering Rust-produced IR too.
TypeScript: `ts-morph` (the brief names it), `ajv` (dev, schema validation of every IR the tests produce against `docs/ir.schema.json`), `typescript` (dev, build), `@types/node` (dev). The glob matcher is written in-house (about 60 lines) rather than adding `picomatch`, so one function owns binding semantics on both sides of the test.
Extension: `vscode-languageclient` (LSP client), `@vscode/vsce` (packaging, dev), `@types/vscode` (dev), `esbuild` (bundling the extension and the webview, dev), `typescript` and `@types/node` (dev, compile the node tests), `@vscode/test-electron` (dev, the optional activation smoke test). The bundled `media/viewer.js` is build output and not tracked. The viewer uses no graph library: a deterministic layered layout is written in `viewer/layout.ts` and tested with golden JSON, because dagre/elk are either unmaintained or non-trivially deterministic across versions.

## Extension tests

The viewer's model, layout and renderer are pure TypeScript with no DOM or `vscode` dependency, so the webview render test for the three modes runs under plain `node --test` with golden SVGs. An activation smoke test inside a real VS Code (`npm run test:vscode`, `@vscode/test-electron`) exists but is not part of `npm test`: it downloads VS Code, and the Definition of done asks for tests that run anywhere.

## Layout placement

Auto-layout lives only in the viewer (`vscode-hesperus/src/viewer/layout.ts`): a nested layered layout where each container ranks its children by longest path over the edges visible at that level, columns are ranks, rows are sorted by name. Nothing about layout enters the language, IR or CLI.

## License

Apache-2.0, carried over from the existing repository.

## Example repository

Phosphorus (`/Users/pmh/phosphorus`) was present, so `examples/phosphorus/` describes it and `hesp emit` runs against it. Extractor heuristics that Phosphorus does not exercise (Express routes, database clients, `ws`) are covered by fixtures under `hesperus-ts/test/fixtures/`, one per heuristic.
