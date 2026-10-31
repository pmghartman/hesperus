// The viewer's graph model: one shape for the three modes. Pure, no DOM, no vscode.

export type Mode = "intent" | "actual" | "unified";
export type Status = "match" | "intent-only" | "actual-only" | "conflict";

export interface VNode {
  id: string;
  kind: string;
  name: string;
  parent: string | null;
  label: string | null;
  status: Status | null;
  conflicts: { property: string; intent: string; actual: string }[];
  /** Evidence into the repository (`path:line`), from the actual side. */
  at: string[];
  detail: string[];
}

export interface VEdge {
  from: string;
  to: string;
  kind: string;
  status: Status | null;
  resolved: boolean;
  count: number;
  at: string[];
}

export interface VConstraint {
  rule: string;
  from: string;
  to: string;
  kind: string | null;
  satisfied: boolean;
  witnesses: string[];
}

export interface Graph {
  root: string;
  nodes: Map<string, VNode>;
  edges: VEdge[];
  constraints: VConstraint[];
}

/** Raw IR / unified JSON as `hesp ir` and `hesp diff --json` print them. */
export interface IrJson {
  root: string;
  nodes: any[];
  edges: any[];
  constraints?: any[];
  locations?: Record<string, string>;
}
export interface UnifiedJson {
  root: string;
  summary: Record<string, number>;
  nodes: any[];
  edges: any[];
  constraints: any[];
}

export function graphFromIr(ir: IrJson): Graph {
  const nodes = new Map<string, VNode>();
  for (const n of ir.nodes) {
    nodes.set(n.id, {
      id: n.id,
      kind: n.kind,
      name: n.name,
      parent: n.parent ?? null,
      label: n.label ?? null,
      status: null,
      conflicts: [],
      at: n.at ?? [],
      detail: nodeDetail(n),
    });
  }
  const edges: VEdge[] = ir.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, status: null, resolved: e.resolved ?? true, count: 1, at: e.at ?? [] }));
  const constraints: VConstraint[] = (ir.constraints ?? []).map((c) => ({ rule: c.rule, from: c.from, to: c.to, kind: c.kind ?? null, satisfied: true, witnesses: [] }));
  return { root: ir.root, nodes, edges, constraints };
}

export function graphFromUnified(u: UnifiedJson): Graph {
  const nodes = new Map<string, VNode>();
  for (const n of u.nodes) {
    const side = n.intent ?? n.actual;
    nodes.set(n.id, {
      id: n.id,
      kind: n.kind,
      name: n.name,
      parent: n.parent ?? null,
      label: side?.label ?? n.actual?.label ?? null,
      status: n.status,
      conflicts: n.conflicts ?? [],
      at: n.actual?.at ?? [],
      detail: [...nodeDetail(n.intent ?? {}), ...(n.actual && n.intent ? [] : nodeDetail(n.actual ?? {}))],
    });
  }
  const edges: VEdge[] = u.edges.map((e) => ({
    from: e.from,
    to: e.to,
    kind: e.kind,
    status: e.status,
    resolved: e.actual?.resolved ?? true,
    count: e.count ?? 1,
    at: e.actual?.at ?? [],
  }));
  const constraints: VConstraint[] = u.constraints.map((c) => ({ rule: c.rule, from: c.from, to: c.to, kind: c.kind ?? null, satisfied: c.satisfied, witnesses: c.witnesses ?? [] }));
  return { root: u.root, nodes, edges, constraints };
}

function nodeDetail(n: any): string[] {
  const out: string[] = [];
  if (n.desc) out.push(n.desc);
  if (n.protocol) out.push(`protocol: ${n.protocol}`);
  if (n.host) out.push(`host: ${n.host}`);
  if (n.engine) out.push(`engine: ${n.engine}`);
  if (n.src?.length) out.push(`src: ${n.src.join(", ")}`);
  return out;
}

export function within(id: string, ancestor: string): boolean {
  return id === ancestor || id.startsWith(ancestor + ".");
}

export function depth(id: string): number {
  return id.split(".").length - 1;
}

export function ancestorAt(id: string, d: number): string {
  return id.split(".").slice(0, d + 1).join(".");
}

const RANK: Record<Status, number> = { match: 0, "intent-only": 1, "actual-only": 2, conflict: 3 };

export function worst(a: Status | null, b: Status | null): Status | null {
  if (a === null) return b;
  if (b === null) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/** A node has children in the graph. */
export function isContainer(g: Graph, id: string): boolean {
  for (const n of g.nodes.values()) if (n.parent === id) return true;
  return false;
}

export interface View {
  focus: string;
  /** Children of the focus. */
  nodes: VNode[];
  /** Nodes outside the focus that visible edges reach, folded to the focus's level. */
  outside: VNode[];
  edges: VEdge[];
}

/**
 * The level shown when zoomed into `focus`: its children, plus the outside nodes that
 * edges reach, with every edge folded onto the visible nodes and counted.
 */
export function viewAt(g: Graph, focus: string): View {
  const children = [...g.nodes.values()].filter((n) => n.parent === focus).sort(byKindThenName);
  const childIds = new Set(children.map((c) => c.id));
  const fold = (id: string): string | null => {
    if (within(id, focus)) {
      if (id === focus) return null;
      return ancestorAt(id, depth(focus) + 1);
    }
    // outside: a node at the focus's depth or shallower, so siblings stay siblings
    return ancestorAt(id, Math.min(depth(id), depth(focus)));
  };
  const folded = new Map<string, VEdge>();
  const outside = new Map<string, VNode>();
  for (const e of g.edges) {
    const from = fold(e.from);
    const to = fold(e.to);
    if (from === null || to === null || from === to) continue;
    if (!childIds.has(from) && !childIds.has(to)) continue;
    for (const id of [from, to]) {
      if (!childIds.has(id) && !outside.has(id)) {
        const n = g.nodes.get(id);
        if (n) outside.set(id, n);
      }
    }
    const key = `${from}\u0000${to}\u0000${e.kind}`;
    const cur = folded.get(key);
    if (cur) {
      cur.count += e.count;
      cur.status = worst(cur.status, e.status);
      cur.resolved = cur.resolved && e.resolved;
      cur.at = [...cur.at, ...e.at];
    } else {
      folded.set(key, { ...e, from, to, at: [...e.at] });
    }
  }
  const edges = [...folded.values()].sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.kind, b.kind));
  return { focus, nodes: children, outside: [...outside.values()].sort(byKindThenName), edges };
}

const KIND_RANK = ["system", "subsystem", "component", "ingress", "egress", "store", "external", "network", "hardware"];
function byKindThenName(a: VNode, b: VNode): number {
  return KIND_RANK.indexOf(a.kind) - KIND_RANK.indexOf(b.kind) || cmp(a.name, b.name);
}
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
