import { Node } from "web-tree-sitter";
import { Frontend } from "../core/frontend";
import { Operand } from "../core/syntax";
import { equalities, Grammar, namedChildren, other, Source } from "./treesitter";

export const LANGUAGE_ID = "php";

const LITERALS = new Set(["integer", "float", "string", "encapsed_string", "boolean", "null"]);

/** `$x`, `$o->p`, `A::C`, `$o::$p`: the member token is the name, what precedes it the receiver. */
function operand(n: Node, src: Source): Operand {
  if (n.type === "variable_name") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "member_access_expression" || n.type === "nullsafe_member_access_expression") {
    const f = n.childForFieldName("name");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("object")?.text ?? "" };
  }
  if (n.type === "class_constant_access_expression" || n.type === "scoped_property_access_expression") {
    const parts = namedChildren(n);
    const last = parts[parts.length - 1];
    if (parts.length >= 2) return { name: src.range(last), text: n.text, form: "name", receiver: parts[0].text };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand(n.namedChild(0)!, src);
  if (LITERALS.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}

const EQ = { eq: ["==", "==="], ne: ["!=", "!==", "<>"] };

/** The value of a call argument, through `name: value`. */
const argValue = (a: Node) => namedChildren(a).pop() ?? a;

export const PHP = new Grammar("tree-sitter-php.wasm", (n, src, f) => {
  const op = (x: Node) => operand(x, src);
  if (n.type === "assignment_expression") {
    const l = n.childForFieldName("left"), r = n.childForFieldName("right");
    if (l && r) f.assigns.push({ target: op(l), value: op(r), init: false });
  } else if (n.type === "augmented_assignment_expression") {
    const l = n.childForFieldName("left");
    if (l) f.assigns.push({ target: op(l), value: other(n, src), init: false });
  } else if (n.type === "update_expression") {
    const t = namedChildren(n)[0];
    if (t) f.assigns.push({ target: op(t), value: other(n, src), init: false });
  } else if (n.type === "property_element") {
    const name = n.childForFieldName("name"), v = n.childForFieldName("default_value");
    if (name && v) f.assigns.push({ target: op(name), value: op(v), init: true });
  } else if (n.type === "const_element") {
    const name = namedChildren(n).find((c) => c.type === "name");
    if (name) f.consts.push(src.range(name));
  } else if (n.type === "enum_case") {
    const name = n.childForFieldName("name");
    if (name) f.consts.push(src.range(name));
  } else if (n.type === "if_statement" || n.type === "else_if_clause") {
    const c = n.childForFieldName("condition"), body = n.childForFieldName("body");
    if (c && body) equalities(c, src.range(body), EQ, op, f.guards);
  } else if (n.type === "function_definition" || n.type === "method_declaration") {
    const decl = src.range(n);
    f.decls.push(decl);
    const params = n.childForFieldName("parameters");
    let idx = 0;
    for (const p of params ? namedChildren(params) : []) {
      if (p.type !== "simple_parameter" && p.type !== "variadic_parameter" && p.type !== "property_promotion_parameter") continue;
      const name = p.childForFieldName("name");
      if (name) f.params.push({ name: name.text, range: src.range(name), index: idx, decl });
      idx++;
    }
  } else if (n.type === "function_call_expression" || n.type === "member_call_expression" || n.type === "nullsafe_member_call_expression" || n.type === "scoped_call_expression" || n.type === "object_creation_expression") {
    const isNew = n.type === "object_creation_expression";
    const callee = isNew ? namedChildren(n).find((c) => c.type === "name" || c.type === "qualified_name") : n.childForFieldName(n.type === "function_call_expression" ? "function" : "name");
    if (!callee) return;
    const a = n.childForFieldName("arguments") ?? namedChildren(n).find((c) => c.type === "arguments");
    const argNodes = a ? namedChildren(a).filter((x) => x.type === "argument").map(argValue) : [];
    const name = callee.type === "qualified_name" ? namedChildren(callee).pop() ?? callee : callee;
    const recv = n.childForFieldName("object") ?? n.childForFieldName("scope");
    f.calls.push({ callee: src.range(name), callee_text: recv ? `${recv.text}.${callee.text}` : callee.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map(op), result_used: n.parent?.type !== "expression_statement" });
  }
});

/** PHP, resolved through the editor's PHP language server. */
export const Php: Frontend = {
  id: LANGUAGE_ID,
  extensions: ["php", "phtml"],
  editor: { id: "bmewburn.vscode-intelephense-client", name: "PHP Intelephense" },
  init: () => PHP.init(),
  syntax: () => PHP,
};
