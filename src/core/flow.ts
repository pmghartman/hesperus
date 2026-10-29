// What the program does, top down: from an entry point, the steps it takes in the order the code runs
// them, the decisions between them, and where it reaches outside the repo. Every step is a call the
// graph holds (with its site), every decision a branch the file's syntax holds, every terminal a call the
// boundary table classified. Labels are the callee's name and the comment above it. Nothing is inferred:
// a function with no comment is named as the code names it, and a call the index could not resolve is
// left out rather than guessed.
import { Boundary, BOUNDARY_INFO, classifyGraph, Extra } from "./boundary";
import { cmpStr, contains, Graph, GraphEdge, GraphNode, isCallable, Range } from "./ir";
import { Severity } from "./lint";
import { Branch, Facts, Imports, Syntax } from "./syntax";

/** A call into the repo: a step the person can open to see its own steps. */
export interface CallStep {
  kind: "call";
  id: string;
  /** The file the call is written in. */
  in: string;
  /** The callee's graph id. */
  target: string;
  name: string;
  doc?: string;
  path?: string;
  /** 1-based line of the call site. */
  line: number;
  /** Consecutive calls to the same callee, folded. */
  count: number;
  may: boolean;
  /** The callee has no steps of its own the chart would show: nothing to open. */
  leaf?: boolean;
  /** Its own steps, when opened. */
  steps?: Step[];
  /** Opened, but empty: nothing in it the chart would show. */
  empty?: boolean;
  /** Calls deeper than the chart follows. */
  cut?: boolean;
}
/** A call that leaves the repo for a boundary: a terminal. */
export interface BoundaryStep {
  kind: "boundary";
  id: string;
  in: string;
  target: string;
  boundary: Boundary;
  /** `module name` as the code calls it. */
  name: string;
  line: number;
  count: number;
  may: boolean;
  flag?: Severity;
  notes?: string[];
}
export interface IfStep { kind: "if"; id: string; in: string; text: string; line: number; yes: Step[]; no: Step[] }
export interface LoopStep { kind: "loop"; id: string; in: string; text: string; line: number; body: Step[] }
export interface SwitchStep { kind: "switch"; id: string; in: string; text: string; line: number; cases: { text: string; line: number; body: Step[] }[] }
export interface CatchStep { kind: "catch"; id: string; in: string; text: string; line: number; body: Step[] }
export type Step = CallStep | BoundaryStep | IfStep | LoopStep | SwitchStep | CatchStep;

/** Where the program starts: a callable nothing in the repo calls, or the top-level code of a file no
 *  other file imports. */
export interface Entry {
  id: string;
  name: string;
  doc?: string;
  path: string;
  line: number;
  kind: "function" | "method" | "file";
  /** Callables reachable from it, a measure of how much of the program it drives. */
  reach: number;
  /** Steps the chart would show directly under it. */
  steps: number;
}

export interface Flow { entry: Entry; steps: Step[]; /** Lint findings touched, worst first. */ flagged: number }

/** The call edges out of each caller, by call site. */
function outgoing(g: Graph): Map<string, GraphEdge[]> {
  const out = new Map<string, GraphEdge[]>();
  for (const e of g.edges) {
    if (e.kind !== "call" || !e.site) continue;
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e);
  }
  for (const list of out.values()) list.sort((a, b) => a.site!.range.start_line - b.site!.range.start_line || a.site!.range.start_col - b.site!.range.start_col);
  return out;
}

export interface FlowInputs {
  /** Repo-relative path to text, for the branches in a function. */
  readSource: (path: string) => string | undefined;
  syntaxFor: (path: string) => Syntax | undefined;
  /** How the file's language names what its imports reach; tells which files other files load. */
  importsFor?: (path: string) => Imports | undefined;
  /** Policy's extra boundary packages. */
  extra?: Extra;
  /** Lint findings by `local\0external`. */
  flags?: Map<string, { severity: Severity; notes: string[] }>;
}

/** How deep opened calls nest before the chart stops following. */
export const MAX_DEPTH = 6;

