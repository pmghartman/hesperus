// SCIP index (+ optional syntax facts) to IR.
//
// Calls: a non-definition occurrence at a call site's callee token. Caller is the
// innermost callable whose body range holds the site. Body range is the occurrence's
// enclosing_range, else the smallest syntax declaration around the identifier.
import { sha256Hex } from "./hash";
import {
  canonicalize, cmpRange, cmpSize, cmpStr, contains, edge, Graph, GraphEdge, GraphNode, isCallable,
  newGraph, node, NodeKind, Provenance, Range, rangeKey, REPO_ID, Site,
} from "./ir";
import {
  CALLABLE_KINDS, CONSTANT_KINDS, Document, externalSymbol, Index, KIND_FIELD, occEnclosing, occRange, parseSymbol, prefix,
  ROLE_DEFINITION, Symbol, SymbolInformation,
} from "./scip";
import { ArgIn, states } from "./states";
import { CallSite, Facts, Imports, noFacts, Syntax } from "./syntax";

export interface Inputs {
  index: Index;
  /** Repo-relative path to file text, when the file is readable. */
  readSource: (path: string) => string | undefined;
  /** (document language, repo-relative path) to a syntax provider. */
  syntaxFor: (language: string, path: string) => Syntax | undefined;
  /** How the language of a file names what its imports reach, when it says. */
  importsFor?: (language: string, path: string) => Imports | undefined;
  /** Files of languages that could not be indexed; each becomes a bare file node. */
  unindexed?: { path: string; reason: string }[];
}

interface Def { path: string; ident: Range }
interface Callable { symbol: string; ident: Range; body: Range }
interface Doc {
  doc: Document;
  facts: Facts;
  /** Non-definition occurrences by range. */
  refs: Map<string, string>;
  /** Same occurrences keyed by end position, for argument lookup. */
  refsByEnd: Map<string, Range[]>;
  /** Definitions by range. */
  defsAt: Map<string, string>;
  callables: Callable[];
  /** No syntax for this file: only the index says anything about it. */
  generic: boolean;
  imports?: Imports;
  /** Import bindings by local name; the first declaration of a name wins. */
  bound: Map<string, Facts["imports"][number]>;
}

const fileId = (path: string) => `file:${path}`;

function pkgId(sym: Symbol): string {
  const ns: string[] = [];
  for (const d of sym.descriptors) {
    if (d.kind !== "namespace") break;
    ns.push(d.name);
  }
  return ns.length ? `pkg:${sym.package}:${ns.join("/")}` : `pkg:${sym.package}`;
}

const callableKind = (info?: SymbolInformation) => info !== undefined && CALLABLE_KINDS.includes(info.kind);

function classify(sym: Symbol, info?: SymbolInformation): NodeKind | undefined {
  const n = sym.descriptors.length;
  const last = sym.descriptors[n - 1];
  if (!last) return undefined;
  const parentIsType = n >= 2 && sym.descriptors[n - 2].kind === "type";
  if (last.kind === "method" || (last.kind === "term" && callableKind(info))) return parentIsType ? "method" : "function";
  // Some indexers name enum members like types (`State#Idle#`); the index kind says they are values.
  if (last.kind === "type") return info !== undefined && CONSTANT_KINDS.includes(info.kind) && parentIsType ? "field" : "type";
  if (last.kind === "term") return parentIsType || (info?.kind ?? 0) === KIND_FIELD ? "field" : "variable";
  return undefined;
}

const lastKind = (sym: Symbol) => sym.descriptors[sym.descriptors.length - 1]?.kind;

/** Method descriptor, or a term the indexer marks callable (e.g. interface methods). */
const isCallableSym = (sym: Symbol, info?: SymbolInformation) => lastKind(sym) === "method" || callableKind(info);

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** First minimum, as Rust's `min_by_key`. */
function minBy<T>(xs: Iterable<T>, cmp: (a: T, b: T) => number): T | undefined {
  let best: T | undefined;
  for (const x of xs) if (best === undefined || cmp(x, best) < 0) best = x;
  return best;
}

const sortedKeys = <V>(m: Map<string, V>) => [...m.keys()].sort(cmpStr);
const bare = (id: string, kind: NodeKind, name: string): GraphNode => ({ id, kind, name });

