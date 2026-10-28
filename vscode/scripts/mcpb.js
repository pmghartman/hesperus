// Packs the MCP server as an MCP Bundle for Claude Desktop: mcpb/manifest.json, the icon, and dist/ with
// elkjs as the bundle's server/, staged in target/mcpb and packed to target/hesperus-<version>.mcpb. The
// version is the Claude Code plugin's, so the bundle and the plugin ship the same server under the same number.
// Run `npm run bundle` first when the source has changed; dist/ is packed as it is.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const top = path.join(__dirname, "..", "..");
const stage = path.join(top, "target", "mcpb");
const { version } = JSON.parse(fs.readFileSync(path.join(top, ".claude-plugin", "plugin.json"), "utf8"));
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(top, "mcpb", "manifest.json"), "utf8"));
fs.writeFileSync(path.join(stage, "manifest.json"), JSON.stringify({ ...manifest, version }, null, 2) + "\n");
fs.copyFileSync(path.join(top, ".claude-plugin", "icon.png"), path.join(stage, "icon.png"));
fs.cpSync(path.join(top, "dist"), path.join(stage, "server"), { recursive: true });
// The CLI's one package dependency, which the plugin gets from its lockfile.
fs.cpSync(path.dirname(require.resolve("elkjs/package.json")), path.join(stage, "server", "node_modules", "elkjs"), { recursive: true });
const out = path.join(top, "target", `hesperus-${version}.mcpb`);
const mcpb = path.join(__dirname, "..", "node_modules", "@anthropic-ai", "mcpb", "dist", "cli", "cli.js");
execFileSync(process.execPath, [mcpb, "pack", stage, out], { stdio: "inherit" });
