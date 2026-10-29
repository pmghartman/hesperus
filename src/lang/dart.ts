import { Node } from "web-tree-sitter";
import { Frontend } from "../core/frontend";
import { cmpStr, Range } from "../core/ir";
import { Facts, Guard, Operand } from "../core/syntax";
import { Grammar, namedChildren, Source } from "./treesitter";

export const LANGUAGE_ID = "dart";

// The Dart grammar keeps expressions flat: `a.b(c)` is the siblings `a`, `.b`, `(c)` in one parent, so an
// operand is a run of sibling nodes rather than one node.
const LITERALS = new Set([
  "decimal_integer_literal", "hex_integer_literal", "decimal_floating_point_literal", "string_literal", "true", "false", "null_literal", "symbol_literal",
]);
const ENDS = new Set(["break_statement", "return_statement", "continue_statement"]);
const isComment = (n: Node) => n.type === "comment" || n.type === "documentation_comment";
const significant = (ns: readonly Node[]) => ns.filter((n) => !isComment(n));

/** The identifier of a member access (`.b`, `?.b`), whether wrapped in a `selector` or not. */
function member(n: Node): Node | undefined {
  const s = n.type === "selector" ? n.namedChild(0) : n;
  if (s?.type !== "unconditional_assignable_selector" && s?.type !== "conditional_assignable_selector") return undefined;
  return namedChildren(s).find((x) => x.type === "identifier");
}

function otherRun(run: Node[], src: Source): Operand {
  const text = src.text.slice(run[0].startIndex, run[run.length - 1].endIndex);
  return { name: src.span(run[0], run[run.length - 1]), text, form: "other", receiver: "" };
}

