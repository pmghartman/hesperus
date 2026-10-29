![Hesperus](media/icon.png)

# Hesperus

A flow chart of what a program does, and a boundary linter, for repos that agents write. Built by static analysis.

Hesperus compiles source "up" into a graph an engineer can question: packages, files, types, and functions, with the calls and data flow between them. It is made for the person overseeing an agent who no longer reads every diff: what the program does from each entry point, step by step; what reaches databases, the internet, model APIs and other outside systems; what changed since they last looked; and what their policy forbids, without trusting an agent-drawn diagram.

## The flow

The first picture is a flow chart, top down, from an entry point: the steps the code takes in the order it runs them, each named by its function and the comment above it; the decisions between them, as diamonds carrying the condition as written; loops; and every call that leaves the repo as a terminal marked with its boundary. Click a step to open its own steps in place, ⌘/Ctrl-click to go to the source. Entry points are the callables nothing in the repo calls (and each file's own top-level code), ranked by how much of the program they drive; any function can be charted by name.

Everything on it is read from the code: a call's site gives its order, the file's syntax gives the branches and the doc comments, the boundary table names the terminals. A function with no comment is labelled as the code names it; a call the index could not resolve is left out rather than guessed; a dynamic call is drawn dashed. `hesperus flow` prints the same chart as text, and `hesperus_flow` serves it to an agent.

- **Analysis only.** Nodes and edges come from the editor's language servers and tree-sitter; a call the servers leave unresolved is resolved through the file's imports. No model creates, removes, or reweights anything.
- **Honest about unknowns.** Every edge is `resolved`, `may` (dynamic dispatch, function values), or `unresolved` (reflection, injection). Unknowns are drawn, never dropped.
- **Zoomable.** Start from the whole repo. Expanding a box splits its edges in place; every rollup traces to the edges beneath it.
- **Per-language.** Each language is indexed separately through its editor extension; a missing one leaves that language's files as unindexed nodes and the rest still builds.
- **Read-only.** The only thing written to the analyzed repo is the `.hesperus/` cache (graph, file outlines, accepted baseline, latest report, and the policy), and nothing at all until you press Index.

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

The table is fixed and per language (`src/core/boundary.ts`); a package it does not know is guessed from its name only as a last resort, and says so. Calls in both directions count: a handler registered with a server is the network calling in. Add your own packages in `.hesperus/hesperus.json`.

The default view is the repo's call flow with each boundary as a box on the right, so the first picture answers "what talks to the database, the internet, a model?". Open a boundary to see the packages and calls behind it.

## Linting while an agent works

Hesperus is a linter for boundary crossings, meant to run beside an agent:

- **Watch.** When files change on disk, Hesperus re-indexes after a quiet spell (`hesperus.watch`, `hesperus.watchDelay`): only the changed files are read and asked about again, and the rest of each language's index is kept, so an edit shows in seconds rather than a whole re-index.
- **New since you looked.** The first index records what the repo already does in `.hesperus/baseline.json`. After that, a crossing or dependency the agent adds is a warning (or info) in the Problems panel, amber in the graph, and counted in the status bar. **Accept** it (quick fix, sidebar, or *Hesperus: Accept All Changes as Reviewed*) once you have looked.
- **Policy.** `.hesperus/hesperus.json`, written by people and untracked with the rest of `.hesperus/`, says what each part of the repo may reach. A violation is an error, red in the graph, until the code or the policy changes:

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

- **For the agent.** Every lint writes `.hesperus/report.json`, and `hesperus check` lints from a terminal, a hook, or CI-like scripts (exit 1 on errors; `--json`, `--accept`, `--max-warnings N`, `--svg`). With `--index`, or when there is no graph yet, it indexes first without an editor (below); otherwise it reads the graph the editor built and says when that is older than `HEAD`.

```
node out/cli.js check . --index
```

## Without an editor: CLI and MCP

`hesperus index` builds the graph from syntax alone: tree-sitter outlines each file, a call's definition is looked up by name in its file and package, and the rest resolves through imports. Coarser than the editor's language servers (no types, so a call on an instance stays unresolved) and a few seconds for a mid-sized repo. JavaScript/TypeScript, Python, Go, Rust, Java and Kotlin; other languages show as unindexed until the editor indexes them.

```
node out/cli.js index .       # build .hesperus/ from source
node out/cli.js svg .         # draw .hesperus/view.svg: the repo with each boundary as a box (its boxes in view.json; --view to open others)
node out/cli.js flow .        # what the program does, top down, as text (--entry NAME, --depth N)
node out/cli.js mcp .         # serve the repo to an agent over MCP (stdio)
```

The CLI ships inside the installed extension, so nothing else is needed: `node ~/.vscode/extensions/pmghartman.hesperus-vscode-*/out/cli.js check .`.

**MCP.** `hesperus mcp` is an MCP server any agent can connect to. Tools: `hesperus_index`, `hesperus_check` (the lint), `hesperus_diff` (crossings and dependencies added or removed since the last accepted review, and anything the policy denies), `hesperus_boundaries` (every call that leaves the repo, by boundary and package, with file:line), `hesperus_calls` (callers and callees by name), `hesperus_flow` (the flow chart as text from an entry point, with its entry points), `hesperus_accept`, `hesperus_svg`. Resources: `hesperus://report`, `hesperus://view.svg`. For an agent such as Claude Code, pointed at the installed extension:

```
claude mcp add hesperus -- node ~/.vscode/extensions/pmghartman.hesperus-vscode-<version>/out/cli.js mcp
```

A host that renders MCP Apps (Claude Desktop, claude.ai) draws the boundary map inline from `hesperus_map`.

## Privacy Policy

Hesperus runs on your machine and collects nothing: no telemetry, no accounts, and no request from the CLI, the MCP server or the extension to any server. It reads the repo you point it at and writes only its own cache in that repo's `.hesperus/`, which stays there until you delete it. The one outside request is the interactive map's page, which the host (Claude Desktop, claude.ai) loads with the MCP Apps client from `unpkg.com`; that fetch goes out under the host's and unpkg's own policies and carries none of your code. The full policy is in [PRIVACY.md](PRIVACY.md).

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

Other languages are counted and not analyzed. Each language is indexed on its own through whichever installed extension declares it (the one named above, or another that serves the same language); if none is installed or it never answers, that language's files show as dashed **unindexed** nodes with the reason and an install button, and the rest of the repo still builds.

## Using the extension

Click the Hesperus icon in the activity bar, then **Index**. Nothing is written to the repo before that press: it detects languages, asks each language's editor extension for symbols and references (offering to install a missing one), builds the graph into `.hesperus/` (untracked, safe to delete), and opens the flow chart.

- **Flow**: what the program does from an entry point. Click a step to open its steps in place; click a decision, loop or terminal to see its code; ⌘/Ctrl-click a step to open its definition. Scroll to zoom, drag to pan.
- **Map**: what the repo reaches outside itself, each boundary a box. Zoom in to open boxes; hover to trace a box's wires. Findings from the lint are drawn on both.
- The sidebar shows status, the entry points (the first few by how much code they drive, the rest unfolded on request; click one to chart it), a search that charts any function by name, what to review, and what the repo reaches.
- **Ask** sends what is on screen (the flow, the findings, what the repo reaches) to an AI assistant the editor already has: GitHub Copilot Chat, Claude Code, Cline, Roo Code, Continue or Kilo Code, chosen in the sidebar's menu and kept in your settings (`hesperus.assistant`). The prompt also goes to the clipboard, for an assistant with no command that takes text.

A stale cache (new commit, lockfile, or tool version) fails loudly, then re-indexes; the outline of each file is kept in `.hesperus/outline/`, so after a new commit or a session away only the files that changed are read again. A new Hesperus version reads the whole repo once.

Output depends on the installed language-server extensions and their versions, so it can differ between machines. A call a server leaves unresolved is resolved through the file's imports (`fs.readFileSync` after `import * as fs from "node:fs"` reaches `"fs".readFileSync` under `node`; a relative import reaches the repo definition it names) for JavaScript/TypeScript, Python, Go, Rust, Java and Kotlin.

## Layout

The repository is the extension: `npm ci && npm run build` at the root compiles it, `npx vsce package` packs the VSIX the release workflow publishes to the VS Code Marketplace and Open VSX.

| Path | Contents |
| --- | --- |
| `src/core` | IR, graph building, aggregation, cache, canonical serialization; `boundary.ts` (classification, boundary view) and `lint.ts` (policy, baseline, findings) |
| `src/linter.ts`, `review.ts` | Problems entries and quick fixes; policy, baseline and report files |
| `src/headless.ts`, `service.ts`, `cli.ts`, `mcp.ts` | indexing without an editor; what the CLI and MCP server share; `hesperus index/check/svg/flow/mcp`; the MCP server |
| `src/core/flow.ts`, `src/flowchart.ts` | the flow: entry points and the step tree from one (calls in site order, branches from syntax, boundary terminals); its chart laid out top down |
| `src/picture.ts`, `svg.ts`, `shelf.ts` | the boundary overview laid out and drawn as SVG; its layout in cells for a tall pane |
| `schema/policy.schema.json` | `.hesperus/hesperus.json` schema |
| `src/lang` | tree-sitter syntax facts and editor extension per language; `treesitter.ts` also reads doc comments and branches for every grammar alike |
| `src/editor.ts` | reads symbols and references from the editor's language servers |
| `src/extension.ts`, `layout.ts`, `assist.ts` | the extension and its webviews; deterministic ELK layout; the Ask button's assistants |
| `schema/graph.schema.json` | versioned graph schema |

TypeScript on Node, one npm package, no native code (tree-sitter runs as WebAssembly).

## Development

```
npm ci && npm run build   # grammars into grammars/, TypeScript into out/
npm test                  # build plus a short smoke test
npx vsce package          # the VSIX
```

## License

Apache-2.0.
