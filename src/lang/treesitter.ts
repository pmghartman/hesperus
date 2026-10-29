// tree-sitter through WebAssembly: one runtime, pinned grammars copied into grammars/ at build.
import * as fs from "node:fs";
import * as path from "node:path";
import { Language, Node, Parser } from "web-tree-sitter";
import { Range } from "../core/ir";
import { Branch, Facts, Guard, noFacts, Operand, SymbolDecl, Syntax } from "../core/syntax";
import { PKG_ROOT } from "../root";

let runtime: Promise<void> | undefined;
const loaded = new Map<string, Promise<Language>>();
// Loaded one at a time: concurrent side-module links race on the runtime's shared symbols.
let chain: Promise<unknown> = Promise.resolve();

/** Loads a grammar by its wasm file name in grammars/. */
export function loadGrammar(file: string): Promise<Language> {
  let l = loaded.get(file);
  if (!l) {
    // The bundle carries the runtime's wasm beside the grammars; the package finds it in node_modules.
    runtime ??= Parser.init({ locateFile: (f: string, dir: string) => (fs.existsSync(path.join(PKG_ROOT, f)) ? path.join(PKG_ROOT, f) : path.join(dir, f)) });
    const load = chain.then(() => runtime).then(() => Language.load(path.join(PKG_ROOT, "grammars", file)));
    chain = load.catch(() => {});
    l = load;
    loaded.set(file, l);
  }
  return l;
}

/** Positions in UTF-8 bytes, as native tree-sitter and SCIP's default report them;
 *  the wasm build reports UTF-16 units. */
export class Source {
  private starts: number[] = [0];
  private ascii: boolean[] = [];
  constructor(readonly text: string) {
    for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) this.starts.push(i + 1);
  }
  private col(row: number, units: number): number {
    if (this.ascii[row] === undefined) {
      const end = row + 1 < this.starts.length ? this.starts[row + 1] : this.text.length;
      this.ascii[row] = !/[^\x00-\x7f]/.test(this.text.slice(this.starts[row], end));
    }
    if (this.ascii[row]) return units;
    const s = this.starts[row];
    return Buffer.byteLength(this.text.slice(s, s + units), "utf8");
  }
  range(n: Node): Range {
    return this.span(n, n);
  }
  /** The character index where a range starts, to find the node that starts there. */
  index(r: Range): number {
    const s = this.starts[r.start_line] ?? this.text.length;
    const end = r.start_line + 1 < this.starts.length ? this.starts[r.start_line + 1] : this.text.length;
    if (!/[^\x00-\x7f]/.test(this.text.slice(s, end))) return s + r.start_col;
    let bytes = 0, i = s;
    while (bytes < r.start_col && i < end) {
      const c = this.text.codePointAt(i)!;
      bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
      i += c >= 0x10000 ? 2 : 1;
    }
    return i;
  }
  /** From the start of `a` to the end of `b`. */
  span(a: Node, b: Node): Range {
    const s = a.startPosition, e = b.endPosition;
    return { start_line: s.row, start_col: this.col(s.row, s.column), end_line: e.row, end_col: this.col(e.row, e.column) };
  }
}

export const children = (n: Node) => n.children.filter((c): c is Node => c !== null);
export const namedChildren = (n: Node) => n.namedChildren.filter((c): c is Node => c !== null);

/** Pre-order walk without recursion, so deep trees cannot overflow the stack. */
export function walk(root: Node, visit: (n: Node) => void) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    visit(n);
    const cs = children(n);
    for (let i = cs.length - 1; i >= 0; i--) stack.push(cs[i]);
  }
}

/** Operand for a whole expression that is never a state or a location. */
export const other = (n: Node, src: Source): Operand => {
  const o: Operand = { name: src.range(n), text: n.text, form: "other", receiver: "" };
  // `!x`, `not self.x`: the location negated, so a flag flipped in place is a known move.
  const inner = negated(n);
  if (inner && /^[\w$@.:>-]+$/.test(inner.text)) {
    let leaf = inner;
    while (leaf.namedChildCount) leaf = namedChildren(leaf).at(-1)!;
    o.negates = src.range(leaf);
  }
  return o;
};

