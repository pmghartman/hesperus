import { Node } from "web-tree-sitter";
import { Frontend } from "../core/frontend";
import { Imports, Operand } from "../core/syntax";
import { guardIf, Grammar, namedChildren, other, Source } from "./treesitter";

export const LANGUAGE_ID = "kotlin";

const LITERALS = new Set(["integer_literal", "long_literal", "real_literal", "string_literal", "character_literal", "boolean_literal", "null_literal"]);
/** Parents in which a call is a statement: its result goes nowhere. */
const STATEMENTS = new Set(["statements", "control_structure_body"]);

const first = (n: Node, type: string) => namedChildren(n).find((c) => c.type === type);

/** The last `.name` of a navigation chain: its name token and the text before it. */
function member(n: Node): { name: Node; receiver: string } | undefined {
  const suffix = namedChildren(n).filter((c) => c.type === "navigation_suffix").pop();
  const name = suffix && first(suffix, "simple_identifier");
  return name ? { name, receiver: namedChildren(n)[0].text } : undefined;
}

function operand(n: Node, src: Source): Operand {
  if (n.type === "simple_identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "navigation_expression" || n.type === "directly_assignable_expression") {
    const m = member(n);
    if (m) return { name: src.range(m.name), text: n.text, form: "name", receiver: m.receiver };
    if (n.type === "directly_assignable_expression" && n.namedChildCount === 1) return operand(n.namedChild(0)!, src);
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand(n.namedChild(0)!, src);
  if (LITERALS.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}

const EQ = { eq: ["==", "==="], ne: ["!=", "!=="] };

/** Like Java's, except a Kotlin file need not be named after what it declares, so every file in the
 *  package folder is tried after the one that is. */
const KT_IMPORTS: Imports = {
  path: (callee) => (/^\w+(\.\w+)*$/.test(callee) ? callee.split(".") : []),
  local(module, from, names) {
    const here = from.split("/").slice(0, -1);
    const out: { files: string[]; names: string[] }[] = [];
    for (let i = here.length; i >= 0; i--) {
      const dir = [...here.slice(0, i), ...module.split(".")].join("/");
      out.push({ files: [`${dir}/${names[0]}.kt`, `${dir}/`], names });
    }
    return out;
  },
  external: (module, names) => ({ package: module, names }),
};

export const KOTLIN = new Grammar("tree-sitter-kotlin.wasm", (n, src, f) => {
  const op = (x: Node) => operand(x, src);
  if (n.type === "assignment") {
    const parts = namedChildren(n);
    const plain = n.children.some((c) => c !== null && !c.isNamed && c.type === "=");
    if (parts.length >= 2) f.assigns.push({ target: op(parts[0]), value: plain ? op(parts[parts.length - 1]) : other(n, src), init: false });
  } else if (n.type === "property_declaration") {
    const v = first(n, "variable_declaration");
    const name = v && first(v, "simple_identifier");
    const parts = namedChildren(n);
    const init = parts.length > 2 ? parts[parts.length - 1] : undefined;
    if (name && init && init.type !== "variable_declaration" && init.type !== "binding_pattern_kind") f.assigns.push({ target: op(name), value: op(init), init: true });
    if (name && /\bconst\b/.test(first(n, "modifiers")?.text ?? "")) f.consts.push(src.range(name));
  } else if (n.type === "enum_entry") {
    const name = first(n, "simple_identifier");
    if (name) f.consts.push(src.range(name));
  } else if (n.type === "if_expression") {
    const c = namedChildren(n)[0], body = first(n, "control_structure_body");
    if (c && body && c !== body) guardIf(n, c, body, EQ, op, f.guards, src);
  } else if (n.type === "when_expression") {
    const subject = first(n, "when_subject")?.namedChild(0);
    if (!subject) return;
    for (const e of namedChildren(n)) {
      if (e.type !== "when_entry") continue;
      const body = first(e, "control_structure_body");
      if (!body) continue;
      for (const c of namedChildren(e).filter((x) => x.type === "when_condition")) {
        const v = c.namedChild(0);
        if (v) f.guards.push({ left: op(subject), right: op(v), equal: true, body: src.range(body), certain: true });
      }
    }
  } else if (n.type === "function_declaration") {
    const decl = src.range(n);
    f.decls.push(decl);
    const params = first(n, "function_value_parameters");
    let idx = 0;
    for (const p of params ? namedChildren(params) : []) {
      if (p.type !== "parameter") continue;
      const name = first(p, "simple_identifier");
      if (name) f.params.push({ name: name.text, range: src.range(name), index: idx, decl });
      idx++;
    }
  } else if (n.type === "import_header") {
    const id = first(n, "identifier"), alias = first(n, "import_alias");
    const segs = id ? namedChildren(id).map((c) => c.text) : [];
    if (segs.length < 2 || first(n, "wildcard_import")) return;
    const aliasName = alias ? namedChildren(alias)[0]?.text : undefined;
    f.imports.push({ local: aliasName ?? segs[segs.length - 1], module: segs.slice(0, -1).join("."), member: segs[segs.length - 1] });
  } else if (n.type === "call_expression") {
    const func = namedChildren(n)[0];
    const suffix = first(n, "call_suffix");
    if (!func) return;
    const callee = func.type === "navigation_expression" ? member(func)?.name ?? func : func;
    const args = suffix ? first(suffix, "value_arguments") : undefined;
    const argNodes = args ? namedChildren(args).filter((x) => x.type === "value_argument").map((x) => namedChildren(x).pop() ?? x) : [];
    f.calls.push({ callee: src.range(callee), callee_text: func.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map(op), result_used: !STATEMENTS.has(n.parent?.type ?? "") });
  }
});

/** Kotlin, resolved through the editor's Kotlin language server. */
export const Kotlin: Frontend = {
  id: LANGUAGE_ID,
  imports: KT_IMPORTS,
  extensions: ["kt", "kts"],
  editor: { id: "fwcd.kotlin", name: "Kotlin" },
  init: () => KOTLIN.init(),
  syntax: () => KOTLIN,
};
