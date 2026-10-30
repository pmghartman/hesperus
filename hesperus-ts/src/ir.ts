// The Hesperus IR as the extractor emits it. Mirrors docs/ir.schema.json; the Rust
// side re-canonicalizes, but we emit canonical JSON anyway so output is stable.

export type NodeKind =
  | "system" | "subsystem" | "component"
  | "ingress" | "egress" | "store" | "external" | "network" | "hardware";
export type EdgeKind = "calls" | "reads" | "writes" | "http" | "ws" | "io";
export type Protocol = "http" | "ws" | "grpc" | "tcp" | "udp" | "ssh" | "other";

export interface IrNode {
  id: string;
  kind: NodeKind;
  name: string;
  parent: string | null;
  label: string | null;
  desc: string | null;
  src: string[];
  protocol: Protocol | null;
  host: string | null;
  engine: string | null;
  at: string[];
}

export interface IrEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label: string | null;
  desc: string | null;
  resolved: boolean;
  at: string[];
}

export interface IrConstraint {
  rule: "require" | "forbid";
  from: string;
  to: string;
  kind: EdgeKind | null;
}

export interface Ir {
  hesperus: "0.1";
  generated: string | null;
  root: string;
  files: { path: string; root: string }[];
  nodes: IrNode[];
  edges: IrEdge[];
  constraints: IrConstraint[];
}

export const EXTRACTOR = "hesperus-ts";
/** Evidence entries kept per node or edge. */
export const MAX_EVIDENCE = 20;

export function node(id: string, kind: NodeKind, extra: Partial<IrNode> = {}): IrNode {
  const dot = id.lastIndexOf(".");
  return {
    id,
    kind,
    name: dot < 0 ? id : id.slice(dot + 1),
    parent: dot < 0 ? null : id.slice(0, dot),
    label: null,
    desc: null,
    src: [],
    protocol: null,
    host: null,
    engine: null,
    at: [],
    ...extra,
  };
}

export function edge(from: string, to: string, kind: EdgeKind, extra: Partial<IrEdge> = {}): IrEdge {
  return { from, to, kind, label: null, desc: null, resolved: true, at: [], ...extra };
}

export function edgeKey(e: { from: string; to: string; kind: EdgeKind }): string {
  return `${e.from}\u0000${e.to}\u0000${e.kind}`;
}

const EDGE_ORDER: EdgeKind[] = ["calls", "reads", "writes", "http", "ws", "io"];

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sort nodes, edges, constraints and evidence; cap evidence. */
export function canonicalize(ir: Ir): Ir {
  const nodes = [...ir.nodes].sort((a, b) => cmp(a.id, b.id));
  for (const n of nodes) {
    n.src = uniqSorted(n.src);
    n.at = uniqSorted(n.at).slice(0, MAX_EVIDENCE);
  }
  const edges = [...ir.edges].sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || EDGE_ORDER.indexOf(a.kind) - EDGE_ORDER.indexOf(b.kind));
  for (const e of edges) e.at = uniqSorted(e.at).slice(0, MAX_EVIDENCE);
  const constraints = [...ir.constraints].sort((a, b) => cmp(a.rule, b.rule) || cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.kind ?? "", b.kind ?? ""));
  return { ...ir, nodes, edges, constraints };
}

export function uniqSorted(xs: string[]): string[] {
  return [...new Set(xs)].sort(evidenceCmp);
}

/** `path:line` sorts by path, then numeric line; other strings lexically. */
export function evidenceCmp(a: string, b: string): number {
  const [pa, la] = splitEvidence(a);
  const [pb, lb] = splitEvidence(b);
  return cmp(pa, pb) || la - lb || cmp(a, b);
}

function splitEvidence(s: string): [string, number] {
  const i = s.lastIndexOf(":");
  if (i < 0) return [s, 0];
  const n = Number(s.slice(i + 1));
  return Number.isInteger(n) ? [s.slice(0, i), n] : [s, 0];
}

export function toJson(ir: Ir): string {
  return JSON.stringify(canonicalize(ir), null, 2) + "\n";
}

/** Is `id` equal to or inside `ancestor`? */
export function within(id: string, ancestor: string): boolean {
  return id === ancestor || id.startsWith(ancestor + ".");
}

/** A valid identifier from arbitrary text (hosts, directory names). */
export function identify(text: string): string {
  let s = text.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (s === "" || !/^[A-Za-z_]/.test(s)) s = "_" + s;
  return s;
}
