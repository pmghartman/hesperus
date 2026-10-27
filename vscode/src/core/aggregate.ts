// Container edges are weighted rollups of leaf edges. Single definition; consumers share it.
import { cmpEdgeKind, cmpStr, EdgeKind, Graph, REPO_ID } from "./ir";

export interface Rollup {
  from: string;
  to: string;
  kind: EdgeKind;
  weight: number;
  resolved: number;
  may: number;
  unresolved: number;
  /** Indices into `Graph.edges`: the edges beneath this rollup. */
  edges: number[];
}

/** View-only layer between a crowded container and its children: dependency tiers among
 *  siblings, from their call and override edges. Not containment; never stored in the graph. */
export interface Group {
  id: string;
  parent: string;
  name: string;
  /** Direct children of `parent` in this group, sorted. */
  members: string[];
  expanded: boolean;
}

/** `nodes` holds graph ids and the ids of visible groups. */
export interface View {
  nodes: string[];
  rollups: Rollup[];
  groups: Group[];
  /** Flow view: boxes left out because nothing flows to or from them. */
  isolated?: number;
}

/** `v` without nodes outside the repo, their group, and the rollups that reach them. */
export function withoutExternal(g: Graph, v: View): View {
  return withoutNodes(v, new Set(g.nodes.filter((n) => n.kind === "external_package" || n.kind === "external").map((n) => n.id)));
}

/** `v` without the `out` nodes, groups made only of them, and the rollups that reach them. */
export function withoutNodes(v: View, out: Set<string>): View {
  out = new Set(out);
  const groups = v.groups.filter((gr) => !gr.members.every((m) => out.has(m)));
  for (const gr of v.groups) if (!groups.includes(gr)) out.add(gr.id);
  return { ...v, nodes: v.nodes.filter((id) => !out.has(id)), rollups: v.rollups.filter((r) => !out.has(r.from) && !out.has(r.to)), groups };
}

/** `v` without unindexed files and the containers left holding only them. */
export function withoutUnindexed(g: Graph, v: View): View {
  const kids = new Map<string, string[]>();
  for (const e of g.edges) if (e.kind === "contains") (kids.get(e.from) ?? kids.set(e.from, []).get(e.from)!).push(e.to);
  const hide = new Set(g.nodes.filter((n) => n.unindexed).map((n) => n.id));
  const seen = new Set<string>();
  const empty = (id: string): boolean => {
    if (hide.has(id)) return true;
    const k = kids.get(id);
    if (!k || seen.has(id)) return false;
    seen.add(id);
    const all = k.every(empty);
    if (all) hide.add(id);
    return all;
  };
  for (const id of kids.keys()) empty(id);
  const groups = v.groups.filter((gr) => !gr.members.every((m) => hide.has(m)));
  for (const gr of v.groups) if (!groups.includes(gr)) hide.add(gr.id);
  return { ...v, nodes: v.nodes.filter((id) => !hide.has(id)), rollups: v.rollups.filter((r) => !hide.has(r.from) && !hide.has(r.to)), groups };
}

/** A state machine: a field or variable with `state` children. */
export interface Machine { id: string; name: string; states: number; transitions: number }

/** Every location with states, named `Owner.name` when a type or function holds it; sorted by
 *  name, then id. */
export function machines(g: Graph): Machine[] {
  const par = parents(g);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out = new Map<string, Machine>();
  for (const n of g.nodes) {
    if (n.kind !== "state") continue;
    const loc = par.get(n.id);
    const l = loc === undefined ? undefined : byId.get(loc);
    if (!l) continue;
    const owner = byId.get(par.get(l.id) ?? "");
    const m = out.get(l.id) ?? out.set(l.id, { id: l.id, name: owner && ["type", "function", "method"].includes(owner.kind) ? `${owner.name}.${l.name}` : l.name, states: 0, transitions: 0 }).get(l.id)!;
    m.states++;
  }
  for (const e of g.edges) if (e.kind === "transition") { const m = out.get(par.get(e.from) ?? ""); if (m) m.transitions++; }
  return [...out.values()].sort((a, b) => cmpStr(a.name, b.name) || cmpStr(a.id, b.id));
}

/** A container shows tiers once it has more children than this. */
export const GROUP_OVER = 12;
export const isGroup = (id: string) => id.startsWith("tier:");

/** Child to parent along `contains` edges. */
export function parents(g: Graph): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of g.edges) if (e.kind === "contains") m.set(e.to, e.from);
  return m;
}

