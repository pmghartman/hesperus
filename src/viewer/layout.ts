// Deterministic layered layout for one zoom level. Columns are longest-path ranks over
// the visible edges (cycles broken in sorted order); rows are sorted by kind and name.
// Outside nodes sit in a column of their own on the right.

import { cmp, VEdge, VNode, View } from "./model.js";

export const NODE_W = 208;
export const NODE_H = 60;
export const GAP_X = 84;
export const GAP_Y = 28;
export const PAD = 24;

export interface Placed {
  node: VNode;
  x: number;
  y: number;
  w: number;
  h: number;
  outside: boolean;
}

export interface Layout {
  width: number;
  height: number;
  nodes: Placed[];
  edges: { edge: VEdge; points: [number, number][] }[];
}

export function layout(view: View): Layout {
  const ids = view.nodes.map((n) => n.id);
  const idSet = new Set(ids);
  // ranks by longest path, back edges (in sorted DFS order) ignored
  const succ = new Map<string, string[]>();
  for (const id of ids) succ.set(id, []);
  const inner = view.edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));
  for (const e of inner.sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to))) succ.get(e.from)!.push(e.to);
  const state = new Map<string, number>(); // 1 visiting, 2 done
  const back = new Set<string>();
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of succ.get(u)!) {
      const s = state.get(v);
      if (s === 1) back.add(`${u}\u0000${v}`);
      else if (!s) visit(v);
    }
    state.set(u, 2);
  };
  for (const id of ids) if (!state.get(id)) visit(id);
  const rank = new Map<string, number>();
  const indeg = new Map<string, number>(ids.map((i) => [i, 0]));
  for (const u of ids) for (const v of succ.get(u)!) if (!back.has(`${u}\u0000${v}`)) indeg.set(v, indeg.get(v)! + 1);
  const queue = ids.filter((i) => indeg.get(i) === 0);
  for (const id of ids) rank.set(id, 0);
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of succ.get(u)!) {
      if (back.has(`${u}\u0000${v}`)) continue;
      rank.set(v, Math.max(rank.get(v)!, rank.get(u)! + 1));
      indeg.set(v, indeg.get(v)! - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }
  const columns = new Map<number, VNode[]>();
  for (const n of view.nodes) {
    const r = rank.get(n.id)!;
    if (!columns.has(r)) columns.set(r, []);
    columns.get(r)!.push(n);
  }
  const placed: Placed[] = [];
  const pos = new Map<string, Placed>();
  const ranks = [...columns.keys()].sort((a, b) => a - b);
  let maxRows = 0;
  for (const r of ranks) {
    const col = columns.get(r)!; // already in kind/name order from the view
    maxRows = Math.max(maxRows, col.length);
    col.forEach((n, i) => {
      const p = { node: n, x: PAD + r * (NODE_W + GAP_X), y: PAD + i * (NODE_H + GAP_Y), w: NODE_W, h: NODE_H, outside: false };
      placed.push(p);
      pos.set(n.id, p);
    });
  }
  const outsideX = PAD + ranks.length * (NODE_W + GAP_X) + (view.outside.length ? GAP_X : 0);
  view.outside.forEach((n, i) => {
    const p = { node: n, x: outsideX, y: PAD + i * (NODE_H + GAP_Y), w: NODE_W, h: NODE_H, outside: true };
    placed.push(p);
    pos.set(n.id, p);
  });
  maxRows = Math.max(maxRows, view.outside.length);
  const width = (view.outside.length ? outsideX + NODE_W : PAD + ranks.length * (NODE_W + GAP_X) - GAP_X) + PAD;
  const height = PAD + Math.max(maxRows, 1) * (NODE_H + GAP_Y) - GAP_Y + PAD;
  // edges between the same pair of boxes (either direction) fan out vertically
  const visible = view.edges.filter((e) => pos.has(e.from) && pos.has(e.to));
  const pairKey = (e: VEdge) => [e.from, e.to].sort().join("\u0000");
  const groups = new Map<string, number>();
  for (const e of visible) groups.set(pairKey(e), (groups.get(pairKey(e)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const edges = visible.map((e) => {
    const a = pos.get(e.from)!;
    const b = pos.get(e.to)!;
    const k = pairKey(e);
    const n = groups.get(k)!;
    const i = seen.get(k) ?? 0;
    seen.set(k, i + 1);
    const dy = (i - (n - 1) / 2) * 14;
    const forward = a.x < b.x;
    const sameCol = a.x === b.x;
    const ay = a.y + a.h / 2 + dy;
    const by = b.y + b.h / 2 + dy;
    const start: [number, number] = sameCol ? [a.x + a.w, ay] : forward ? [a.x + a.w, ay] : [a.x, ay];
    const end: [number, number] = sameCol ? [b.x + b.w, by] : forward ? [b.x, by] : [b.x + b.w, by];
    if (sameCol) {
      const bulge = GAP_X / 2 + 8 + i * 8;
      return { edge: e, points: [start, [start[0] + bulge, start[1]], [end[0] + bulge, end[1]], end] as [number, number][] };
    }
    const midX = (start[0] + end[0]) / 2 + (i - (n - 1) / 2) * 12;
    return { edge: e, points: [start, [midX, start[1]], [midX, end[1]], end] as [number, number][] };
  });
  return { width, height, nodes: placed, edges };
}
