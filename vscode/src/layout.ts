import ELK from "elkjs/lib/elk.bundled.js";
import { Rollup, View } from "./core/aggregate";
import { cmpStr, Graph, GraphNode } from "./core/ir";

/** Rollups between a box and one node outside the repo. */
export interface Stub { id: string; name: string; rollups: Rollup[] }
/** `parent` is the drawn box this one sits in, if any. `ext` lists the outside nodes a leaf box
 *  reaches; they are drawn as a line in the box, not wires, since every box calls the standard library. */
export interface Box { id: string; x: number; y: number; w: number; h: number; node: GraphNode; container: boolean; expandable: boolean; parent?: string; ext?: Stub[];
  /** Flow view: where the box sits in the picture. `entry` has no callers; `sink` is outside the repo. */
  role?: "entry" | "sink" }
/** All rollups between two nodes share one wire, both directions: returns run against their
 *  calls, and routing them separately sends every one around the outside. Kinds stay listed for
 *  filtering; each rollup keeps its own direction. `from` is the end most rollups leave.
 *  `points` is an orthogonal polyline: start, bend points, end. */
export interface Wire { from: string; to: string; rollups: Rollup[]; points: { x: number; y: number }[]; labels: string[] }
export interface Layout { width: number; height: number; boxes: Box[]; wires: Wire[] }

// Sizes come from character counts, not measured text, so layout never depends on fonts.
// Must match media/graph.js. PAD holds the chevron, the kind mark, and margins.
const CHAR = 6.6, PAD = 40, MIN_W = 72, MAX_W = 260, LEAF_H = 26, EXT_H = 14;
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
  /** Set by ELK: the node whose frame the sections use. Not always the lowest common
   *  ancestor: an edge into a container's own descendant is routed in that container. */
  container?: string;
  sections?: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: { x: number; y: number }[] }[];
}

const width = (n: GraphNode) => Math.min(MAX_W, Math.max(MIN_W, Math.ceil(n.name.length * CHAR) + PAD + 14));

// Positions come from ELK only; inputs are sorted and the seed is fixed so equal input
// gives equal output.
export async function layout(graph: Graph, view: View, opts: { flow?: boolean } = {}): Promise<Layout> {
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
  // Nearest drawn ancestor: views pass through some structure without drawing it.
  const up = (id: string) => {
    let p = parent.get(id);
    while (p !== undefined && !visible.has(p)) p = parent.get(p);
    return p;
  };
  const kids = new Map<string, string[]>();
  const roots: string[] = [];
  for (const id of [...view.nodes].sort(cmpStr)) {
    const p = up(id);
    if (p) {
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p)!.push(id);
    } else roots.push(id);
  }
  const mk = (id: string): ElkNode => {
    const ch = kids.get(id);
    const node = byId.get(id);
    const pin: Record<string, string> = roles.has(id) && !up(id) ? { "elk.layered.layering.layerConstraint": roles.get(id) === "entry" ? "FIRST" : "LAST" } : {};
    if (ch)
      return { id, children: ch.map(mk), layoutOptions: { "elk.padding": "[top=38,left=12,bottom=12,right=12]", ...pin } };
    const ext = stubs.get(id);
    if (ext) {
      const text = Math.ceil(ext.map((x) => x.name).join(", ").length * CHAR) + 30;
      return { id, width: Math.max(node ? width(node) : MIN_W, Math.min(MAX_W, text)), height: LEAF_H + EXT_H };
    }
    return { id, width: node ? width(node) : MIN_W, height: LEAF_H, ...(roles.has(id) ? { layoutOptions: pin } : {}) };
  };
  // Flow view: the entries a program starts from and the packages it ends in, pinned to the two sides.
  const outsideNode = (id: string) => ["external_package", "external"].includes(byId.get(id)?.kind ?? "");
  const roles = new Map<string, "entry" | "sink">();
  if (opts.flow) {
    const called = new Set<string>(), calls = new Set<string>();
    for (const r of view.rollups) {
      if (r.kind !== "call" && r.kind !== "override") continue;
      called.add(r.to);
      calls.add(r.from);
    }
    for (const id of view.nodes) {
      if (outsideNode(id)) roles.set(id, "sink");
      else if (calls.has(id) && !called.has(id)) roles.set(id, "entry");
    }
  }
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
  const outside = (id: string) => ["external_package", "external"].includes(byId.get(id)?.kind ?? "");
  const stubs = new Map<string, Stub[]>();
  const keys = [...pairs.keys()].sort(cmpStr).filter((k) => {
    const [from, to] = k.split("\0");
    if (opts.flow || outside(from) === outside(to)) return true;
    const [inner, ext] = outside(to) ? [from, to] : [to, from];
    if (kids.has(inner)) return true;
    if (!stubs.has(inner)) stubs.set(inner, []);
    stubs.get(inner)!.push({ id: ext, name: byId.get(ext)!.name, rollups: pairs.get(k)! });
    return false;
  });
  for (const ss of stubs.values()) ss.sort((a, b) => cmpStr(a.name, b.name) || cmpStr(a.id, b.id));
  // Each edge lives in its endpoints' lowest common container.
  const chain = (id: string) => {
    const out: string[] = [];
    for (let p = up(id); p; p = up(p)) out.push(p);
    return out;
  };
  const elkEdges = new Map<string, ElkEdge[]>();
  keys.forEach((k, i) => {
    const [from, to] = k.split("\0");
    const up = new Set(chain(from));
    const lca = chain(to).find((p) => up.has(p) && p !== from && p !== to) ?? "root";
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
      // Orthogonal wires read like a circuit: parallel runs, few crossings, no loops around the outside.
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "18",
      "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      "elk.spacing.edgeNode": "14",
      "elk.spacing.edgeEdge": "7",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "7",
      "elk.layered.spacing.edgeNodeBetweenLayers": "14",
      // Each wire keeps its own port, so every line can be followed end to end.
      "elk.layered.mergeEdges": "true",
      // Sorted input order breaks ties, so expanding one box moves its neighbours as little as possible.
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
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
        boxes.push({ id: c.id, x, y, w: c.width ?? 0, h: c.height ?? 0, node, container: !!c.children, expandable: hasKids.has(c.id), ...(n.id === "root" ? {} : { parent: n.id }), ...(stubs.has(c.id) ? { ext: stubs.get(c.id) } : {}), ...(roles.has(c.id) ? { role: roles.get(c.id) } : {}) });
      walk(c, x, y);
    }
  };
  walk(out, 0, 0);
  const pos = new Map(boxes.map((b) => [b.id, b]));
  const wires: Wire[] = keys.flatMap((k, i) => {
    const [from, to] = k.split("\0");
    const a = pos.get(from), b = pos.get(to);
    if (!a || !b) return [];
    const e = routed.get(`e${i}`);
    const s = e?.sections?.[0];
    const o = origin.get(e?.container ?? "root") ?? { x: 0, y: 0 };
    const points = s
      ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((q) => ({ x: o.x + q.x, y: o.y + q.y }))
      : [{ x: a.x + a.w, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 }];
    // Who triggers a transition: the writers' names, from the edges beneath.
    const labels = new Set<string>();
    for (const r of pairs.get(k)!) if (r.kind === "transition") for (const i of r.edges) { const l = graph.edges[i]?.label; if (l !== undefined) labels.add(l); }
    return [{ from, to, rollups: pairs.get(k)!, points, labels: [...labels].sort(cmpStr) }];
  });
  boxes.sort((a, b) => cmpStr(a.id, b.id));
  return { width: out.width ?? 0, height: out.height ?? 0, boxes, wires };
}
