import type ELK from "elkjs/lib/elk.bundled.js";
import { Rollup, View } from "./core/aggregate";
import { AState, Automaton, Dim, Input } from "./core/automaton";
import { cmpStr, Graph, GraphNode } from "./core/ir";

/** Rollups between a box and one node outside the repo. */
export interface Stub { id: string; name: string; rollups: Rollup[] }
/** `parent` is the drawn box this one sits in, if any. `ext` lists the outside nodes a leaf box
 *  reaches; they are drawn as a line in the box, not wires, since every box calls the standard library. */
export interface Box { id: string; x: number; y: number; w: number; h: number; node: GraphNode; container: boolean; expandable: boolean; parent?: string; ext?: Stub[];
  /** Flow view: where the box sits in the picture. `entry` has no callers; `sink` is outside the repo. */
  role?: "entry" | "sink";
  /** Lint findings this box takes part in: the worst severity, and what they say. */
  flag?: Flag }
export interface Flag { severity: "error" | "warning" | "info"; notes: string[] }
/** All rollups between two nodes share one wire, both directions: returns run against their
 *  calls, and routing them separately sends every one around the outside. Kinds stay listed for
 *  filtering; each rollup keeps its own direction. `from` is the end most rollups leave.
 *  `points` is an orthogonal polyline: start, bend points, end. */
export interface Wire { from: string; to: string; rollups: Rollup[]; points: { x: number; y: number }[]; labels: string[]; flag?: Flag }
export interface Layout { width: number; height: number; boxes: Box[]; wires: Wire[]; /** Wires left out to keep layout fast: the lightest ones. */ omitted: number }

/** ELK's layered layout grows steeply with wires; past this the picture is a hairball anyway. */
export const MAX_WIRES = 200;

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
  labels?: { text: string; width: number; height: number; x?: number; y?: number }[];
}

/** ELK, loaded on the first layout rather than with the module: indexing and linting never need it, and
 *  the CLI finds it in the plugin's node_modules, where Claude Code installs it, not in its own bundle. */
let elkLoaded: typeof ELK | undefined;
function elkClass(): typeof ELK {
  try {
    elkLoaded ??= require("elkjs/lib/elk.bundled.js") as typeof ELK;
  } catch {
    throw new Error("the layout library elkjs is not installed; run `npm ci` in Hesperus's folder");
  }
  return elkLoaded;
}

/** ELK's in-process worker exports itself only where `self` is undefined, else it takes itself for a
 *  web worker and waits for messages; Bun defines `self`, so it is hidden while ELK loads that worker. */
function elk(): InstanceType<typeof ELK> {
  const Elk = elkClass();
  const g = globalThis as { self?: unknown };
  const self = g.self;
  if (self === undefined) return new Elk();
  delete g.self;
  try {
    return new Elk();
  } finally {
    g.self = self;
  }
}

const width = (n: GraphNode) => Math.min(MAX_W, Math.max(MIN_W, Math.ceil(n.name.length * CHAR) + PAD + 14));