/** Kinds that are code organisation rather than logic. */
const STRUCTURE = new Set(["directory", "package", "file"]);

export interface ViewOptions {
  /** Draw files. Off by default: the logic view keeps packages and directories as boundaries
   *  and shows the types and functions in them directly. */
  files?: boolean;
  /** Stage flow: directories, packages and files are units, drawn flat and never as boundaries; opening
   *  one replaces it with what it holds. Tiers and unconnected boxes are left out, so the picture is
   *  what calls what, entries first. Language-free: it reads only containment and call edges. */
  flow?: boolean;
}

/** Flow view: a structure node is drawn only while shut. Open ones, and ones that are their parent's
 *  only child, dissolve into their children. */
function flowThrough(g: Graph, par: Map<string, string>, expanded: ReadonlySet<string>): (id: string) => boolean {
  const kind = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const kids = new Map<string, number>();
  for (const e of g.edges) if (e.kind === "contains") kids.set(e.from, (kids.get(e.from) ?? 0) + 1);
  return (id) => {
    const p = par.get(id);
    if (!STRUCTURE.has(kind.get(id) ?? "") || !kids.get(id) || p === undefined) return false;
    return expanded.has(id) || kids.get(p) === 1;
  };
}

/** Nodes views pass through: never drawn, opened with their parent. Files (unless asked for),
 *  and structure that is its parent's only child (a module's one file), which adds a level and
 *  no grouping. Top-level nodes are always drawn, so every edge has a box to land on. */
export function passThrough(g: Graph, par: Map<string, string> = parents(g), opts: ViewOptions = {}): (id: string) => boolean {
  const kind = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const kids = new Map<string, number>();
  for (const e of g.edges) if (e.kind === "contains") kids.set(e.from, (kids.get(e.from) ?? 0) + 1);
  return (id) => {
    const k = kind.get(id) ?? "";
    const p = par.get(id);
    if (!STRUCTURE.has(k) || !kids.get(id) || p === undefined || p === REPO_ID) return false;
    return (k === "file" && !opts.files) || kids.get(p) === 1;
  };
}

/** Visible nodes and rollups when `expanded` containers show their children.
 *  The repo root is always expanded. */
export function view(g: Graph, expanded: ReadonlySet<string>, opts: ViewOptions = {}): View {
  return build(g, expanded, opts).view;
}

/** `view`, plus every box it could draw before the flow view leaves out the unconnected ones. */
function build(g: Graph, expanded: ReadonlySet<string>, opts: ViewOptions): { view: View; all: string[] } {
  const par = parents(g);
  const through = opts.flow ? flowThrough(g, par, expanded) : passThrough(g, par, opts);
  const memo = new Map<string, string>();
  const rep = (id: string): string => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const chain = [id];
    for (let p = par.get(id); p !== undefined; p = par.get(p)) {
      chain.push(p);
      if (chain.length > par.size + 1) break; // containment cycle guard
    }
    chain.reverse(); // root first
    let cur = chain[0];
    for (const x of chain.slice(1)) {
      if (cur === REPO_ID || expanded.has(cur) || through(cur)) cur = x;
      else break;
    }
    // A passed-through node's own edges (module-level code) belong to its drawn parent.
    while (cur !== REPO_ID && through(cur)) cur = par.get(cur) ?? REPO_ID;
    memo.set(id, cur);
    return cur;
  };
  const groups = opts.flow ? [] : tiers(g, par, rep, expanded, through);
  const tierOf = new Map<string, Group>();
  for (const gr of groups) for (const m of gr.members) tierOf.set(m, gr);
  // A collapsed tier stands for everything beneath its members; the outermost one wins.
  const memo2 = new Map<string, string>();
  const rep2 = (id: string): string => {
    const r = rep(id);
    const hit = memo2.get(r);
    if (hit !== undefined) return hit;
    let out = r;
    for (let x: string | undefined = r; x !== undefined && x !== REPO_ID; x = par.get(x)) {
      const t = tierOf.get(x);
      if (t && !t.expanded) out = t.id;
    }
    memo2.set(r, out);
    return out;
  };
  const visible = new Set(g.nodes.filter((n) => n.id !== REPO_ID && rep(n.id) === n.id && !through(n.id)).map((n) => n.id));
  const drawn = (c: string) => c === REPO_ID || (visible.has(c) && rep2(c) === c);
  const live = groups.filter((gr) => drawn(gr.parent));
  const shown = new Set<string>();
  for (const id of visible) shown.add(rep2(id));
  for (const gr of live) if (gr.expanded) shown.add(gr.id);
  const nodes = [...shown].sort(cmpStr);
  const acc = new Map<string, Rollup>();
  g.edges.forEach((e, i) => {
    if (e.kind === "contains") return;
    const a = rep2(e.from), b = rep2(e.to);
    // The repo root is never drawn; an edge that lifts to it has no box to land on.
    if (a === b || a === REPO_ID || b === REPO_ID) return;
    const k = `${a}\0${b}\0${e.kind}`;
    let r = acc.get(k);
    if (!r) acc.set(k, (r = { from: a, to: b, kind: e.kind, weight: 0, resolved: 0, may: 0, unresolved: 0, edges: [] }));
    r.weight++;
    r[e.provenance]++;
    r.edges.push(i);
  });
  const rollups = [...acc.values()].sort((x, y) => cmpStr(x.from, y.from) || cmpStr(x.to, y.to) || cmpEdgeKind(x.kind, y.kind));
  if (!opts.flow) return { view: { nodes, rollups, groups: live }, all: nodes };
  // A box nothing flows to or from says nothing about what the program does; its ancestors stay if a
  // linked box sits inside.
  const keep = new Set<string>();
  for (const r of rollups) for (const id of [r.from, r.to]) for (let x: string | undefined = id; x !== undefined && !keep.has(x); x = par.get(x)) keep.add(x);
  const linked = nodes.filter((id) => keep.has(id));
  // Nothing linked at this depth (top-level folders that never call each other): draw them all, not nothing.
  if (!linked.length) return { view: { nodes, rollups, groups: live, isolated: 0 }, all: nodes };
  return { view: { nodes: linked, rollups, groups: live, isolated: nodes.length - linked.length }, all: nodes };
}

