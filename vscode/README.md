# Hesperus

A boundary linter and live map for repos that agents write. Hesperus shows what in the code reaches a database, the network, a model API, the cloud, a queue, the filesystem, other processes or the environment; flags what changed since you last looked; and enforces what your policy forbids. Under it is a zoomable graph of packages, files, types, and functions, with the calls and data flow between them.

Every node and edge comes from static analysis (your editor's language servers plus tree-sitter). No model creates, removes, or reweights anything. Edges carry their certainty: **resolved**, **may** (dynamic dispatch), or **unresolved**, and unknowns are drawn, never dropped.

## Use

Click the Hesperus icon in the activity bar. The first time, Hesperus:

1. detects the languages in the workspace,
2. asks the editor's language server for each (offering to install its extension if missing),
3. builds the graph into an untracked `.hesperus/` cache (safe to delete),
4. opens the graph in an editor tab.

The graph tab:

- Scroll to zoom, drag to pan. The view refits when the panel resizes.
- Click a box to expand it. Cmd/Ctrl-click or double-click opens its source.
- Hover a box to focus on its connections, or an edge to see the counts behind it.

The sidebar shows status and errors, finds nodes by name, toggles calls, data flow, overrides, and state transitions, lists the state machines found, and re-indexes.

The **Automaton** box in the sidebar draws the program as a state machine instead: states are the values its state machines hold (fields and variables set to constants and tested against them, and flags set both ways), and the inputs are what comes in from outside: functions handed to code outside the repo (event listeners, message handlers), each value a handler dispatches on (`m.type === "play"`), and functions nothing in the repo calls. Locations that never test each other are drawn as separate regions, so independent flags never multiply. A dashed transition is one the analysis could not decide.

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
node ~/.vscode/extensions/pmghartman.hesperus-vscode-*/out/cli.js check .
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

Each language is indexed on its own. If its extension is missing or never answers, its files show as dashed **unindexed** nodes (toggle in the sidebar) with the reason and an install button, and the other languages still build. Files in other languages are counted and not analyzed.

## Guarantees

- **Read-only.** Hesperus writes only its `.hesperus/` cache (graph, accepted baseline, latest report) in the analyzed repo. `hesperus.json` is yours; Hesperus creates it only when you ask.
- **Resolved by your language servers.** Output depends on the installed language-server extensions and their versions, so it can differ between machines. A call a server leaves unresolved is resolved through the file's imports (`fs.readFileSync` after `import * as fs from "node:fs"` reaches `"fs".readFileSync` under `node`; a relative import reaches the repo definition it names) for JavaScript/TypeScript, Python, Go, Rust, Java and Kotlin.
- **Stale caches fail loudly.** A new commit, lockfile, or Hesperus version re-indexes, and the sidebar says why.
