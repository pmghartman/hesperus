// The program as an automaton. States are the values of its state machines (locations assigned
// constants); the alphabet is what comes in from outside: callbacks handed to code outside the repo,
// events a handler dispatches on, and entry points nothing in the repo calls. Each input's
// transitions come from what its handler, and everything it calls, writes under which guards.
//
// Locations that never test each other are orthogonal regions, as in a statechart: each region is
// explored on its own from its initial values, so independent flags never multiply into a product.
//
// Built for runtime tracing later: state and input ids are stable, and `locate` maps observed
// location values onto states.
import { cmpRange, cmpSize, cmpStr, contains, Graph, GraphNode, isCallable, Range } from "./ir";
import { parents } from "./aggregate";

/** A location the automaton tracks, with the constant values it takes. "?" is a value no analysis fixed. */
export interface Dim { id: string; name: string; values: string[]; names: Record<string, string>; initial: string; tested: boolean }

/** One input symbol: `name` labels a transition, `detail` says where it comes from. `handler` is the
 *  callable whose code runs, `region` the callback in it, `event` narrows it to one dispatch. */
export interface Input { id: string; name: string; detail: string; handler: string; region?: string; event?: string; kind: "callback" | "event" | "entry" }

/** A state of a region: each of its locations' value. `loops` are inputs that leave it as it is. */
export interface AState { id: string; values: Record<string, string[]>; initial: boolean; loops: string[]; mayLoops: string[] }

export interface AEdge { from: string; to: string; inputs: string[]; may: boolean }

export interface Region { id: string; dims: string[]; states: AState[]; edges: AEdge[]; truncated: boolean }

export interface Automaton { dims: Dim[]; inputs: Input[]; regions: Region[]; /** Inputs that change no tracked location. */ quiet: number }

interface Cond { dim: string; key: string; eq: boolean }
/** Effects sharing a `group` are one write's alternatives (`x = !x` from each value): each is judged on
 *  the value before the write. */
interface Effect { dim: string; to: string; conds: Cond[]; may: boolean; group: number }

/** Values a branch may hold; past this many open branches a step stops forking and leaves "?". */
const MAX_BRANCHES = 32;
const MAX_STATES = 200;
const MAX_DEPTH = 8;

const siteKey = (path: string, r: Range) => `${path}\0${r.start_line},${r.start_col},${r.end_line},${r.end_col}`;
const inside = (outer: { path: string; range: Range }, path: string, r: Range) => outer.path === path && contains(outer.range, r);

const UNKNOWN = "?";

