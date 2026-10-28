// Bundles the CLI (and so the MCP server and the indexer) into dist/ at the repository root, with the
// grammars and the tree-sitter runtime beside it: one folder that runs with Node alone, committed so a
// clone of the repository is a working Claude Code plugin with nothing to build.
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
const dist = path.join(root, "..", "dist");
fs.mkdirSync(path.join(dist, "grammars"), { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(root, "src", "cli.ts")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  // The package's CommonJS build: its ESM build locates the runtime wasm through import.meta, which a bundle has no value for.
  alias: { "web-tree-sitter": path.join(root, "node_modules", "web-tree-sitter", "tree-sitter.cjs") },
  outfile: path.join(dist, "hesperus.js"),
  legalComments: "none",
  logLevel: "warning",
});
// The graph page the MCP App draws (src/mapapp.ts reads these beside the bundle).
fs.mkdirSync(path.join(dist, "media"), { recursive: true });
for (const f of ["graph.js", "graph.css"]) fs.copyFileSync(path.join(root, "media", f), path.join(dist, "media", f));
for (const g of fs.readdirSync(path.join(root, "grammars"))) fs.copyFileSync(path.join(root, "grammars", g), path.join(dist, "grammars", g));
fs.copyFileSync(path.join(root, "node_modules", "web-tree-sitter", "tree-sitter.wasm"), path.join(dist, "tree-sitter.wasm"));
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
fs.writeFileSync(path.join(dist, "package.json"), JSON.stringify({ name: "hesperus-dist", version, private: true, description: "Built by vscode/scripts/bundle.js; do not edit." }, null, 2) + "\n");
