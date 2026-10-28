![Hesperus](vscode/media/icon.png)

# Hesperus

A boundary linter and live map for repos that agents write, built by static analysis.

Hesperus compiles source "up" into a graph an engineer can question: packages, files, types, and functions, with the calls and data flow between them. It is made for the person overseeing an agent who no longer reads every diff: what reaches databases, the internet, model APIs and other outside systems, what changed since they last looked, and what their policy forbids, without trusting an agent-drawn diagram.

- **Analysis only.** Nodes and edges come from the editor's language servers and tree-sitter; a call the servers leave unresolved is resolved through the file's imports. No model creates, removes, or reweights anything.
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

- **For the agent.** Every lint writes `.hesperus/report.json`, and `hesperus check` lints from a terminal, a hook, or CI-like scripts (exit 1 on errors; `--json`, `--accept`, `--max-warnings N`, `--svg`). With `--index`, or when there is no graph yet, it indexes first without an editor (below); otherwise it reads the graph the editor built and says when that is older than `HEAD`.

```
node dist/hesperus.js check . --index
```

## Without an editor: CLI, MCP, Claude Code

`hesperus index` builds the graph from syntax alone: tree-sitter outlines each file, a call's definition is looked up by name in its file and package, and the rest resolves through imports. Coarser than the editor's language servers (no types, so a call on an instance stays unresolved) and a few seconds for a mid-sized repo. JavaScript/TypeScript, Python, Go, Rust, Java and Kotlin; other languages show as unindexed until the editor indexes them.

```
node dist/hesperus.js index .       # build .hesperus/ from source
node dist/hesperus.js svg .         # draw .hesperus/view.svg: the repo with each boundary as a box (its boxes in view.json; --view to open others)
node dist/hesperus.js mcp .         # serve the repo to an agent over MCP (stdio)
```

**MCP.** `hesperus mcp` is an MCP server any agent can connect to. Tools: `hesperus_index`, `hesperus_check` (the lint), `hesperus_diff` (crossings and dependencies added or removed since the last accepted review, and anything the policy denies), `hesperus_boundaries` (every call that leaves the repo, by boundary and package, with file:line), `hesperus_calls` (callers and callees by name), `hesperus_accept`, `hesperus_svg`. Resources: `hesperus://report`, `hesperus://view.svg`. For Claude Code without the plugin:

```
claude mcp add hesperus -- node /path/to/hesperus/dist/hesperus.js mcp
```

**Claude Code plugin.** This repository is also a Claude Code plugin: a pane beside the chat with the boundary map, an explorer of its boxes and the findings, re-drawn after every edit the agent makes. The map is laid out for the pane's tall narrow shape (entries at the top, boundaries at the bottom, each layer wrapped to the pane's width) and drawn in character cells, so it is live: drag a box to move it (its wires follow, and it stays put across edits and sessions until **Overview**), drag the space or press the arrows to pan, click a box to select it (its source shown below) and click it again to open or close it, or to go to its source. The explorer below lists the same boxes as a tree: ↑↓ select, → ← open and close, Enter goes to the source in VS Code (`code -g`) or whatever opens the file. Both need the terminal or the desktop app; in the editor's pane and on the phone the map is a picture and the explorer's rows are buttons. Also a status line count, `/hesperus` and `/hesperus accept`, and the MCP server above wired in through `.mcp.json`. Nothing to build: `dist/` holds the CLI bundled with its grammars, so Node is the only requirement.

```
/plugin marketplace add pmghartman/hesperus
/plugin install hesperus@hesperus
```

or `claude --plugin-dir /path/to/hesperus` for one session. `dist/hesperus.js` is the same CLI as `vscode/out/cli.js` (`node dist/hesperus.js check .`); `hesperus svg --portrait 60` writes the pane's layout to `.hesperus/view.json` (boxes and wires in cells) beside the SVG.

The plugin's version (`.claude-plugin/plugin.json`) raises itself: a push to `main` that changes what the plugin ships gets a patch bump committed back by the `plugin-version` workflow, unless that push already raised it; installed copies pick the change up on their next update. The VS Code extension is versioned by its release tags instead.

**Claude Desktop.** The MCP server alone, as an MCP Bundle: open `hesperus-<version>.mcpb` with Claude Desktop (or drop it on *Settings → Extensions*), pick the repo to map, and ask about it in a chat; the boundary map draws inline. No pane, status line or commands, and nothing to install but the bundle. `cd vscode && npm run mcpb` packs `target/hesperus-<version>.mcpb` from `mcpb/manifest.json` and `dist/`, under the plugin's version.

## Privacy Policy

Hesperus runs on your machine and collects nothing: no telemetry, no accounts, and no request from the CLI, the MCP server or the plugin to any server. What the plugin runs: the MCP server (`node dist/hesperus.js mcp`); `node dist/hesperus.js check . --index --json --svg` in the session's folder when a session starts and a moment after each edit, which re-indexes only when a file changed; `node dist/hesperus.js svg .` to draw a view you open; and, on **Go to source**, `code -g`, `open` or `xdg-open` on that file. It reads the repo you point it at and writes only its own cache in that repo's `.hesperus/`, which stays there until you delete it. The one outside request is the interactive map's page, which the host (Claude Desktop, claude.ai) loads with the MCP Apps client from `unpkg.com`; that fetch goes out under the host's and unpkg's own policies and carries none of your code. The full policy is in [PRIVACY.md](PRIVACY.md).


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
| `vscode/src/linter.ts`, `review.ts` | Problems entries and quick fixes; policy, baseline and report files |
| `vscode/src/headless.ts`, `service.ts`, `cli.ts`, `mcp.ts` | indexing without an editor; what the CLI, MCP server and plugin share; `hesperus index/check/svg/mcp`; the MCP server |
| `vscode/src/picture.ts`, `svg.ts`, `shelf.ts` | the boundary overview laid out and drawn as SVG; its layout in cells for a tall pane |
| `.claude-plugin/`, `hooks/`, `types/`, `.mcp.json` | the Claude Code plugin: pane with its map (`hooks/map.tsx`) and explorer (`hooks/explorer.tsx`), status line, `/hesperus`, MCP wiring; `.github/workflows/plugin-version.yml` raises its version |
| `dist/` | the CLI bundled with its grammars (`vscode/scripts/bundle.js`), committed so the plugin needs no build |
| `mcpb/manifest.json` | the Claude Desktop bundle's manifest; `vscode/scripts/mcpb.js` packs it with `dist/` |
| `vscode/schema/policy.schema.json` | `hesperus.json` schema |
| `vscode/src/lang` | tree-sitter syntax facts and editor extension per language |
| `vscode/src/editor.ts` | reads symbols and references from the editor's language servers |
| `vscode/src/extension.ts`, `layout.ts` | webview extension; deterministic ELK layout |
| `vscode/schema/graph.schema.json` | versioned graph schema |

TypeScript on Node, one npm package, no native code (tree-sitter runs as WebAssembly). See [CLAUDE.md](CLAUDE.md) for invariants and design.

## Development

```
cd vscode && npm ci && npm run build   # also rebuilds ../dist, which is committed: the plugin runs from it
npm test                               # build plus a short smoke test
```

## License

Apache-2.0.