export function automaton(g: Graph): Automaton {
  const par = parents(g);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const callable = (id: string) => isCallable(byId.get(id)?.kind ?? "repo");
  // Code runs in callables, and at a file's top level.
  const code = (id: string) => callable(id) || byId.get(id)?.kind === "file";

  // Locations with states, and their values. State ids are `state:<location>:<key>`.
  const dims = new Map<string, Dim>();
  const keyOf = (state: string, loc: string) => state.slice(`state:${loc}:`.length);
  for (const n of g.nodes) {
    if (n.kind !== "state" && !(n.kind === "unresolved" && n.id.startsWith("state:"))) continue;
    const loc = par.get(n.id);
    if (loc === undefined) continue;
    const d = dims.get(loc) ?? dims.set(loc, { id: loc, name: dimName(loc, byId, par), values: [], names: {}, initial: UNKNOWN, tested: false }).get(loc)!;
    const key = keyOf(n.id, loc);
    if (key.startsWith("#")) continue;
    d.values.push(key);
    d.names[key] = n.name;
  }
  const dimOfState = (id: string) => {
    const loc = id.startsWith("state:") ? par.get(id) : undefined;
    return loc !== undefined && dims.has(loc) ? loc : undefined;
  };
  for (const d of dims.values()) {
    d.values.sort(cmpStr);
    if (!d.values.includes(UNKNOWN)) d.names[UNKNOWN] = UNKNOWN;
  }
  const inits = new Map<string, Set<string>>();
  for (const e of g.edges) {
    if (e.kind !== "transition" || !e.from.endsWith(":#initial")) continue;
    const loc = dimOfState(e.to);
    if (loc) (inits.get(loc) ?? inits.set(loc, new Set()).get(loc)!).add(keyOf(e.to, loc));
  }
  for (const [loc, ks] of inits) if (ks.size === 1) dims.get(loc)!.initial = [...ks][0];

  // Who runs the code at a site: the callable behind its call or write edge.
  const writer = new Map<string, string>();
  for (const e of g.edges)
    if (e.site && code(e.from) && (e.kind === "call" || (e.kind === "flow" && e.label === "write"))) writer.set(siteKey(e.site.path, e.site.range), e.from);

  interface Item { path: string; range: Range; set?: { dim: string; from: string; to: string; may: boolean }; call?: { to: string; may: boolean } }
  interface GuardOf { path: string; range: Range; to: string; label: string; may: boolean }
  const items = new Map<string, Item[]>();
  const guards = new Map<string, GuardOf[]>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
  for (const e of g.edges) {
    if (!e.site) continue;
    if (e.kind === "transition") {
      const dim = dimOfState(e.to) ?? (e.to.startsWith("state:") ? par.get(e.to) : undefined);
      const who = writer.get(siteKey(e.site.path, e.site.range));
      if (!dim || !dims.has(dim) || !who) continue;
      const from = e.from.slice(`state:${dim}:`.length);
      if (from === "#initial") continue;
      // A write no guard on its location encloses (`#any`) still happens whenever its code runs.
      push(items, who, { path: e.site.path, range: e.site.range, set: { dim, from, to: keyOf(e.to, dim), may: e.provenance !== "resolved" && from !== "#any" } });
    } else if (e.kind === "call" && code(e.from) && callable(e.to) && e.provenance !== "unresolved" && e.label !== "callback") {
      push(items, e.from, { path: e.site.path, range: e.site.range, call: { to: e.to, may: e.provenance !== "resolved" } });
    } else if (e.kind === "guard") {
      push(guards, e.from, { path: e.site.path, range: e.site.range, to: e.to, label: e.label ?? "", may: e.provenance !== "resolved" });
      const dim = dimOfState(e.to);
      if (dim) dims.get(dim)!.tested = true;
    }
  }
  for (const xs of items.values()) xs.sort((a, b) => cmpStr(a.path, b.path) || cmpRange(a.range, b.range));

  const family = (event: string) => event.slice(0, event.lastIndexOf("="));
  let groupNo = 0;
  /** Effects of running `c`, in source order. `region` is the callback whose code runs (else the body
   *  outside every callback); `event` narrows the callable that owns it to one dispatch. */
  const summary = (c: string, region: string | undefined, event: string | undefined, depth: number, stack: Set<string>): Effect[] => {
    if (depth > MAX_DEPTH || stack.has(c)) return [];
    stack.add(c);
    const gs = guards.get(c) ?? [];
    const out: Effect[] = [];
    let last = "";
    for (const it of items.get(c) ?? []) {
      const around = gs.filter((x) => inside(x, it.path, it.range));
      // The innermost callback around the item is the one whose code it is.
      const cb = around.filter((x) => x.label === "callback").reduce<GuardOf | undefined>((m, x) => (!m || cmpSize(x.range, m.range) < 0 ? x : m), undefined);
      if (cb?.to !== region) continue;
      let may = false;
      const conds: Cond[] = [];
      let skip = false;
      for (const x of around) {
        const dim = dimOfState(x.to);
        if (dim) {
          if (x.label === "==" || x.label === "!=") conds.push({ dim, key: keyOf(x.to, dim), eq: x.label === "==" });
          may ||= x.may;
        } else if (byId.get(x.to)?.kind === "event" && x.label !== "callback") {
          if (event !== undefined && family(x.to) === family(event)) {
            if ((x.label === "==") !== (x.to === event)) skip = true;
          } else may = true;
        }
      }
      if (skip) continue;
      if (it.set) {
        const conds2 = it.set.from === "#any" ? conds : [...conds, { dim: it.set.dim, key: it.set.from, eq: true }];
        const k = siteKey(it.path, it.range);
        if (k !== last) (last = k, groupNo++);
        out.push({ dim: it.set.dim, to: it.set.to, conds: conds2, may: may || it.set.may, group: groupNo });
      } else if (it.call) {
        last = "";
        for (const e of summary(it.call.to, undefined, event, depth + 1, stack))
          out.push({ ...e, conds: [...conds, ...e.conds], may: e.may || may || it.call.may });
      }
    }
    stack.delete(c);
    return out;
  };

  // The alphabet.
  const inputs: { input: Input; effects: Effect[] }[] = [];
  const eventsOf = new Map<string, GraphNode[]>();
  for (const n of g.nodes) if (n.kind === "event" && n.id.includes("=")) push(eventsOf, par.get(n.id) ?? "", n);
  const add = (input: Input) => {
    const effects = summary(input.handler, input.region, input.event, 0, new Set());
    inputs.push({ input, effects });
  };
  /** One input per dispatch event of a callable `handler`'s code calls first-hand, else one for all of it. */
  const expand = (base: Omit<Input, "event">) => {
    const reached = (items.get(base.handler) ?? []).filter((it) => it.call && (base.region === undefined || (guards.get(base.handler) ?? []).some((x) => x.to === base.region && inside(x, it.path, it.range))));
    const evs = [...new Set(reached.map((it) => it.call!.to))].sort(cmpStr).flatMap((d) => eventsOf.get(d) ?? []);
    if (!evs.length) return add({ ...base });
    for (const ev of evs.sort((a, b) => cmpStr(a.id, b.id)))
      add({ ...base, id: `${base.id}#${ev.id}`, name: ev.name, detail: `${base.detail}, when ${name(par.get(ev.id) ?? "")}: ${ev.doc ?? ev.name}`, event: ev.id, kind: "event" });
  };
  const called = new Set<string>();
  for (const e of g.edges) if (e.kind === "call" && code(e.from) && e.from !== e.to) called.add(e.to);
  for (const n of [...g.nodes].sort((a, b) => cmpStr(a.id, b.id))) {
    if (n.kind === "event" && !n.id.includes("=")) {
      const owner = par.get(n.id);
      if (owner && code(owner)) expand({ id: n.id, name: n.name.slice(n.name.lastIndexOf(".") + 1), detail: `${n.name} callback in ${name(owner)}`, handler: owner, region: n.id, kind: "callback" });
    } else if (isCallable(n.kind) && !called.has(n.id)) {
      const evs = eventsOf.get(n.id) ?? [];
      if (!evs.length) add({ id: n.id, name: `${n.name}()`, detail: `${n.name}: nothing in the repo calls it`, handler: n.id, kind: "entry" });
      for (const ev of evs) add({ id: `${n.id}#${ev.id}`, name: ev.name, detail: `${n.name}, when ${ev.doc ?? ev.name}`, handler: n.id, event: ev.id, kind: "event" });
    }
  }
  for (const e of g.edges)
    if (e.kind === "call" && e.label === "callback" && callable(e.to)) expand({ id: `callback:${e.from}:${e.to}`, name: `${name(e.to)}()`, detail: `${name(e.from)} calls ${name(e.to)}`, handler: e.to, kind: "callback" });
  const live = inputs.filter((x) => x.effects.length);
  const dedup = new Map<string, { input: Input; effects: Effect[] }>();
  for (const x of live) if (!dedup.has(x.input.id)) dedup.set(x.input.id, x);
  const alphabet = [...dedup.values()].sort((a, b) => cmpStr(a.input.name, b.input.name) || cmpStr(a.input.id, b.input.id));

  // Regions: locations joined when an effect on one is conditioned on the other.
  const used = new Set<string>();
  const up = new Map<string, string>();
  const find = (x: string): string => (up.get(x) === x ? x : (up.set(x, find(up.get(x)!)), up.get(x)!));
  const union = (a: string, b: string) => up.set(find(a), find(b));
  for (const { effects } of alphabet)
    for (const e of effects) {
      for (const d of [e.dim, ...e.conds.map((c) => c.dim)]) if (!up.has(d)) (up.set(d, d), used.add(d));
      for (const c of e.conds) union(e.dim, c.dim);
    }
  const groups = new Map<string, string[]>();
  for (const d of [...used].sort(cmpStr)) push(groups, find(d), d);
  const regions = [...groups.values()].filter((ds) => alphabet.some((x) => x.effects.some((e) => ds.includes(e.dim))))
    .map((ds) => explore(ds, dims, alphabet))
    .sort((a, b) => cmpStr(a.id, b.id));
  const touched = new Set(regions.flatMap((r) => r.dims));
  return {
    dims: [...dims.values()].filter((d) => touched.has(d.id)).sort((a, b) => cmpStr(a.name, b.name) || cmpStr(a.id, b.id)),
    inputs: alphabet.map((x) => x.input),
    regions,
    quiet: inputs.length - live.length,
  };
}