/** The first view opens down to logic instead of showing one box per top-level folder. */
export const OVERVIEW_NODES = 60;

/** Containers to open for the first view: whole levels at a time, so every part of the repo is
 *  shown to the same depth, while the view stays within `budget` nodes. Outside packages stay shut. */
export function overview(g: Graph, budget = OVERVIEW_NODES, opts: ViewOptions = {}): Set<string> {
  const hasKids = new Set(g.edges.filter((e) => e.kind === "contains").map((e) => e.from));
  // Boundaries stay shut too: the first view shows that the repo reaches a database, not every query.
  const outside = new Set(g.nodes.filter((n) => n.kind === "external_package" || n.kind === "external" || n.kind === "boundary").map((n) => n.id));
  // Levels open by every box, drawn or not: in the flow view a folder with no calls across it still
  // holds the logic, and judging by the drawn boxes alone would never open it.
  let open = new Set<string>(), v = build(g, open, opts);
  for (;;) {
    const level = v.all.filter((id) => !open.has(id) && !outside.has(id) && (hasKids.has(id) || v.view.groups.some((gr) => gr.id === id && !gr.members.every((m) => outside.has(m)))));
    if (!level.length) return open;
    const next = new Set([...open, ...level]);
    const nv = build(g, next, opts);
    if (nv.view.nodes.length > budget) return open;
    [open, v] = [next, nv];
  }
}

/** Tiers for every expanded, visible container with more than GROUP_OVER children.
 *  Tier n holds siblings whose longest chain of in-container callers is n; cycles share a
 *  tier. Siblings with no edges to each other form their own group; external packages too. */
