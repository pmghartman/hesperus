// Copies the pinned tree-sitter grammars (devDependencies) into grammars/, which ships in the VSIX.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const GRAMMARS = [
  "tree-sitter-c-sharp/tree-sitter-c_sharp.wasm",
  "tree-sitter-cpp/tree-sitter-cpp.wasm",
  "tree-sitter-dart/tree-sitter-dart.wasm",
  "tree-sitter-go/tree-sitter-go.wasm",
  "tree-sitter-javascript/tree-sitter-javascript.wasm",
  "tree-sitter-rust/tree-sitter-rust.wasm",
  "tree-sitter-typescript/tree-sitter-typescript.wasm",
  "tree-sitter-typescript/tree-sitter-tsx.wasm",
  "tree-sitter-python/tree-sitter-python.wasm",
  "tree-sitter-java/tree-sitter-java.wasm",
  "tree-sitter-php/tree-sitter-php.wasm",
  "tree-sitter-ruby/tree-sitter-ruby.wasm",
  // npm ships no wasm for Kotlin
  "tree-sitter-wasms/out/tree-sitter-kotlin.wasm",
];

fs.mkdirSync(path.join(root, "grammars"), { recursive: true });
for (const g of GRAMMARS) fs.copyFileSync(path.join(root, "node_modules", g), path.join(root, "grammars", path.basename(g)));
