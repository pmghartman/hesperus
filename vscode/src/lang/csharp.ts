import { Node } from "web-tree-sitter";
import { Frontend } from "../core/frontend";
import { cmpStr } from "../core/ir";
import { Facts, Operand } from "../core/syntax";
import { guardIf, Grammar, namedChildren, other, Source } from "./treesitter";

export const LANGUAGE_ID = "csharp";

const LITERALS = new Set([
  "integer_literal", "real_literal", "string_literal", "verbatim_string_literal", "raw_string_literal", "character_literal",
  "boolean_literal", "null_literal",
]);

function operand(n: Node, src: Source): Operand {
  if (n.type === "identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "member_access_expression" || n.type === "member_binding_expression") {
    const f = n.childForFieldName("name");
    if (f) {
      // `this.x` has no expression child; the receiver is the text before the dot.
      const recv = n.childForFieldName("expression")?.text ?? n.text.slice(0, n.text.length - f.text.length).replace(/\??\.$/, "");
      return { name: src.range(f), text: n.text, form: "name", receiver: recv };
    }
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand(n.namedChild(0)!, src);
  if (LITERALS.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}

const EQ = { eq: ["=="], ne: ["!="] };
const ENDS = new Set(["break_statement", "return_statement", "throw_statement", "continue_statement", "goto_statement"]);

/** The initializer of a declarator: its name is the first named child, the value the last. */
function initializer(d: Node): Node | undefined {
  const ns = namedChildren(d).filter((x) => x.type !== "comment");
  return ns.length >= 2 ? ns[ns.length - 1] : undefined;
}

const isConst = (decl: Node | null | undefined) => !!decl && namedChildren(decl).some((x) => x.type === "modifier" && x.text === "const");

function declare(n: Node, src: Source, f: Facts) {
  const decl = src.range(n);
  f.decls.push(decl);
  const params = n.childForFieldName("parameters");
  if (!params) return;
  namedChildren(params).filter((p) => p.type === "parameter").forEach((p, index) => {
    const name = p.childForFieldName("name");
    if (name) f.params.push({ name: name.text, range: src.range(name), index, decl });
  });
}

function state(n: Node, src: Source, f: Facts) {
  const op = (x: Node) => operand(x, src);
  switch (n.type) {
    case "assignment_expression": {
      const l = n.childForFieldName("left"), r = n.childForFieldName("right");
      if (!l || !r) break;
      const plain = n.childForFieldName("operator")?.type === "=";
      // Inside `new T { x = 1 }` the assignment is the first value, not a statement.
      f.assigns.push({ target: op(l), value: plain ? op(r) : other(n, src), init: n.parent?.type === "initializer_expression" });
      break;
    }
    case "postfix_unary_expression": case "prefix_unary_expression": {
      const inc = n.children.some((c) => c !== null && (c.type === "++" || c.type === "--"));
      const t = namedChildren(n)[0];
      if (inc && t) f.assigns.push({ target: op(t), value: other(n, src), init: false });
      break;
    }
    case "variable_declarator": {
      const name = n.childForFieldName("name"), v = initializer(n);
      if (!name || !v) break;
      const decl = n.parent?.parent;
      const constant = isConst(decl);
      if (constant) {
        if (op(v).form === "literal") f.consts.push(src.range(name));
      } else {
        // Locals have no receiver; fields are read as `this.x`.
        f.assigns.push({ target: { ...op(name), receiver: decl?.type === "field_declaration" ? "this" : "" }, value: op(v), init: true });
      }
      break;
    }
    case "enum_member_declaration": {
      const name = n.childForFieldName("name");
      if (name) f.consts.push(src.range(name));
      break;
    }
    case "property_declaration": {
      const name = n.childForFieldName("name"), v = n.childForFieldName("value");
      if (name && v) f.assigns.push({ target: { ...op(name), receiver: "this" }, value: op(v), init: true });
      break;
    }
    case "if_statement": {
      const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
      if (c && body) guardIf(n, c, body, EQ, op, f.guards, src);
      break;
    }
    case "switch_statement": {
      const subject = n.childForFieldName("value");
      const body = n.childForFieldName("body");
      if (!subject || !body) break;
      const v = subject.type === "tuple_expression" ? undefined : subject;
      if (!v) break;
      // A label-only section falls into the next body, which then also runs without that label's test.
      let pending: Node[] = [], falls = false;
      for (const sec of namedChildren(body)) {
        if (sec.type !== "switch_section") continue;
        const kids = namedChildren(sec).filter((x) => x.type !== "comment");
        const labels = kids.filter((x) => x.type === "constant_pattern");
        const stmts = kids.filter((x) => x.type !== "constant_pattern" && x.type !== "when_clause");
        for (const l of labels) pending.push(l.namedChild(0) ?? l);
        if (!stmts.length) continue;
        const range = src.span(stmts[0], stmts[stmts.length - 1]);
        for (const x of pending) f.guards.push({ left: op(v), right: op(x), equal: true, body: range, certain: !falls });
        falls = !ENDS.has(stmts[stmts.length - 1].type);
        pending = [];
      }
      break;
    }
  }
}

/** Name token of a constructed type: `T`, `a.T`, `T<U>`. */
function typeName(t: Node): Node {
  if (t.type === "qualified_name") return typeName(t.childForFieldName("name") ?? t);
  if (t.type === "generic_name") return t.namedChild(0) ?? t;
  return t;
}

export const CSHARP = new Grammar("tree-sitter-c_sharp.wasm", (n, src, f) => {
  state(n, src, f);
  switch (n.type) {
    case "method_declaration": case "constructor_declaration": case "local_function_statement": case "operator_declaration":
      declare(n, src, f);
      break;
    case "invocation_expression": case "object_creation_expression": {
      const func = n.type === "invocation_expression" ? n.childForFieldName("function") : n.childForFieldName("type");
      if (!func) break;
      const name = func.type === "member_access_expression" || func.type === "member_binding_expression"
        ? func.childForFieldName("name") ?? func : n.type === "object_creation_expression" ? typeName(func) : func;
      const a = n.childForFieldName("arguments");
      // `ref x` and `name: x` arguments wrap an expression; the value is the last child.
      const argNodes = a ? namedChildren(a).filter((x) => x.type === "argument").map((x) => namedChildren(x).filter((c) => c.type !== "name_colon").pop() ?? x) : [];
      // `await f();` is a statement too.
      let p = n.parent;
      while (p?.type === "await_expression") p = p.parent;
      f.calls.push({ callee: src.range(name), callee_text: func.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map((x) => operand(x, src)), result_used: p !== null && p.type !== "expression_statement" });
      break;
    }
  }
});

/** C#: symbols and references come from the editor's language server. */
export const CSharp: Frontend = {
  id: LANGUAGE_ID,
  extensions: ["cs"],
  editor: { id: "ms-dotnettools.csharp", name: "C#" },
  init: () => CSHARP.init(),
  syntax: () => CSHARP,
};
