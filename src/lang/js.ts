import { Node } from "web-tree-sitter";
import { Frontend, extension } from "../core/frontend";
import { cmpStr } from "../core/ir";
import { Facts, Imports, Operand } from "../core/syntax";
import { branches, children, guardIf, Grammar, namedChildren, other, Source, symbol } from "./treesitter";

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
  } else if (n.type === "ternary_expression") {
    const c = n.childForFieldName("condition"), yes = n.childForFieldName("consequence"), no = n.childForFieldName("alternative");
    if (c && yes) branches(c, src.range(yes), no ? src.range(no) : undefined, EQ, op, f.guards);
  } else if (n.type === "if_statement") {
    const c = n.childForFieldName("condition"), body = n.childForFieldName("consequence");
    if (c && body) guardIf(n, c, body, EQ, op, f.guards, src);
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

const unquote = (s: Node) => (s.type === "string" || s.type === "template_string" ? s.text.slice(1, -1) : s.text);

/** `import` forms and `require` bindings. Type-only imports bind nothing at run time. */
function imports(n: Node, f: Facts) {
  const push = (local: string, module: string, member?: string) => f.imports.push(member === undefined ? { local, module } : { local, module, member });
  if (n.type === "import_statement") {
    const source = n.childForFieldName("source");
    if (!source || children(n).some((c) => c.type === "type")) return;
    const module = unquote(source);
    for (const c of namedChildren(n)) {
      if (c.type === "import_require_clause") {
        const id = namedChildren(c).find((x) => x.type === "identifier");
        if (id) push(id.text, module);
      } else if (c.type === "import_clause") {
        for (const x of namedChildren(c)) {
          if (x.type === "identifier") push(x.text, module);
          else if (x.type === "namespace_import") {
            const id = namedChildren(x).find((y) => y.type === "identifier");
            if (id) push(id.text, module);
          } else if (x.type === "named_imports") {
            for (const spec of namedChildren(x)) {
              const name = spec.childForFieldName("name"), alias = spec.childForFieldName("alias");
              if (spec.type === "import_specifier" && name && !children(spec).some((y) => y.type === "type")) push((alias ?? name).text, module, name.text);
            }
          }
        }
      }
    }
  } else if (n.type === "variable_declarator") {
    // `const fs = require("fs")`, `const { spawn: sp } = require("child_process")`.
    const name = n.childForFieldName("name"), value = n.childForFieldName("value");
    if (!name || value?.type !== "call_expression" || value.childForFieldName("function")?.text !== "require") return;
    const arg = namedChildren(value.childForFieldName("arguments") ?? value)[0];
    if (!arg || (arg.type !== "string" && arg.type !== "template_string")) return;
    const module = unquote(arg);
    if (name.type === "identifier") push(name.text, module);
    else if (name.type === "object_pattern") {
      for (const x of namedChildren(name)) {
        if (x.type === "shorthand_property_identifier_pattern") push(x.text, module, x.text);
        else if (x.type === "pair_pattern") {
          const k = x.childForFieldName("key"), v = x.childForFieldName("value");
          if (k && v?.type === "identifier") push(v.text, module, k.text);
        }
      }
    }
  }
}

const TYPES = new Set(["class_declaration", "class", "abstract_class_declaration", "interface_declaration", "type_alias_declaration", "enum_declaration"]);

/** The outline: functions by their naming declaration, classes and types, variables and fields. */
function outline(n: Node, src: Source, f: Facts) {
  if (TYPES.has(n.type)) {
    const name = n.childForFieldName("name");
    if (name) symbol(f, src, n.parent?.type === "export_statement" ? n.parent : n, name, "type", n.type === "interface_declaration" ? 21 : n.type === "enum_declaration" ? 11 : 7);
  } else if (n.type === "enum_assignment" || (n.type === "property_identifier" && n.parent?.type === "enum_body")) {
    symbol(f, src, n, n.type === "enum_assignment" ? n.childForFieldName("name") : n, "term", 12);
  } else if (FUNCTIONS.has(n.type)) {
    const d = namingDecl(n);
    if (!d) return;
    const name = d.type === "pair" ? d.childForFieldName("key") : d.type === "assignment_expression" ? d.childForFieldName("left") : d.childForFieldName("name") ?? d.childForFieldName("property");
    const leaf = name?.type === "member_expression" ? name.childForFieldName("property") : name;
    const inType = d.type === "method_definition" || d.type === "public_field_definition" || d.type === "field_definition";
    const whole = d.parent?.type === "export_statement" ? d.parent : d.type === "variable_declarator" && d.parent?.parent?.type === "export_statement" ? d.parent.parent : d;
    symbol(f, src, whole, leaf, "method", d.type === "method_definition" && leaf?.text === "constructor" ? 9 : inType ? 26 : 17);
  } else if (n.type === "variable_declarator" || n.type === "public_field_definition" || n.type === "field_definition") {
    const name = n.childForFieldName("name") ?? n.childForFieldName("property"), value = n.childForFieldName("value");
    if (name?.type !== "identifier" && name?.type !== "property_identifier" && name?.type !== "private_property_identifier") return;
    if (value && FUNCTIONS.has(value.type)) return; // outlined as a function above
    const isConst = n.parent?.type === "lexical_declaration" && n.parent.childForFieldName("kind")?.type === "const";
    symbol(f, src, n, name, "term", n.type === "variable_declarator" ? (isConst ? 8 : 61) : 15);
  }
}

function visit(n: Node, src: Source, f: Facts) {
  state(n, src, f);
  imports(n, f);
  outline(n, src, f);
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

/** Modules Node ships; `node:` is optional before them. */
const NODE_BUILTINS = new Set((
  "assert async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel dns domain events fs http http2 https " +
  "inspector module net os path perf_hooks process punycode querystring readline repl sea sqlite stream string_decoder sys test timers tls " +
  "trace_events tty url util v8 vm wasi worker_threads zlib"
).split(" "));
const EXTS = ["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"];
const relative = (m: string) => m.startsWith("./") || m.startsWith("../") || m === "." || m === "..";

/** Joins a relative module specifier onto the importing file's directory. */
function join(from: string, m: string): string | undefined {
  const segs = from.split("/").slice(0, -1);
  for (const s of m.split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") {
      if (!segs.length) return undefined;
      segs.pop();
    } else segs.push(s);
  }
  return segs.join("/");
}

/** Names the platform defines without an import, as the TypeScript server files them: the language's
 *  own under `builtins`, Node's under `node`. */
const GLOBALS = new Map<string, string>([
  ...["Math", "JSON", "Object", "Array", "Map", "Set", "WeakMap", "WeakSet", "Promise", "Error", "TypeError", "RangeError", "Date", "Number", "String",
    "Boolean", "Symbol", "BigInt", "RegExp", "Reflect", "Proxy", "Intl", "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent",
    "decodeURIComponent", "encodeURI", "decodeURI", "structuredClone", "queueMicrotask", "setTimeout", "setInterval", "clearTimeout", "clearInterval",
    "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "URL", "URLSearchParams", "TextEncoder", "TextDecoder", "AbortController", "Blob", "FormData",
    "Headers", "Request", "Response", "crypto", "performance", "navigator", "document", "window", "globalThis", "localStorage", "sessionStorage",
    "indexedDB", "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array",
    "ArrayBuffer", "DataView", "Atomics", "SharedArrayBuffer", "alert", "console"].map((n): [string, string] => [n, "builtins"]),
  ...["process", "Buffer", "require", "module", "__dirname", "__filename", "setImmediate", "clearImmediate"].map((n): [string, string] => [n, "node"]),
]);

/** Relative specifiers are repo files, with any of the source extensions, or a folder's index file; a
 *  compiled `.js` name may stand for a `.ts` source. Bare specifiers are packages: a Node built-in is
 *  named by its module in quotes under `node`, as the TypeScript server reports it; a subpath import
 *  (`firebase/app`) keeps its module the same way under its package. */
const JS_IMPORTS: Imports = {
  path: (callee) => (/^[\w$]+(\.[\w$]+)*$/.test(callee) ? callee.split(".") : []),
  local(module, from, names) {
    if (!relative(module)) return [];
    const p = join(from, module);
    if (p === undefined) return [];
    const files = [p];
    const m = /^(.*)\.([cm]?js)x?$/.exec(p);
    if (m) files.push(`${m[1]}.${m[2].replace("js", "ts")}`, `${m[1]}.tsx`);
    for (const e of EXTS) files.push(`${p}.${e}`);
    for (const e of EXTS) files.push(`${p}/index.${e}`);
    return [{ files, names }];
  },
  qualified: (path) => (GLOBALS.has(path[0]) ? { module: `<${GLOBALS.get(path[0])}>`, names: path } : undefined),
  external(module, names) {
    if (module === "<builtins>" || module === "<node>") return { package: module.slice(1, -1), names };
    if (relative(module) || module.startsWith("/") || module.startsWith("#")) return undefined;
    const m = module.replace(/^node:/, "");
    const segs = m.split("/");
    if (NODE_BUILTINS.has(segs[0])) return { package: "node", names: [`"${m}"`, ...names] };
    const pkg = segs[0].startsWith("@") && segs.length > 1 ? `${segs[0]}/${segs[1]}` : segs[0];
    return { package: pkg, names: pkg === module ? names : [`"${module}"`, ...names] };
  },
};

/** JavaScript and TypeScript: the editor's built-in TypeScript server answers. */
export const Js: Frontend = {
  id: LANGUAGE_ID,
  headless: true,
  extensions: ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx"],
  editor: { id: "vscode.typescript-language-features", name: "TypeScript and JavaScript" },
  imports: JS_IMPORTS,
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