const BINARY = new Set(["binary_expression", "binary", "boolean_operator", "comparison_operator", "conjunction_expression", "disjunction_expression", "equality_expression"]);

/** Left side, right side and operator token of a binary node, whether the grammar names its fields or not. */
function sides(n: Node): { l?: Node; r?: Node; op: string } {
  const named = namedChildren(n);
  if (n.type === "comparison_operator") return { l: named[0], r: named[1], op: n.childForFieldName("operators")?.type ?? "" };
  const op = n.childForFieldName("operator")?.type ?? children(n).find((c) => !c.isNamed)?.type ?? "";
  return { l: n.childForFieldName("left") ?? named[0], r: n.childForFieldName("right") ?? named[named.length - 1], op };
}

/** `!x` or `not x`: the negated expression. */
function negated(n: Node): Node | undefined {
  const named = namedChildren(n);
  return named.length === 1 && children(n).some((c) => !c.isNamed && (c.type === "!" || c.type === "not")) ? named[0] : undefined;
}

/** Equality and inequality tests in an `if` condition, through `&&`, `||` and parentheses. Under `||` the
 *  body can run without the test, so those guards are not certain; under `!` they are dropped. A bare
 *  name is a truth test (`if (busy)`, `if (!busy)`): the name against `true` or `false`. */
export function equalities(
  cond: Node, body: Range, ops: { eq: readonly string[]; ne: readonly string[] }, operand: (n: Node) => Operand, out: Guard[], certain = true,
) {
  if (cond.type === "parenthesized_expression") {
    const c = namedChildren(cond)[0];
    if (c) equalities(c, body, ops, operand, out, certain);
    return;
  }
  const inner = negated(cond);
  for (const [x, value] of [[cond, "true"], [inner, "false"]] as const) {
    const o = x && operand(x);
    if (o?.form !== "name") continue;
    out.push({ left: o, right: { name: o.name, text: value, form: "literal", receiver: "" }, equal: true, body, certain, truth: true });
    return;
  }
  if (!BINARY.has(cond.type)) return;
  const { l, r, op } = sides(cond);
  if (!l || !r) return;
  if (ops.eq.includes(op) || ops.ne.includes(op)) out.push({ left: operand(l), right: operand(r), equal: ops.eq.includes(op), body, certain });
  else if (op === "&&" || op === "||" || op === "and" || op === "or") {
    const all = op === "&&" || op === "and";
    equalities(l, body, ops, operand, out, certain && all);
    equalities(r, body, ops, operand, out, certain && all);
  }
}

const EXIT = /^(return|throw|raise|break|continue)(_statement|_expression)?$|^jump_expression$/;
const LOGICAL = new Set(["&&", "||", "and", "or"]);

/** Code after an `if` with no else whose body always leaves (`if (!ready) return;`): it runs only when the
 *  test failed. Undefined otherwise. */
function rest(n: Node, body: Node, src: Source): Range | undefined {
  const parent = n.parent;
  if (!parent || n.childForFieldName("alternative") || children(n).some((c) => c.type === "else" || /else|elif|elsif/.test(c.type))) return undefined;
  const stmts = namedChildren(body).filter((c) => !c.type.includes("comment"));
  const last = EXIT.test(body.type) ? body : stmts[stmts.length - 1];
  if (!last || !EXIT.test(last.type) || n.endIndex >= parent.endIndex) return undefined;
  const end = src.range(n);
  return { ...src.range(parent), start_line: end.end_line, start_col: end.end_col };
}

type Ops = { eq: readonly string[]; ne: readonly string[] };

/** The condition over `yes`, and the opposite of a single test over `no`: the else branch, or the code
 *  after an `if` whose body always leaves. Under `&&` or `||` the opposite is not one test, so it is left out. */