/** Syntax facts per file, read once. */
function factsCache(inp: FlowInputs): (path: string) => Facts | undefined {
  const cache = new Map<string, Facts | undefined>();
  return (path) => {
    if (!cache.has(path)) {
      const text = inp.readSource(path), syn = inp.syntaxFor(path);
      cache.set(path, text !== undefined && syn ? syn.facts(text) : undefined);
    }
    return cache.get(path);
  };
}

/** Which of a file's own calls run when it loads. A call inside a named declaration runs when that is
 *  called, not on load; so does one inside a function literal, unless the literal is the module's body
 *  (a file wrapped in `(() => { … })()` holds nearly all of its calls in one literal). */
function onLoad(facts: Facts | undefined, sites: Range[]): (r: Range) => boolean {
  if (!facts) return () => true;
  const smallest = (list: Range[], r: Range) => {
    let best: Range | undefined;
    for (const x of list) if (contains(x, r) && (!best || contains(best, x))) best = x;
    return best;
  };
  const body = new Set(facts.lambdas.filter((l) => sites.filter((s) => contains(l, s)).length >= Math.max(1, sites.length * 0.9)));
  return (r) => {
    if (facts.decls.some((d) => contains(d, r))) return false;
    const l = smallest(facts.lambdas, r);
    return l === undefined || body.has(l);
  };
}

/** The program's entry points, those that drive the most of it first, then by file and line. */
export function entries(g: Graph, inp: FlowInputs): Entry[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out = outgoing(g);
  const factsOf = factsCache(inp);
  const onLoadOf = new Map<string, (r: Range) => boolean>();
  const runsOnLoad = (file: GraphNode, r: Range) => {
    if (!onLoadOf.has(file.id)) onLoadOf.set(file.id, onLoad(factsOf(file.path!), (out.get(file.id) ?? []).map((e) => e.site!.range)));
    return onLoadOf.get(file.id)!(r);
  };
  // Called: by a callable, or by a file's own top-level code (`main()` at the foot of a script is a
  // step of that file's load, not a second entry).
  const called = new Set<string>();
  for (const e of g.edges) {
    if (e.kind !== "call") continue;
    const from = byId.get(e.from);
    if (!from) continue;
    if (isCallable(from.kind) || (from.kind === "file" && from.path && e.site && runsOnLoad(from, e.site.range))) called.add(e.to);
  }
  const reach = (id: string) => {
    const seen = new Set<string>([id]);
    const stack = [id];
    while (stack.length) {
      for (const e of out.get(stack.pop()!) ?? []) {
        const t = byId.get(e.to);
        if (t && isCallable(t.kind) && t.path && !seen.has(e.to)) (seen.add(e.to), stack.push(e.to));
      }
    }
    return seen.size - 1;
  };
  const cls = classifyGraph(g, inp.extra);
  const shown = (e: GraphEdge) => {
    const t = byId.get(e.to);
    return !!t && ((isCallable(t.kind) && !!t.path) || cls.has(e.to));
  };
  // A file another file imports (or calls into) runs when that file loads it, not on its own: only the
  // files nothing loads are where the program starts.
  const files = new Set<string>();
  for (const n of g.nodes) if (n.kind === "file" && n.path) files.add(n.path);
  const loaded = new Set<string>();
  for (const e of g.edges) {
    if (e.kind !== "call") continue;
    const a = byId.get(e.from)?.path, b = byId.get(e.to)?.path;
    if (a && b && a !== b) loaded.add(b);
  }
  for (const p of files) {
    const imp = inp.importsFor?.(p);
    const f = imp && factsOf(p);
    if (!f) continue;
    for (const d of f.imports) {
      for (const l of imp.local(d.module, p, d.member !== undefined ? [d.member] : [])) {
        for (const x of l.files) {
          if (x.endsWith("/")) for (const y of files) { if (y.startsWith(x) && !y.slice(x.length).includes("/")) loaded.add(y); }
          else if (files.has(x)) loaded.add(x);
        }
      }
    }
  }
  const list: Entry[] = [];
  for (const n of g.nodes) {
    if (!n.path) continue;
    const calls = out.get(n.id) ?? [];
    if (isCallable(n.kind)) {
      if (called.has(n.id) || !calls.some(shown)) continue;
      list.push({ id: n.id, name: n.name, doc: n.doc, path: n.path, line: (n.range?.start_line ?? 0) + 1, kind: n.kind as "function" | "method", reach: reach(n.id), steps: calls.filter(shown).length });
    } else if (n.kind === "file" && !loaded.has(n.path)) {
      // Module-level code: what runs when the file loads. A script whose load is one call into the
      // repo (`main()`) is entered as that function: the chart then starts where the reader expects.
      const steps = calls.filter((e) => shown(e) && runsOnLoad(n, e.site!.range));
      const only = steps.length === 1 ? byId.get(steps[0].to) : undefined;
      if (only && isCallable(only.kind) && only.path && (out.get(only.id) ?? []).some(shown))
        list.push({ id: only.id, name: only.name, doc: only.doc, path: only.path, line: (only.range?.start_line ?? 0) + 1, kind: only.kind as "function" | "method", reach: reach(only.id), steps: (out.get(only.id) ?? []).filter(shown).length });
      else if (steps.length) list.push({ id: n.id, name: `${n.name} (on load)`, path: n.path, line: 1, kind: "file", reach: reach(n.id), steps: steps.length });
    }
  }
  // Built and vendored files are code too, but never where a reader wants to start.
  const built = (p: string) => (GENERATED.test(p) ? 1 : 0);
  return list.sort((a, b) => built(a.path) - built(b.path) || b.reach - a.reach || cmpStr(a.path, b.path) || a.line - b.line);
}

