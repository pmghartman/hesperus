import { Node } from "web-tree-sitter";
import { Frontend } from "../core/frontend";
import { cmpStr } from "../core/ir";
import { Imports, Operand } from "../core/syntax";
import { equalities, guardIf, Grammar, namedChildren, other, Source, symbol } from "./treesitter";

export const LANGUAGE_ID = "rust";


const LITERALS = new Set(["integer_literal", "float_literal", "string_literal", "raw_string_literal", "char_literal", "boolean_literal", "negative_literal"]);

function operand(n: Node, src: Source): Operand {
  if (n.type === "identifier" || n.type === "field_identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "field_expression") {
    const f = n.childForFieldName("field");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("value")?.text ?? "" };
  }
  if (n.type === "scoped_identifier") {
    const f = n.childForFieldName("name");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("path")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand(n.namedChild(0)!, src);
  if (LITERALS.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}

const EQ = { eq: ["=="], ne: ["!="] };

/** Alternatives of a pattern, through `A | B`. `_` and bindings with guards are left to the caller. */
function alternatives(p: Node): Node[] {
  if (p.type === "or_pattern") return namedChildren(p).flatMap(alternatives);
  return [p];
}

/** Every name a `use` tree binds, with the full path it stands for. */
function useTree(n: Node, prefix: string[], out: { local: string; path: string[] }[]) {
  switch (n.type) {
    case "identifier":
    case "crate":
    case "super":
    case "self":
      // `use a::{self}` binds `a` itself.
      if (n.type === "self" && prefix.length) out.push({ local: prefix[prefix.length - 1], path: prefix });
      else out.push({ local: n.text, path: [...prefix, n.text] });
      break;
    case "scoped_identifier": {
      const path = n.childForFieldName("path"), name = n.childForFieldName("name");
      if (name) useTree(name, path ? [...prefix, ...path.text.split("::")] : prefix, out);
      break;
    }
    case "scoped_use_list": {
      const path = n.childForFieldName("path"), list = n.childForFieldName("list");
      const pre = path ? [...prefix, ...path.text.split("::")] : prefix;
      for (const c of list ? namedChildren(list) : []) useTree(c, pre, out);
      break;
    }
    case "use_list":
      for (const c of namedChildren(n)) useTree(c, prefix, out);
      break;
    case "use_as_clause": {
      const path = n.childForFieldName("path"), alias = n.childForFieldName("alias");
      if (path && alias) out.push({ local: alias.text, path: [...prefix, ...path.text.split("::")] });
      break;
    }
    default:
      break; // wildcards bind nothing nameable
  }
}

/** Paths through `crate`, `super` and `self` are repo modules, from the crate root (the `src` folder
 *  above the file) or the file's own module; a bare path is tried as a submodule of the file's own first. Module segments are dropped from an outside name, keeping
 *  the types (capitalized) that own it and the name itself, as the editor outlines the crate's files;
 *  the crate is the path's first segment. */
const RS_IMPORTS: Imports = {
  path: (callee) => (/^\w+(::\w+)*$/.test(callee) ? callee.split("::") : []),
  local(module, from, names) {
    const segs = module.split("::");
    const file = from.split("/");
    const base = file.pop()!;
    // The folder a file's `mod x;` children live in.
    const own = /^(mod|lib|main)\.rs$/.test(base) ? file : [...file, base.replace(/\.rs$/, "")];
    let dir: string[], rest = segs.slice(1);
    if (segs[0] === "crate") {
      const src = file.lastIndexOf("src");
      dir = src >= 0 ? file.slice(0, src + 1) : [];
    } else if (segs[0] === "self") dir = own;
    else if (segs[0] === "super") dir = own.slice(0, -1);
    else {
      // A bare path (`store::save` after `mod store;`) is the file's own submodule before it is a crate.
      dir = own;
      rest = segs;
    }
    const out: { files: string[]; names: string[] }[] = [];
    for (let k = 0; k <= Math.min(2, names.length - 1); k++) {
      const p = [...dir, ...rest, ...names.slice(0, k)].join("/");
      if (!rest.length && k === 0) out.push({ files: [dir.length ? `${dir.join("/")}/` : ""].filter((x) => x !== ""), names });
      else out.push({ files: [`${p}.rs`, `${p}/mod.rs`], names: names.slice(k) });
    }
    return out;
  },
  external(module, names) {
    const segs = module.split("::");
    if (segs[0] === "crate" || segs[0] === "self" || segs[0] === "super") return undefined;
    const all = [...segs.slice(1), ...names];
    const kept = all.filter((x, i) => i === all.length - 1 || /^[A-Z]/.test(x));
    return { package: segs[0], names: kept };
  },
  qualified: (path) => (path.length >= 2 && /^[a-z_]\w*$/.test(path[0]) ? { module: path[0], names: path.slice(1) } : undefined),
};

export const RUST = new Grammar("tree-sitter-rust.wasm", (n, src, f) => {
  const op = (x: Node) => operand(x, src);
  switch (n.type) {
    case "assignment_expression": {
      const l = n.childForFieldName("left"), r = n.childForFieldName("right");
      if (l && r) f.assigns.push({ target: op(l), value: op(r), init: false });
      break;
    }
    case "compound_assignment_expr": {
      const l = n.childForFieldName("left");
      if (l) f.assigns.push({ target: op(l), value: other(n, src), init: false });
      break;
    }
    case "let_declaration": {
      const p = n.childForFieldName("pattern"), v = n.childForFieldName("value");
      if (p?.type === "identifier" && v) f.assigns.push({ target: op(p), value: op(v), init: true });
      break;
    }
    case "const_item": case "static_item": {
      const name = n.childForFieldName("name"), v = n.childForFieldName("value");
      if (name && v && n.type === "const_item" && op(v).form === "literal") f.consts.push(src.range(name));
      symbol(f, src, n, name, "term", n.type === "const_item" ? 8 : 61);
      break;
    }
    case "field_initializer": {
      const k = n.childForFieldName("field"), v = n.childForFieldName("value");
      if (k && v) f.assigns.push({ target: op(k), value: op(v), init: true });
      break;
    }
    case "if_expression": {
      const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
      if (c && body) guardIf(n, c, body, EQ, op, f.guards, src);
      break;
    }
    case "match_expression": {
      const v = n.childForFieldName("value");
      const arms = namedChildren(n.childForFieldName("body") ?? n).filter((x) => x.type === "match_arm");
      if (!v) break;
      for (const arm of arms) {
        const mp = arm.childForFieldName("pattern"), body = arm.childForFieldName("value");
        const pat = mp?.namedChild(0);
        if (!mp || !pat || !body) continue;
        // `x if cond =>`: the body runs only when both hold.
        const cond = mp.childForFieldName("condition");
        for (const alt of alternatives(pat)) {
          if (alt.type === "_" || alt.type === "identifier" && alt.text === "_") continue;
          f.guards.push({ left: op(v), right: op(alt), equal: true, body: src.range(body), certain: true });
        }
        if (cond) equalities(cond, src.range(body), EQ, op, f.guards);
      }
      break;
    }
    case "function_item": case "function_signature_item": {
      const decl = src.range(n);
      f.decls.push(decl);
      symbol(f, src, n, n.childForFieldName("name"), "method", /^(impl|trait)_item$/.test(n.parent?.parent?.type ?? "") ? 26 : 17);
      const params = n.childForFieldName("parameters");
      if (!params) break;
      let idx = 0;
      for (const d of namedChildren(params)) {
        if (d.type !== "parameter") continue;
        const name = d.childForFieldName("pattern");
        if (name?.type === "identifier") f.params.push({ name: name.text, range: src.range(name), index: idx, decl });
        idx++;
      }
      break;
    }
    case "struct_item":
    case "enum_item":
    case "trait_item":
    case "union_item":
    case "type_item":
      symbol(f, src, n, n.childForFieldName("name"), "type", n.type === "enum_item" ? 11 : n.type === "trait_item" ? 21 : n.type === "struct_item" ? 49 : 7);
      break;
    case "impl_item": {
      // `impl Trait for Foo` and `impl Foo` both outline under `Foo`; the indexer merges it with the struct.
      const t = n.childForFieldName("type");
      const name = t?.type === "generic_type" ? t.childForFieldName("type") : t;
      symbol(f, src, n, name, "type", 7);
      break;
    }
    case "mod_item":
      symbol(f, src, n, n.childForFieldName("name"), "namespace", 29);
      break;
    case "enum_variant":
      symbol(f, src, n, n.childForFieldName("name"), "term", 12);
      break;
    case "field_declaration":
      symbol(f, src, n, n.childForFieldName("name"), "term", 15);
      break;
    case "use_declaration": {
      const arg = n.childForFieldName("argument");
      const bound: { local: string; path: string[] }[] = [];
      if (arg) useTree(arg, [], bound);
      for (const b of bound) {
        if (b.path.length < 2) f.imports.push({ local: b.local, module: b.path[0] });
        else f.imports.push({ local: b.local, module: b.path.slice(0, -1).join("::"), member: b.path[b.path.length - 1] });
      }
      break;
    }
    case "call_expression": {
      let func = n.childForFieldName("function");
      if (func?.type === "generic_function") func = func.childForFieldName("function");
      if (!func) break;
      const callee = func.type === "field_expression" ? func.childForFieldName("field") ?? func
        : func.type === "scoped_identifier" ? func.childForFieldName("name") ?? func : func;
      const a = n.childForFieldName("arguments");
      const argNodes = a ? namedChildren(a).filter((x) => x.type !== "line_comment" && x.type !== "block_comment") : [];
      const used = n.parent?.type !== "expression_statement";
      f.calls.push({ callee: src.range(callee), callee_text: func.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map(op), result_used: used });
      break;
    }
  }
});

/** Rust Analyzer: symbols and references come from the editor's language server. */
export const Rust: Frontend = {
  id: LANGUAGE_ID,
  headless: true,
  imports: RS_IMPORTS,
  extensions: ["rs"],
  editor: { id: "rust-lang.rust-analyzer", name: "Rust Analyzer" },
  init: () => RUST.init(),
  syntax: () => RUST,
};
