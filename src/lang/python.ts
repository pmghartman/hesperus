import { Node } from "web-tree-sitter";
import { Frontend } from "../core/frontend";
import { Imports, Operand } from "../core/syntax";
import { guardIf, Grammar, namedChildren, other, Source, symbol } from "./treesitter";

export const LANGUAGE_ID = "python";

const LITERALS = new Set(["integer", "float", "string", "concatenated_string", "true", "false", "none"]);

function operand(n: Node, src: Source): Operand {
  if (n.type === "identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "attribute") {
    const a = n.childForFieldName("attribute");
    if (a) return { name: src.range(a), text: n.text, form: "name", receiver: n.childForFieldName("object")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand(n.namedChild(0)!, src);
  if (LITERALS.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}

const EQ = { eq: ["=="], ne: ["!="] };

/** The parameter's name token, through defaults, annotations and `*args`. */
function paramName(p: Node): Node | undefined {
  if (p.type === "identifier") return p;
  if (p.type === "default_parameter" || p.type === "typed_default_parameter") return p.childForFieldName("name") ?? undefined;
  if (p.type === "typed_parameter" || p.type === "list_splat_pattern" || p.type === "dictionary_splat_pattern") return namedChildren(p).find((c) => c.type === "identifier");
  return undefined;
}

export const PYTHON = new Grammar("tree-sitter-python.wasm", (n, src, f) => {
  const op = (x: Node) => operand(x, src);
  if (n.type === "import_statement") {
    // `import a.b.c` binds `a`; `import a.b as x` binds `x` to the whole path.
    for (const c of namedChildren(n)) {
      if (c.type === "dotted_name") f.imports.push({ local: c.text.split(".")[0], module: c.text.split(".")[0] });
      else if (c.type === "aliased_import") {
        const name = c.childForFieldName("name"), alias = c.childForFieldName("alias");
        if (name && alias) f.imports.push({ local: alias.text, module: name.text });
      }
    }
  } else if (n.type === "import_from_statement") {
    const module = n.childForFieldName("module_name")?.text;
    if (module === undefined) return;
    for (const c of n.childrenForFieldName("name")) {
      if (!c) continue;
      const name = c.type === "aliased_import" ? c.childForFieldName("name") : c, alias = c.type === "aliased_import" ? c.childForFieldName("alias") : null;
      if (name) f.imports.push({ local: (alias ?? name).text, module, member: name.text });
    }
  } else if (n.type === "assignment") {
    const l = n.childForFieldName("left"), r = n.childForFieldName("right");
    if (l && r && l.type !== "pattern_list" && l.type !== "tuple_pattern") f.assigns.push({ target: op(l), value: r.type === "assignment" ? other(r, src) : op(r), init: false });
    // Module- and class-level names; the indexer nests them and drops the ones inside functions.
    if (l?.type === "identifier" && n.parent?.type === "expression_statement") symbol(f, src, n, l, "term", n.parent.parent?.parent?.type === "class_definition" ? 15 : 61);
  } else if (n.type === "augmented_assignment") {
    const l = n.childForFieldName("left");
    if (l) f.assigns.push({ target: op(l), value: other(n, src), init: false });
  } else if (n.type === "if_statement" || n.type === "elif_clause") {
    const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
    if (c && body) guardIf(n, c, body, EQ, op, f.guards, src);
  } else if (n.type === "class_definition") {
    symbol(f, src, n.parent?.type === "decorated_definition" ? n.parent : n, n.childForFieldName("name"), "type", 7);
  } else if (n.type === "function_definition") {
    const decl = src.range(n);
    f.decls.push(decl);
    {
      let up = n.parent;
      if (up?.type === "decorated_definition") up = up.parent;
      const inClass = up?.type === "block" && up.parent?.type === "class_definition";
      symbol(f, src, n.parent?.type === "decorated_definition" ? n.parent : n, n.childForFieldName("name"), "method", inClass ? 26 : 17);
    }
    const params = n.childForFieldName("parameters");
    if (!params) return;
    // A method's first parameter is its receiver.
    let up = n.parent;
    if (up?.type === "decorated_definition") up = up.parent;
    let idx = up?.type === "block" && up.parent?.type === "class_definition" ? -1 : 0;
    for (const p of namedChildren(params)) {
      if (p.type === "comment" || p.type === "keyword_separator" || p.type === "positional_separator") continue;
      const name = paramName(p);
      if (idx >= 0 && name) f.params.push({ name: name.text, range: src.range(name), index: idx, decl });
      idx++;
    }
  } else if (n.type === "call") {
    const func = n.childForFieldName("function");
    if (!func) return;
    const callee = func.type === "attribute" ? func.childForFieldName("attribute") ?? func : func;
    const a = n.childForFieldName("arguments");
    const argNodes = a?.type === "argument_list" ? namedChildren(a).filter((x) => x.type !== "comment") : [];
    const values = argNodes.map((x) => (x.type === "keyword_argument" ? x.childForFieldName("value") ?? x : x));
    let p = n.parent;
    while (p?.type === "await") p = p.parent;
    f.calls.push({ callee: src.range(callee), callee_text: func.text, args: values.map((x) => src.range(x)), values: values.map(op), result_used: p?.type !== "expression_statement" });
  }
});

/** Files a module path may be, under `dir`: the module file or its package's `__init__`. */
const moduleFiles = (dir: string, segs: string[]) => {
  const p = [dir, ...segs].filter((x) => x !== "").join("/");
  return [`${p}.py`, `${p}/__init__.py`];
};

/** A relative import is resolved from the importing file's package; an absolute one is tried from the
 *  repo root and each folder above the file, since the source root is not known. The first names of
 *  the callee may be submodules (`from . import db; db.query()`), so each split is tried. Outside the
 *  repo, the package is the top-level module, as the editor names it from `site-packages`. */
const PY_IMPORTS: Imports = {
  path: (callee) => (/^\w+(\.\w+)*$/.test(callee) ? callee.split(".") : []),
  local(module, from, names) {
    const out: { files: string[]; names: string[] }[] = [];
    const dots = /^\.*/.exec(module)![0].length;
    const segs = module.slice(dots).split(".").filter((x) => x !== "");
    const dirs: string[] = [];
    const here = from.split("/").slice(0, -1);
    if (dots) {
      if (dots - 1 > here.length) return [];
      dirs.push(here.slice(0, here.length - (dots - 1)).join("/"));
    } else {
      for (let i = here.length; i >= 0; i--) dirs.push(here.slice(0, i).join("/"));
    }
    for (let k = 0; k <= Math.min(2, names.length - 1); k++)
      for (const d of dirs) if (segs.length + k > 0) out.push({ files: moduleFiles(d, [...segs, ...names.slice(0, k)]), names: names.slice(k) });
    return out;
  },
  external(module, names) {
    if (module.startsWith(".")) return undefined;
    const [pkg, ...rest] = module.split(".");
    return { package: pkg, names: [...rest, ...names] };
  },
};

/** Python, resolved through the editor's Python language server. */
export const Python: Frontend = {
  id: LANGUAGE_ID,
  headless: true,
  extensions: ["py", "pyw"],
  editor: { id: "ms-python.python", name: "Python" },
  imports: PY_IMPORTS,
  init: () => PYTHON.init(),
  implicit: /^__\w+__$/,
  syntax: () => PYTHON,
};
