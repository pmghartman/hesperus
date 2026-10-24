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

export interface View { nodes: string[]; rollups: Rollup[] }

/** Child to parent along `contains` edges. */
export function parents(g: Graph): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of g.edges) if (e.kind === "contains") m.set(e.to, e.from);
  return m;
}

/** Visible nodes and rollups when `expanded` containers show their children.
 *  The repo root is always expanded. */
export function view(g: Graph, expanded: ReadonlySet<string>): View {
  const par = parents(g);
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
      if (cur === REPO_ID || expanded.has(cur)) cur = x;
      else break;
    }
    memo.set(id, cur);
    return cur;
  };
  const nodes = g.nodes.filter((n) => n.id !== REPO_ID && rep(n.id) === n.id).map((n) => n.id);
  const acc = new Map<string, Rollup>();
  g.edges.forEach((e, i) => {
    if (e.kind === "contains") return;
    const a = rep(e.from), b = rep(e.to);
    if (a === b) return;
    const k = `${a}\0${b}\0${e.kind}`;
    let r = acc.get(k);
    if (!r) acc.set(k, (r = { from: a, to: b, kind: e.kind, weight: 0, resolved: 0, may: 0, unresolved: 0, edges: [] }));
    r.weight++;
    r[e.provenance]++;
    r.edges.push(i);
  });
  const rollups = [...acc.values()].sort((x, y) => cmpStr(x.from, y.from) || cmpStr(x.to, y.to) || cmpEdgeKind(x.kind, y.kind));
  return { nodes, rollups };
}
