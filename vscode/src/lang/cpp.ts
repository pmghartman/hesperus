import { Node } from "web-tree-sitter";
import { Frontend } from "../core/frontend";
import { cmpStr } from "../core/ir";
import { Facts, Operand } from "../core/syntax";
import { guardIf, Grammar, namedChildren, other, Source } from "./treesitter";

export const LANGUAGE_ID = "cpp";


const LITERALS = new Set(["number_literal", "string_literal", "raw_string_literal", "char_literal", "true", "false", "nullptr", "null"]);

function operand(n: Node, src: Source): Operand {
  if (n.type === "identifier" || n.type === "field_identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "field_expression") {
    const f = n.childForFieldName("field");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("argument")?.text ?? "" };
  }
  if (n.type === "qualified_identifier") {
    const f = n.childForFieldName("name");
    if (f && f.type !== "qualified_identifier") return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("scope")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand(n.namedChild(0)!, src);
  if (LITERALS.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}

const EQ = { eq: ["=="], ne: ["!="] };
const ENDS = new Set(["break_statement", "return_statement", "continue_statement", "goto_statement"]);

/** `if (x)` and `switch (x)` wrap the expression in a condition clause. */
const unclause = (c: Node) => (c.type === "condition_clause" ? c.childForFieldName("value") ?? c : c);

/** The innermost declarator that names something, through pointers and references. */
function nameOf(d: Node | null): Node | undefined {
  while (d && (d.type === "pointer_declarator" || d.type === "reference_declarator" || d.type === "array_declarator" || d.type === "parenthesized_declarator")) {
    d = d.childForFieldName("declarator") ?? d.namedChild(0);
  }
  return d?.type === "identifier" || d?.type === "field_identifier" ? d : undefined;
}

/** The function declarator of a definition, through `T*` and `T&` return declarators. */
function functionDeclarator(d: Node | null): Node | undefined {
  while (d && d.type !== "function_declarator") d = d.childForFieldName("declarator");
  return d ?? undefined;
}

const isConst = (decl: Node) => namedChildren(decl).some((x) => x.type === "type_qualifier" && (x.text === "const" || x.text === "constexpr"));

function state(n: Node, src: Source, f: Facts) {
  const op = (x: Node) => operand(x, src);
  switch (n.type) {
    case "assignment_expression": {
      const l = n.childForFieldName("left"), r = n.childForFieldName("right");
      if (l && r) f.assigns.push({ target: op(l), value: n.childForFieldName("operator")?.type === "=" ? op(r) : other(n, src), init: false });
      break;
    }
    case "update_expression": {
      const a = n.childForFieldName("argument");
      if (a) f.assigns.push({ target: op(a), value: other(n, src), init: false });
      break;
    }
    case "init_declarator": {
      const name = nameOf(n.childForFieldName("declarator")), v = n.childForFieldName("value");
      if (!name || !v || v.type === "initializer_list") break;
      if (n.parent && isConst(n.parent)) {
        if (op(v).form === "literal") f.consts.push(src.range(name));
      } else {
        f.assigns.push({ target: op(name), value: op(v), init: true });
      }
      break;
    }
    case "enumerator": {
      const name = n.childForFieldName("name");
      if (name) f.consts.push(src.range(name));
      break;
    }
    case "field_declaration": {
      const name = nameOf(n.childForFieldName("declarator")), v = n.childForFieldName("default_value");
      if (name && v) f.assigns.push({ target: { ...op(name), receiver: "this" }, value: op(v), init: true });
      break;
    }
    case "field_initializer": {
      // `state_(State::Idle)` in a constructor's initializer list.
      const name = namedChildren(n).find((x) => x.type === "field_identifier");
      const args = namedChildren(n).find((x) => x.type === "argument_list");
      const first = args?.namedChildren.filter((x): x is Node => x !== null)[0];
      if (name && first && args!.namedChildCount === 1) f.assigns.push({ target: { ...op(name), receiver: "this" }, value: op(first), init: true });
      break;
    }
    case "if_statement": {
      const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
      if (c && body) guardIf(n, unclause(c), body, EQ, op, f.guards, src);
      break;
    }
    case "switch_statement": {
      const c = n.childForFieldName("condition"), body = n.childForFieldName("body");
      const subject = c && unclause(c);
      if (!subject || !body) break;
      let pending: Node[] = [], falls = false;
      for (const cs of namedChildren(body)) {
        if (cs.type !== "case_statement") continue;
        const val = cs.childForFieldName("value");
        if (val) pending.push(val);
        const stmts = namedChildren(cs).filter((x) => x.id !== val?.id && x.type !== "comment");
        if (!stmts.length) continue;
        const range = src.span(stmts[0], stmts[stmts.length - 1]);
        for (const x of pending) f.guards.push({ left: op(subject), right: op(x), equal: true, body: range, certain: !falls });
        falls = !ENDS.has(stmts[stmts.length - 1].type);
        pending = [];
      }
      break;
    }
  }
}

function params(fd: Node, decl: ReturnType<Source["range"]>, src: Source, f: Facts) {
  const list = fd.childForFieldName("parameters");
  if (!list) return;
  let index = 0;
  for (const p of namedChildren(list)) {
    if (p.type !== "parameter_declaration" && p.type !== "optional_parameter_declaration" && p.type !== "variadic_parameter_declaration") continue;
    const name = nameOf(p.childForFieldName("declarator"));
    // `f(void)` has one nameless parameter that is no parameter.
    if (name) f.params.push({ name: name.text, range: src.range(name), index, decl });
    index++;
  }
}

export const CPP = new Grammar("tree-sitter-cpp.wasm", (n, src, f) => {
  state(n, src, f);
  if (n.type === "function_definition") {
    const fd = functionDeclarator(n.childForFieldName("declarator"));
    const decl = src.range(n);
    f.decls.push(decl);
    if (fd) params(fd, decl, src, f);
  } else if (n.type === "call_expression" || n.type === "new_expression") {
    let func = n.type === "call_expression" ? n.childForFieldName("function") : n.childForFieldName("type");
    if (func?.type === "template_function") func = func.childForFieldName("name") ?? func;
    if (!func) return;
    const callee = func.type === "field_expression" ? func.childForFieldName("field") ?? func
      : func.type === "qualified_identifier" ? func.childForFieldName("name") ?? func : func;
    const a = n.childForFieldName("arguments");
    const argNodes = a ? namedChildren(a).filter((x) => x.type !== "comment") : [];
    f.calls.push({ callee: src.range(callee), callee_text: func.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map((x) => operand(x, src)), result_used: n.parent?.type !== "expression_statement" });
  }
});

/** C/C++: symbols and references come from the editor's language server. */
export const Cpp: Frontend = {
  id: LANGUAGE_ID,
  extensions: ["c", "cc", "cpp", "cxx", "c++", "h", "hh", "hpp", "hxx", "h++", "ipp"],
  editor: { id: "ms-vscode.cpptools", name: "C/C++" },
  declarationsAcrossFiles: true,
  init: () => CPP.init(),
  syntax: () => CPP,
};
