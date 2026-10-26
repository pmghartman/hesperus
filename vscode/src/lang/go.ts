import { Frontend } from "../core/frontend";
import { cmpStr } from "../core/ir";
import { Node } from "web-tree-sitter";
import { Operand } from "../core/syntax";
import { equalities, guardIf, Grammar, namedChildren, other, Source } from "./treesitter";

export const LANGUAGE_ID = "go";

const LITERALS = new Set([
  "interpreted_string_literal", "raw_string_literal", "int_literal", "float_literal", "imaginary_literal",
  "rune_literal", "true", "false", "nil",
]);

function operand(n: Node, src: Source): Operand {
  if (n.type === "identifier" || n.type === "field_identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "selector_expression") {
    const f = n.childForFieldName("field");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("operand")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand(n.namedChild(0)!, src);
  if (n.type === "literal_element" && n.namedChildCount === 1) return operand(n.namedChild(0)!, src);
  if (LITERALS.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}

const EQ = { eq: ["=="], ne: ["!="] };

/** Statements of a switch case: everything after its values. */
function caseBody(c: Node, src: Source) {
  const stmts = namedChildren(c).filter((x) => c.childForFieldName("value")?.id !== x.id && x.type !== "comment");
  return stmts.length ? src.span(stmts[0], stmts[stmts.length - 1]) : undefined;
}

export const GO = new Grammar("tree-sitter-go.wasm", (n, src, f) => {
  const op = (x: Node) => operand(x, src);
  if (n.type === "assignment_statement") {
    const l = namedChildren(n.childForFieldName("left")!), r = namedChildren(n.childForFieldName("right")!);
    const plain = n.childForFieldName("operator")?.type === "=" && l.length === r.length;
    l.forEach((t, i) => f.assigns.push({ target: op(t), value: plain ? op(r[i]) : other(r[Math.min(i, r.length - 1)] ?? n, src), init: false }));
  } else if (n.type === "short_var_declaration") {
    const l = namedChildren(n.childForFieldName("left")!), r = namedChildren(n.childForFieldName("right")!);
    if (l.length === r.length) l.forEach((t, i) => f.assigns.push({ target: op(t), value: op(r[i]), init: true }));
  } else if (n.type === "const_spec") {
    for (const x of n.childrenForFieldName("name")) if (x) f.consts.push(src.range(x));
  } else if (n.type === "inc_statement" || n.type === "dec_statement") {
    const t = n.namedChild(0);
    if (t) f.assigns.push({ target: op(t), value: other(n, src), init: false });
  } else if (n.type === "var_spec") {
    const vals = n.childForFieldName("value");
    const names = n.childrenForFieldName("name").filter((x): x is Node => x !== null);
    const r = vals ? namedChildren(vals) : [];
    if (r.length === names.length) names.forEach((t, i) => f.assigns.push({ target: op(t), value: op(r[i]), init: true }));
  } else if (n.type === "keyed_element" && n.parent?.parent?.type === "composite_literal"
    && n.parent.parent.childForFieldName("type")?.type !== "map_type") {
    const k = n.childForFieldName("key"), v = n.childForFieldName("value");
    if (k && v) f.assigns.push({ target: op(k), value: op(v), init: true });
  } else if (n.type === "if_statement") {
    const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
    if (c && body) guardIf(n, c, body, EQ, op, f.guards, src);
  } else if (n.type === "expression_switch_statement") {
    const v = n.childForFieldName("value");
    for (const c of namedChildren(n)) {
      if (c.type !== "expression_case") continue;
      const body = caseBody(c, src), vals = c.childForFieldName("value");
      if (!body || !vals) continue;
      // `switch { case a == b: }` tests each case like an `if` condition.
      for (const x of namedChildren(vals))
        v ? f.guards.push({ left: op(v), right: op(x), equal: true, body, certain: true }) : equalities(x, body, EQ, op, f.guards);
    }
  } else if (n.type === "function_declaration" || n.type === "method_declaration") {
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
    const argNodes = a ? namedChildren(a).filter((x) => x.type !== "comment") : [];
    const args = argNodes.map((x) => src.range(x)), values = argNodes.map((x) => operand(x, src));
    const p = n.parent?.type;
    const used = p !== "expression_statement" && p !== "go_statement" && p !== "defer_statement";
    f.calls.push({ callee: src.range(callee), callee_text: func.text, args, values, result_used: used });
  }
});


/** Go: symbols and references come from the editor's language server. */
export const Go: Frontend = {
  id: LANGUAGE_ID,
  extensions: ["go"],
  editor: { id: "golang.go", name: "Go" },
  init: () => GO.init(),
  syntax: () => GO,
};
