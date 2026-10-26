import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Node } from "web-tree-sitter";
import { Command, Frontend, Tool } from "../core/frontend";
import { cmpStr } from "../core/ir";
import { Facts, Operand } from "../core/syntax";
import { equalities, Grammar, namedChildren, other, Source } from "./treesitter";

export const LANGUAGE_ID = "cpp";

const VERSION = "v0.4.1";
const asset = (name: string, sha256: string) => ({ archive: "none" as const, sha256, url: `https://github.com/sourcegraph/scip-clang/releases/download/${VERSION}/${name}` });

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
      if (c && body) equalities(unclause(c), src.range(body), EQ, op, f.guards);
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

/** scip-clang finds no system headers on macOS by itself, and a failed include silently drops the code after it. */
function sysroot(): string[] {
  if (process.platform !== "darwin") return [];
  const r = spawnSync("xcrun", ["--show-sdk-path"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() ? ["-isysroot", r.stdout.trim()] : [];
}

const isFile = (p: string) => fs.statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;
const UNITS = new Set(["c", "cc", "cpp", "cxx", "c++"]);

/** C and C++, resolved by scip-clang. */
export const Cpp: Frontend = {
  id: LANGUAGE_ID,
  extensions: ["c", "cc", "cpp", "cxx", "c++", "h", "hh", "hpp", "hxx", "h++", "ipp"],
  tool: (): Tool => ({
    name: "scip-clang",
    version: VERSION,
    install: {
      kind: "release",
      assets: {
        "darwin-arm64": asset("scip-clang-arm64-darwin", "34a2eb7a5ef9bbe9849cded59f4eb22a2331bd5b64a5cec2b17ee09b8aa515de"),
        "linux-x64": asset("scip-clang-x86_64-linux", "a434d26a079fd80e1996ba79276cb1ef86b2b2ad28b13e24386285db32c59046"),
      },
    },
  }),
  binIn: (dir) => path.join(dir, "bin", "scip-clang"),
  searchDirs: () => [],
  roots: () => [""],
  /** scip-clang reads a compilation database. Use the repo's own; without one, compile every translation
   *  unit with default flags and the usual include directories, which resolves self-contained code only. */
  command(repo, bin, out, scratch): Command {
    const abs = path.resolve(repo);
    let db = ["compile_commands.json", "build/compile_commands.json"].map((p) => path.join(abs, p)).find(isFile);
    if (!db) {
      const files: string[] = [];
      const walk = (d: string, rel: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => cmpStr(a.name, b.name))) {
          if (e.name.startsWith(".")) continue;
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(path.join(d, e.name), r);
          else if (UNITS.has(e.name.slice(e.name.lastIndexOf(".") + 1).toLowerCase())) files.push(r);
        }
      };
      walk(abs, "");
      const flags = ["-std=c++17", "-I.", "-Iinclude", "-Isrc", ...sysroot()].join(" ");
      const entries = files.map((file) => ({ directory: abs, command: `clang++ ${flags} -c ${file}`, file }));
      fs.mkdirSync(path.join(scratch, "cpp-db"), { recursive: true });
      db = path.join(scratch, "cpp-db", "compile_commands.json");
      fs.writeFileSync(db, JSON.stringify(entries));
    }
    return { cmd: bin, args: [`--compdb-path=${db}`, `--index-output-path=${out}`], cwd: abs };
  },
  init: () => CPP.init(),
  syntax: () => CPP,
};
