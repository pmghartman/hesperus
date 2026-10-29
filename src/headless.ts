// Indexing with no language server: the outline and call sites come from syntax, a call's definition
// from a name lookup in its own file or package, and whatever that leaves goes through the file's
// imports in `build`. Coarser than an editor's servers (no types, no overload resolution), and the same
// bridge, so the graph has the same shape either way.
import * as fs from "node:fs";
import * as path from "node:path";
import { bridge, BridgeFile, BridgeRef, BridgeSymbol, Pos, Span } from "./core/bridge";
import { Frontend } from "./core/frontend";
import { cmpStr, Range } from "./core/ir";
import { Index } from "./core/scip";
import { Facts, SymbolDecl } from "./core/syntax";

export const HEADLESS_TOOL = { name: "headless", version: "1" };

const ASCII = /^[\x00-\x7f]*$/;

/** Syntax columns are UTF-8 bytes; the bridge takes UTF-16 units, as an editor reports them.
 *  An ASCII line's are the same; any other is encoded once per call, so keep calls per line few. */
const utf16 = (lines: string[], line: number, col: number) => {
  const s = lines[line] ?? "";
  return ASCII.test(s) ? Math.min(col, s.length) : Buffer.from(s, "utf8").subarray(0, col).toString("utf8").length;
};

function spanOf(lines: string[], r: Range): Span {
  return { start: { line: r.start_line, character: utf16(lines, r.start_line, r.start_col) }, end: { line: r.end_line, character: utf16(lines, r.end_line, r.end_col) } };
}

const before = (a: Range, b: Range) => a.start_line - b.start_line || a.start_col - b.start_col;
const within = (inner: Range, outer: Range) =>
  before(outer, inner) <= 0 && (inner.end_line < outer.end_line || (inner.end_line === outer.end_line && inner.end_col <= outer.end_col));

/** Flat declarations into the outline tree an editor would give: each under the innermost declaration
 *  whose range holds it. Siblings of one name and shape (a Rust struct and its impl blocks) are one. */
export function outline(lines: string[], symbols: SymbolDecl[]): BridgeSymbol[] {
  const sorted = [...symbols].sort((a, b) => before(a.range, b.range) || (b.range.end_line - a.range.end_line) || (b.range.end_col - a.range.end_col));
  const root: BridgeSymbol[] = [];
  const stack: { decl: SymbolDecl; sym: BridgeSymbol }[] = [];
  for (const d of sorted) {
    while (stack.length && !within(d.range, stack[stack.length - 1].decl.range)) stack.pop();
    const sym: BridgeSymbol = { name: d.name, shape: d.shape, kind: d.kind, range: spanOf(lines, d.range), selection: spanOf(lines, d.selection), children: [] };
    (stack.length ? stack[stack.length - 1].sym.children : root).push(sym);
    stack.push({ decl: d, sym });
  }
  const merge = (list: BridgeSymbol[]): BridgeSymbol[] => {
    const out: BridgeSymbol[] = [];
    const seen = new Map<string, BridgeSymbol>();
    for (const s of list) {
      const k = s.shape === "type" || s.shape === "namespace" ? `${s.shape}\0${s.name}` : undefined;
      const old = k === undefined ? undefined : seen.get(k);
      if (old) old.children.push(...s.children);
      else {
        out.push(s);
        if (k !== undefined) seen.set(k, s);
      }
    }
    for (const s of out) s.children = merge(s.children);
    return out;
  };
  return merge(root);
}

interface Doc { file: BridgeFile; facts: Facts; lines: string[]; tree: BridgeSymbol[];
  /** Each call by where its callee starts (`line:character`), the first of any that share it. */
  calls: Map<string, Facts["calls"][number]>; sites: Span[] }

const posKey = (a: Pos, b: Pos) => a.line - b.line || a.character - b.character;
const holds = (p: Pos, s: Span) => posKey(s.start, p) <= 0 && posKey(p, s.end) <= 0;
const SELF = new Set(["this", "self", "cls", "Self"]);

