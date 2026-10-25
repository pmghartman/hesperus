// Node 20's `node --test` takes no globs, so list the compiled tests here.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const out = path.join(__dirname, "..", "out");
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".test.js")) files.push(p);
  }
})(out);

process.exit(spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" }).status ?? 1);
