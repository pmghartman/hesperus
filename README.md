<p align="center">
  <img src="vscode/media/icon.png" alt="Hesperus" width="128" height="128">
</p>

<h1 align="center">Hesperus</h1>

<p align="center">A boundary linter and live map for repos that agents write, built by static analysis.</p>

Hesperus compiles source "up" into a graph an engineer can question: packages, files, types, and functions, with the calls and data flow between them. It is made for the person overseeing an agent who no longer reads every diff: what reaches databases, the internet, model APIs and other outside systems, what changed since they last looked, and what their policy forbids, without trusting an agent-drawn diagram.

- **Analysis only.** Nodes and edges come from the editor's language servers and tree-sitter. No model creates, removes, or reweights anything.
- **Honest about unknowns.** Every edge is `resolved`, `may` (dynamic dispatch, function values), or `unresolved` (reflection, injection). Unknowns are drawn, never dropped.
- **Zoomable.** Start from the whole repo. Expanding a box splits its edges in place; every rollup traces to the edges beneath it.
- **Per-language.** Each language is indexed separately through its editor extension; a missing one leaves that language's files as unindexed nodes and the rest still builds.
- **Read-only.** The only thing written to the analyzed repo is the `.hesperus/` cache (graph, accepted baseline, latest report).

## Boundaries

Hesperus files every call that leaves the repo under what it reaches:

| Boundary | For example |
| --- | --- |
| Database | `pg`, Prisma, SQLAlchemy, `database/sql`, Redis, IndexedDB |
| Network | `fetch`, axios, `requests`, `net/http`, Express and other servers |
| AI models | OpenAI, Anthropic, LangChain, Ollama |
| Cloud & SaaS | AWS, Google Cloud, Azure, Firebase, Stripe |
| Queues | Kafka, RabbitMQ, NATS, Celery |
| Filesystem, Processes, Environment | `fs`, `child_process`, `subprocess`, `os.Getenv` |

The table is fixed and per language (`src/core/boundary.ts`); a package it does not know is guessed from its name only as a last resort, and says so. Calls in both directions count: a handler registered with a server is the network calling in. Add your own packages in `hesperus.json`.

The default view is the repo's call flow with each boundary as a box on the right, so the first picture answers "what talks to the database, the internet, a model?". Open a boundary to see the packages and calls behind it.

## Linting while an agent works

Hesperus is a linter for boundary crossings, meant to run beside an agent:

- **Watch.** When files change on disk, Hesperus re-indexes after a quiet spell (`hesperus.watch`, `hesperus.watchDelay`).
- **New since you looked.** The first index records what the repo already does in `.hesperus/baseline.json`. After that, a crossing or dependency the agent adds is a warning (or info) in the Problems panel, amber in the graph, and counted in the status bar. **Accept** it (quick fix, sidebar, or *Hesperus: Accept All Changes as Reviewed*) once you have looked.
- **Policy.** `hesperus.json` at the repo root, written by people, says what each part of the repo may reach. A violation is an error, red in the graph, until the code or the policy changes:

```json
{
  "boundaries": { "database": ["@acme/db"] },
  "rules": [
    { "paths": ["src/core/**"], "deny": ["network", "database", "process"], "reason": "core stays pure" },
    { "paths": ["src/api/**"], "allow": ["network", "database"] }
  ],
  "review": { "crossings": "warning", "dependencies": "info" }
}
```

- **For the agent.** Every lint writes `.hesperus/report.json`, and `hesperus check` lints the last graph from a terminal, a hook, or CI-like scripts (exit 1 on errors; `--json`, `--accept`, `--max-warnings N`). It reads the graph the extension built and does not index; it says when that graph is older than `HEAD`.

```
node vscode/out/cli.js check .
```


## Languages

| Language | Editor extension |
| --- | --- |
| Go | Go (`golang.go`) |
| JavaScript, TypeScript | Built in |
| Rust | rust-analyzer (`rust-lang.rust-analyzer`) |
| C# | C# (`ms-dotnettools.csharp`) |
| C, C++ | C/C++ (`ms-vscode.cpptools`) |
| Dart, Flutter | Dart (`Dart-Code.dart-code`) |
| Python | Python (`ms-python.python`) |
| Java | Language Support for Java (`redhat.java`) |
| Kotlin | Kotlin (`fwcd.kotlin`) |
| PHP | PHP Intelephense (`bmewburn.vscode-intelephense-client`) |
| Ruby | Ruby LSP (`Shopify.ruby-lsp`) |
| Anything else (Swift, Scala, Lua, Zig, ...) | Generic: whatever language server the editor has. Definitions and references only, calls shown as `may` |

Other languages are counted and not analyzed.

## VS Code extension

Click the Hesperus icon in the activity bar. On first use it detects languages, asks each language's editor extension for symbols and references (offering to install a missing one), builds the graph into `.hesperus/` (untracked, safe to delete), and opens the graph.

- Scroll to zoom, drag to pan. Click a box to expand it.
- Cmd/Ctrl-click or double-click opens the source.
- Hover to focus a box's connections or see the counts behind an edge.
- The sidebar shows status, finds nodes by name, filters calls, data flow, overrides, and state transitions, lists the state machines found, and re-indexes.
- Automaton view: the program as a state machine over its state variables, with external events and entry points as inputs.

A stale cache (new commit, lockfile, or tool version) fails loudly, then re-indexes.

## Layout

| Path | Contents |
| --- | --- |
| `vscode/src/core` | IR, graph building, aggregation, cache, canonical serialization; `boundary.ts` (classification, boundary view) and `lint.ts` (policy, baseline, findings) |
| `vscode/src/linter.ts`, `review.ts`, `cli.ts` | Problems entries and quick fixes; policy, baseline and report files; `hesperus check` |
| `vscode/schema/policy.schema.json` | `hesperus.json` schema |
| `vscode/src/lang` | tree-sitter syntax facts and editor extension per language |
| `vscode/src/editor.ts` | reads symbols and references from the editor's language servers |
| `vscode/src/extension.ts`, `layout.ts` | webview extension; deterministic ELK layout |
| `vscode/schema/graph.schema.json` | versioned graph schema |

TypeScript on Node, one npm package, no native code (tree-sitter runs as WebAssembly). See [CLAUDE.md](CLAUDE.md) for invariants and design.

## Development

```
cd vscode && npm ci && npm run build
npm test                 # build plus a short smoke test
```

## License

Apache-2.0.
