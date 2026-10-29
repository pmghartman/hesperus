// Field-level flow and state machines, from assignments and equality guards.
//
// A location is a field or variable defined in the repo, or a local variable. Every write to a
// field or variable is a `flow` edge from the writer labeled `write`; every other reference is
// a `flow` edge to the reader labeled `read`. A location is a state machine when it is tested
// for equality against a constant (or, holding only booleans, for truth: `if (busy)`) and holds at
// least two distinct constants, counting its initializer, at least one of them set by a statement. Its states are those constants, contained by the location; a local that is
// one becomes a `variable` node inside its function. A `transition` runs from the state an
// enclosing guard tests to the state assigned. Unknowns stay visible: an unguarded write starts at `any` (may), a
// non-constant value ends at `?` (unresolved).
import { cmpRange, cmpSite, cmpSize, cmpStr, contains, GraphEdge, GraphNode, NodeKind, Provenance, Range, rangeKey, Site } from "./ir";
import { Facts, Guard, Operand } from "./syntax";

export interface StateDoc {
  path: string;
  facts: Facts;
  /** Symbol at an exact token range, definitions included. */
  symAt: (r: Range) => string | undefined;
  /** Non-definition occurrences, in document order. */
  refs: [Range, string][];
  /** Innermost callable around a range, else the file. */
  callerAt: (r: Range) => string;
  /** Definition range of a document-local symbol. */
  localDef: (sym: string) => Range | undefined;
}

export interface StateInputs {
  docs: StateDoc[];
  /** Node kind of an in-repo definition. */
  kindOf: (sym: string) => NodeKind | undefined;
  /** True for symbols outside the repo that name values (constants, enum members, terms). */
  isExternalValue: (sym: string) => boolean;
  /** The callable and index of a parameter, by its local symbol in a document. */
  paramOf: (path: string, sym: string) => [string, number] | undefined;
  /** Callables that code outside the repo runs; a parameter they test against constants is an event. */
  isHandler: (callable: string) => boolean;
  /** Resolved call sites passing an argument into a callable's parameter. */
  argsTo: (callable: string, index: number) => ArgIn[];
  /** Fields the index marks Constant or EnumMember. */
  isConstantKind: (sym: string) => boolean;
  nameOf: (id: string) => string;
  defSite: (sym: string) => Site | undefined;
}

export interface ArgIn { path: string; caller: string; site: Range; value: Operand }

export interface StateOut { nodes: GraphNode[]; parents: [string, string][]; edges: GraphEdge[] }

interface Write { path: string; site: Range; caller: string; loc: string; receiver: string; value: Operand; init: boolean }
interface Test { path: string; loc: string; receiver: string; value: NonNullable<Value>; body: Range; certain: boolean; truth: boolean; equal: boolean }
type Value = { key: string; name: string; sym?: string; site: Site } | undefined;

const isLocation = (k: NodeKind | undefined) => k === "field" || k === "variable";

export const stateId = (loc: string, key: string) => `state:${loc}:${key}`;
const isLocal = (s: string) => s.startsWith("local ");
const LOCAL = "local:";