export function build(inp: Inputs): Graph {
  const docs = [...inp.index.documents].sort((a, b) => cmpStr(a.relative_path, b.relative_path));

  const info = new Map<string, SymbolInformation>();
  for (const d of docs) for (const s of d.symbols) if (!info.has(s.symbol)) info.set(s.symbol, s);
  for (const s of inp.index.external_symbols) if (!info.has(s.symbol)) info.set(s.symbol, s);

  // Pass 1: definitions, per-document context.
  const defs = new Map<string, Def>();
  const ctxs: Doc[] = [];
  const texts = new Map<string, string | undefined>();
  for (const d of docs) {
    const path = d.relative_path;
    const text = d.text === "" ? inp.readSource(path) : d.text;
    const syn = inp.syntaxFor(d.language, path);
    const facts = text !== undefined && syn ? syn.facts(text) : noFacts();
    const refs = new Map<string, string>();
    const refsByEnd = new Map<string, Range[]>();
    const defsAt = new Map<string, string>();
    const localDefs: [string, Range, Range | undefined][] = [];
    for (const o of d.occurrences) {
      const r = occRange(o);
      if (!r || o.symbol === "") continue;
      if (o.symbol_roles & ROLE_DEFINITION) {
        const body = occEnclosing(o) ?? minBy(facts.decls.filter((x) => contains(x, r)), cmpSize);
        localDefs.push([o.symbol, r, body]);
        const k = rangeKey(r);
        if (!defsAt.has(k)) defsAt.set(k, o.symbol);
      } else {
        const k = rangeKey(r);
        if (!refs.has(k)) refs.set(k, o.symbol);
        const ek = `${r.end_line},${r.end_col}`;
        const list = refsByEnd.get(ek);
        list ? list.push(r) : refsByEnd.set(ek, [r]);
      }
    }
    // A binding the syntax says names a function (`const f = () => …`) is callable whatever kind the
    // server gives it.
    for (const [sym, r, body] of localDefs) {
      const i = info.get(sym);
      if (i && !callableKind(i) && parseSymbol(sym) && lastKind(parseSymbol(sym)!) === "term" && facts.decls.some((d) => contains(d, r) && (!body || contains(body, d))))
        info.set(sym, { ...i, kind: 17 });
    }
    const callables: Callable[] = [];
    for (const [sym, r, body] of localDefs) {
      const ps = parseSymbol(sym);
      if (!ps) continue;
      const kind = classify(ps, info.get(sym));
      if (!kind) continue;
      const old = defs.get(sym);
      if (!old || (cmpStr(old.path, path) || cmpRange(old.ident, r)) > 0) defs.set(sym, { path, ident: r });
      if (isCallable(kind) && body) callables.push({ symbol: sym, ident: r, body });
    }
    texts.set(path, text);
    const bound = new Map<string, Facts["imports"][number]>();
    for (const i of facts.imports) if (!bound.has(i.local)) bound.set(i.local, i);
    ctxs.push({ doc: d, facts, refs, refsByEnd, defsAt, callables, generic: !syn, imports: inp.importsFor?.(d.language, path), bound });
  }

  const hashes = new Map<string, string | undefined>();
  const hashOf = (path: string) => {
    if (!hashes.has(path)) {
      const t = texts.get(path);
      hashes.set(path, t === undefined ? undefined : sha256Hex(t));
    }
    return hashes.get(path);
  };

  const nodes = new Map<string, GraphNode>();
  const parent = new Map<string, string>();
  const edges: GraphEdge[] = [];
  const ensure = (n: GraphNode) => nodes.has(n.id) || nodes.set(n.id, n);
  nodes.set(REPO_ID, bare(REPO_ID, "repo", "repo"));

  // Nodes for definitions.
  const filePkgs = new Map<string, Set<string>>();
  for (const sym of sortedKeys(defs)) {
    const def = defs.get(sym)!;
    const ps = parseSymbol(sym)!;
    const inf = info.get(sym);
    const kind = classify(ps, inf)!;
    const name = inf && inf.display_name !== "" ? inf.display_name : ps.descriptors[ps.descriptors.length - 1]?.name ?? "";
    const signature = inf?.signature_documentation?.text || undefined;
    const doc = inf?.documentation.join("\n") || undefined;
    nodes.set(sym, { id: sym, kind, name, path: def.path, range: def.ident, signature, doc, hash: hashOf(def.path) });
    const pkgs = filePkgs.get(def.path) ?? filePkgs.set(def.path, new Set()).get(def.path)!;
    pkgs.add(pkgId(ps));
    const n = ps.descriptors.length;
    let owner: string | undefined;
    if (n >= 2 && ps.descriptors[n - 2].kind === "type") {
      const p = prefix(ps, sym, n - 1);
      if (defs.has(p)) owner = p;
    }
    parent.set(sym, owner ?? fileId(def.path));
  }

  // Package and file nodes.
  for (const ctx of ctxs) {
    const path = ctx.doc.relative_path;
    const fid = fileId(path);
    nodes.set(fid, { id: fid, kind: "file", name: baseName(path), path, hash: hashOf(path) });
    const pkgs = filePkgs.get(path);
    parent.set(fid, pkgs ? minBy(pkgs, cmpStr)! : REPO_ID);
  }
  for (const u of inp.unindexed ?? []) {
    const fid = fileId(u.path);
    if (nodes.has(fid)) continue;
    const text = inp.readSource(u.path);
    nodes.set(fid, { id: fid, kind: "file", name: baseName(u.path), path: u.path, hash: text === undefined ? undefined : sha256Hex(text), doc: u.reason, unindexed: true });
    parent.set(fid, REPO_ID);
  }
  for (const pkgs of filePkgs.values()) {
    for (const pid of pkgs) {
      let name = pid.startsWith("pkg:") ? pid.slice(4) : pid;
      const colon = name.indexOf(":");
      if (colon >= 0) name = name.slice(colon + 1);
      // The directory tree already shows the path; a full import path would be cut off.
      const tail = name.replace(/\/+$/, "");
      if (tail.includes("/")) name = tail.slice(tail.lastIndexOf("/") + 1);
      ensure(bare(pid, "package", name));
      parent.set(pid, REPO_ID);
    }
  }

  directories(nodes, parent, filePkgs);

  // Definitions by (container, name): a file's top-level ones under the file id, members under their type.
  const named = new Map<string, Map<string, string[]>>();
  for (const sym of sortedKeys(defs)) {
    const p = parent.get(sym), name = nodes.get(sym)?.name;
    if (p === undefined || name === undefined) continue;
    const m = named.get(p) ?? named.set(p, new Map()).get(p)!;
    (m.get(name) ?? m.set(name, []).get(name)!).push(sym);
  }
  const inDir = new Map<string, string[]>();
  for (const ctx of ctxs) {
    const p = ctx.doc.relative_path, d = dirOf(p);
    (inDir.get(d) ?? inDir.set(d, []).get(d)!).push(p);
  }
  /** The definition an import reaches: the names walked from the top level of one of the files. */
  const lookup = (files: string[], names: string[]): string | undefined => {
    if (!names.length) return undefined;
    for (const f of files.flatMap((f) => (f.endsWith("/") ? inDir.get(f.slice(0, -1)) ?? [] : texts.has(f) ? [f] : []))) {
      let holders = [fileId(f)];
      for (const n of names) holders = holders.flatMap((h) => named.get(h)?.get(n) ?? []);
      if (holders.length) return holders[0];
    }
    return undefined;
  };
  /** A call the index left unresolved, resolved through the import that binds its callee's head: a
   *  definition in the repo, a symbol outside it, "type" for a constructor or conversion, or nothing. */
  const viaImport = (ctx: Doc, call: CallSite): string | undefined => {
    const imp = ctx.imports;
    if (!imp) return undefined;
    const segs = imp.path(call.callee_text);
    if (!segs.length) return undefined;
    const decl = ctx.bound.get(segs[0]);
    let module: string, names: string[];
    if (decl) {
      module = decl.module;
      names = decl.member !== undefined ? [decl.member, ...segs.slice(1)] : segs.slice(1);
      if (!names.length) names = [decl.local];
    } else {
      const q = imp.qualified?.(segs);
      if (!q) return undefined;
      ({ module, names } = q);
    }
    for (const l of imp.local(module, ctx.doc.relative_path, names)) {
      const sym = lookup(l.files, l.names);
      if (sym === undefined) continue;
      const kind = nodes.get(sym)?.kind;
      return kind === "type" ? "type" : kind !== undefined && isCallable(kind) ? sym : undefined;
    }
    const ext = imp.external(module, names);
    return ext && externalSymbol(ctx.doc.language, ext.package, ext.names);
  };

  /** Symbols with no in-repo definition resolve outside the repo, labeled by package. */
  const ensureExternal = (sym: string) => {
    if (defs.has(sym) || nodes.has(sym)) return;
    const ps = parseSymbol(sym);
    if (!ps) return;
    const pid = `ext:${ps.package}`;
    ensure(bare(pid, "external_package", ps.package));
    parent.set(pid, REPO_ID);
    // Owning types name it too (`Map.get`); the package is already its parent.
    const named = ps.descriptors.filter((d) => d.kind === "type" || d.kind === "method" || d.kind === "term");
    nodes.set(sym, bare(sym, "external", named.map((d) => d.name).join(".") || (ps.descriptors[ps.descriptors.length - 1]?.name ?? "")));
    parent.set(sym, pid);
  };

  // Implementations: interface member -> in-repo implementers.
  const impls = new Map<string, Set<string>>();
  for (const sym of sortedKeys(defs)) {
    const def = defs.get(sym)!;
    const i = info.get(sym);
    if (!i) continue;
    for (const r of i.relationships) {
      if (!r.is_implementation) continue;
      (impls.get(r.symbol) ?? impls.set(r.symbol, new Set()).get(r.symbol)!).add(sym);
      ensureExternal(r.symbol);
      edges.push({ from: sym, to: r.symbol, kind: "override", provenance: "resolved", site: { path: def.path, range: def.ident } });
    }
  }

  // Parameters: callable symbol -> [(index, name)], and (path, param symbol) -> (callable, index).
  const paramsOf = new Map<string, [number, string][]>();
  const paramSym = new Map<string, [string, number]>();
  const pathSym = (path: string, sym: string) => `${path}\0${sym}`;
  for (const ctx of ctxs) {
    const defsAt = ctx.defsAt;
    for (const p of ctx.facts.params) {
      const c = ctx.callables.find((c) => contains(p.decl, c.ident));
      if (!c) continue;
      (paramsOf.get(c.symbol) ?? paramsOf.set(c.symbol, []).get(c.symbol)!).push([p.index, p.name]);
      const s = defsAt.get(rangeKey(p.range));
      if (s !== undefined) paramSym.set(pathSym(ctx.doc.relative_path, s), [c.symbol, p.index]);
    }
  }

  // Without syntax there are no call sites. A reference to an in-repo callable from inside another
  // callable may be a call or a mention, so it is a `may` edge.
  for (const ctx of ctxs) {
    if (!ctx.generic) continue;
    const path = ctx.doc.relative_path;
    for (const o of ctx.doc.occurrences) {
      const rg = occRange(o);
      if (!rg || o.symbol === "" || o.symbol_roles & ROLE_DEFINITION || o.symbol.startsWith("local ") || !defs.has(o.symbol)) continue;
      const ps = parseSymbol(o.symbol);
      if (!ps || !isCallableSym(ps, info.get(o.symbol))) continue;
      const caller = callerAt(ctx, rg);
      if (caller === fileId(path)) continue;
      edges.push(callEdge(caller, o.symbol, "may", "reference", { path, range: rg }));
    }
  }

  // Pass 2: calls and flow.
  interface ParamCall { func: string; idx: number; caller: string; site: Site; name: string }
  const paramCalls: ParamCall[] = [];
  const fnFlows: [string, number, string][] = []; // (callee, param idx, function value)
  const argsTo = new Map<string, ArgIn[]>(); // callee + index -> resolved call sites passing it
  // Code handed to something outside the repo runs when that code calls it: an event of the callable
  // that hands it over, guarding the function literal's range.
  const handlers = new Set<string>(); // callables code outside the repo calls, directly or from a callback
  const callbacks: Site[] = [];
  for (const ctx of ctxs) {
    const path = ctx.doc.relative_path;
    // Each function literal belongs to the innermost call whose arguments hold it.
    const holder = ctx.facts.lambdas.map((l) => minBy(
      ctx.facts.calls.flatMap((c, i) => c.args.filter((a) => contains(a, l)).map((a) => ({ i, a }))),
      (x, y) => cmpSize(x.a, y.a),
    )?.i);
    // A call that registers code keeps nothing of its result, or hands it on whole to a call that does
    // (`subs.push(onEvent(cb))`); one whose result is used (`new Set(xs.map(f))`) runs it now.
    const lines = (texts.get(path) ?? "").split("\n");
    const between = (a: Range, b: Range) => a.start_line === b.start_line ? lines[a.start_line]?.slice(a.start_col, b.start_col) ?? ""
      : [lines[a.start_line]?.slice(a.start_col) ?? "", ...lines.slice(a.start_line + 1, b.start_line), lines[b.start_line]?.slice(0, b.start_col) ?? ""].join("\n");
    const end = (r: Range): Range => ({ start_line: r.end_line, start_col: r.end_col, end_line: r.end_line, end_col: r.end_col });
    const registers = (c: CallSite, depth = 0): boolean => {
      if (!c.result_used) return true;
      const last = c.args[c.args.length - 1];
      return !!last && depth < 8 && ctx.facts.calls.some((o) => o !== c && o.args.some((a) => contains(a, c.callee) && contains(a, last) && /^[\s,]*\)$/.test(between(end(last), end(a)))) && registers(o, depth + 1));
    };
    ctx.facts.calls.forEach((call, ci) => {
      const caller = callerAt(ctx, call.callee);
      const site: Site = { path, range: call.callee };
      const targets: [string, Provenance][] = [];
      let stub = false;
      const s = ctx.refs.get(rangeKey(call.callee));
      if (s === undefined) stub = true;
      else if (!s.startsWith("local ")) {
        const ps = parseSymbol(s);
        if (ps && isCallableSym(ps, info.get(s))) {
          ensureExternal(s);
          edges.push(callEdge(caller, s, "resolved", undefined, site));
          targets.push([s, "resolved"]);
          for (const imp of [...(impls.get(s) ?? [])].sort(cmpStr)) {
            edges.push(callEdge(caller, imp, "may", "dispatch", site));
            targets.push([imp, "may"]);
          }
        } else if (ps && lastKind(ps) === "type") return; // conversion
        else stub = true;
      } else {
        const pc = paramSym.get(pathSym(path, s));
        if (pc) paramCalls.push({ func: pc[0], idx: pc[1], caller, site, name: call.callee_text });
        stub = true;
      }
      if (stub) {
        const via = viaImport(ctx, call);
        if (via === "type") return; // constructor or conversion
        if (via !== undefined) {
          ensureExternal(via);
          edges.push(callEdge(caller, via, "resolved", undefined, site));
          targets.push([via, "resolved"]);
          for (const imp of [...(impls.get(via) ?? [])].sort(cmpStr)) {
            edges.push(callEdge(caller, imp, "may", "dispatch", site));
            targets.push([imp, "may"]);
          }
          stub = false;
        }
      }
      if (stub) {
        // A callee written as an expression (an inline function) is named by its first line, not its body.
        const text = call.callee_text.length > 40 || call.callee_text.includes("\n") ? call.callee_text.split("\n")[0].slice(0, 39).trimEnd() + "…" : call.callee_text;
        const id = `unresolved:${caller}:${text}`;
        ensure(bare(id, "unresolved", text));
        parent.set(id, caller);
        edges.push(callEdge(caller, id, "unresolved", undefined, site));
        targets.push([id, "unresolved"]);
      }
      for (const [t, prov] of targets) {
        const names = paramsOf.get(t);
        call.args.forEach((arg, i) => {
          const name = names?.find(([k]) => k === i)?.[1];
          const label = name === undefined ? `arg${i}` : `arg${i}:${name}`;
          if (prov === "resolved" && call.values[i]) {
            const k = `${t}\0${i}`;
            (argsTo.get(k) ?? argsTo.set(k, []).get(k)!).push({ path, caller, site: call.callee, value: call.values[i] });
          }
          edges.push({ from: caller, to: t, kind: "flow", provenance: prov, label, site });
          if (prov !== "resolved") return;
          // Function value passed as argument.
          let fv: string | undefined;
          for (const r of ctx.refsByEnd.get(`${arg.end_line},${arg.end_col}`) ?? []) {
            const sym = ctx.refs.get(rangeKey(r));
            if (sym === undefined) continue;
            const ps = parseSymbol(sym);
            if (ps && contains(arg, r) && isCallableSym(ps, info.get(sym)) && defs.has(sym)) {
              fv = sym;
              break;
            }
          }
          if (fv !== undefined) {
            edges.push({ from: fv, to: t, kind: "flow", provenance: "resolved", label: `fn:${label}`, site });
            fnFlows.push([t, i, fv]);
            if (!defs.has(t)) {
              edges.push(callEdge(t, fv, "may", "callback", site));
              handlers.add(fv);
            }
          }
        });
        if (call.result_used) edges.push({ from: t, to: caller, kind: "flow", provenance: prov, label: "return", site });
      }
      const ext = targets.find(([t, prov]) => prov === "resolved" && !defs.has(t))?.[0];
      if (ext === undefined || !registers(call)) return;
      ctx.facts.lambdas.forEach((l, li) => {
        if (holder[li] !== ci) return;
        const id = `event:${caller}:${nodes.get(ext)!.name}@${l.start_line + 1}:${l.start_col}`;
        ensure({ id, kind: "event", name: nodes.get(ext)!.name, path, range: l, doc: "Code outside the repo calls this function literal." });
        parent.set(id, caller);
        // Whether the outside code calls it later or right away is not known: `may`.
        edges.push({ from: caller, to: id, kind: "guard", provenance: "may", label: "callback", site: { path, range: l } });
        edges.push(callEdge(ext, id, "may", "callback", { path, range: l }));
        callbacks.push({ path, range: l });
      });
    });
  }
  // Callables a callback calls handle what comes in from outside.
  for (const e of edges)
    if (e.kind === "call" && defs.has(e.to) && e.site && callbacks.some((c) => c.path === e.site!.path && contains(c.range, e.site!.range))) handlers.add(e.to);
  // Calls through a parameter reach the function values passed into it.
  for (const pc of paramCalls) {
    for (const [callee, idx, f] of fnFlows) {
      if (callee === pc.func && idx === pc.idx) edges.push(callEdge(pc.caller, f, "may", `via ${pc.name}`, pc.site));
    }
  }

  // Indexers that leave the symbol kind unset: the syntax says which definitions are constants.
  const constRanges = new Map(ctxs.map((c) => [c.doc.relative_path, new Set(c.facts.consts.map(rangeKey))]));
  const declaredConst = (sym: string) => {
    const d = defs.get(sym);
    return !!d && !!constRanges.get(d.path)?.has(rangeKey(d.ident));
  };

  const st = states({
    docs: ctxs.map((ctx) => {
      const localDefs = new Map<string, Range>();
      for (const [k, sym] of ctx.defsAt) if (sym.startsWith("local ") && !localDefs.has(sym)) localDefs.set(sym, keyRange(k));
      return {
        path: ctx.doc.relative_path,
        facts: ctx.facts,
        symAt: (r) => ctx.refs.get(rangeKey(r)) ?? ctx.defsAt.get(rangeKey(r)),
        refs: [...ctx.refs].map(([k, sym]): [Range, string] => [keyRange(k), sym]),
        callerAt: (r) => callerAt(ctx, r),
        localDef: (sym) => localDefs.get(sym),
      };
    }),
    kindOf: (sym) => (defs.has(sym) ? nodes.get(sym)?.kind : undefined),
    isExternalValue: (sym) => {
      const ps = parseSymbol(sym);
      return !!ps && lastKind(ps) === "term" && !isCallableSym(ps, info.get(sym));
    },
    paramOf: (path, sym) => paramSym.get(pathSym(path, sym)),
    isHandler: (callable) => handlers.has(callable),
    argsTo: (callable, idx) => argsTo.get(`${callable}\0${idx}`) ?? [],
    isConstantKind: (sym) => CONSTANT_KINDS.includes(info.get(sym)?.kind ?? 0) || declaredConst(sym),
    nameOf: (id) => nodes.get(id)?.name ?? id,
    defSite: (sym) => {
      const d = defs.get(sym);
      return d && { path: d.path, range: d.ident };
    },
  });
  for (const n of st.nodes) ensure(n);
  for (const [child, p] of st.parents) parent.set(child, p);
  edges.push(...st.edges);

  for (const [child, p] of parent) edges.push({ from: p, to: child, kind: "contains", provenance: "resolved" });
  const g = newGraph();
  g.nodes = [...nodes.values()].map(node);
  g.edges = edges.map(edge);
  canonicalize(g);
  return g;
}

