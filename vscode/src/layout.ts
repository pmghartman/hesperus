import ELK from "elkjs/lib/elk.bundled.js";
import { Graph, GraphNode, Rollup, View } from "./graph";

export interface Box { id: string; x: number; y: number; w: number; h: number; node: GraphNode; container: boolean }
export interface Wire { rollup: Rollup; points: { x: number; y: number }[] }
export interface Layout { width: number; height: number; boxes: Box[]; wires: Wire[] }

const LEAF = { w: 160, h: 36 };

interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  edges?: unknown[];
  layoutOptions?: Record<string, string>;
}

// Positions come from ELK only; inputs are sorted and the seed is fixed so equal input
// gives equal output.
export async function layout(graph: Graph, view: View): Promise<Layout> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parent = new Map<string, string>();
  for (const e of graph.edges) if (e.kind === "contains") parent.set(e.to, e.from);
  const visible = new Set(view.nodes);
  const kids = new Map<string, string[]>();
  const roots: string[] = [];
  for (const id of [...view.nodes].sort()) {
    const p = parent.get(id);
    if (p && visible.has(p)) {
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p)!.push(id);
    } else roots.push(id);
  }
  const mk = (id: string): ElkNode => {
    const ch = kids.get(id);
    const n: ElkNode = { id, width: LEAF.w, height: LEAF.h };
    if (ch) {
      n.children = ch.map(mk);
      n.layoutOptions = { "elk.padding": "[top=28,left=12,bottom=12,right=12]" };
      delete n.width;
      delete n.height;
    }
    return n;
  };
  const rollups = [...view.rollups].sort((a, b) =>
    (a.from + "\0" + a.to + "\0" + a.kind).localeCompare(b.from + "\0" + b.to + "\0" + b.kind));
  const root: ElkNode = {
    id: "root",
    children: roots.map(mk),
    edges: rollups.map((r, i) => ({ id: `e${i}`, sources: [r.from], targets: [r.to] })),
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.randomSeed": "1",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": "24",
      "elk.layered.spacing.nodeNodeBetweenLayers": "48",
    },
  };
  const out = (await new ELK().layout(root as never)) as ElkNode & { width: number; height: number };
  const boxes: Box[] = [];
  const walk = (n: ElkNode, ox: number, oy: number) => {
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0), y = oy + (c.y ?? 0);
      const node = byId.get(c.id);
      if (node) boxes.push({ id: c.id, x, y, w: c.width ?? 0, h: c.height ?? 0, node, container: !!c.children });
      walk(c, x, y);
    }
  };
  walk(out, 0, 0);
  const pos = new Map(boxes.map((b) => [b.id, b]));
  // Straight centre-to-centre wires: robust across hierarchy levels, still deterministic.
  const wires: Wire[] = rollups.flatMap((r) => {
    const a = pos.get(r.from), b = pos.get(r.to);
    if (!a || !b) return [];
    return [{ rollup: r, points: [{ x: a.x + a.w, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 }] }];
  });
  boxes.sort((a, b) => a.id.localeCompare(b.id));
  return { width: out.width ?? 0, height: out.height ?? 0, boxes, wires };
}
