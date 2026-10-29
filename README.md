<p align="center"><img src="media/icon.png" alt="Hesperus" width="120"></p>

# Hesperus

See what a program does, and what it reaches outside itself, without reading every diff. Built for repos agents write, by static analysis only: no model draws or guesses anything.

- **Flow:** a top-down chart from any entry point, with branches, loops and every call that leaves the repo.
- **Map:** each boundary (database, network, AI models, cloud, queues, filesystem, processes) as a box.
- **Lint:** new crossings since you last looked are warnings; calls your policy forbids (`.hesperus/hesperus.json`) are errors.

Open the Hesperus icon in the activity bar and press **Index**. Nothing is written to your repo before that.

**Works in** VS Code and its forks (Cursor, Windsurf, VSCodium, via Open VSX), and with no editor at all: `hesperus check` lints from a terminal or CI, and `hesperus mcp` serves the repo to any MCP agent.

**Languages:** Go, JavaScript, TypeScript, Rust, C#, C, C++, Dart, Python, Java, Kotlin, PHP and Ruby, plus any other language your editor has a language server for.

Runs locally, collects nothing ([privacy](PRIVACY.md)). Apache-2.0.
