import ELK from "elkjs/lib/elk.bundled.js";
import { Graph, GraphNode, Rollup, View } from "./graph";

export interface Box { id: string; x: number; y: number; w: number; h: number; node: GraphNode; container: boolean; expandable: boolean }
/** All rollups between one ordered pair of nodes share a wire; kinds stay listed for filtering. */
/** `points` is start, cubic Bézier control triples, end (ELK spline sections). */
export interface Wire { from: string; to: string; rollups: Rollup[]; points: { x: number; y: number }[] }
export interface Layout { width: number; height: number; boxes: Box[]; wires: Wire[] }

// Sizes come from character counts, not measured text, so layout never depends on fonts.
const CHAR = 7.4, PAD = 28, MIN_W = 120, MAX_W = 300, LEAF_H = 44;
export const MAX_CHARS = Math.floor((MAX_W - PAD) / CHAR);

interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
  layoutOptions?: Record<string, string>;
}
interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: { x: number; y: number }[] }[];
}

const width = (n: GraphNode) => Math.min(MAX_W, Math.max(MIN_W, Math.ceil(Math.max(n.name.length, n.kind.length + 2) * CHAR) + PAD));

// Positions come from ELK only; inputs are sorted and the seed is fixed so equal input
// gives equal output.
export async function layout(graph: Graph, view: View): Promise<Layout> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parent = new Map<string, string>();
  const hasKids = new Set<string>();
  for (const e of graph.edges)
    if (e.kind === "contains") {
      parent.set(e.to, e.from);
      hasKids.add(e.from);
    }
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
    const node = byId.get(id);
    if (ch)
      return { id, children: ch.map(mk), layoutOptions: { "elk.padding": "[top=36,left=16,bottom=16,right=16]" } };
    return { id, width: node ? width(node) : MIN_W, height: LEAF_H };
  };
  const pairs = new Map<string, Rollup[]>();
  for (const r of view.rollups) {
    const k = r.from + "\0" + r.to;
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k)!.push(r);
  }
  const keys = [...pairs.keys()].sort();
  for (const k of keys) pairs.get(k)!.sort((a, b) => a.kind.localeCompare(b.kind));
  const root: ElkNode = {
    id: "root",
    children: roots.map(mk),
    edges: keys.map((k, i) => {
      const [from, to] = k.split("\0");
      return { id: `e${i}`, sources: [from], targets: [to] };
    }),
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.randomSeed": "1",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "SPLINES",
      "elk.json.edgeCoords": "ROOT",
      "elk.spacing.nodeNode": "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      "elk.spacing.edgeNode": "16",
      // Network-simplex placement is ~25x slower on repo-sized views.
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    },
  };
  const out = (await new ELK().layout(root as never)) as ElkNode & { width: number; height: number };
  const boxes: Box[] = [];
  const walk = (n: ElkNode, ox: number, oy: number) => {
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0), y = oy + (c.y ?? 0);
      const node = byId.get(c.id);
      if (node)
        boxes.push({ id: c.id, x, y, w: c.width ?? 0, h: c.height ?? 0, node, container: !!c.children, expandable: hasKids.has(c.id) });
      walk(c, x, y);
    }
  };
  walk(out, 0, 0);
  const pos = new Map(boxes.map((b) => [b.id, b]));
  const routed = new Map((out.edges ?? []).map((e) => [e.id, e]));
  const wires: Wire[] = keys.flatMap((k, i) => {
    const [from, to] = k.split("\0");
    const a = pos.get(from), b = pos.get(to);
    if (!a || !b) return [];
    const s = routed.get(`e${i}`)?.sections?.[0];
    const points = s
      ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint]
      : [{ x: a.x + a.w, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 }];
    return [{ from, to, rollups: pairs.get(k)!, points }];
  });
  boxes.sort((a, b) => a.id.localeCompare(b.id));
  return { width: out.width ?? 0, height: out.height ?? 0, boxes, wires };
}