export function states(inp: StateInputs): StateOut {
  // Locals written anywhere get ids scoped to their function, `local:<function>:<name>`, with a
  // `#n` suffix when one function declares the name more than once; numbered in source order.
  const localIds = new Map<string, string>(); // path + local symbol -> id
  const localDefs: { key: string; path: string; def: Range; owner: string; name: string }[] = [];
  for (const d of inp.docs) {
    for (const a of d.facts.assigns) {
      const s = a.target.form === "name" ? d.symAt(a.target.name) : undefined;
      const def = s !== undefined && isLocal(s) ? d.localDef(s) : undefined;
      const key = `${d.path}\0${s}`;
      if (!def || localIds.has(key)) continue;
      localIds.set(key, "");
      localDefs.push({ key, path: d.path, def, owner: d.callerAt(def), name: a.target.text });
    }
  }
  localDefs.sort((a, b) => cmpStr(a.path, b.path) || cmpRange(a.def, b.def));
  const seen = new Map<string, number>();
  for (const l of localDefs) {
    const base = `${LOCAL}${l.owner}:${l.name}`, n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    localIds.set(l.key, n === 1 ? base : `${base}#${n}`);
  }
  const localInfo = new Map(localDefs.map((l) => [localIds.get(l.key)!, l]));
  /** Location id of a symbol in a document: itself, or a local's scoped id. */
  const locOf = (d: StateDoc, s: string | undefined) => (s === undefined ? undefined : isLocal(s) ? localIds.get(`${d.path}\0${s}`) || undefined : s);

  // Pass 1: writes to locations, so a written variable never counts as a constant.
  const writes: Write[] = [];
  const written = new Set<string>();
  const targets = new Set<string>(); // path + target range
  for (const d of inp.docs) {
    for (const a of d.facts.assigns) {
      if (a.target.form !== "name") continue;
      const loc = locOf(d, d.symAt(a.target.name));
      if (loc === undefined || !(localInfo.has(loc) || isLocation(inp.kindOf(loc)))) continue;
      writes.push({ path: d.path, site: a.target.name, caller: d.callerAt(a.target.name), loc, receiver: a.target.receiver, value: a.value, init: a.init });
      written.add(loc);
      targets.add(`${d.path}\0${rangeKey(a.target.name)}`);
    }
  }
  const consts = new Map(inp.docs.map((d) => [d.path, new Set(d.facts.consts.map(rangeKey))]));

  const value = (d: StateDoc, o: Operand, loc: string): Value => {
    const site = { path: d.path, range: o.name };
    // `True` and `true` are one state across languages.
    if (o.form === "literal") return { key: /^(true|false)$/i.test(o.text) ? o.text.toLowerCase() : o.text, name: o.text, site };
    if (o.form !== "name") return undefined;
    const s = d.symAt(o.name);
    if (s === undefined || s === loc || written.has(s)) return undefined;
    if (isLocal(s)) {
      // A local declared constant; never a parameter or a variable.
      const def = d.localDef(s);
      if (!def || !consts.get(d.path)!.has(rangeKey(def)) || written.has(locOf(d, s) ?? "")) return undefined;
      return { key: `${LOCAL}${o.text}`, name: o.text, site: { path: d.path, range: def } };
    }
    const k = inp.kindOf(s);
    const constant = k === undefined ? inp.isExternalValue(s) : k === "variable" || (k === "field" && inp.isConstantKind(s));
    return constant ? { key: s, name: inp.nameOf(s), sym: s, site } : undefined;
  };

  // Guards: whichever side is a written location, against a constant on the other. `tests` are the
  // equalities that say which state code runs in; `checks` add the inequalities.
  let checks: Test[] = [];
  for (const d of inp.docs) {
    for (const g of d.facts.guards) {
      for (const [l, r] of [[g.left, g.right], [g.right, g.left]]) {
        if (l.form !== "name") continue;
        const loc = locOf(d, d.symAt(l.name));
        if (loc === undefined || !written.has(loc)) continue;
        const v = value(d, r, loc);
        if (v) checks.push({ path: d.path, loc, receiver: l.receiver, value: v, body: g.body, certain: g.certain, truth: !!g.truth, equal: g.equal });
        break;
      }
    }
  }

  const docOf = new Map(inp.docs.map((d) => [d.path, d]));
  const values = new Map<string, Map<string, NonNullable<Value>>>(); // loc -> key -> first site
  const note = (loc: string, v: Value) => {
    if (!v) return;
    const m = values.get(loc) ?? values.set(loc, new Map()).get(loc)!;
    const old = m.get(v.key);
    if (!old || cmpSite(v.site, old.site) < 0) m.set(v.key, v);
  };
  // What each write stores: its value, or through a parameter, every argument passed into it.
  // A move through a parameter is triggered at the call site, by the caller.
  // `x = !x` flips a flag: a move from each truth value to the other.
  interface Move { value: Value; caller: string; site: Site; flip?: boolean }
  const moves: Move[][] = writes.map((w) => {
    const d = docOf.get(w.path)!;
    const here = { caller: w.caller, site: { path: w.path, range: w.site } };
    if (w.value.negates && locOf(d, d.symAt(w.value.negates)) === w.loc) return [{ value: undefined, flip: true, ...here }];
    const s = w.value.form === "name" ? d.symAt(w.value.name) : undefined;
    const p = s === undefined ? undefined : inp.paramOf(w.path, s);
    if (!p) return [{ value: value(d, w.value, w.loc), ...here }];
    // `if p != "" { x = p }`: a value the parameter is tested against never reaches the write.
    const barred = new Set(d.facts.guards.flatMap((g) => {
      if (g.equal || !g.certain || !contains(g.body, w.site)) return [];
      const [l, r] = d.symAt(g.left.name) === s ? [g.left, g.right] : d.symAt(g.right.name) === s ? [g.right, g.left] : [];
      return r?.form === "literal" ? [r.text] : r?.form === "name" && d.symAt(r.name) !== undefined ? [d.symAt(r.name)!] : [];
    }));
    const ins = inp.argsTo(p[0], p[1]).filter((a) => {
      const v = value(docOf.get(a.path)!, a.value, w.loc);
      return !v || !barred.has(v.key);
    });
    if (!ins.length) return [{ value: undefined, ...here }];
    return ins.map((a) => ({ value: value(docOf.get(a.path)!, a.value, w.loc), caller: a.caller, site: { path: a.path, range: a.site } }));
  });
  // Values each location holds: from statements, which move a machine, and from initializers, which start it.
  const assigned = new Map<string, Set<string>>(), held = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, loc: string, key: string) => (m.get(loc) ?? m.set(loc, new Set()).get(loc)!).add(key);
  writes.forEach((w, i) => {
    for (const m of moves[i]) {
      for (const key of m.flip ? ["false", "true"] : m.value ? [m.value.key] : []) {
        add(held, w.loc, key);
        if (!w.init) add(assigned, w.loc, key);
      }
    }
  });
  // A truth test says which state a flag is in only when the flag holds nothing but booleans; there,
  // `!= true` is `== false`.
  const boolean = (loc: string) => [...(held.get(loc) ?? [])].every((k) => k === "true" || k === "false");
  const not = (v: NonNullable<Value>): NonNullable<Value> => (v.key === "true" ? { ...v, key: "false", name: "false" } : { ...v, key: "true", name: "true" });
  checks = checks.filter((t) => !t.truth || boolean(t.loc)).map((t) => (!t.equal && boolean(t.loc) && /^(true|false)$/.test(t.value.key) ? { ...t, equal: true, value: not(t.value) } : t));
  const tests = checks.filter((t) => t.equal);
  const machines = new Set<string>();
  for (const t of tests) if (assigned.has(t.loc) && (held.get(t.loc)?.size ?? 0) >= 2) machines.add(t.loc);
  // A field or module flag set both ways by statements is state even where only a ternary or nothing reads it.
  for (const [loc, ks] of held) if (!localInfo.has(loc) && boolean(loc) && ks.size === 2 && assigned.has(loc)) machines.add(loc);

  const out: StateOut = { nodes: [], parents: [], edges: [] };
  const made = new Set<string>();
  const pseudo = (loc: string, key: string, kind: NodeKind, name: string, doc: string) => {
    const id = stateId(loc, key);
    if (!made.has(id)) {
      made.add(id);
      out.nodes.push({ id, kind, name, doc });
      out.parents.push([id, loc]);
    }
    return id;
  };
  const real = (loc: string, v: NonNullable<Value>) => stateId(loc, v.key);

  for (const t of tests) if (machines.has(t.loc)) note(t.loc, t.value);
  const truth = (key: string, site: Site): NonNullable<Value> => ({ key, name: key, site });
  writes.forEach((w, i) => machines.has(w.loc) && moves[i].forEach((m) => (m.flip ? [truth("false", m.site), truth("true", m.site)] : [m.value]).forEach((v) => note(w.loc, v))));
  for (const loc of [...values.keys()].sort(cmpStr)) {
    const l = localInfo.get(loc);
    if (l) {
      out.nodes.push({ id: loc, kind: "variable", name: l.name, path: l.path, range: l.def });
      out.parents.push([loc, l.owner]);
    }
    for (const [key, v] of [...values.get(loc)!].sort(([a], [b]) => cmpStr(a, b))) {
      const at = (v.sym && inp.defSite(v.sym)) || v.site;
      const id = stateId(loc, key);
      made.add(id);
      out.nodes.push({ id, kind: "state", name: v.name, path: at.path, range: at.range });
      out.parents.push([id, loc]);
    }
  }

  writes.forEach((w, i) => {
    const site: Site = { path: w.path, range: w.site };
    // A local's reads and writes stay inside its function; they add nothing at any zoom.
    if (!localInfo.has(w.loc)) out.edges.push({ from: w.caller, to: w.loc, kind: "flow", provenance: "resolved", label: "write", site });
    if (!machines.has(w.loc)) return;
    // The innermost guards on this location around the write; a case listing several values
    // gives several with the same body.
    const around = tests.filter((t) => t.loc === w.loc && t.path === w.path && contains(t.body, w.site));
    const inner = around.reduce<Range | undefined>((m, t) => (m === undefined || cmpSize(t.body, m) < 0 ? t.body : m), undefined);
    for (const m of moves[i]) {
      if (m.flip) {
        // From each truth value the enclosing guards allow, to the other.
        const from = inner ? around.filter((t) => cmpRange(t.body, inner) === 0).map((t) => t.value.key) : ["false", "true"];
        for (const f of from.filter((k) => k === "true" || k === "false"))
          out.edges.push({ from: stateId(w.loc, f), to: stateId(w.loc, f === "true" ? "false" : "true"), kind: "transition", provenance: "resolved", label: inp.nameOf(m.caller), site: m.site });
        continue;
      }
      const to = m.value ? real(w.loc, m.value) : pseudo(w.loc, "?", "unresolved", "?", "A value that is not a constant.");
      const emit = (from: string, prov: Provenance) =>
        out.edges.push({ from, to, kind: "transition", provenance: m.value ? prov : "unresolved", label: inp.nameOf(m.caller), site: m.site });
      if (w.init) emit(pseudo(w.loc, "#initial", "state", "initial", "Before any write: declaration initializers and literal elements."), "resolved");
      else if (!inner) emit(pseudo(w.loc, "#any", "state", "any", "Any state: a write no guard on this location encloses."), "may");
      else for (const t of around)
        if (cmpRange(t.body, inner) === 0) emit(real(w.loc, t.value), t.certain && t.receiver === w.receiver ? "resolved" : "may");
    }
  });

  // Guards: the code a check encloses runs only in (or out of) that state.
  for (const t of checks) {
    if (!machines.has(t.loc) || !values.get(t.loc)?.has(t.value.key)) continue;
    const d = docOf.get(t.path)!;
    out.edges.push({ from: d.callerAt(t.body), to: stateId(t.loc, t.value.key), kind: "guard", provenance: t.certain ? "resolved" : "may", label: t.equal ? "==" : "!=", site: { path: t.path, range: t.body } });
  }

  // Events: a handler's parameter tested against two or more constants (`m.type === "toggle"`) says
  // which input arrived; each constant is an event of the handler, guarding the code that handles it.
  interface Dispatch { caller: string; on: string; value: Operand; guard: Guard; path: string }
  const dispatch: Dispatch[] = [];
  for (const d of inp.docs) {
    for (const g of d.facts.guards) {
      const caller = d.callerAt(g.body);
      if (!inp.isHandler(caller)) continue;
      const decl = d.facts.params.filter((p) => contains(p.decl, g.body)).reduce<Range | undefined>((m, p) => (m === undefined || cmpSize(p.decl, m) < 0 ? p.decl : m), undefined);
      const names = new Set(d.facts.params.filter((p) => decl && cmpRange(p.decl, decl) === 0).map((p) => p.name));
      for (const [l, r] of [[g.left, g.right], [g.right, g.left]]) {
        if (l.form !== "name" || r.form !== "literal" || g.truth || !(names.has(l.receiver) || (l.receiver === "" && names.has(l.text)))) continue;
        dispatch.push({ caller, on: l.text, value: r, guard: g, path: d.path });
        break;
      }
    }
  }
  const kinds = new Map<string, Set<string>>();
  for (const x of dispatch) if (x.guard.equal) add(kinds, `${x.caller}\0${x.on}`, x.value.text);
  for (const x of [...dispatch].sort((a, b) => cmpStr(a.path, b.path) || cmpRange(a.value.name, b.value.name))) {
    if ((kinds.get(`${x.caller}\0${x.on}`)?.size ?? 0) < 2) continue;
    const id = `event:${x.caller}:${x.on}=${x.value.text}`;
    if (!made.has(id)) {
      made.add(id);
      out.nodes.push({ id, kind: "event", name: x.value.text.replace(/^(["'`])(.*)\1$/, "$2"), path: x.path, range: x.value.name, doc: `${x.on} == ${x.value.text}` });
      out.parents.push([id, x.caller]);
    }
    out.edges.push({ from: x.caller, to: id, kind: "guard", provenance: x.guard.certain ? "resolved" : "may", label: x.guard.equal ? "==" : "!=", site: { path: x.path, range: x.guard.body } });
  }

  // Reads: every other reference to a written location.
  for (const d of inp.docs) {
    for (const [r, s] of d.refs) {
      if (!written.has(s) || targets.has(`${d.path}\0${rangeKey(r)}`)) continue;
      out.edges.push({ from: s, to: d.callerAt(r), kind: "flow", provenance: "resolved", label: "read", site: { path: d.path, range: r } });
    }
  }
  return out;
}
