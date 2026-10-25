import * as fs from "node:fs";
import * as path from "node:path";
import { Node } from "web-tree-sitter";
import { CACHE_DIR } from "../core/cache";
import { Command, extension, Frontend, Tool } from "../core/frontend";
import { cmpStr } from "../core/ir";
import { Facts } from "../core/syntax";
import { PKG_ROOT } from "../root";
import { Grammar, namedChildren, Source } from "./treesitter";

export const LANGUAGE_ID = "javascript";

const FUNCTIONS = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "function",
  "generator_function",
  "arrow_function",
  "method_definition",
]);

/** The node that names a function: itself when declared, else the binding that holds it
 *  (`const f = () => …`, `{ f: function () {} }`, `this.f = …`, class fields). */
function namingDecl(f: Node): Node | undefined {
  if (f.type === "function_declaration" || f.type === "generator_function_declaration" || f.type === "method_definition") return f;
  const p = f.parent;
  if (!p) return undefined;
  const holds = (field: string) => p.childForFieldName(field)?.id === f.id;
  switch (p.type) {
    case "variable_declarator":
    case "public_field_definition":
    case "field_definition":
    case "pair":
      return holds("value") ? p : undefined;
    case "assignment_expression":
      return holds("right") ? p : undefined;
    default:
      return undefined;
  }
}

/** Binding name of one formal parameter; undefined for destructuring patterns. */
function paramName(n: Node): Node | undefined {
  switch (n.type) {
    case "identifier":
      return n;
    case "assignment_pattern": {
      const l = n.childForFieldName("left");
      return l?.type === "identifier" ? l : undefined;
    }
    case "rest_pattern": {
      const c = n.namedChild(0);
      return c?.type === "identifier" ? c : undefined;
    }
    case "required_parameter":
    case "optional_parameter": {
      const p = n.childForFieldName("pattern");
      return p ? paramName(p) : undefined;
    }
    default:
      return undefined;
  }
}

function visit(n: Node, src: Source, f: Facts) {
  if (FUNCTIONS.has(n.type)) {
    const d = namingDecl(n);
    if (d) {
      const decl = src.range(d);
      f.decls.push(decl);
      const params = n.childForFieldName("parameters");
      if (params) {
        namedChildren(params).filter((x) => x.type !== "comment").forEach((p, index) => {
          const name = paramName(p);
          if (name) f.params.push({ name: name.text, range: src.range(name), index, decl });
        });
      } else {
        // `x => …` has a bare identifier parameter.
        const p = n.childForFieldName("parameter");
        if (p) f.params.push({ name: p.text, range: src.range(p), index: 0, decl });
      }
    }
  }
  const func = n.type === "call_expression" ? n.childForFieldName("function") : n.type === "new_expression" ? n.childForFieldName("constructor") : null;
  if (func) {
    const name = func.type === "member_expression" ? func.childForFieldName("property") ?? func : func;
    const a = n.childForFieldName("arguments");
    const args = a ? namedChildren(a).filter((x) => x.type !== "comment").map((x) => src.range(x)) : [];
    const used = n.parent !== null && n.parent.type !== "expression_statement";
    f.calls.push({ callee: src.range(name), callee_text: func.text, args, result_used: used });
  }
}

// One grammar each: the TypeScript grammar does not parse JSX, and TSX rejects `<T>x` casts.
export const JS = new Grammar("tree-sitter-javascript.wasm", visit);
export const TS = new Grammar("tree-sitter-typescript.wasm", visit);
export const TSX = new Grammar("tree-sitter-tsx.wasm", visit);

const CONFIGS = ["tsconfig.json", "jsconfig.json"];
const TOOL_DIR = path.join(PKG_ROOT, "indexers", "scip-typescript");

const isFile = (p: string) => fs.statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;

/** JavaScript and TypeScript, resolved by scip-typescript. */
export const Js: Frontend = {
  id: LANGUAGE_ID,
  extensions: ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx"],
  tool: (): Tool => ({
    name: "scip-typescript",
    version: "0.5.2",
    install: {
      kind: "npm",
      package_json: fs.readFileSync(path.join(TOOL_DIR, "package.json"), "utf8"),
      package_lock: fs.readFileSync(path.join(TOOL_DIR, "package-lock.json"), "utf8"),
    },
  }),
  binIn: (dir) => path.join(dir, "node_modules", ".bin", "scip-typescript"),
  searchDirs: () => [],
  roots: () => [""],
  /** scip-typescript needs a tsconfig and writes one into the project when inferring it.
   *  Index a scratch overlay instead: symlinks to the repo's entries plus our config.
   *  `preserveSymlinks` keeps paths, and so symbols, relative to the overlay root. */
  command(repo, bin, out, scratch): Command {
    const overlay = path.join(scratch, "js-overlay");
    fs.mkdirSync(overlay, { recursive: true });
    // Absolute targets: a relative one would resolve against the overlay.
    const abs = path.resolve(repo);
    const hasConfig = CONFIGS.some((c) => isFile(path.join(abs, c)));
    const names = fs.readdirSync(abs).sort(cmpStr);
    for (const name of names) {
      if (name === ".git" || name === CACHE_DIR) continue;
      link(path.join(abs, name), path.join(overlay, name));
    }
    if (!hasConfig) {
      const cfg = `{"compilerOptions":{"allowJs":true,"noEmit":true,"preserveSymlinks":true}}`;
      fs.writeFileSync(path.join(overlay, "tsconfig.json"), cfg);
    }
    return { cmd: bin, args: ["index", "--no-progress-bar", "--cwd", overlay, "--output", out, overlay], cwd: overlay };
  },
  init: async () => {
    await Promise.all([JS.init(), TS.init(), TSX.init()]);
  },
  syntax(p) {
    const e = extension(p);
    if (e === "js" || e === "mjs" || e === "cjs" || e === "jsx") return JS;
    if (e === "ts" || e === "mts" || e === "cts") return TS;
    if (e === "tsx") return TSX;
    return undefined;
  },
};

/** Junctions on Windows need no elevation, unlike directory symlinks. */
function link(src: string, dst: string) {
  const dir = fs.statSync(src, { throwIfNoEntry: false })?.isDirectory() ?? false;
  fs.symlinkSync(src, dst, process.platform === "win32" ? (dir ? "junction" : "file") : undefined);
}
