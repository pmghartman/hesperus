// Deterministic layered layout for one zoom level. Ranks are longest-path distances over
// the visible edges (cycles broken in sorted order); a rank's nodes stack vertically in
// kind-then-name order. Consecutive ranks fold into one column when that lets the whole
// picture show larger in the viewport, so a long chain becomes a grid instead of a strip.
// Outside nodes sit in columns of their own on the right.

import { cmp, VEdge, VNode, View } from "./model.js";

export const NODE_W = 208;
export const NODE_H = 60;
export const GAP_X = 84;
export const GAP_Y = 40;
export const PAD = 24;
/** The zoom `fit` never exceeds; past it, a wider layout is as good as a taller one. */
export const MAX_FIT_ZOOM = 1.25;

export interface LayoutOptions {
  /** The viewport the layout should fill, in CSS pixels. Defaults to a large screen, so small graphs never fold. */
  viewport?: { width: number; height: number };
  /** `false` keeps one column per rank (a pipeline reads left to right); default folds ranks to fit the viewport. */
  fold?: boolean;
}

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

const CELL_W = NODE_W + GAP_X;
const CELL_H = NODE_H + GAP_Y;

export function layout(view: View, opts: LayoutOptions = {}): Layout {
  const viewport = opts.viewport ?? { width: 1600, height: 900 };
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
  const byRank = new Map<number, VNode[]>();
  for (const n of view.nodes) {
    const r = rank.get(n.id)!;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(n); // already in kind/name order from the view
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b).map((r) => byRank.get(r)!);

  // Fold consecutive ranks into columns under a row budget; pick the budget that shows
  // the graph largest, preferring fewer rows (wider) on ties.
  const total = view.nodes.length + view.outside.length;
  const minRows = Math.max(1, ...ranks.map((c) => c.length));
  let best: { columns: VNode[][]; outside: VNode[][]; width: number; height: number; zoom: number } | null = null;
  for (let budget = minRows; budget <= Math.max(minRows, total); budget++) {
    const columns = opts.fold === false ? ranks.map((r) => [...r]) : fold(ranks, budget);
    const outside = chunk(view.outside, budget);
    const rows = Math.max(1, ...columns.map((c) => c.length), ...outside.map((c) => c.length));
    const width = Math.max(PAD * 2, PAD * 2 + (columns.length + outside.length) * CELL_W - GAP_X + (outside.length ? GAP_X : 0));
    const height = PAD * 2 + rows * CELL_H - GAP_Y;
    const zoom = Math.min(MAX_FIT_ZOOM, (viewport.width - 2 * PAD) / width, (viewport.height - 2 * PAD) / height);
    if (!best || zoom > best.zoom + 1e-9) best = { columns, outside, width, height, zoom };
    if ((columns.length === 1 || opts.fold === false) && outside.length <= 1) break;
  }
  const { columns, outside, width, height } = best!;

  const placed: Placed[] = [];
  const pos = new Map<string, Placed>();
  const row = new Map<string, number>();
  const column = new Map<string, number>();
  columns.forEach((col, c) =>
    col.forEach((n, i) => {
      const p = { node: n, x: PAD + c * CELL_W, y: PAD + i * CELL_H, w: NODE_W, h: NODE_H, outside: false };
      placed.push(p);
      pos.set(n.id, p);
      row.set(n.id, i);
      column.set(n.id, c);
    }),
  );
  const outsideX = PAD + columns.length * CELL_W + GAP_X;
  outside.forEach((col, c) =>
    col.forEach((n, i) => {
      const p = { node: n, x: outsideX + c * CELL_W, y: PAD + i * CELL_H, w: NODE_W, h: NODE_H, outside: true };
      placed.push(p);
      pos.set(n.id, p);
      row.set(n.id, i);
      column.set(n.id, columns.length + c);
    }),
  );

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
    if (sameCol && Math.abs(row.get(e.from)! - row.get(e.to)!) === 1) {
      // neighbours in a column: a straight vertical arrow between them
      const down = a.y < b.y;
      const x = a.x + a.w / 2 + dy;
      const start: [number, number] = [x, down ? a.y + a.h : a.y];
      const end: [number, number] = [x, down ? b.y : b.y + b.h];
      // a zero-length middle segment carries the label, fanned along the edge so labels do not overlap
      const midY = (start[1] + end[1]) / 2 + (i - (n - 1) / 2) * 16;
      return { edge: e, points: [start, [x, midY], [x, midY], end] as [number, number][] };
    }
    const ay = a.y + a.h / 2 + dy;
    const by = b.y + b.h / 2 + dy;
    const start: [number, number] = sameCol ? [a.x + a.w, ay] : forward ? [a.x + a.w, ay] : [a.x, ay];
    const end: [number, number] = sameCol ? [b.x + b.w, by] : forward ? [b.x, by] : [b.x + b.w, by];
    if (sameCol) {
      // a loop out to the right; edges spanning more rows swing further so they do not overlap
      const span = Math.abs(row.get(e.from)! - row.get(e.to)!);
      const bulge = Math.min(GAP_X - 10, GAP_X / 2 + 8 + i * 8 + (span - 1) * 6);
      return { edge: e, points: [start, [start[0] + bulge, start[1]], [end[0] + bulge, end[1]], end] as [number, number][] };
    }
    const midX = (start[0] + end[0]) / 2 + (i - (n - 1) / 2) * 12;
    return { edge: e, points: [start, [midX, start[1]], [midX, end[1]], end] as [number, number][] };
  });
  return { width, height, nodes: placed, edges };
}

/** Consecutive ranks merged into one column while it stays within `budget` rows; a rank taller than the budget stands alone. */
function fold(ranks: VNode[][], budget: number): VNode[][] {
  const columns: VNode[][] = [];
  for (const r of ranks) {
    const last = columns[columns.length - 1];
    if (last && last.length + r.length <= budget) last.push(...r);
    else columns.push([...r]);
  }
  return columns;
}

function chunk(nodes: VNode[], size: number): VNode[][] {
  const out: VNode[][] = [];
  for (let i = 0; i < nodes.length; i += size) out.push(nodes.slice(i, i + size));
  return out;
}
