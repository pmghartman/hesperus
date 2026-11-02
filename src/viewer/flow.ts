// The flow.json an extractor writes (docs/flow.schema.json) becomes a View the layout
// draws left to right: the entry, then every function it reaches in call order, then the
// boundaries each path ends in as outside nodes. Functions are tinted by the component
// that owns their file.

import { cmp, Graph, VEdge, View, VNode } from "./model.js";

export interface FlowJson {
  flow: string;
  generated: string;
  root: string;
  limits: { depth: number; steps: number };
  components: { id: string; name: string; label: string | null; kind: string }[];
  units: FlowUnit[];
  entries: FlowEntry[];
  constraints: FlowConstraint[];
}
export interface FlowUnit {
  id: string;
  name: string;
  file: string;
  line: number;
  end: number;
  owner: string;
}
export interface FlowEntry {
  id: string;
  kind: "route" | "main" | "module" | "command" | "export" | "event";
  label: string;
  protocol: "http" | "ws" | null;
  unit: string;
  at: string;
  steps: FlowStep[];
}
export type FlowStep =
  | { call: string; at: string; steps?: FlowStep[]; cut?: "cycle" | "seen" | "depth" | "steps"; how?: "next" | "timer" | "event" }
  | { boundary: "ingress" | "store" | "external" | "network" | "hardware" | "config"; node: string; label: string; edge: string; resolved: boolean; at: string };
export interface FlowConstraint {
  rule: "require" | "forbid";
  from: string;
  to: string;
  kind: string | null;
  satisfied: boolean;
  witnesses: { at: string; entries: string[] }[];
}

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
  event: "event handler",
};

/** How many distinct tints the stylesheet defines. */
export const TINTS = 8;

/** A component's display name: the intent label, else its name. */
export function componentLabel(f: FlowJson, id: string): string {
  const c = f.components.find((x) => x.id === id);
  if (c) return c.label ?? c.name;
  return id.startsWith(f.root + ".") ? id.slice(f.root.length + 1) : id;
}

/** The pipeline of one entry. */
export function flowView(f: FlowJson, entryId: string | null): FlowView | null {
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
      o = { id, label: componentLabel(f, id), tint: owners.size % TINTS };
      owners.set(id, o);
    }
    return o;
  };
  const unitNode = (id: string): VNode => {
    let n = nodes.get(id);
    if (n) return n;
    const u = units.get(id);
    const file = u?.file ?? id.slice(0, id.indexOf("#"));
    const owner = u ? ownerOf(u.owner) : null;
    n = {
      id,
      kind: "function",
      name: u?.name ?? id.slice(id.indexOf("#") + 1),
      label: owner ? owner.label : file.slice(file.lastIndexOf("/") + 1),
      at: u ? [`${u.file}:${u.line}`] : [],
      detail: [`file: ${file}${u ? `:${u.line}-${u.end}` : ""}`, ...(u ? [`owner: ${u.owner}`] : [])],
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
    } else edges.set(key, { from, to, kind, resolved, count: 1, at: [at] });
  };

  const entryNode: VNode = {
    id: entry.id,
    kind: "entry",
    name: entry.label,
    label: ENTRY_KIND_LABEL[entry.kind] ?? entry.kind,
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
          t = { id: s.node, kind: s.boundary, name: s.node.slice(s.node.lastIndexOf(".") + 1), label: s.label, at: [], detail: [`boundary: ${s.boundary}`] };
          nodes.set(s.node, t);
          outside.push(t);
        }
        if (!t.at.includes(s.at)) t.at.push(s.at);
        addEdge(from, s.node, s.edge, s.at, s.resolved);
        continue;
      }
      const to = unitNode(s.call);
      addEdge(from, to.id, s.how ?? "calls", s.at);
      if (s.steps) walk(to.id, s.steps);
    }
  };
  walk(first.id, entry.steps);

  const graph: Graph = { root: entry.id, nodes, edges: [...edges.values()] };
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
  const kinds: FlowEntry["kind"][] = ["route", "event", "command", "main", "module", "export"];
  return kinds.map((k) => ({ kind: k, label: ENTRY_KIND_LABEL[k], entries: f.entries.filter((e) => e.kind === k) })).filter((g) => g.entries.length);
}

/** Which entries pass through a file (or a line of it): the blast radius of a change there. */
export function reaches(f: FlowJson, file: string, line?: number): { entry: FlowEntry; units: FlowUnit[] }[] {
  const hit = new Set(f.units.filter((u) => u.file === file && (line === undefined || (u.line <= line && line <= u.end))).map((u) => u.id));
  if (hit.size === 0) return [];
  const out: { entry: FlowEntry; units: FlowUnit[] }[] = [];
  const byId = new Map(f.units.map((u) => [u.id, u]));
  for (const e of f.entries) {
    const found = new Set<string>();
    if (hit.has(e.unit)) found.add(e.unit);
    const walk = (steps: FlowStep[]) => {
      for (const s of steps) {
        if ("boundary" in s) continue;
        if (hit.has(s.call)) found.add(s.call);
        if (s.steps) walk(s.steps);
      }
    };
    walk(e.steps);
    if (found.size) out.push({ entry: e, units: [...found].map((id) => byId.get(id)!).filter(Boolean) });
  }
  return out;
}
