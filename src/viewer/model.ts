// The viewer's graph model: what the layout and renderer draw. Pure, no DOM, no vscode.

export interface VNode {
  id: string;
  /** `entry`, `function`, or a boundary kind (`store`, `external`, `ingress`, `network`, `hardware`). */
  kind: string;
  name: string;
  label: string | null;
  /** Source lines (`path:line`): the declaration of a function, the sites a boundary is reached from. */
  at: string[];
  /** `key: value` lines for the inspector. */
  detail: string[];
  /** The colour slot of the component that owns the function (`tint-N` class). */
  tint?: number;
}

export interface VEdge {
  from: string;
  to: string;
  kind: string;
  resolved: boolean;
  count: number;
  /** Call sites or crossing sites. */
  at: string[];
}

export interface Graph {
  root: string;
  nodes: Map<string, VNode>;
  edges: VEdge[];
}

/** What one picture shows: inner nodes in row order, outside nodes on the right, and the edges between them. */
export interface View {
  focus: string;
  nodes: VNode[];
  outside: VNode[];
  edges: VEdge[];
}

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