const keyRange = (k: string): Range => {
  const [a, b, c, d] = k.split(",").map(Number);
  return { start_line: a, start_col: b, end_line: c, end_col: d };
};

/** Innermost callable whose body holds the range, else the file. */
function callerAt(ctx: Doc, r: Range): string {
  return minBy(ctx.callables.filter((c) => contains(c.body, r)), (a, b) => cmpSize(a.body, b.body))?.symbol ?? fileId(ctx.doc.relative_path);
}

function callEdge(from: string, to: string, provenance: Provenance, label: string | undefined, site: Site): GraphEdge {
  return { from, to, kind: "call", provenance, label, site };
}

const dirOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), 0));

/** Deepest directory holding every path. */
function commonDir(paths: Iterable<string>): string {
  let common: string[] | undefined;
  for (const p of paths) {
    const segs = dirOf(p).split("/").filter((x) => x !== "");
    if (!common) common = segs;
    else {
      let i = 0;
      while (i < common.length && i < segs.length && common[i] === segs[i]) i++;
      common = common.slice(0, i);
    }
  }
  return (common ?? []).join("/");
}

/** Directory nodes between the repo and its top-level packages and files, from file paths.
 *  A directory with one child adds a click and no grouping, so it folds into its parent. */
export function directories(nodes: Map<string, GraphNode>, parent: Map<string, string>, filePkgs: Map<string, Set<string>>) {
  const pkgFiles = new Map<string, string[]>();
  for (const [path, pkgs] of filePkgs) for (const p of pkgs) (pkgFiles.get(p) ?? pkgFiles.set(p, []).get(p)!).push(path);
  const children = new Map<string, Set<string>>(); // dir path -> child ids
  const up = new Map<string, string>(); // dir path -> parent dir path ("" is the repo)
  const dirId = (d: string) => (d === "" ? REPO_ID : `dir:${d}`);
  const place = (id: string, dir: string) => {
    for (let d = dir; d !== ""; d = dirOf(d)) {
      if (!children.has(d)) children.set(d, new Set());
      if (!up.has(d)) up.set(d, dirOf(d));
    }
    if (dir !== "") children.get(dir)!.add(id);
    parent.set(id, dirId(dir));
  };
  for (const id of [...parent.keys()].sort(cmpStr)) {
    if (parent.get(id) !== REPO_ID) continue;
    const n = nodes.get(id);
    if (n?.kind === "package") place(id, commonDir(pkgFiles.get(id) ?? []));
    else if (n?.kind === "file" && n.path !== undefined) place(id, dirOf(n.path));
  }
  for (const [d, p] of up) if (p !== "") children.get(p)!.add(dirId(d));
  // Deepest first, so a directory's children are final before it is judged.
  const depth = (d: string) => d.split("/").length;
  for (const d of [...children.keys()].sort((a, b) => depth(b) - depth(a) || cmpStr(a, b))) {
    const kids = children.get(d)!;
    if (kids.size !== 1) continue;
    const [only] = kids;
    const p = up.get(d)!;
    parent.set(only, dirId(p));
    if (only.startsWith("dir:")) up.set(only.slice(4), p);
    if (p !== "") {
      children.get(p)!.delete(dirId(d));
      children.get(p)!.add(only);
    }
    children.delete(d);
  }
  for (const d of children.keys()) {
    const p = up.get(d)!;
    nodes.set(dirId(d), { id: dirId(d), kind: "directory", name: p === "" ? d : d.slice(p.length + 1) });
    parent.set(dirId(d), dirId(p));
  }
}