/** Paths of bundled, generated or vendored code, ranked after the sources. */
export const GENERATED = /(^|\/)(dist|build|out|target|vendor|node_modules|__pycache__|\.generated)\/|\.min\.[cm]?js$|\.bundle\.[cm]?js$|\.pb\.go$|_pb2\.py$/;

/** The flow from one entry, with the calls in `open` (step ids) inlined. */
export function flow(g: Graph, entryId: string, open: ReadonlySet<string>, inp: FlowInputs): Flow | undefined {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const root = byId.get(entryId);
  if (!root?.path) return undefined;
  const out = outgoing(g);
  const cls = classifyGraph(g, inp.extra);
  const factsOf = factsCache(inp);
  /** The branches in a callable's body: the smallest declaration or function literal around its name. */
  const branchesIn = (path: string, ident: Range | undefined): Branch[] => {
    const f = factsOf(path);
    if (!f) return [];
    if (!ident) return f.branches;
    let body: Range | undefined;
    for (const d of [...f.decls, ...f.lambdas]) if (contains(d, ident) && (!body || contains(body, d))) body = d;
    return body ? f.branches.filter((b) => contains(body!, b.range)) : [];
  };
  /** The calls under a node that the chart would draw as steps. */
  const stepCalls = (fn: GraphNode): GraphEdge[] => {
    const calls = (out.get(fn.id) ?? []).filter((e) => {
      const t = byId.get(e.to);
      // A call back into the same function is recursion, or a local helper the index folded into its
      // owner; neither is a step a reader wants drawn under it.
      return !!t && e.to !== fn.id && ((isCallable(t.kind) && !!t.path) || cls.has(e.to));
    });
    if (fn.kind !== "file" || !fn.path) return calls;
    const runs = onLoad(factsOf(fn.path), (out.get(fn.id) ?? []).map((e) => e.site!.range));
    return calls.filter((e) => runs(e.site!.range));
  };
  const leaves = new Map<string, boolean>();
  const isLeaf = (t: GraphNode) => {
    if (!leaves.has(t.id)) leaves.set(t.id, stepCalls(t).length === 0);
    return leaves.get(t.id)!;
  };
  let flagged = 0;

  const stepsOf = (fn: GraphNode, prefix: string, depth: number, chain: Set<string>): Step[] => {
    const branches = fn.path ? branchesIn(fn.path, fn.range) : [];
    // Items in source order: calls worth a step, and the branches that hold them.
    interface Item { at: Range; call?: GraphEdge; branch?: Branch }
    const items: Item[] = stepCalls(fn).map((e) => ({ at: e.site!.range, call: e }));
    if (!items.length) return [];
    for (const b of branches) items.push({ at: b.range, branch: b });
    const before = (a: Range, b: Range) => a.start_line - b.start_line || a.start_col - b.start_col || b.end_line - a.end_line || b.end_col - a.end_col;
    items.sort((a, b) => before(a.at, b.at));
    // Nest by containment: each item's parent is the innermost branch whose range holds it.
    const kids = new Map<Item | undefined, Item[]>();
    const stack: Item[] = [];
    for (const it of items) {
      while (stack.length && !contains(stack[stack.length - 1].at, it.at)) stack.pop();
      const parent = stack[stack.length - 1];
      (kids.get(parent) ?? kids.set(parent, []).get(parent)!).push(it);
      if (it.branch) stack.push(it);
    }
    const line = (r: Range) => r.start_line + 1;
    const build = (list: Item[]): Step[] => {
      const steps: Step[] = [];
      for (const it of list) {
        if (it.call) {
          const e = it.call, t = byId.get(e.to)!;
          const last = steps[steps.length - 1];
          if (last && (last.kind === "call" || last.kind === "boundary") && last.target === e.to) {
            last.count++;
            last.may = last.may && e.provenance !== "resolved";
            continue;
          }
          const may = e.provenance !== "resolved";
          const id = `${prefix}${e.site!.range.start_line}:${e.site!.range.start_col}`;
          const c = cls.get(e.to);
          if (c) {
            const f = inp.flags?.get(`${fn.id}\0${e.to}`);
            if (f) flagged++;
            const name = t.name.startsWith(c.module) || !c.module ? t.name : `${c.module} ${t.name}`;
            steps.push({ kind: "boundary", id, in: fn.path!, target: e.to, boundary: c.boundary, name, line: line(e.site!.range), count: 1, may, ...(f ? { flag: f.severity, notes: f.notes } : {}) });
          } else {
            const step: CallStep = { kind: "call", id, in: fn.path!, target: e.to, name: t.name, doc: t.doc, path: t.path, line: line(e.site!.range), count: 1, may };
            if (isLeaf(t)) step.leaf = true;
            else if (open.has(id)) {
              if (depth >= MAX_DEPTH || chain.has(e.to)) step.cut = true;
              else {
                const inner = stepsOf(t, `${id}/`, depth + 1, new Set([...chain, e.to]));
                if (inner.length) step.steps = inner;
                else step.empty = true;
              }
            }
            steps.push(step);
          }
        } else if (it.branch) {
          const b = it.branch, inner = kids.get(it) ?? [];
          const id = `${prefix}@${b.range.start_line}:${b.range.start_col}`;
          if (b.kind === "if") {
            // The yes side is the body; the rest of the construct is the no side, with any else flattened.
            const yes = build(inner.filter((x) => contains(b.body, x.at)));
            const no = build(inner.filter((x) => !contains(b.body, x.at)).flatMap((x) => (x.branch?.kind === "else" ? kids.get(x) ?? [] : [x])));
            if (yes.length || no.length) steps.push({ kind: "if", id, in: fn.path!, text: b.text, line: line(b.range), yes, no });
          } else if (b.kind === "else") {
            // Reached only when its `if` was not seen (grammar quirk): plain steps.
            steps.push(...build(inner));
          } else if (b.kind === "loop") {
            const body = build(inner);
            if (body.length) steps.push({ kind: "loop", id, in: fn.path!, text: b.text, line: line(b.range), body });
          } else if (b.kind === "switch") {
            const cases: SwitchStep["cases"] = [];
            const loose: Item[] = [];
            for (const x of inner) {
              if (x.branch?.kind === "case") {
                const body = build(kids.get(x) ?? []);
                if (body.length) cases.push({ text: x.branch.text, line: line(x.at), body });
              } else loose.push(x);
            }
            if (cases.length) steps.push({ kind: "switch", id, in: fn.path!, text: b.text, line: line(b.range), cases });
            steps.push(...build(loose));
          } else if (b.kind === "case") {
            steps.push(...build(inner));
          } else if (b.kind === "catch") {
            const body = build(inner);
            if (body.length) steps.push({ kind: "catch", id, in: fn.path!, text: b.text, line: line(b.range), body });
          }
        }
      }
      return steps;
    };
    return build(kids.get(undefined) ?? []);
  };

  const steps = stepsOf(root, "", 0, new Set([root.id]));
  const entry: Entry = root.kind === "file"
    ? { id: root.id, name: `${root.name} (on load)`, path: root.path, line: 1, kind: "file", reach: 0, steps: steps.length }
    : { id: root.id, name: root.name, doc: root.doc, path: root.path, line: (root.range?.start_line ?? 0) + 1, kind: isCallable(root.kind) ? (root.kind as "function" | "method") : "function", reach: 0, steps: steps.length };
  return { entry, steps, flagged };
}