export function branches(cond: Node, yes: Range, no: Range | undefined, ops: Ops, operand: (n: Node) => Operand, out: Guard[]) {
  const from = out.length;
  equalities(cond, yes, ops, operand, out);
  let c = cond;
  while (c.type === "parenthesized_expression" && namedChildren(c)[0]) c = namedChildren(c)[0];
  const compound = BINARY.has(c.type) && LOGICAL.has(sides(c).op);
  if (no && out.length - from === 1 && !compound) out.push({ ...out[from], equal: !out[from].equal, body: no });
}

/** Guards of an `if`: see `branches`. */
export function guardIf(n: Node, cond: Node, body: Node, ops: Ops, operand: (n: Node) => Operand, out: Guard[], src: Source) {
  const alt = n.childForFieldName("alternative");
  branches(cond, src.range(body), alt ? src.range(alt) : rest(n, body, src), ops, operand, out);
}

// ---- doc comments ----
// Found for every grammar alike: the comments directly above a declaration (over its decorators,
// attributes and annotations), or the string that opens its body (a Python docstring).
const SKIP_BACK = /decorator|attribute|annotation|modifier|visibility/;
const PRAGMA = /^(eslint|prettier|ts-|noqa|type:|pylint|nolint|go:|#!|-\*-|@ts|biome|istanbul|c8 |v8 |SPDX|Copyright|License|coding[:=])/i;
const ROOT = new Set(["program", "module", "source_file", "translation_unit", "compilation_unit"]);

/** The paragraph of comment text above `n`, cleaned of comment marks; undefined when there is none. */
function docOf(n: Node): string | undefined {
  // The outermost node that starts where the symbol does: `export function f` is an export statement.
  let top = n;
  while (top.parent && top.parent.startIndex === top.startIndex && !ROOT.has(top.parent.type)) top = top.parent;
  const lines: string[] = [];
  let row = top.startPosition.row;
  for (let p = top.previousSibling; p !== null; p = p!.previousSibling) {
    if (/comment/.test(p.type)) {
      if (p.endPosition.row < row - 1) break;
      lines.unshift(...p.text.split("\n"));
      row = p.startPosition.row;
      continue;
    }
    if (!lines.length && SKIP_BACK.test(p.type)) {
      row = p.startPosition.row;
      continue;
    }
    break;
  }
  if (!lines.length) {
    // A docstring: the string that is the first statement of the body.
    const body = n.childForFieldName("body") ?? n.childForFieldName("definition")?.childForFieldName("body") ?? namedChildren(n).find((c) => /definition|declaration/.test(c.type))?.childForFieldName("body");
    const first = body && namedChildren(body).find((c) => !/comment/.test(c.type));
    const str = first?.type === "expression_statement" ? namedChildren(first)[0] : undefined;
    if (str && /string/.test(str.type)) lines.push(...str.text.split("\n"));
  }
  return clean(lines);
}

const MARK_START = /^\s*(\/\*\*<?|\/\*!?|\*\/|\/\/[/!]?|#+|--|r?"""|r?'''|\*)\s?/;
const MARK_END = /\s*(\*\/|"""|''')\s*$/;

/** Comment lines to one paragraph: marks stripped, the first blank line ends it, pragmas dropped. */
export function clean(lines: string[]): string | undefined {
  const out: string[] = [];
  for (const raw of lines) {
    let l = raw.replace(MARK_END, "");
    for (let i = 0; i < 2; i++) l = l.replace(MARK_START, "");
    l = l.trim();
    if (!l) {
      if (out.length) break;
      continue;
    }
    if (!out.length && PRAGMA.test(l)) return undefined;
    out.push(l);
  }
  const text = out.join(" ").replace(/\s+/g, " ").trim();
  return text ? (text.length > 400 ? text.slice(0, 399) + "…" : text) : undefined;
}

// ---- branches ----
// Control structures by the names grammars share: an `if` has a condition and a consequence, a loop
// a body, a switch a value and cases, a catch a body. Fields are read by name, then by shape.
const IF = /^(if_statement|if_expression|if_let_expression|elif_clause|else_if_clause|elsif|elseif_clause|else_if)$/;
const ELSE = /^(else_clause|else_statement|else)$/;
const LOOP = /^(for|while|do|loop|for_in|foreach|for_each|enhanced_for|for_range|repeat|until|for_numeric|for_generic|do_while)_?(statement|expression|loop)?$/;
const SWITCH = /^(switch_statement|switch_expression|match_statement|match_expression|when_expression|select_statement|expression_switch_statement|type_switch_statement|switch)$/;
const CASE = /^(switch_case|switch_default|case_clause|default_clause|match_arm|when_entry|case|communication_case|default_case|expression_case|type_case|switch_section|case_pattern|match_case|switch_rule|switch_block_statement_group)$/;
const CATCH = /^(catch_clause|except_clause|except_group_clause|rescue|rescue_clause|catch_block|catch|finally_clause|on_part|catch_part)$/;
const BLOCK = /block|body|statement_list|compound_statement|suite|consequence|statements|control_structure_body/;
const squash = (s: string, n = 60) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
const unparen = (s: string) => s.replace(/^\((.*)\)$/s, "$1");

function branch(n: Node, src: Source, out: Branch[]) {
  // Keyword tokens (`switch`, `case`, `else`) share names with the constructs; only named nodes count.
  if (!n.isNamed) return;
  const t = n.type;
  const field = (...names: string[]) => {
    for (const f of names) {
      const c = n.childForFieldName(f);
      if (c) return c;
    }
    return undefined;
  };
  const named = namedChildren(n);
  const blockLike = (c: Node) => BLOCK.test(c.type);
  const comment = (c: Node) => /comment/.test(c.type);
  if (IF.test(t)) {
    const cond = field("condition", "value") ?? named.find((c) => !blockLike(c) && !comment(c));
    if (!cond) return;
    const body = field("consequence", "body", "block") ?? named.find((c) => c.id !== cond.id && blockLike(c));
    if (!body) return;
    out.push({ kind: "if", text: squash(unparen(cond.text)), range: src.range(n), body: src.range(body) });
    // A plain else block is the no side; a chained `else if` registers itself when visited.
    const alt = field("alternative");
    if (alt && !IF.test(alt.type)) {
      const inner = ELSE.test(alt.type) ? namedChildren(alt).find((c) => !comment(c)) : alt;
      if (inner && !IF.test(inner.type)) out.push({ kind: "else", text: "", range: src.range(alt), body: src.range(alt) });
    }
  } else if (ELSE.test(t) && n.parent && n.parent.childForFieldName("alternative")?.id !== n.id) {
    // Grammars without an `alternative` field (Python's else_clause): the clause itself.
    const inner = named.find((c) => !comment(c));
    if (inner && !IF.test(inner.type) && /if|match|switch|try|for|while/.test(n.parent.type) && !/for|while|try/.test(n.parent.type)) out.push({ kind: "else", text: "", range: src.range(n), body: src.range(n) });
  } else if (LOOP.test(t)) {
    const body = field("body", "block") ?? [...named].reverse().find(blockLike);
    if (!body) return;
    const head = n.text.slice(0, body.startIndex - n.startIndex).replace(/[{:]\s*$/, "").trim();
    out.push({ kind: "loop", text: squash(head || t.replace(/_.*$/, "")), range: src.range(n), body: src.range(body) });
  } else if (SWITCH.test(t)) {
    const value = field("value", "condition", "subject") ?? named.find((c) => !blockLike(c) && !CASE.test(c.type) && !comment(c));
    out.push({ kind: "switch", text: squash(value ? unparen(value.text) : t.replace(/_.*$/, "")), range: src.range(n), body: src.range(n) });
  } else if (CASE.test(t)) {
    const v = field("pattern", "value", "condition") ?? named.find((c) => !blockLike(c) && !comment(c) && c.startPosition.row === n.startPosition.row);
    const isDefault = /default/.test(t) || v?.text === "_" || v?.text === "default";
    out.push({ kind: "case", text: isDefault || !v ? "otherwise" : squash(v.text, 40), range: src.range(n), body: src.range(n) });
  } else if (CATCH.test(t)) {
    const what = field("parameter", "pattern", "type", "name", "value", "exception");
    out.push({ kind: "catch", text: /finally/.test(t) ? "finally" : `on error${what ? ` ${squash(what.text, 30)}` : ""}`, range: src.range(n), body: src.range(n) });
  }
}

/** Records a definition for the headless outline: `decl` is the whole declaration, `name` its name token. */
export function symbol(f: Facts, src: Source, decl: Node, name: Node | null | undefined, shape: SymbolDecl["shape"], kind: number) {
  if (name) f.symbols.push({ name: name.text, shape, kind, range: src.range(decl), selection: src.range(name) });
}

/** Function literals across grammars: code that runs when whoever receives it calls it. */
const LAMBDAS = new Set([
  "arrow_function", "function_expression", "function", "generator_function", "lambda", "lambda_expression", "lambda_literal",
  "closure_expression", "func_literal", "anonymous_function", "anonymous_function_creation_expression", "anonymous_method_expression",
  "function_literal", "function_expression_body",
]);

/** A grammar plus the visitor that turns its trees into facts. */
export class Grammar implements Syntax {
  private lang?: Language;
  /** Facts by source: an index reads each file's twice (its outline, then the graph), and a long-lived
   *  server re-reads the files that did not change. Bounded, so it never holds a repo's history. */
  private seen = new Map<string, Facts>();
  constructor(readonly file: string, private visit: (n: Node, src: Source, f: Facts) => void) {}

  async init() {
    this.lang = await loadGrammar(this.file);
  }

  facts(source: string): Facts {
    if (!this.lang) throw new Error(`grammar ${this.file} used before init()`);
    const hit = this.seen.get(source);
    if (hit) return hit;
    const p = new Parser();
    p.setLanguage(this.lang);
    const f = noFacts();
    const tree = p.parse(source);
    if (tree) {
      const src = new Source(source);
      // Nodes by where they start, outermost first, so a symbol finds its declaration node.
      const starts = new Map<number, Node>();
      walk(tree.rootNode, (n) => {
        if (!starts.has(n.startIndex)) starts.set(n.startIndex, n);
        this.visit(n, src, f);
        if (LAMBDAS.has(n.type)) f.lambdas.push(src.range(n));
        branch(n, src, f.branches);
      });
      for (const sym of f.symbols) {
        const at = starts.get(src.index(sym.range));
        const doc = at && docOf(at);
        if (doc) sym.doc = doc;
      }
      tree.delete();
    }
    p.delete();
    if (this.seen.size >= 4096) this.seen.clear();
    this.seen.set(source, f);
    return f;
  }

  /** Parsed again rather than kept with the facts: every name in a large repo is more than the cache should hold. */
  names(source: string, wanted: (name: string) => boolean): Range[] {
    if (!this.lang) throw new Error(`grammar ${this.file} used before init()`);
    const p = new Parser();
    p.setLanguage(this.lang);
    const out: Range[] = [];
    const tree = p.parse(source);
    if (tree) {
      const src = new Source(source);
      walk(tree.rootNode, (n) => {
        if (n.childCount === 0 && n.isNamed && NAME.test(n.text) && wanted(n.text)) out.push(src.range(n));
      });
      tree.delete();
    }
    p.delete();
    return out;
  }
}

/** A token that can name a definition: letters, digits, `_` and `$`, and Ruby's `?` and `!` at the end. */
const NAME = /^[\p{L}_$][\p{L}\p{N}_$]*[?!]?$/u;