function operand(run: Node[], src: Source): Operand {
  run = significant(run);
  if (!run.length) throw new Error("empty operand");
  const last = run[run.length - 1];
  if (run.length === 1) {
    const n = run[0];
    if (n.type === "identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
    if (LITERALS.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
    if (n.type === "assignable_expression" || n.type === "parenthesized_expression") {
      const inner = namedChildren(n);
      if (inner.length) return operand(inner, src);
    }
  }
  const m = member(last);
  if (m && run.length > 1) {
    const recv = src.text.slice(run[0].startIndex, last.startIndex).replace(/\??\.?$/, "");
    return { name: src.range(m), text: src.text.slice(run[0].startIndex, last.endIndex), form: "name", receiver: recv };
  }
  return otherRun(run, src);
}

/** Equality tests in a condition, through `&&`, `||` and parentheses; as `equalities` in treesitter.ts. */
function guards(seq: Node[], body: Range, src: Source, out: Guard[], certain = true) {
  seq = significant(seq);
  if (seq.length !== 1) return;
  const n = seq[0];
  if (n.type === "parenthesized_expression") return guards(namedChildren(n), body, src, out, certain);
  if (n.type === "logical_and_expression" || n.type === "logical_or_expression") {
    const tok = n.type === "logical_and_expression" ? "&&" : "||";
    const parts = split(n, (c) => c.type === tok);
    for (const p of parts) guards(p, body, src, out, certain && tok === "&&");
  } else if (n.type === "equality_expression") {
    const sides = split(n, (c) => c.type === "equality_operator");
    const op = namedChildren(n).find((c) => c.type === "equality_operator")?.text;
    if (sides.length === 2 && sides[0].length && sides[1].length && (op === "==" || op === "!=")) {
      out.push({ left: operand(sides[0], src), right: operand(sides[1], src), equal: op === "==", body, certain });
    }
  }
}

/** Children of `n` between separator tokens. */
function split(n: Node, sep: (c: Node) => boolean): Node[][] {
  const parts: Node[][] = [[]];
  for (const c of n.children) {
    if (!c) continue;
    if (sep(c)) parts.push([]);
    else if (c.isNamed) parts[parts.length - 1].push(c);
  }
  return parts;
}

const hasChild = (n: Node | null | undefined, type: string) => !!n && namedChildren(n).some((c) => c.type === type);

function assignment(n: Node, src: Source, f: Facts) {
  const kids = n.children.filter((c): c is Node => c !== null);
  const li = kids.findIndex((c) => c.id === n.childForFieldName("left")?.id);
  const left = kids[li];
  if (!left) return;
  const right = n.childrenForFieldName("right").filter((c): c is Node => c !== null);
  const plain = kids[li + 1]?.text === "=";
  if (!right.length) return;
  f.assigns.push({
    target: operand(namedChildren(left), src),
    value: plain ? operand(right, src) : otherRun([n], src),
    init: false,
  });
}

function variables(n: Node, src: Source, f: Facts) {
  if (n.type === "enum_constant") {
    const name = n.childForFieldName("name");
    if (name) f.consts.push(src.range(name));
  } else if (n.type === "initialized_variable_definition") {
    const name = n.childForFieldName("name"), value = n.childrenForFieldName("value").filter((c): c is Node => c !== null);
    if (!name || !value.length) return;
    if (hasChild(n, "const_builtin")) {
      if (operand(value, src).form === "literal") f.consts.push(src.range(name));
    } else if (!hasChild(n, "final_builtin")) {
      f.assigns.push({ target: operand([name], src), value: operand(value, src), init: true });
    }
  } else if (n.type === "initialized_identifier") {
    // A field: the name, then the value as sibling nodes.
    const [name, ...rest] = namedChildren(n);
    const value = significant(rest);
    if (name?.type !== "identifier" || !value.length) return;
    // `a = 1, b = 2`: later declarators of a local nest in the first; fields sit in a list under their declaration.
    const local = n.parent?.type === "initialized_variable_definition";
    const decl = local ? n.parent : n.parent?.parent;
    if (hasChild(decl, "const_builtin")) {
      if (operand(value, src).form === "literal") f.consts.push(src.range(name));
    } else if (!hasChild(decl, "final_builtin")) {
      f.assigns.push({ target: { ...operand([name], src), receiver: local ? "" : "this" }, value: operand(value, src), init: true });
    }
  }
}

function statements(n: Node, src: Source, f: Facts) {
  if (n.type === "assignment_expression") assignment(n, src, f);
  else if (n.type === "postfix_expression" || n.type === "unary_expression") {
    const t = namedChildren(n).find((c) => c.type === "assignable_expression");
    if (t && /^(\+\+|--)|(\+\+|--)$/.test(n.text)) f.assigns.push({ target: operand(namedChildren(t), src), value: otherRun([n], src), init: false });
  } else if (n.type === "if_statement") {
    const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
    if (c && body) guards([c], src.range(body), src, f.guards);
  } else if (n.type === "switch_statement") {
    const c = n.childForFieldName("condition"), block = n.childForFieldName("body");
    const subject = c ? significant(namedChildren(c)) : [];
    if (!subject.length || !block) return;
    let pending: Node[][] = [], stmts: Node[] = [], falls = false;
    const flush = () => {
      if (!stmts.length) return;
      const range = src.span(stmts[0], stmts[stmts.length - 1]);
      for (const v of pending) f.guards.push({ left: operand(subject, src), right: operand(v, src), equal: true, body: range, certain: !falls });
      falls = !ENDS.has(stmts[stmts.length - 1].type);
      pending = [];
      stmts = [];
    };
    for (const k of significant(namedChildren(block))) {
      if (k.type === "switch_label") {
        flush();
        if (hasChild(k, "case_builtin")) pending.push(significant(namedChildren(k).filter((x) => x.type !== "case_builtin")));
      } else stmts.push(k);
    }
    flush();
  }
}

function declare(n: Node, src: Source, f: Facts) {
  // The body is the sibling after the signature (or after the `method_signature` wrapping it).
  const outer = n.parent?.type === "method_signature" ? n.parent : n;
  const body = outer.nextNamedSibling;
  const decl = body?.type === "function_body" ? src.span(outer, body) : src.range(outer);
  f.decls.push(decl);
  const list = namedChildren(n).find((c) => c.type === "formal_parameter_list");
  if (!list) return;
  let index = 0;
  const one = (p: Node) => {
    const name = p.childForFieldName("name");
    if (p.type === "formal_parameter" && name) f.params.push({ name: name.text, range: src.range(name), index, decl });
    index++;
  };
  for (const p of namedChildren(list)) {
    if (p.type === "optional_formal_parameters") {
      // `{named}` parameters bind by name, not position; `[optional]` ones are positional.
      if (p.text.startsWith("[")) namedChildren(p).filter((x) => x.type.endsWith("parameter")).forEach(one);
    } else if (p.type.endsWith("parameter")) one(p);
  }
}

/** Calls in the sibling runs of `n`: a primary (`a`, `this`) followed by selectors. */
function calls(n: Node, src: Source, f: Facts) {
  const kids = significant(namedChildren(n));
  for (let i = 0; i < kids.length; i++) {
    const start = kids[i];
    if (start.type !== "identifier" && start.type !== "this" && start.type !== "super") continue;
    let j = i + 1;
    while (j < kids.length && kids[j].type === "selector") j++;
    for (let k = i + 1; k < j; k++) {
      const args = namedChildren(kids[k]).find((c) => c.type === "argument_part");
      if (!args) continue;
      const prev = kids[k - 1];
      const callee = k === i + 1 ? (start.type === "identifier" ? start : undefined) : member(prev);
      if (!callee) continue;
      const argNodes = namedChildren(namedChildren(args).find((c) => c.type === "arguments") ?? args).filter((c) => c.type === "argument");
      const runs = argNodes.map((a) => significant(namedChildren(a))).filter((r) => r.length);
      f.calls.push({
        callee: src.range(callee),
        callee_text: src.text.slice(start.startIndex, prev.endIndex),
        args: runs.map((r) => src.span(r[0], r[r.length - 1])),
        values: runs.map((r) => operand(r, src)),
        result_used: !(n.type === "expression_statement" && k === j - 1 && j === kids.length),
      });
    }
    i = j - 1;
  }
}

export const DART = new Grammar("tree-sitter-dart.wasm", (n, src, f) => {
  variables(n, src, f);
  statements(n, src, f);
  calls(n, src, f);
  if (n.type === "function_signature" || n.type === "constructor_signature") declare(n, src, f);
  else if (n.type === "new_expression" || n.type === "const_object_expression") {
    const type = namedChildren(n).find((c) => c.type === "type_identifier");
    const args = namedChildren(n).find((c) => c.type === "arguments");
    if (!type) return;
    const runs = args ? namedChildren(args).filter((c) => c.type === "argument").map((a) => significant(namedChildren(a))).filter((r) => r.length) : [];
    f.calls.push({
      callee: src.range(type), callee_text: type.text,
      args: runs.map((r) => src.span(r[0], r[r.length - 1])), values: runs.map((r) => operand(r, src)),
      result_used: n.parent?.type !== "expression_statement",
    });
  }
});

/** Dart and Flutter: symbols and references come from the editor's language server. */
export const Dart: Frontend = {
  id: LANGUAGE_ID,
  extensions: ["dart"],
  editor: { id: "Dart-Code.dart-code", name: "Dart and Flutter" },
  init: () => DART.init(),
  implicit: /^call$/,
  syntax: () => DART,
};
