// tree-sitter through WebAssembly: one runtime, pinned grammars copied into grammars/ at build.
import * as path from "node:path";
import { Language, Node, Parser } from "web-tree-sitter";
import { Range } from "../core/ir";
import { Facts, Guard, noFacts, Operand, Syntax } from "../core/syntax";
import { PKG_ROOT } from "../root";

let runtime: Promise<void> | undefined;
const loaded = new Map<string, Promise<Language>>();
// Loaded one at a time: concurrent side-module links race on the runtime's shared symbols.
let chain: Promise<unknown> = Promise.resolve();

/** Loads a grammar by its wasm file name in grammars/. */
export function loadGrammar(file: string): Promise<Language> {
  let l = loaded.get(file);
  if (!l) {
    runtime ??= Parser.init();
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
export const other = (n: Node, src: Source): Operand => ({ name: src.range(n), text: n.text, form: "other", receiver: "" });

/** Equality and inequality tests in an `if` condition, through `&&`, `||` and parentheses. Under `||` the
 *  body can run without the test, so those guards are not certain; under `!` they are dropped. */
export function equalities(
  cond: Node, body: Range, ops: { eq: readonly string[]; ne: readonly string[] }, operand: (n: Node) => Operand, out: Guard[], certain = true,
) {
  if (cond.type === "parenthesized_expression") {
    const c = namedChildren(cond)[0];
    if (c) equalities(c, body, ops, operand, out, certain);
    return;
  }
  if (cond.type !== "binary_expression") return;
  const op = cond.childForFieldName("operator")?.type ?? "";
  const l = cond.childForFieldName("left"), r = cond.childForFieldName("right");
  if (!l || !r) return;
  if (ops.eq.includes(op) || ops.ne.includes(op)) out.push({ left: operand(l), right: operand(r), equal: ops.eq.includes(op), body, certain });
  else if (op === "&&" || op === "||") {
    equalities(l, body, ops, operand, out, certain && op === "&&");
    equalities(r, body, ops, operand, out, certain && op === "&&");
  }
}

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
      walk(tree.rootNode, (n) => this.visit(n, src, f));
      tree.delete();
    }
    p.delete();
    return f;
  }
}
