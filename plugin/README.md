![Hesperus](.claude-plugin/icon.png)

# Hesperus for Claude Code

A live map of what your repo reaches outside itself (databases, the network, AI models, cloud services, queues, files, processes and the environment) in a pane beside the chat, re-drawn as the agent edits. Built by static analysis: no model draws or guesses an edge, and unknowns are drawn, never dropped.

- **The pane.** The boundary map, laid out for a tall narrow pane with entries at the top and each boundary as a box along the bottom, drawn in character cells so it is live: drag a box to move it (its wires follow, and it stays put across edits and sessions until **Overview**), drag the space or press the arrows to pan, click a box to select it and see its source, click it again to open or close it. Below it, an explorer of the same boxes (↑↓ select, → ← open and close, Enter goes to the source), then the findings. In the editor's pane and on the phone the map is a picture and the explorer's rows are buttons.
- **The lint.** A call into a boundary the agent adds since you last looked is a warning, in amber; one your `hesperus.json` policy denies is an error, in red. The status line counts them. `/hesperus accept` marks every current crossing as reviewed; `/hesperus` opens the pane.
- **For the agent.** The same facts over MCP: `hesperus_index`, `hesperus_check`, `hesperus_diff`, `hesperus_boundaries`, `hesperus_calls`, `hesperus_accept`, `hesperus_svg`, and `hesperus_map`, an interactive map where the host draws MCP Apps.

JavaScript/TypeScript, Python, Go, Rust, Java and Kotlin are indexed from syntax; other languages show as unindexed. The project, its policy file and the VS Code extension are described in the [repository's README](https://github.com/pmghartman/hesperus#readme).

## Install

From the plugin directory on claude.ai, or at the prompt of a terminal session:

```
/plugin marketplace add pmghartman/hesperus
/plugin install hesperus@hesperus
```

Node and npm are the only requirements: Claude Code installs the plugin's one package, `elkjs`, from `package-lock.json`. To run it from a clone for one session, run `npm ci` in this folder, then `claude --plugin-dir /path/to/hesperus/plugin`.

## What the plugin runs and reads

- **MCP server:** `node ${CLAUDE_PLUGIN_ROOT}/dist/hesperus.js mcp`, the plugin's one program and the bundled CLI in `dist/`. It reads the session's repo, writes its `.hesperus/` cache there (the graph, the accepted baseline, the latest report and the pictures it draws), and, asked to open a box's source, runs `code -g <file>:<line>`, else `open <file>` or `xdg-open <file>`.
- **Package:** `elkjs` 0.9.3, the layout the map is drawn with, pinned in `package-lock.json` and installed by Claude Code with the plugin. Nothing else is downloaded.
- **Grammars:** `dist/grammars/*.wasm` and `dist/tree-sitter.wasm`, tree-sitter's runtime and parsers compiled to WebAssembly, copied from pinned npm packages (`web-tree-sitter`, `tree-sitter-go` and the like, and `tree-sitter-wasms` for Kotlin), which the MCP server loads to read source files.
- **Hooks module** (`hooks/register.tsx`), which starts no programs:
  - `session.start`: registers `/hesperus`, opens the Hesperus pane, and reads back from the plugin's own store where you dragged boxes.
  - `tool.call`: lets every call run as it would and changes, blocks or answers none. After an `Edit`, `Write`, `MultiEdit`, `NotebookEdit` or `Bash` call it schedules a re-lint, since those may change source files.
  - `command.run`, matched to `/hesperus` alone, the one command the module registers: it answers `/hesperus` (opens the pane) and `/hesperus accept` itself, and sees no other command and no permission decision.
  - The pane's own messages and drawing.
  - For everything it shows, the pane calls the plugin's own MCP server above with `$.mcp.call`, by fixed tool names, and calls no other tool, server or command: `hesperus_check` to re-index and lint when a session starts and a moment after an edit (it re-indexes only when a file changed), `hesperus_svg` to draw the view you open, `hesperus_accept` on `/hesperus accept`, and `hesperus_open` on **Go to source**. Their answers stay on the machine, in the pane and the status line.
  - **Files it reads:** `.hesperus/view.svg` and `.hesperus/view.json`, which the server just drew, and the source file of the box you select, to show its lines.
- **Sent anywhere:** nothing. Neither the server nor the hooks make network requests; what they find stays in the pane, the status line and the agent's context. The one outside request is the interactive map's page in hosts that draw MCP Apps (Claude Desktop, claude.ai), which the host loads with the MCP Apps client from `unpkg.com`, carrying none of your code.
- **Patterns, not calls:** `dist/hesperus.js` holds the tables that classify what your code calls, so it spells names such as `getenv`, Go's `os` `Getenv`, PHP's `curl_*`, `child_process` and Go packages under `github.com/...`, and the bundled tree-sitter runtime cites an emscripten issue on GitHub in a comment. They are patterns matched against your source, never run: the bundle reads no environment variable, no credential and no network address, and downloads and executes nothing.
- **`tests/`:** the hooks module's tests, run by `claude plugin test`; the plugin never loads them. They start a session, call tools and answer MCP and file calls with mocks.

## Privacy Policy

Hesperus collects nothing: no telemetry, no accounts, no data sent anywhere. Its only storage is the `.hesperus/` folder in your repo, which stays until you delete it. The full policy: [PRIVACY.md](https://github.com/pmghartman/hesperus/blob/main/PRIVACY.md).

## License

Apache-2.0.
