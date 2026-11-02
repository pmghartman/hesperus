// Flow mode: one entry point as a pipeline. The flow.json an extractor writes next to the
// actual (docs/flow.schema.json) becomes a View the ordinary layout draws left to right:
// the entry, then every function it reaches in call order, then the boundaries each path
// ends in as outside nodes. Functions are tinted by the component that owns their file.

import { cmp, Graph, VEdge, View, VNode } from "./model.js";

export interface FlowJson {
  flow: string;
  generated: string;
  root: string;
  limits: { depth: number; steps: number };
  units: { id: string; name: string; file: string; line: number; owner: string }[];
  entries: FlowEntry[];
}
export interface FlowEntry {
  id: string;
  kind: "route" | "main" | "module" | "command" | "export";
  label: string;
  protocol: "http" | "ws" | null;
  unit: string;
  at: string;
  steps: FlowStep[];
}
export type FlowStep =
  | { call: string; at: string; steps?: FlowStep[]; cut?: "cycle" | "seen" | "depth" | "steps" }
  | { boundary: "ingress" | "store" | "external" | "network" | "hardware"; node: string; label: string; edge: string; resolved: boolean; at: string };

export interface FlowOwner {
  id: string;
  label: string;
  tint: number;
}

export interface FlowView {
  entry: FlowEntry;
  graph: Graph;
  view: View;
  /** Components whose functions appear, in order of first appearance, with their tint. */
  owners: FlowOwner[];
}

export const ENTRY_KIND_LABEL: Record<FlowEntry["kind"], string> = {
  route: "route handler",
  main: "main",
  module: "module (bin)",
  command: "command handler",
  export: "host export",
};

/** How many distinct tints the stylesheet defines. */
export const TINTS = 8;

/**
 * The pipeline of one entry. `ownerLabel` names a component for the legend (the actual
 * graph's label or name); without it the owner id minus the root is used.
 */
export function flowView(f: FlowJson, entryId: string, ownerLabel: (id: string) => string | null = () => null): FlowView | null {
  const entry = f.entries.find((e) => e.id === entryId) ?? f.entries[0];
  if (!entry) return null;
  const units = new Map(f.units.map((u) => [u.id, u]));
  const nodes = new Map<string, VNode>();
  const order: VNode[] = [];
  const outside: VNode[] = [];
  const edges = new Map<string, VEdge>();
  const owners = new Map<string, FlowOwner>();

  const ownerOf = (id: string): FlowOwner => {
    let o = owners.get(id);
    if (!o) {
      const short = id.startsWith(f.root + ".") ? id.slice(f.root.length + 1) : id;
      o = { id, label: ownerLabel(id) ?? short, tint: owners.size % TINTS };
      owners.set(id, o);
    }
    return o;
  };
  const unitNode = (id: string): VNode => {
    let n = nodes.get(id);
    if (n) return n;
    const u = units.get(id);
    const file = u?.file ?? id.slice(0, id.indexOf("#"));
    const base = file.slice(file.lastIndexOf("/") + 1);
    const owner = u ? ownerOf(u.owner) : null;
    n = {
      id,
      kind: "function",
      name: u?.name ?? id.slice(id.indexOf("#") + 1),
      parent: null,
      label: owner ? owner.label : base,
      status: null,
      conflicts: [],
      at: u ? [`${u.file}:${u.line}`] : [],
      detail: [`file: ${file}${u ? `:${u.line}` : ""}`, ...(u ? [`owner: ${u.owner}`] : [])],
      tint: owner?.tint,
    };
    nodes.set(id, n);
    order.push(n);
    return n;
  };
  const addEdge = (from: string, to: string, kind: string, at: string, resolved = true) => {
    const key = `${from}\u0000${to}\u0000${kind}`;
    const e = edges.get(key);
    if (e) {
      e.count++;
      e.resolved = e.resolved && resolved;
      if (!e.at.includes(at)) e.at.push(at);
    } else edges.set(key, { from, to, kind, status: null, resolved, count: 1, at: [at] });
  };

  const entryNode: VNode = {
    id: entry.id,
    kind: "entry",
    name: entry.label,
    parent: null,
    label: ENTRY_KIND_LABEL[entry.kind] ?? entry.kind,
    status: null,
    conflicts: [],
    at: [entry.at],
    detail: [`kind: ${entry.kind}`, ...(entry.protocol ? [`protocol: ${entry.protocol}`] : [])],
  };
  nodes.set(entry.id, entryNode);
  order.push(entryNode);
  const first = unitNode(entry.unit);
  addEdge(entry.id, first.id, entry.protocol ?? "calls", entry.at);

  const walk = (from: string, steps: FlowStep[]) => {
    for (const s of steps) {
      if ("boundary" in s) {
        let t = nodes.get(s.node);
        if (!t) {
          t = {
            id: s.node,
            kind: s.boundary,
            name: s.node.slice(s.node.lastIndexOf(".") + 1),
            parent: null,
            label: s.label,
            status: null,
            conflicts: [],
            at: [],
            detail: [`boundary: ${s.boundary}`],
          };
          nodes.set(s.node, t);
          outside.push(t);
        }
        if (!t.at.includes(s.at)) t.at.push(s.at);
        addEdge(from, s.node, s.edge, s.at, s.resolved);
        continue;
      }
      const to = unitNode(s.call);
      addEdge(from, to.id, "calls", s.at);
      if (s.steps) walk(to.id, s.steps);
    }
  };
  walk(first.id, entry.steps);

  const graph: Graph = { root: entry.id, nodes, edges: [...edges.values()], constraints: [] };
  const view: View = {
    focus: entry.id,
    nodes: order,
    outside,
    edges: [...edges.values()].sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.kind, b.kind)),
  };
  return { entry, graph, view, owners: [...owners.values()] };
}

/** Entries grouped for the inspector: routes first, then the rest, each in flow order. */
export function entryGroups(f: FlowJson): { kind: FlowEntry["kind"]; label: string; entries: FlowEntry[] }[] {
  const kinds: FlowEntry["kind"][] = ["route", "command", "main", "module", "export"];
  return kinds.map((k) => ({ kind: k, label: ENTRY_KIND_LABEL[k], entries: f.entries.filter((e) => e.kind === k) })).filter((g) => g.entries.length);
}