/** The first sentence of a doc comment, for a label. */
export function firstSentence(doc: string | undefined, max = 90): string | undefined {
  if (!doc) return undefined;
  const m = /^(.*?[.!?])(\s|$)/.exec(doc);
  const s = (m ? m[1] : doc).trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** The flow as indented text, for a terminal or an agent. With `label`, each top-level step is tagged
 *  (`[S1]`, `[S2]`, …) so an answer can point back at it. */
export function flowText(f: Flow, label?: (i: number) => string): string {
  const lines: string[] = [`▶ ${f.entry.name}${f.entry.doc ? `  — ${firstSentence(f.entry.doc)}` : ""}  (${f.entry.path}:${f.entry.line})`];
  const times = (n: number) => (n > 1 ? ` ×${n}` : "");
  const walk = (steps: Step[], pad: string, top: boolean) => {
    steps.forEach((s, i) => {
      const tag = top && label ? `${label(i)} ` : "";
      if (s.kind === "call") {
        lines.push(`${pad}${tag}▭ ${s.name}${times(s.count)}${s.may ? " (may)" : ""}${s.doc ? `  — ${firstSentence(s.doc)}` : ""}  ${s.path ?? ""}`);
        if (s.steps) walk(s.steps, pad + "   ", false);
        else if (s.empty) lines.push(`${pad}   (nothing further the chart shows)`);
        else if (s.cut) lines.push(`${pad}   (deeper than the chart follows)`);
      } else if (s.kind === "boundary") lines.push(`${pad}${tag}⬚ ${s.name}${times(s.count)}  [${BOUNDARY_INFO[s.boundary].label}]${s.flag ? `  ${s.flag.toUpperCase()}: ${(s.notes ?? []).join("; ")}` : ""}`);
      else if (s.kind === "if") {
        lines.push(`${pad}${tag}◇ if ${s.text}`);
        if (s.yes.length) (lines.push(`${pad}│ yes:`), walk(s.yes, pad + "│  ", false));
        if (s.no.length) (lines.push(`${pad}│ no:`), walk(s.no, pad + "│  ", false));
      } else if (s.kind === "loop") (lines.push(`${pad}${tag}↻ ${s.text}`), walk(s.body, pad + "│  ", false));
      else if (s.kind === "switch") {
        lines.push(`${pad}${tag}◇ switch on ${s.text}`);
        for (const c of s.cases) (lines.push(`${pad}│ ${c.text}:`), walk(c.body, pad + "│  ", false));
      } else if (s.kind === "catch") (lines.push(`${pad}${tag}⚠ ${s.text}`), walk(s.body, pad + "│  ", false));
    });
  };
  walk(f.steps, "   ", true);
  return lines.join("\n") + "\n";
}
