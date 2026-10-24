// Copies the pinned tree-sitter grammars (devDependencies) into grammars/, which ships in the VSIX.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const GRAMMARS = [
  "tree-sitter-go/tree-sitter-go.wasm",
  "tree-sitter-javascript/tree-sitter-javascript.wasm",
  "tree-sitter-typescript/tree-sitter-typescript.wasm",
  "tree-sitter-typescript/tree-sitter-tsx.wasm",
];

fs.mkdirSync(path.join(root, "grammars"), { recursive: true });
for (const g of GRAMMARS) fs.copyFileSync(path.join(root, "node_modules", g), path.join(root, "grammars", path.basename(g)));
