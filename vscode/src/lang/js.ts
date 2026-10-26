import { Node } from "web-tree-sitter";
import { Frontend, extension } from "../core/frontend";
import { cmpStr } from "../core/ir";
import { Facts, Operand } from "../core/syntax";
import { equalities, Grammar, namedChildren, other, Source } from "./treesitter";

export const LANGUAGE_ID = "javascript";

const FUNCTIONS = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "function",
  "generator_function",
  "arrow_function",
  "method_definition",
]);

/** The node that names a function: itself when declared, else the binding that holds it
 *  (`const f = () => …`, `{ f: function () {} }`, `this.f = …`, class fields). */
function namingDecl(f: Node): Node | undefined {
  if (f.type === "function_declaration" || f.type === "generator_function_declaration" || f.type === "method_definition") return f;
  const p = f.parent;
  if (!p) return undefined;
  const holds = (field: string) => p.childForFieldName(field)?.id === f.id;
  switch (p.type) {
    case "variable_declarator":
    case "public_field_definition":
    case "field_definition":
    case "pair":
      return holds("value") ? p : undefined;
    case "assignment_expression":
      return holds("right") ? p : undefined;
    default:
      return undefined;
  }
}

/** Binding name of one formal parameter; undefined for destructuring patterns. */
function paramName(n: Node): Node | undefined {
  switch (n.type) {
    case "identifier":
      return n;
    case "assignment_pattern": {
      const l = n.childForFieldName("left");
      return l?.type === "identifier" ? l : undefined;
    }
    case "rest_pattern": {
      const c = n.namedChild(0);
      return c?.type === "identifier" ? c : undefined;
    }
    case "required_parameter":
    case "optional_parameter": {
      const p = n.childForFieldName("pattern");
      return p ? paramName(p) : undefined;
    }
    default:
      return undefined;
  }
}

const LITERALS = new Set(["string", "number", "true", "false", "null", "undefined"]);

