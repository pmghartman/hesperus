# Privacy Policy

Covers Hesperus in every form it ships in: the CLI, the MCP server (including the Claude Desktop bundle), the Claude Code plugin, and the VS Code extension.

## Data collection

None. Hesperus has no telemetry, analytics, crash reporting or accounts, and the CLI, the MCP server, the plugin and the extension make no network requests.

## Usage and storage

Hesperus reads the source of the repo you point it at, and only to build its graph. What it writes goes in that repo's `.hesperus/` folder (the graph, the accepted baseline, the latest report, and the pictures it draws), on your machine. It never changes your source files. `hesperus_open` asks your editor or your system's opener to open a file, and nothing else.

## Third-party sharing

Hesperus sends nothing to anyone. When a host such as Claude Desktop or claude.ai shows the interactive boundary map, the host loads the map's page with the MCP Apps client script from `https://unpkg.com`. That request carries none of your code or of the graph; it is made under the host's privacy policy and [unpkg's](https://unpkg.com). What the map and the tools return goes to the agent or host you connected them to, under that host's own policy.

## Data retention

The `.hesperus/` folder stays until you delete it; delete it at any time, and Hesperus rebuilds it on the next index. Uninstalling Hesperus leaves it in place.

## Contact

Questions and reports: [github.com/pmghartman/hesperus/issues](https://github.com/pmghartman/hesperus/issues).
