import { Node } from "web-tree-sitter";
import { Frontend } from "../core/frontend";
import { cmpStr } from "../core/ir";
import { Operand } from "../core/syntax";
import { equalities, Grammar, namedChildren, other, Source } from "./treesitter";

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
      break;
    }
    case "field_initializer": {
      const k = n.childForFieldName("field"), v = n.childForFieldName("value");
      if (k && v) f.assigns.push({ target: op(k), value: op(v), init: true });
      break;
    }
    case "if_expression": {
      const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
      if (c && body) equalities(c, src.range(body), EQ, op, f.guards);
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
  extensions: ["rs"],
  editor: { id: "rust-lang.rust-analyzer", name: "Rust Analyzer" },
  init: () => RUST.init(),
  syntax: () => RUST,
};
