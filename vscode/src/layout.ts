import ELK from "elkjs/lib/elk.bundled.js";
import { Rollup, View } from "./core/aggregate";
import { cmpStr, Graph, GraphNode } from "./core/ir";

export interface Box { id: string; x: number; y: number; w: number; h: number; node: GraphNode; container: boolean; expandable: boolean }
/** All rollups between two nodes share one wire, both directions: returns run against their
 *  calls, and routing them separately sends every one around the outside. Kinds stay listed for
 *  filtering; each rollup keeps its own direction. `from` is the end most rollups leave.
 *  `points` is start, cubic Bézier control triples, end (ELK spline sections). */
export interface Wire { from: string; to: string; rollups: Rollup[]; points: { x: number; y: number }[] }
export interface Layout { width: number; height: number; boxes: Box[]; wires: Wire[] }

// Sizes come from character counts, not measured text, so layout never depends on fonts.
// Must match media/graph.js. PAD holds the chevron, the kind mark, and margins.
const CHAR = 6.6, PAD = 40, MIN_W = 72, MAX_W = 260, LEAF_H = 26;
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

const width = (n: GraphNode) => Math.min(MAX_W, Math.max(MIN_W, Math.ceil(n.name.length * CHAR) + PAD + 14));

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
  // Tiers sit between a container and its children; they are boxes like any other.
  for (const gr of view.groups) {
    const what = gr.id.endsWith("#ext") ? "Packages outside the repo." : gr.id.endsWith("#solo")
      ? "No resolved calls to or from their siblings."
      : "Siblings grouped by their longest chain of resolved callers inside the parent; cycles share a layer.";
    const doc = `View grouping, not code structure. ${what}\n${gr.members.length} children.`;
    byId.set(gr.id, { id: gr.id, kind: "tier" as GraphNode["kind"], name: gr.name, doc });
    hasKids.add(gr.id);
    parent.set(gr.id, gr.parent);
    for (const m of gr.members) parent.set(m, gr.id);
  }
  const visible = new Set(view.nodes);
  const kids = new Map<string, string[]>();
  const roots: string[] = [];
  for (const id of [...view.nodes].sort(cmpStr)) {
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
      return { id, children: ch.map(mk), layoutOptions: { "elk.padding": "[top=38,left=12,bottom=12,right=12]" } };
    return { id, width: node ? width(node) : MIN_W, height: LEAF_H };
  };
  const byPair = new Map<string, Rollup[]>();
  for (const r of view.rollups) {
    const k = cmpStr(r.from, r.to) < 0 ? r.from + "\0" + r.to : r.to + "\0" + r.from;
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k)!.push(r);
  }
  // Orient each wire along its calls and overrides, else its heavier direction, else by id.
  const pairs = new Map<string, Rollup[]>();
  for (const [k, rs] of byPair) {
    const [a, b] = k.split("\0");
    const score = (from: string) => rs.reduce((s, r) => s + (r.from === from ? (r.kind === "flow" ? 1 : 1e6) * r.weight : 0), 0);
    const [from, to] = score(b) > score(a) ? [b, a] : [a, b];
    pairs.set(from + "\0" + to, rs.sort((x, y) => cmpStr(x.kind, y.kind) || (x.from === from ? 0 : 1) - (y.from === from ? 0 : 1)));
  }
  const keys = [...pairs.keys()].sort();
  // Each edge lives in its endpoints' lowest common container; ELK routes it in that frame.
  const holder = new Map<string, string>(); // edge id -> elk container id
  const chain = (id: string) => {
    const out: string[] = [];
    for (let p = parent.get(id); p && visible.has(p); p = parent.get(p)) out.push(p);
    return out;
  };
  const elkEdges = new Map<string, ElkEdge[]>();
  keys.forEach((k, i) => {
    const [from, to] = k.split("\0");
    const up = new Set(chain(from));
    const lca = chain(to).find((p) => up.has(p) && p !== from && p !== to) ?? "root";
    holder.set(`e${i}`, lca);
    if (!elkEdges.has(lca)) elkEdges.set(lca, []);
    elkEdges.get(lca)!.push({ id: `e${i}`, sources: [from], targets: [to] });
  });
  const attach = (n: ElkNode) => {
    const es = elkEdges.get(n.id);
    if (es) n.edges = es;
    n.children?.forEach(attach);
  };
  const root: ElkNode = {
    id: "root",
    children: roots.map(mk),
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.randomSeed": "1",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "SPLINES",
      "elk.spacing.nodeNode": "14",
      "elk.layered.spacing.nodeNodeBetweenLayers": "48",
      "elk.spacing.edgeNode": "10",
      "elk.spacing.edgeEdge": "4",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "4",
      "elk.layered.spacing.edgeNodeBetweenLayers": "10",
      // Edges sharing an end share a port, so a busy node fans out from one point.
      "elk.layered.mergeEdges": "true",
      // Network-simplex placement is ~25x slower on repo-sized views.
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    },
  };
  attach(root);
  const out = (await new ELK().layout(root as never)) as ElkNode & { width: number; height: number };
  const boxes: Box[] = [];
  const origin = new Map<string, { x: number; y: number }>([["root", { x: 0, y: 0 }]]);
  const routed = new Map<string, ElkEdge>();
  const walk = (n: ElkNode, ox: number, oy: number) => {
    for (const e of n.edges ?? []) routed.set(e.id, e);
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0), y = oy + (c.y ?? 0);
      const node = byId.get(c.id);
      origin.set(c.id, { x, y });
      if (node)
        boxes.push({ id: c.id, x, y, w: c.width ?? 0, h: c.height ?? 0, node, container: !!c.children, expandable: hasKids.has(c.id) });
      walk(c, x, y);
    }
  };
  walk(out, 0, 0);
  const pos = new Map(boxes.map((b) => [b.id, b]));
  const wires: Wire[] = keys.flatMap((k, i) => {
    const [from, to] = k.split("\0");
    const a = pos.get(from), b = pos.get(to);
    if (!a || !b) return [];
    const s = routed.get(`e${i}`)?.sections?.[0];
    const o = origin.get(holder.get(`e${i}`)!)!;
    const points = s
      ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((q) => ({ x: o.x + q.x, y: o.y + q.y }))
      : [{ x: a.x + a.w, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 }];
    return [{ from, to, rollups: pairs.get(k)!, points }];
  });
  boxes.sort((a, b) => cmpStr(a.id, b.id));
  return { width: out.width ?? 0, height: out.height ?? 0, boxes, wires };
}