/** Reachable states of one region from its initial values. */
function explore(ds: string[], dims: Map<string, Dim>, alphabet: { input: Input; effects: Effect[] }[]): Region {
  type Vals = Record<string, string>;
  const key = (v: Vals) => ds.map((d) => v[d]).join("\u0001");
  const evalCond = (v: Vals, c: Cond) => (v[c.dim] === UNKNOWN ? undefined : (v[c.dim] === c.key) === c.eq);
  const mine = alphabet.map(({ input, effects }) => ({ input, effects: effects.filter((e) => ds.includes(e.dim)) })).filter((x) => x.effects.length);

  const step = (v: Vals, effects: Effect[]) => {
    let branches: { v: Vals; may: boolean }[] = [{ v, may: false }];
    for (let i = 0; i < effects.length; ) {
      let j = i;
      while (j < effects.length && effects[j].group === effects[i].group) j++;
      const alts = effects.slice(i, j);
      i = j;
      const next = new Map<string, { v: Vals; may: boolean }>();
      const keep = (b: { v: Vals; may: boolean }) => {
        const k = key(b.v);
        const old = next.get(k);
        next.set(k, { v: b.v, may: (old?.may ?? true) && b.may });
      };
      for (const b of branches) {
        const judged = alts.map((e) => ({ e, rs: e.conds.map((c) => evalCond(b.v, c)) })).filter((x) => !x.rs.includes(false));
        const sure = judged.filter((x) => !x.rs.includes(undefined) && !x.e.may);
        if (!judged.length) keep(b);
        else if (sure.length === 1 && judged.length === 1) keep({ v: { ...b.v, [sure[0].e.dim]: sure[0].e.to }, may: b.may });
        else if (next.size + judged.length + 1 > MAX_BRANCHES) keep({ v: { ...b.v, [alts[0].dim]: UNKNOWN }, may: true });
        else {
          for (const x of judged) keep({ v: { ...b.v, [x.e.dim]: x.e.to }, may: true });
          if (!sure.length) keep({ v: b.v, may: true });
        }
      }
      branches = [...next.values()];
    }
    return branches;
  };

  const init: Vals = Object.fromEntries(ds.map((d) => [d, dims.get(d)!.initial]));
  const seen = new Map<string, Vals>([[key(init), init]]);
  const queue = [init];
  const raw: { from: string; to: string; input: string; may: boolean }[] = [];
  let truncated = false;
  while (queue.length) {
    const v = queue.shift()!;
    for (const { input, effects } of mine) {
      const outs = step(v, effects);
      for (const o of outs) {
        const k = key(o.v);
        if (!seen.has(k)) {
          if (seen.size >= MAX_STATES) { truncated = true; continue; }
          seen.set(k, o.v);
          queue.push(o.v);
        }
        raw.push({ from: key(v), to: k, input: input.id, may: outs.length > 1 });
      }
    }
  }

  const id = (k: string) => `${ds.join("+")}=${ds.map((d) => seen.get(k)![d]).join(",")}`;
  const out: AState[] = [...seen.keys()].map((k) => ({
    id: id(k),
    values: Object.fromEntries(ds.map((d) => [d, [seen.get(k)![d]]])),
    initial: k === key(init),
    loops: [], mayLoops: [],
  })).sort((a, b) => cmpStr(a.id, b.id));
  const byId = new Map(out.map((s) => [s.id, s]));
  const edges = new Map<string, AEdge>();
  for (const r of raw) {
    const from = id(r.from), to = id(r.to);
    if (from === to) {
      const s = byId.get(from)!;
      (r.may ? s.mayLoops : s.loops).push(r.input);
      continue;
    }
    const k = `${from}\0${to}\0${r.may}`;
    const e = edges.get(k) ?? edges.set(k, { from, to, inputs: [], may: r.may }).get(k)!;
    e.inputs.push(r.input);
  }
  for (const s of out) {
    s.loops = [...new Set(s.loops)].sort(cmpStr);
    s.mayLoops = [...new Set(s.mayLoops)].filter((x) => !s.loops.includes(x)).sort(cmpStr);
  }
  for (const e of edges.values()) e.inputs = [...new Set(e.inputs)].sort(cmpStr);
  return { id: ds.join("+"), dims: ds, states: out, edges: [...edges.values()].sort((a, b) => cmpStr(a.from, b.from) || cmpStr(a.to, b.to) || Number(a.may) - Number(b.may)), truncated };
}

/** `Owner.name` when a type or function holds the location. */
function dimName(loc: string, byId: Map<string, GraphNode>, par: Map<string, string>): string {
  const l = byId.get(loc), owner = byId.get(par.get(loc) ?? "");
  const n = l?.name ?? loc;
  return owner && ["type", "function", "method"].includes(owner.kind) ? `${owner.name}.${n}` : n;
}

/** The state of each region that observed location values fall in; for runtime traces. */
export function locate(a: Automaton, values: Record<string, string>): Record<string, string | undefined> {
  return Object.fromEntries(a.regions.map((r) => [r.id, r.states.find((s) => r.dims.every((d) => s.values[d].includes(values[d] ?? UNKNOWN)))?.id]));
}