function operand(n: Node, src: Source): Operand {
  if (n.type === "identifier" || n.type === "property_identifier" || n.type === "private_property_identifier")
    return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "member_expression") {
    const p = n.childForFieldName("property");
    if (p) return { name: src.range(p), text: n.text, form: "name", receiver: n.childForFieldName("object")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand(n.namedChild(0)!, src);
  // A template with no substitutions is a plain string.
  if (LITERALS.has(n.type) || (n.type === "template_string" && !namedChildren(n).some((x) => x.type === "template_substitution")))
    return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}

const EQ = { eq: ["===", "=="], ne: ["!==", "!="] };
const ENDS = new Set(["break_statement", "return_statement", "throw_statement", "continue_statement"]);

/** Assignments and equality guards. `switch` cases with no statements share the next body. */
function state(n: Node, src: Source, f: Facts) {
  const op = (x: Node) => operand(x, src);
  if (n.type === "assignment_expression") {
    const l = n.childForFieldName("left"), r = n.childForFieldName("right");
    if (l && r) f.assigns.push({ target: op(l), value: op(r), init: false });
  } else if (n.type === "augmented_assignment_expression") {
    const l = n.childForFieldName("left");
    if (l) f.assigns.push({ target: op(l), value: other(n, src), init: false });
  } else if (n.type === "update_expression") {
    const a = n.childForFieldName("argument");
    if (a) f.assigns.push({ target: op(a), value: other(n, src), init: false });
  } else if (n.type === "lexical_declaration" && n.childForFieldName("kind")?.type === "const") {
    // `const s = "idle"`: a constant only when it holds a literal.
    for (const d of namedChildren(n)) {
      const t = d.childForFieldName("name"), v = d.childForFieldName("value");
      if (d.type === "variable_declarator" && t?.type === "identifier" && v && op(v).form === "literal") f.consts.push(src.range(t));
    }
  }
  // A `const` binding is never written again, so it is a value, not a location.
  const isConst = n.parent?.type === "lexical_declaration" && n.parent.childForFieldName("kind")?.type === "const";
  if ((n.type === "variable_declarator" && !isConst) || n.type === "field_definition" || n.type === "public_field_definition") {
    const t = n.childForFieldName("name") ?? n.childForFieldName("property"), v = n.childForFieldName("value");
    if (t && v) f.assigns.push({ target: { ...op(t), receiver: n.type === "variable_declarator" ? "" : "this" }, value: op(v), init: true });
  } else if (n.type === "if_statement") {
    const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
    if (c && body) equalities(c, src.range(body), EQ, op, f.guards);
  } else if (n.type === "switch_statement") {
    const v = n.childForFieldName("value"), cases = namedChildren(n.childForFieldName("body") ?? n);
    const subject = v?.type === "parenthesized_expression" && v.namedChildCount === 1 ? v.namedChild(0)! : v;
    if (!subject) return;
    let pending: Node[] = [], falls = false;
    for (const c of cases) {
      if (c.type !== "switch_case") continue;
      const val = c.childForFieldName("value");
      if (val) pending.push(val);
      const stmts = c.childrenForFieldName("body").filter((x): x is Node => x !== null && x.type !== "comment");
      if (!stmts.length) continue;
      const body = src.span(stmts[0], stmts[stmts.length - 1]);
      // A body the previous case falls into also runs without this case's test.
      for (const x of pending) f.guards.push({ left: op(subject), right: op(x), equal: true, body, certain: !falls });
      falls = !ENDS.has(stmts[stmts.length - 1].type);
      pending = [];
    }
  }
}

function visit(n: Node, src: Source, f: Facts) {
  state(n, src, f);
  if (FUNCTIONS.has(n.type)) {
    const d = namingDecl(n);
    if (d) {
      const decl = src.range(d);
      f.decls.push(decl);
      const params = n.childForFieldName("parameters");
      if (params) {
        namedChildren(params).filter((x) => x.type !== "comment").forEach((p, index) => {
          const name = paramName(p);
          if (name) f.params.push({ name: name.text, range: src.range(name), index, decl });
        });
      } else {
        // `x => …` has a bare identifier parameter.
        const p = n.childForFieldName("parameter");
        if (p) f.params.push({ name: p.text, range: src.range(p), index: 0, decl });
      }
    }
  }
  const func = n.type === "call_expression" ? n.childForFieldName("function") : n.type === "new_expression" ? n.childForFieldName("constructor") : null;
  if (func) {
    const name = func.type === "member_expression" ? func.childForFieldName("property") ?? func : func;
    const a = n.childForFieldName("arguments");
    const argNodes = a ? namedChildren(a).filter((x) => x.type !== "comment") : [];
    const args = argNodes.map((x) => src.range(x)), values = argNodes.map((x) => operand(x, src));
    const used = n.parent !== null && n.parent.type !== "expression_statement";
    f.calls.push({ callee: src.range(name), callee_text: func.text, args, values, result_used: used });
  }
}

// One grammar each: the TypeScript grammar does not parse JSX, and TSX rejects `<T>x` casts.
export const JS = new Grammar("tree-sitter-javascript.wasm", visit);
export const TS = new Grammar("tree-sitter-typescript.wasm", visit);
export const TSX = new Grammar("tree-sitter-tsx.wasm", visit);

/** JavaScript and TypeScript: the editor's built-in TypeScript server answers. */
export const Js: Frontend = {
  id: LANGUAGE_ID,
  extensions: ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx"],
  editor: { id: "vscode.typescript-language-features", name: "TypeScript and JavaScript" },
  init: async () => {
    await Promise.all([JS.init(), TS.init(), TSX.init()]);
  },
  syntax(p) {
    const e = extension(p);
    if (e === "js" || e === "mjs" || e === "cjs" || e === "jsx") return JS;
    if (e === "ts" || e === "mts" || e === "cts") return TS;
    if (e === "tsx") return TSX;
    return undefined;
  },
};