// Positions come from ELK only; inputs are sorted and the seed is fixed so equal input
// gives equal output.
export async function layout(graph: Graph, view: View, opts: { flow?: boolean; /** Wires kept first when there are too many. */ keep?: (r: Rollup) => boolean } = {}): Promise<Layout> {
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
  const outsideNode = (id: string) => ["external_package", "external", "boundary"].includes(byId.get(id)?.kind ?? "");
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
  const drawn = new Set(view.nodes);
  for (const r of view.rollups) {
    if (!drawn.has(r.from) || !drawn.has(r.to)) continue;
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
  let omitted = 0;
  if (pairs.size > MAX_WIRES) {
    const weight = (rs: Rollup[]) => rs.reduce((s, r) => s + r.weight, 0);
    const first = (rs: Rollup[]) => (opts.keep && rs.some(opts.keep) ? 1 : 0);
    const keep = [...pairs].sort(([ka, a], [kb, b]) => first(b) - first(a) || weight(b) - weight(a) || cmpStr(ka, kb)).slice(0, MAX_WIRES);
    omitted = pairs.size - keep.length;
    pairs.clear();
    for (const [k, rs] of keep) pairs.set(k, rs);
  }
  // Calls across a boundary are the point of the picture: always wires, never a line of text in the box.
  const bounded = (id: string) => {
    for (let p: string | undefined = id; p !== undefined; p = parent.get(p)) if (byId.get(p)?.kind === "boundary") return true;
    return false;
  };
  const outside = (id: string) => ["external_package", "external"].includes(byId.get(id)?.kind ?? "") && !bounded(id);
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
  const out = (await elk().layout(root as never)) as ElkNode & { width: number; height: number };
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
  return { width: out.width ?? 0, height: out.height ?? 0, boxes, wires, omitted };
}

/** A state drawn as a pill; `lines` are its values, `loops` the inputs that leave it as it is. */
export interface StateBox { id: string; region: string; x: number; y: number; w: number; h: number; lines: string[]; initial: boolean; loops: string[]; mayLoops: string[] }
/** A transition; `inputs` are input ids, `label` where its names are drawn. */
export interface Arc { from: string; to: string; inputs: string[]; may: boolean; points: { x: number; y: number }[]; label: { text: string; x: number; y: number } }
export interface RegionBox { id: string; title: string; x: number; y: number; w: number; h: number; truncated: boolean }
export interface AutomatonLayout { width: number; height: number; regions: RegionBox[]; states: StateBox[]; arcs: Arc[]; inputs: Input[]; dims: Dim[]; quiet: number }

const STATE_H = 30, LOOP_H = 14, REGION_HEAD = 40, GAP = 28, ARROW = 0;
/** Names on a transition past this many collapse to a count. */
const LABEL_NAMES = 3;

const names = (ids: string[], byId: Map<string, Input>) => {
  const ns = ids.map((i) => byId.get(i)?.name ?? i);
  return ns.length > LABEL_NAMES ? `${ns.slice(0, LABEL_NAMES).join(", ")} +${ns.length - LABEL_NAMES}` : ns.join(", ");
};

/** Each region laid out on its own (states left to right from the initial one), then the regions
 *  packed in rows, largest first. Deterministic: sorted input, fixed seed. */
export async function automatonLayout(a: Automaton): Promise<AutomatonLayout> {
  const inputs = new Map(a.inputs.map((i) => [i.id, i]));
  const dims = new Map(a.dims.map((d) => [d.id, d]));
  const engine = elk();
  const laid = await Promise.all(a.regions.map(async (r) => {
    const multi = r.dims.length > 1;
    const lines = (s: AState) => r.dims.map((d) => {
      const v = s.values[d].map((k) => dims.get(d)?.names[k] ?? k).join(" | ");
      return multi ? `${dims.get(d)?.name ?? d} = ${v}` : v;
    });
    const loopText = (s: AState) => (s.loops.length || s.mayLoops.length ? "↺ " + names([...s.loops, ...s.mayLoops], inputs) : "");
    const size = (s: AState) => {
      const text = Math.max(...lines(s).map((l) => l.length), 4) * CHAR + 28;
      return { width: Math.min(MAX_W + 80, Math.max(MIN_W, text, loopText(s).length * 6 + 12)), height: STATE_H + (lines(s).length - 1) * 16 + (loopText(s) ? LOOP_H : 0) };
    };
    const root: ElkNode & { edges: ElkEdge[] } = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.randomSeed": "1",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.spacing.nodeNode": "24",
        "elk.layered.spacing.nodeNodeBetweenLayers": "64",
        "elk.spacing.edgeLabel": "4",
        "elk.edgeLabels.placement": "CENTER",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      },
      // The initial state first, so it sits on the left.
      children: [...r.states].sort((x, y) => Number(y.initial) - Number(x.initial) || cmpStr(x.id, y.id)).map((s) => ({ id: s.id, ...size(s), ...(s.initial ? { layoutOptions: { "elk.layered.layering.layerConstraint": "FIRST" } } : {}) })),
      edges: r.edges.map((e, i) => {
        const text = names(e.inputs, inputs);
        return { id: `e${i}`, sources: [e.from], targets: [e.to], labels: [{ text, width: Math.ceil(text.length * 6) + 6, height: 14 }] };
      }),
    };
    const out = (await engine.layout(root as never)) as typeof root & { width: number; height: number };
    return { r, out, lines, loopText };
  }));
  // Shelf packing: rows no wider than a square's side of the total area, at least the widest region.
  const sized = laid.map((l) => ({ ...l, w: l.out.width + ARROW + 24, h: l.out.height + REGION_HEAD + 16 }))
    .sort((x, y) => y.r.states.length - x.r.states.length || cmpStr(x.r.id, y.r.id));
  const area = sized.reduce((s, x) => s + x.w * x.h, 0);
  const rowW = Math.max(Math.sqrt(area) * 1.6, ...sized.map((x) => x.w));
  const regions: RegionBox[] = [], states: StateBox[] = [], arcs: Arc[] = [];
  let x = 0, y = 0, rowH = 0, width = 0;
  for (const s of sized) {
    if (x > 0 && x + s.w > rowW) (x = 0, y += rowH + GAP, rowH = 0);
    const title = s.r.dims.map((d) => dims.get(d)?.name ?? d).join(" × ");
    regions.push({ id: s.r.id, title, x, y, w: s.w, h: s.h, truncated: s.r.truncated });
    const ox = x + ARROW + 12, oy = y + REGION_HEAD;
    const byState = new Map(s.r.states.map((st) => [st.id, st]));
    for (const c of s.out.children ?? []) {
      const st = byState.get(c.id)!;
      states.push({ id: st.id, region: s.r.id, x: ox + (c.x ?? 0), y: oy + (c.y ?? 0), w: c.width ?? 0, h: c.height ?? 0, lines: s.lines(st), initial: st.initial, loops: st.loops, mayLoops: st.mayLoops });
    }
    s.out.edges.forEach((e, i) => {
      const src = s.r.edges[i], sec = e.sections?.[0], lab = e.labels?.[0];
      if (!sec) return;
      arcs.push({
        from: src.from, to: src.to, inputs: src.inputs, may: src.may,
        points: [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((p) => ({ x: ox + p.x, y: oy + p.y })),
        label: { text: lab?.text ?? "", x: ox + (lab?.x ?? 0), y: oy + (lab?.y ?? 0) + 10 },
      });
    });
    x += s.w + GAP;
    rowH = Math.max(rowH, s.h);
    width = Math.max(width, x - GAP);
  }
  return { width, height: y + rowH, regions, states, arcs, inputs: a.inputs, dims: a.dims, quiet: a.quiet };
}
