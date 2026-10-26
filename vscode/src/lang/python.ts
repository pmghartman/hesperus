import { Node } from "web-tree-sitter";
import { Frontend } from "../core/frontend";
import { Operand } from "../core/syntax";
import { guardIf, Grammar, namedChildren, other, Source } from "./treesitter";

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
  if (n.type === "assignment") {
    const l = n.childForFieldName("left"), r = n.childForFieldName("right");
    if (l && r && l.type !== "pattern_list" && l.type !== "tuple_pattern") f.assigns.push({ target: op(l), value: r.type === "assignment" ? other(r, src) : op(r), init: false });
  } else if (n.type === "augmented_assignment") {
    const l = n.childForFieldName("left");
    if (l) f.assigns.push({ target: op(l), value: other(n, src), init: false });
  } else if (n.type === "if_statement" || n.type === "elif_clause") {
    const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
    if (c && body) guardIf(n, c, body, EQ, op, f.guards, src);
  } else if (n.type === "function_definition") {
    const decl = src.range(n);
    f.decls.push(decl);
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

/** Python, resolved through the editor's Python language server. */
export const Python: Frontend = {
  id: LANGUAGE_ID,
  extensions: ["py", "pyw"],
  editor: { id: "ms-python.python", name: "Python" },
  init: () => PYTHON.init(),
  syntax: () => PYTHON,
};
