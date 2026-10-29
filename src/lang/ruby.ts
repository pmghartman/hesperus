import { Node } from "web-tree-sitter";
import { Frontend } from "../core/frontend";
import { Operand } from "../core/syntax";
import { guardIf, Grammar, namedChildren, other, Source } from "./treesitter";

export const LANGUAGE_ID = "ruby";

const NAMES = new Set(["identifier", "constant", "instance_variable", "class_variable", "global_variable"]);
const LITERALS = new Set(["integer", "float", "string", "simple_symbol", "delimited_symbol", "true", "false", "nil"]);
/** Parents in which a call is a statement: its result goes nowhere. */
const STATEMENTS = new Set(["program", "body_statement", "then", "else", "do_block", "begin", "block_body"]);

function operand(n: Node, src: Source): Operand {
  if (NAMES.has(n.type)) return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "scope_resolution") {
    const f = n.childForFieldName("name");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("scope")?.text ?? "" };
  }
  // `obj.state` with no arguments reads an attribute.
  if (n.type === "call" && !n.childForFieldName("arguments")) {
    const m = n.childForFieldName("method"), r = n.childForFieldName("receiver");
    if (m && r) return { name: src.range(m), text: n.text, form: "name", receiver: r.text };
  }
  if (LITERALS.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}

const EQ = { eq: ["==", "==="], ne: ["!="] };

function paramName(p: Node): Node | undefined {
  if (p.type === "identifier") return p;
  return ["optional_parameter", "splat_parameter", "hash_splat_parameter", "keyword_parameter", "block_parameter"].includes(p.type) ? p.childForFieldName("name") ?? undefined : undefined;
}

export const RUBY = new Grammar("tree-sitter-ruby.wasm", (n, src, f) => {
  const op = (x: Node) => operand(x, src);
  if (n.type === "assignment") {
    const l = n.childForFieldName("left"), r = n.childForFieldName("right");
    if (l && r && r.type !== "assignment" && r.type !== "right_assignment_list") f.assigns.push({ target: op(l), value: op(r), init: false });
    if (l?.type === "constant") f.consts.push(src.range(l));
  } else if (n.type === "operator_assignment") {
    const l = n.childForFieldName("left");
    if (l) f.assigns.push({ target: op(l), value: other(n, src), init: false });
  } else if (n.type === "if" || n.type === "elsif") {
    const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
    if (c && body) guardIf(n, c, body, EQ, op, f.guards, src);
  } else if (n.type === "method" || n.type === "singleton_method") {
    const decl = src.range(n);
    f.decls.push(decl);
    const params = n.childForFieldName("parameters");
    let idx = 0;
    for (const p of params ? namedChildren(params) : []) {
      const name = paramName(p);
      if (name) f.params.push({ name: name.text, range: src.range(name), index: idx, decl });
      idx++;
    }
  } else if (n.type === "call") {
    const m = n.childForFieldName("method");
    const a = n.childForFieldName("arguments");
    // Without arguments a statement is a call; elsewhere `obj.x` is an attribute read.
    if (!m || (!a && !STATEMENTS.has(n.parent?.type ?? ""))) return;
    const r = n.childForFieldName("receiver");
    // `Thing.new(...)` constructs the receiver's class.
    const target = m.text === "new" && r ? (r.type === "scope_resolution" ? r.childForFieldName("name") ?? r : r) : m;
    const argNodes = a ? namedChildren(a).filter((x) => x.type !== "comment") : [];
    const values = argNodes.map((x) => (x.type === "pair" ? x.childForFieldName("value") ?? x : x));
    f.calls.push({ callee: src.range(target), callee_text: r ? `${r.text}.${m.text}` : m.text, args: values.map((x) => src.range(x)), values: values.map(op), result_used: !STATEMENTS.has(n.parent?.type ?? "") });
  }
});

/** Ruby, resolved through the editor's Ruby language server. */
export const Ruby: Frontend = {
  id: LANGUAGE_ID,
  extensions: ["rb", "rake", "gemspec"],
  editor: { id: "Shopify.ruby-lsp", name: "Ruby LSP" },
  init: () => RUBY.init(),
  syntax: () => RUBY,
};
