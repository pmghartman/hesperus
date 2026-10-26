// Versioned IR. Change deliberately and bump SCHEMA_VERSION; mirrored by schema/graph.schema.json.
export const SCHEMA_VERSION = 5;
export const TOOL_NAME = "hesperus";
export const REPO_ID = "repo";

// Declaration order is sort order.
export const NODE_KINDS = [
  "repo", "directory", "package", "file", "type", "function", "method", "field",
  "variable", "state", "event", "external_package", "external", "unresolved",
] as const;
export const EDGE_KINDS = ["contains", "call", "override", "flow", "transition", "guard"] as const;
export const PROVENANCES = ["resolved", "may", "unresolved"] as const;

export type NodeKind = (typeof NODE_KINDS)[number];
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type Provenance = (typeof PROVENANCES)[number];

/** 0-based, half-open on columns, as in SCIP. Columns are UTF-8 bytes. */
export interface Range { start_line: number; start_col: number; end_line: number; end_col: number }
export interface Site { path: string; range: Range }

/** Base labels (name, signature, doc) are deterministic. Agent labels live elsewhere. */
export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  path?: string;
  range?: Range;
  signature?: string;
  doc?: string;
  /** Content hash of the defining file; marks staleness only. */
  hash?: string;
  /** A file in a language nothing resolved; `doc` says why. */
  unindexed?: true;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  provenance: Provenance;
  label?: string;
  site?: Site;
}

export interface Graph { schema_version: number; nodes: GraphNode[]; edges: GraphEdge[] }

export const isCallable = (k: NodeKind) => k === "function" || k === "method";

/** Code point order, which is UTF-8 byte order; plain `<` compares UTF-16 units. */
export function cmpStr(a: string, b: string): number {
  if (a === b) return 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = a.charCodeAt(i), y = b.charCodeAt(i);
    if (x === y) continue;
    // Surrogates (astral code points) sort above U+E000..U+FFFF.
    if (x >= 0xd800 && y >= 0xd800) {
      x = x >= 0xe000 ? x - 0x800 : x + 0x2000;
      y = y >= 0xe000 ? y - 0x800 : y + 0x2000;
    }
    return x < y ? -1 : 1;
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}

const cmpNum = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);

/** None sorts first, as Rust's Option. */
function cmpOpt<T>(a: T | undefined, b: T | undefined, f: (x: T, y: T) => number): number {
  if (a === undefined) return b === undefined ? 0 : -1;
  return b === undefined ? 1 : f(a, b);
}

const rank = <T extends string>(xs: readonly T[]) => (a: T, b: T) => cmpNum(xs.indexOf(a), xs.indexOf(b));
export const cmpNodeKind = rank(NODE_KINDS);
export const cmpEdgeKind = rank(EDGE_KINDS);
export const cmpProvenance = rank(PROVENANCES);

export function cmpRange(a: Range, b: Range): number {
  return cmpNum(a.start_line, b.start_line) || cmpNum(a.start_col, b.start_col)
    || cmpNum(a.end_line, b.end_line) || cmpNum(a.end_col, b.end_col);
}

export const cmpSite = (a: Site, b: Site) => cmpStr(a.path, b.path) || cmpRange(a.range, b.range);

export function contains(outer: Range, o: Range): boolean {
  const le = (l1: number, c1: number, l2: number, c2: number) => l1 < l2 || (l1 === l2 && c1 <= c2);
  return le(outer.start_line, outer.start_col, o.start_line, o.start_col) && le(o.end_line, o.end_col, outer.end_line, outer.end_col);
}

/** (lines, columns) with columns wrapping as u32, so multi-line ranges rank by lines first. */
export function cmpSize(a: Range, b: Range): number {
  return cmpNum(a.end_line - a.start_line, b.end_line - b.start_line)
    || cmpNum((a.end_col - a.start_col) >>> 0, (b.end_col - b.start_col) >>> 0);
}

export const rangeKey = (r: Range) => `${r.start_line},${r.start_col},${r.end_line},${r.end_col}`;

export function cmpNode(a: GraphNode, b: GraphNode): number {
  return cmpStr(a.id, b.id) || cmpNodeKind(a.kind, b.kind) || cmpStr(a.name, b.name)
    || cmpOpt(a.path, b.path, cmpStr) || cmpOpt(a.range, b.range, cmpRange)
    || cmpOpt(a.signature, b.signature, cmpStr) || cmpOpt(a.doc, b.doc, cmpStr) || cmpOpt(a.hash, b.hash, cmpStr);
}