function tiers(g: Graph, par: Map<string, string>, rep: (id: string) => string, expanded: ReadonlySet<string>, through: (id: string) => boolean): Group[] {
  // Children as drawn: a passed-through node's children belong to its nearest drawn ancestor.
  const drawnParent = (id: string) => {
    let p = par.get(id);
    while (p !== undefined && p !== REPO_ID && through(p)) p = par.get(p);
    return p;
  };
  const kids = new Map<string, string[]>();
  for (const n of g.nodes) {
    const p = through(n.id) ? undefined : drawnParent(n.id);
    if (p !== undefined) (kids.get(p) ?? kids.set(p, []).get(p)!).push(n.id);
  }
  const kindOf = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const out: Group[] = [];
  for (const c of [...kids.keys()].sort(cmpStr)) {
    const ch = kids.get(c)!.sort(cmpStr);
    if (ch.length <= GROUP_OVER) continue;
    if (c !== REPO_ID && (!expanded.has(c) || rep(c) !== c)) continue;
    // A location's children are its states; transitions, not calls, connect them.
    if (kindOf.get(c) === "field" || kindOf.get(c) === "variable") continue;
    const away = (id: string) => kindOf.get(id) === "external_package" || kindOf.get(id) === "boundary";
    const ext = ch.filter(away);
    const own = ch.filter((id) => !away(id));
    const mk = (key: string, name: string, members: string[]) => {
      const id = `tier:${c}#${key}`;
      out.push({ id, parent: c, name, members, expanded: expanded.has(id) });
    };
    if (ext.length > 1) mk("ext", `external · ${ext.length}`, ext);
    if (own.length <= GROUP_OVER) continue;
    // Each edge, lifted to the pair of children of c it runs between.
    const childOf = new Map<string, string | null>();
    const lift = (id: string): string | null => {
      const hit = childOf.get(id);
      if (hit !== undefined) return hit;
      const p = drawnParent(id);
      const r = p === undefined ? null : p === c ? id : lift(p);
      childOf.set(id, r);
      return r;
    };
    const ownSet = new Set(own);
    const adj = new Map<string, Set<string>>(own.map((id) => [id, new Set()]));
    for (const e of g.edges) {
      // Dispatch guesses run against the dependency direction and would merge every tier.
      if ((e.kind !== "call" && e.kind !== "override") || e.provenance !== "resolved") continue;
      const a = lift(e.from), b = lift(e.to);
      if (a && b && a !== b && ownSet.has(a) && ownSet.has(b)) adj.get(a)!.add(b);
    }
    const level = layers(own, adj);
    const linked = new Set<string>();
    for (const [a, bs] of adj) if (bs.size) { linked.add(a); for (const b of bs) linked.add(b); }
    const byLevel = new Map<number, string[]>();
    for (const id of own) if (linked.has(id)) (byLevel.get(level.get(id)!) ?? byLevel.set(level.get(id)!, []).get(level.get(id)!)!).push(id);
    const lv = [...byLevel.keys()].sort((a, b) => a - b);
    lv.forEach((l, i) => {
      const role = i === 0 ? " · callers" : i === lv.length - 1 ? " · callees" : "";
      mk(String(i + 1).padStart(3, "0"), `layer ${i + 1}${role}`, byLevel.get(l)!);
    });
    const alone = own.filter((id) => !linked.has(id));
    if (alone.length) mk("solo", "unconnected", alone);
  }
  return out;
}

/** Longest-path level from the sources of the SCC condensation; iterative Tarjan. */
function layers(ids: string[], adj: Map<string, Set<string>>): Map<string, number> {
  const succ = (id: string) => [...adj.get(id)!].sort(cmpStr);
  const index = new Map<string, number>(), low = new Map<string, number>(), comp = new Map<string, number>();
  const stack: string[] = [], on = new Set<string>();
  let next = 0, ncomp = 0;
  for (const root of ids) {
    if (index.has(root)) continue;
    const work: [string, string[], number][] = [[root, succ(root), 0]];
    index.set(root, next); low.set(root, next); next++; stack.push(root); on.add(root);
    while (work.length) {
      const top = work[work.length - 1];
      const [v, ss] = top;
      if (top[2] < ss.length) {
        const w = ss[top[2]++];
        if (!index.has(w)) {
          index.set(w, next); low.set(w, next); next++; stack.push(w); on.add(w);
          work.push([w, succ(w), 0]);
        } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
        continue;
      }
      work.pop();
      if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u)!, low.get(v)!)); }
      if (low.get(v) === index.get(v)) {
        let w: string;
        do { w = stack.pop()!; on.delete(w); comp.set(w, ncomp); } while (w !== v);
        ncomp++;
      }
    }
  }
  // Tarjan emits components in reverse topological order: callees first.
  const preds = new Map<number, Set<number>>();
  for (const [a, bs] of adj) for (const b of bs) {
    const ca = comp.get(a)!, cb = comp.get(b)!;
    if (ca !== cb) (preds.get(cb) ?? preds.set(cb, new Set()).get(cb)!).add(ca);
  }
  const lvl = new Array<number>(ncomp).fill(0);
  for (let c = ncomp - 1; c >= 0; c--) for (const p of preds.get(c) ?? []) lvl[c] = Math.max(lvl[c], lvl[p] + 1);
  return new Map(ids.map((id) => [id, lvl[comp.get(id)!]]));
}
