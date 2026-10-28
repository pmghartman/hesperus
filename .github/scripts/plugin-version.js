// Bumps the Claude Code plugin's version in plugin/.claude-plugin/plugin.json: installed copies update only when
// the version changes, so every change to the plugin's files on main gets a new one. Run by the
// plugin-version workflow after each push to main; by hand, `node .github/scripts/plugin-version.js`.
// Prints the new version; with `--check <commit>`, prints nothing and exits 0 when that commit already
// changed the version (a bump by hand), 1 when it did not.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const file = path.join(__dirname, "..", "..", "plugin", ".claude-plugin", "plugin.json");
const read = () => JSON.parse(fs.readFileSync(file, "utf8"));

if (process.argv[2] === "--check") {
  const commit = process.argv[3] ?? "HEAD";
  let before = "";
  try {
    before = JSON.parse(execFileSync("git", ["show", `${commit}~1:plugin/.claude-plugin/plugin.json`], { encoding: "utf8" })).version;
  } catch {}
  process.exit(before !== read().version ? 0 : 1);
}

const [major, minor, patch] = String(read().version).split(".").map((n) => Number(n) || 0);
const next = `${major}.${minor}.${patch + 1}`;
// The one line, so the file keeps its own layout.
const text = fs.readFileSync(file, "utf8").replace(/("version":\s*")[^"]*(")/, `$1${next}$2`);
if (JSON.parse(text).version !== next) throw new Error("plugin.json has no version line to raise");
fs.writeFileSync(file, text);
console.log(next);