export function cmpEdge(a: GraphEdge, b: GraphEdge): number {
  return cmpStr(a.from, b.from) || cmpStr(a.to, b.to) || cmpEdgeKind(a.kind, b.kind)
    || cmpOpt(a.site, b.site, cmpSite) || cmpOpt(a.label, b.label, cmpStr) || cmpProvenance(a.provenance, b.provenance);
}

// Constructors fix key order, which is serialization order.
export const range = (r: Range): Range => ({ start_line: r.start_line, start_col: r.start_col, end_line: r.end_line, end_col: r.end_col });

export function node(n: GraphNode): GraphNode {
  const o: GraphNode = { id: n.id, kind: n.kind, name: n.name };
  if (n.path !== undefined) o.path = n.path;
  if (n.range !== undefined) o.range = range(n.range);
  if (n.signature !== undefined) o.signature = n.signature;
  if (n.doc !== undefined) o.doc = n.doc;
  if (n.hash !== undefined) o.hash = n.hash;
  if (n.unindexed) o.unindexed = true;
  return o;
}

export function edge(e: GraphEdge): GraphEdge {
  const o: GraphEdge = { from: e.from, to: e.to, kind: e.kind, provenance: e.provenance };
  if (e.label !== undefined) o.label = e.label;
  if (e.site !== undefined) o.site = { path: e.site.path, range: range(e.site.range) };
  return o;
}

export const newGraph = (): Graph => ({ schema_version: SCHEMA_VERSION, nodes: [], edges: [] });

function sortDedup<T>(xs: T[], cmp: (a: T, b: T) => number): T[] {
  xs.sort(cmp);
  return xs.filter((x, i) => i === 0 || cmp(xs[i - 1], x) !== 0);
}

/** Canonical order; dedupes identical records. */
export function canonicalize(g: Graph) {
  g.nodes = sortDedup(g.nodes, cmpNode);
  g.edges = sortDedup(g.edges, cmpEdge);
}

/** Pretty JSON with a trailing newline. Objects must come from the constructors above. */
export const pretty = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

export const toJson = (g: Graph) => pretty({ schema_version: g.schema_version, nodes: g.nodes, edges: g.edges });

// Parsing checks shape and rebuilds every record, so key order never depends on the input.
const fail = (what: string): never => { throw new Error(what); };
const str = (v: unknown, f: string) => (typeof v === "string" ? v : fail(`${f}: expected a string`));
const optStr = (v: unknown, f: string) => (v == null ? undefined : str(v, f));
const u32 = (v: unknown, f: string) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 0xffffffff ? (v as number) : fail(`${f}: expected u32`));
const oneOf = <T extends string>(xs: readonly T[], v: unknown, f: string) => (xs.includes(v as T) ? (v as T) : fail(`${f}: unknown variant ${JSON.stringify(v)}`));
const obj = (v: unknown, f: string) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(`${f}: expected an object`));
export const arr = (v: unknown, f: string) => (Array.isArray(v) ? v : fail(`${f}: expected an array`));

function parseRange(v: unknown): Range {
  const r = obj(v, "range");
  return { start_line: u32(r.start_line, "start_line"), start_col: u32(r.start_col, "start_col"), end_line: u32(r.end_line, "end_line"), end_col: u32(r.end_col, "end_col") };
}

export function parseNode(v: unknown): GraphNode {
  const n = obj(v, "node");
  return node({
    id: str(n.id, "id"), kind: oneOf(NODE_KINDS, n.kind, "kind"), name: str(n.name, "name"),
    path: optStr(n.path, "path"), range: n.range == null ? undefined : parseRange(n.range),
    signature: optStr(n.signature, "signature"), doc: optStr(n.doc, "doc"), hash: optStr(n.hash, "hash"),
  });
}

export function parseEdge(v: unknown): GraphEdge {
  const e = obj(v, "edge");
  const site = e.site == null ? undefined : obj(e.site, "site");
  return edge({
    from: str(e.from, "from"), to: str(e.to, "to"), kind: oneOf(EDGE_KINDS, e.kind, "kind"),
    provenance: oneOf(PROVENANCES, e.provenance, "provenance"), label: optStr(e.label, "label"),
    site: site && { path: str(site.path, "path"), range: parseRange(site.range) },
  });
}

export function fromJson(s: string): Graph {
  let g: Graph;
  try {
    const o = obj(JSON.parse(s), "graph");
    g = { schema_version: u32(o.schema_version, "schema_version"), nodes: arr(o.nodes, "nodes").map(parseNode), edges: arr(o.edges, "edges").map(parseEdge) };
  } catch (e) {
    throw new Error(`invalid graph: ${(e as Error).message}`);
  }
  if (g.schema_version !== SCHEMA_VERSION) throw new Error(`graph schema version ${g.schema_version} != supported ${SCHEMA_VERSION}`);
  return g;
}