/** Builds one index for a language's files from syntax alone. */
export async function headlessIndex(repo: string, fe: Frontend, files: readonly string[]): Promise<Index> {
  const docs = new Map<string, Doc>();
  for (const p of [...files].sort(cmpStr)) {
    let text: string;
    try {
      text = fs.readFileSync(path.join(repo, p), "utf8");
    } catch {
      continue;
    }
    const syn = fe.syntax(p);
    if (!syn) continue;
    const facts = syn.facts(text);
    const lines = text.split("\n");
    const tree = outline(lines, facts.symbols);
    const calls = new Map<string, Facts["calls"][number]>();
    const sites = facts.calls.map((c) => {
      const s = spanOf(lines, c.callee);
      const k = `${s.start.line}:${s.start.character}`;
      if (!calls.has(k)) calls.set(k, c);
      return s;
    });
    docs.set(p, { file: { path: p, language: fe.id, text, symbols: tree }, facts, lines, tree, calls, sites });
  }
  const byDir = new Map<string, Doc[]>();
  for (const d of docs.values()) {
    const dir = path.posix.dirname(d.file.path);
    (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(d);
  }
  const ref = (d: Doc, s: BridgeSymbol): BridgeRef => ({ path: d.file.path, span: s.selection });
  const top = (d: Doc, name: string, shape?: BridgeSymbol["shape"]) => d.tree.filter((s) => s.name === name && (!shape || s.shape === shape));
  const member = (t: BridgeSymbol, name: string) => t.children.find((c) => c.name === name && c.shape === "method");
  const callees = (callee: string) => fe.imports?.path(callee) ?? (/^[\w$]+([.:]+[\w$]+)*$/.test(callee) ? callee.split(/[.:]+/) : []);
  /** The innermost type whose range holds `at`. */
  const enclosingType = (d: Doc, at: Pos): BridgeSymbol | undefined => {
    let found: BridgeSymbol | undefined;
    const walk = (list: BridgeSymbol[]) => {
      for (const s of list) {
        if (!holds(at, s.range)) continue;
        if (s.shape === "type") found = s;
        walk(s.children);
      }
    };
    walk(d.tree);
    return found;
  };
  // Where a call's name is defined: its own file, then its own folder (a Go package, a Java package),
  // by name; `this.m()` in the enclosing type. Anything else is for the imports to say.
  const definitionsOf = async (p: string, at: Pos): Promise<BridgeRef[]> => {
    const d = docs.get(p);
    if (!d) return [];
    const call = d.calls.get(`${at.line}:${at.character}`);
    if (!call) return [];
    const segs = callees(call.callee_text);
    if (!segs.length) return [];
    // A name the file imports means what the import says, never a namesake in the folder: `load` from
    // "./service" is not the folder's engine.ts `load`. The file's own definitions still come first.
    const bound = d.facts.imports.some((i) => i.local === segs[0]) && !SELF.has(segs[0]);
    const scopes = bound ? [d] : [d, ...(byDir.get(path.posix.dirname(p)) ?? []).filter((x) => x !== d)];
    if (segs.length === 1) {
      // A type's name called is a constructor or conversion; the index says so and `build` drops it.
      for (const shape of ["method", "type"] as const) for (const x of scopes) for (const s of top(x, segs[0], shape)) return [ref(x, s)];
      const t = enclosingType(d, at);
      const m = t && member(t, segs[0]);
      return m ? [ref(d, m)] : [];
    }
    const [head, ...rest] = segs;
    const types = SELF.has(head) ? [enclosingType(d, at)].filter((t): t is BridgeSymbol => !!t).map((t) => [d, t] as const)
      : scopes.flatMap((x) => top(x, head, "type").map((t) => [x, t] as const));
    for (const [x, t] of types) {
      let cur: BridgeSymbol | undefined = t;
      for (const n of rest) cur = cur?.children.find((c) => c.name === n);
      if (cur) return [ref(x, cur)];
    }
    return [];
  };
  const sites = (f: BridgeFile): Span[] => {
    const d = docs.get(f.path);
    return d ? d.sites : [];
  };
  return bridge([...docs.values()].map((d) => d.file), async () => [], { unify: fe.declarationsAcrossFiles, sites, definitionsOf, concurrency: 64 });
}
