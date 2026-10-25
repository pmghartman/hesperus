import * as fs from "node:fs";
import * as path from "node:path";
import { Command, Frontend, Tool } from "../core/frontend";
import { cmpStr } from "../core/ir";
import { Grammar, namedChildren } from "./treesitter";

export const LANGUAGE_ID = "go";

export const GO = new Grammar("tree-sitter-go.wasm", (n, src, f) => {
  if (n.type === "function_declaration" || n.type === "method_declaration") {
    const decl = src.range(n);
    f.decls.push(decl);
    const params = n.childForFieldName("parameters");
    if (params) {
      let idx = 0;
      for (const d of namedChildren(params)) {
        if (d.type !== "parameter_declaration" && d.type !== "variadic_parameter_declaration") continue;
        let named = 0;
        for (const name of d.childrenForFieldName("name")) {
          if (!name) continue;
          f.params.push({ name: name.text, range: src.range(name), index: idx, decl });
          idx++;
          named++;
        }
        if (named === 0) idx++;
      }
    }
  } else if (n.type === "call_expression") {
    const func = n.childForFieldName("function");
    if (!func) return;
    const callee = func.type === "selector_expression" ? func.childForFieldName("field") ?? func : func;
    const a = n.childForFieldName("arguments");
    const args = a ? namedChildren(a).filter((x) => x.type !== "comment").map((x) => src.range(x)) : [];
    const p = n.parent?.type;
    const used = p !== "expression_statement" && p !== "go_statement" && p !== "defer_statement";
    f.calls.push({ callee: src.range(callee), callee_text: func.text, args, result_used: used });
  }
});

const env = (k: string) => process.env[k] || undefined;

export const Go: Frontend = {
  id: LANGUAGE_ID,
  extensions: ["go"],
  tool: (): Tool => ({ name: "scip-go", version: "0.2.9", install: { kind: "go", package: "github.com/scip-code/scip-go/cmd/scip-go@v0.2.9" } }),
  binIn: (dir) => path.join(dir, "bin", "scip-go"),
  /** Where `go install` puts binaries; editors launched outside a shell often lack it on PATH. */
  searchDirs() {
    const out: string[] = [];
    const gobin = env("GOBIN"), gopath = env("GOPATH"), home = env("HOME");
    if (gobin) out.push(gobin);
    if (gopath) out.push(path.join(gopath, "bin"));
    if (home) out.push(path.join(home, "go", "bin"));
    return out;
  },
  /** scip-go indexes one module from its root, so every go.mod in the tree is a root.
   *  The go tool skips testdata and nested modules on its own. */
  roots(files) {
    const mods = files.filter((f) => (f === "go.mod" || f.endsWith("/go.mod")) && !f.split("/").includes("testdata"));
    if (!mods.length) throw new Error("Go files found but no go.mod anywhere in the repo; scip-go indexes Go modules.");
    return mods.map((f) => f.slice(0, Math.max(f.lastIndexOf("/"), 0))).sort(cmpStr);
  },
  command(repo, bin, out): Command {
    if (!isFile(path.join(repo, "go.mod"))) throw new Error(`no go.mod in ${repo}`);
    return { cmd: bin, args: ["--output", out], cwd: repo };
  },
  init: () => GO.init(),
  syntax: () => GO,
};

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
