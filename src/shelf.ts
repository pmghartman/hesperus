// The boundary picture laid out for a tall narrow pane, in character cells: layers top to bottom (entries
// first, boundaries last), each layer's boxes wrapped into rows no wider than the pane, and the same
// again inside every open box. ELK's layered layout sets every entry side by side and separate components
// beside each other, which runs hundreds of columns wide; this trades its wire routing for a picture a
// pane sixty columns wide can hold. Wires are routed by whatever draws the picture.
import { Box, Layout } from "./layout";
import { cmpStr } from "./core/ir";

export interface CellRect { x: number; y: number; w: number; h: number }
export interface Shelf { rects: Map<string, CellRect>; width: number; height: number }

/** Boxes outside the repo go in the last layer. */
const SINK = new Set(["boundary", "external", "external_package"]);
/** Between boxes in a row; between rows of one layer; between layers (room for a wire's bend). */
const GAP_X = 2, GAP_ROW = 1, GAP_LAYER = 2;
/** Inside an open box: the border and a space either side, the border and the title above. */
const INSET_X = 2, INSET_TOP = 2, INSET_BOTTOM = 1;
const MIN_W = 6;

/** A leaf's size: a bar, a chevron when it opens, a mark when flagged, the name, a space; a line of
 *  notes below when flagged. */
function leafSize(b: Box, max: number): { w: number; h: number } {
  const w = 1 + (b.expandable ? 2 : 0) + (b.flag ? 2 : 0) + b.node.name.length + 1;
  return { w: Math.max(MIN_W, Math.min(max, w)), h: b.flag ? 2 : 1 };
}

export function shelf(laid: Layout, columns: number): Shelf {
  const byId = new Map(laid.boxes.map((b) => [b.id, b]));
  const kids = new Map<string | undefined, Box[]>();
  for (const b of laid.boxes) (kids.get(b.parent) ?? kids.set(b.parent, []).get(b.parent)!).push(b);
  // The child of `p` an id sits in, or undefined when it is not inside `p`.
  const lift = (id: string, p: string | undefined): string | undefined => {
    for (let x: string | undefined = id; x !== undefined; x = byId.get(x)?.parent) if (byId.get(x)?.parent === p) return x;
    return undefined;
  };
  const rects = new Map<string, CellRect>();

  // Lays out the children of `p` in `width` columns; returns the extent. Positions are local to `p`'s inside.
  const lay = (p: string | undefined, width: number): { w: number; h: number } => {
    const children = [...(kids.get(p) ?? [])].sort((a, b) => cmpStr(a.id, b.id));
    if (!children.length) return { w: 0, h: 0 };
    const inner = Math.max(MIN_W, width);
    // Each child's size: a leaf's from its name, an open box's from what is inside it.
    const size = new Map<string, { w: number; h: number }>();
    for (const c of children) {
      if (c.container) {
        const s = lay(c.id, inner - 2 * INSET_X);
        const title = 2 + (c.flag ? 2 : 0) + c.node.name.length + 2;
        size.set(c.id, { w: Math.min(inner, Math.max(MIN_W, s.w + 2 * INSET_X, title)), h: s.h + INSET_TOP + INSET_BOTTOM });
      } else size.set(c.id, leafSize(c, inner));
    }
    // Layers: the longest path over the wires between the children, back edges dropped; boxes outside the
    // repo last; boxes no wire touches before them.
    const ids = children.map((c) => c.id);
    const out = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
    const touched = new Set<string>();
    for (const w of laid.wires) {
      const a = lift(w.from, p), b = lift(w.to, p);
      if (a === undefined || b === undefined || a === b) continue;
      out.get(a)!.add(b);
      touched.add(a);
      touched.add(b);
    }
    const sink = (id: string) => SINK.has(byId.get(id)!.node.kind);
    const layer = new Map<string, number>();
    const onStack = new Set<string>();
    const visit = (id: string): number => {
      if (layer.has(id)) return layer.get(id)!;
      onStack.add(id);
      let depth = 0;
      for (const to of [...out.get(id)!].sort(cmpStr)) if (!onStack.has(to) && !sink(to)) depth = Math.max(depth, visit(to) + 1);
      onStack.delete(id);
      layer.set(id, depth);
      return depth;
    };
    for (const id of ids) if (!sink(id)) visit(id);
    // `visit` counts the longest path below a box; flip it so entries are on top.
    const deepest = Math.max(0, ...[...layer.values()]);
    const row = (id: string) => {
      if (sink(id)) return deepest + 2;
      if (!touched.has(id)) return deepest + 1;
      return deepest - layer.get(id)!;
    };
    const layers = new Map<number, string[]>();
    for (const id of ids) (layers.get(row(id)) ?? layers.set(row(id), []).get(row(id))!).push(id);
    // Rows of each layer in turn, each box after its predecessors' average column, then by id.
    const local = new Map<string, CellRect>();
    const into = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
    for (const [a, bs] of out) for (const b of bs) into.get(b)!.add(a);
    let y = 0, w = 0;
    for (const key of [...layers.keys()].sort((a, b) => a - b)) {
      const order = layers.get(key)!;
      const mid = (id: string) => {
        const xs = [...into.get(id)!].map((a) => local.get(a)).filter((r): r is CellRect => !!r).map((r) => r.x + r.w / 2);
        return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : Infinity;
      };
      const keyed = order.map((id) => ({ id, mid: mid(id) })).sort((a, b) => a.mid - b.mid || cmpStr(a.id, b.id));
      if (y > 0) y += GAP_LAYER;
      let x = 0, rowH = 0;
      for (const { id } of keyed) {
        const s = size.get(id)!;
        if (x > 0 && x + s.w > inner) {
          x = 0;
          y += rowH + GAP_ROW;
          rowH = 0;
        }
        local.set(id, { x, y, w: s.w, h: s.h });
        x += s.w + GAP_X;
        rowH = Math.max(rowH, s.h);
        w = Math.max(w, x - GAP_X);
      }
      y += rowH;
    }
    for (const [id, r] of local) rects.set(id, r);
    return { w, h: y };
  };
  const top = lay(undefined, columns);
  // Local positions to absolute ones, each box once its parent is placed.
  const done = new Set<string>();
  const place = (id: string) => {
    if (done.has(id)) return;
    const b = byId.get(id)!;
    if (b.parent !== undefined) place(b.parent);
    if (b.parent !== undefined) {
      const r = rects.get(id)!, pr = rects.get(b.parent)!;
      rects.set(id, { x: pr.x + INSET_X + r.x, y: pr.y + INSET_TOP + r.y, w: r.w, h: r.h });
    }
    done.add(id);
  };
  for (const b of laid.boxes) place(b.id);
  return { rects, width: top.w, height: top.h };
}
