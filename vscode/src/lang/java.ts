import { Node } from "web-tree-sitter";
import { Frontend } from "../core/frontend";
import { Imports, Operand } from "../core/syntax";
import { guardIf, Grammar, namedChildren, other, Source } from "./treesitter";

export const LANGUAGE_ID = "java";

const LITERALS = new Set([
  "decimal_integer_literal", "hex_integer_literal", "octal_integer_literal", "binary_integer_literal", "decimal_floating_point_literal",
  "hex_floating_point_literal", "string_literal", "character_literal", "true", "false", "null_literal",
]);

function operand(n: Node, src: Source): Operand {
  if (n.type === "identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "field_access") {
    const f = n.childForFieldName("field");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("object")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand(n.namedChild(0)!, src);
  if (LITERALS.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}

const EQ = { eq: ["=="], ne: ["!="] };
const ENDS = new Set(["break_statement", "return_statement", "continue_statement", "throw_statement", "yield_statement"]);
const COMMENTS = new Set(["line_comment", "block_comment"]);

/** Name token of a constructed type: `T`, `a.T`, `T<U>`. */
function typeName(t: Node): Node {
  if (t.type === "scoped_type_identifier") return typeName(namedChildren(t).pop() ?? t);
  if (t.type === "generic_type") return typeName(t.namedChild(0) ?? t);
  return t;
}

/** A class lives in the file named after it under its package folder, below some source root above
 *  the importing file. Outside the repo, the package is the import's package. */
const JAVA_IMPORTS: Imports = {
  path: (callee) => (/^\w+(\.\w+)*$/.test(callee) ? callee.split(".") : []),
  local(module, from, names) {
    const here = from.split("/").slice(0, -1);
    const out: { files: string[]; names: string[] }[] = [];
    for (let i = here.length; i >= 0; i--) out.push({ files: [[...here.slice(0, i), ...module.split("."), `${names[0]}.java`].join("/")], names });
    return out;
  },
  external: (module, names) => ({ package: module, names }),
};

export const JAVA = new Grammar("tree-sitter-java.wasm", (n, src, f) => {
  const op = (x: Node) => operand(x, src);
  if (n.type === "assignment_expression") {
    const l = n.childForFieldName("left"), r = n.childForFieldName("right");
    if (l && r) f.assigns.push({ target: op(l), value: n.childForFieldName("operator")?.type === "=" ? op(r) : other(n, src), init: false });
  } else if (n.type === "update_expression") {
    const t = namedChildren(n)[0];
    if (t) f.assigns.push({ target: op(t), value: other(n, src), init: false });
  } else if (n.type === "variable_declarator") {
    const name = n.childForFieldName("name"), v = n.childForFieldName("value");
    if (name && v && v.type !== "array_initializer") f.assigns.push({ target: op(name), value: op(v), init: true });
    const decl = n.parent;
    if (name && decl?.type === "field_declaration" && namedChildren(decl).some((c) => c.type === "modifiers" && /\bfinal\b/.test(c.text))) f.consts.push(src.range(name));
  } else if (n.type === "enum_constant") {
    const name = n.childForFieldName("name");
    if (name) f.consts.push(src.range(name));
  } else if (n.type === "if_statement") {
    const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
    if (c && body) guardIf(n, c, body, EQ, op, f.guards, src);
  } else if (n.type === "switch_expression" || n.type === "switch_statement") {
    const c = n.childForFieldName("condition"), block = n.childForFieldName("body");
    const subject = c && (c.type === "parenthesized_expression" ? c.namedChild(0) : c);
    if (!subject || !block) return;
    let pending: Node[] = [], falls = false;
    for (const g of namedChildren(block)) {
      if (g.type !== "switch_block_statement_group" && g.type !== "switch_rule") continue;
      const labels = namedChildren(g).filter((x) => x.type === "switch_label");
      const stmts = namedChildren(g).filter((x) => x.type !== "switch_label" && !COMMENTS.has(x.type));
      for (const l of labels) pending.push(...namedChildren(l));
      if (!stmts.length) continue;
      const body = src.span(stmts[0], stmts[stmts.length - 1]);
      for (const v of pending) f.guards.push({ left: op(subject), right: op(v), equal: true, body, certain: !falls });
      falls = g.type === "switch_block_statement_group" && !ENDS.has(stmts[stmts.length - 1].type);
      pending = [];
    }
  } else if (n.type === "method_declaration" || n.type === "constructor_declaration") {
    const decl = src.range(n);
    f.decls.push(decl);
    const params = n.childForFieldName("parameters");
    let idx = 0;
    for (const p of params ? namedChildren(params) : []) {
      const name = p.type === "formal_parameter" ? p.childForFieldName("name") : p.type === "spread_parameter" ? namedChildren(p).find((c) => c.type === "variable_declarator")?.childForFieldName("name") : null;
      if (name) f.params.push({ name: name.text, range: src.range(name), index: idx, decl });
      if (p.type === "formal_parameter" || p.type === "spread_parameter") idx++;
    }
  } else if (n.type === "import_declaration") {
    // `import a.b.C` and `import static a.b.C.m` bind their last name; `import a.b.*` binds none.
    const id = namedChildren(n).find((c) => c.type === "scoped_identifier");
    const scope = id?.childForFieldName("scope"), name = id?.childForFieldName("name");
    if (scope && name && !namedChildren(n).some((c) => c.type === "asterisk")) f.imports.push({ local: name.text, module: scope.text, member: name.text });
  } else if (n.type === "method_invocation" || n.type === "object_creation_expression") {
    const isNew = n.type === "object_creation_expression";
    const t = isNew ? n.childForFieldName("type") : n.childForFieldName("name");
    if (!t) return;
    const callee = isNew ? typeName(t) : t;
    const obj = isNew ? null : n.childForFieldName("object");
    const a = n.childForFieldName("arguments");
    const argNodes = a ? namedChildren(a).filter((x) => !COMMENTS.has(x.type)) : [];
    f.calls.push({ callee: src.range(callee), callee_text: obj ? `${obj.text}.${t.text}` : t.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map(op), result_used: n.parent?.type !== "expression_statement" });
  }
});

/** Java, resolved through the editor's Java language server. */
export const Java: Frontend = {
  id: LANGUAGE_ID,
  imports: JAVA_IMPORTS,
  extensions: ["java"],
  editor: { id: "redhat.java", name: "Language Support for Java" },
  init: () => JAVA.init(),
  syntax: () => JAVA,
};
