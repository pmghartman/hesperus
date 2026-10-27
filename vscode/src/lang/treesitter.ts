// tree-sitter through WebAssembly: one runtime, pinned grammars copied into grammars/ at build.
import * as fs from "node:fs";
import * as path from "node:path";
import { Language, Node, Parser } from "web-tree-sitter";
import { Range } from "../core/ir";
import { Facts, Guard, noFacts, Operand, SymbolDecl, Syntax } from "../core/syntax";
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
  constructor(readonly file: string, private visit: (n: Node, src: Source, f: Facts) => void) {}

  async init() {
    this.lang = await loadGrammar(this.file);
  }

  facts(source: string): Facts {
    if (!this.lang) throw new Error(`grammar ${this.file} used before init()`);
    const p = new Parser();
    p.setLanguage(this.lang);
    const f = noFacts();
    const tree = p.parse(source);
    if (tree) {
      const src = new Source(source);
      walk(tree.rootNode, (n) => {
        this.visit(n, src, f);
        if (LAMBDAS.has(n.type)) f.lambdas.push(src.range(n));
      });
      tree.delete();
    }
    p.delete();
    return f;
  }
}
