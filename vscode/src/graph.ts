// Mirrors schema/graph.schema.json and core/src/{ir,aggregate}.rs. Change together.
export const SCHEMA_VERSION = 1;

export type NodeKind =
  | "repo" | "package" | "file" | "type" | "function" | "method" | "field"
  | "variable" | "external_package" | "external" | "unresolved";
export type EdgeKind = "contains" | "call" | "override" | "flow";
export type Provenance = "resolved" | "may" | "unresolved";

export interface Range { start_line: number; start_col: number; end_line: number; end_col: number }
export interface Site { path: string; range: Range }

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  path?: string;
  range?: Range;
  signature?: string;
  doc?: string;
  hash?: string;
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

// Output of `hesperus view`. Aggregation lives in core only.
export interface Rollup {
  from: string;
  to: string;
  kind: EdgeKind;
  weight: number;
  resolved: number;
  may: number;
  unresolved: number;
  edges: number[];
}
export interface View { nodes: string[]; rollups: Rollup[] }
