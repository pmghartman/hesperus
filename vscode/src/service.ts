// What the CLI, the MCP server and the Claude Code plugin do with a repo: index it headlessly, lint it,
// say what changed since the baseline, accept, draw. One place, so every agent-facing surface agrees.
import * as fs from "node:fs";
import * as path from "node:path";
import { BOUNDARIES, Boundary, BOUNDARY_INFO, Crossing } from "./core/boundary";
import { CACHE_DIR, readHeader, readShards } from "./core/cache";
import { Graph, pretty } from "./core/ir";
import { accept, Baseline, lint, Policy, Report, reportToJson, snapshot } from "./core/lint";
import { HeadlessOutcome, indexHeadless } from "./engine";
import { boundaryPicture } from "./picture";
import { gitHead, readBaseline, readPolicy, writeBaseline, writeReport } from "./review";
import { toSvg } from "./svg";

export const VIEW_FILE = "view.svg";

export interface Loaded { graph: Graph; policy: Policy; baseline?: Baseline; stale?: string; indexed?: HeadlessOutcome["languages"] }

export function hasCache(repo: string): boolean {
  try {
    readHeader(repo);
    return true;
  } catch {
    return false;
  }
}

/** The graph, re-indexed when asked or when there is none yet. */
export async function load(repo: string, index = false, report?: (s: string) => void): Promise<Loaded> {
  let indexed: HeadlessOutcome["languages"] | undefined;
  if (index || !hasCache(repo)) indexed = (await indexHeadless(repo, [], report)).languages;
  const h = readHeader(repo);
  const graph = readShards(repo);
  const policy = readPolicy(repo);
  const head = gitHead(repo);
  const stale = h.commit !== head ? `graph built at ${h.commit.slice(0, 12)}, HEAD is ${head.slice(0, 12)}; run \`hesperus index\` or \`hesperus check --index\`` : undefined;
  return { graph, policy, baseline: readBaseline(repo), stale, indexed };
}

/** Lints and writes the report; the first lint of a repo records the baseline, so later ones say what is new. */
export function check(repo: string, l: Loaded): Report {
  const r = lint(l.graph, l.policy, l.baseline);
  if (!l.baseline) {
    writeBaseline(repo, snapshot(l.graph, l.policy, gitHead(repo)));
    l.baseline = readBaseline(repo);
  }
  writeReport(repo, l.graph, r, l.stale);
  return r;
}

export const checkJson = (l: Loaded, r: Report) => reportToJson(l.graph, r, l.stale);

/** What changed since the baseline: findings that are new, and crossings that are gone. */
export function diffJson(l: Loaded, r: Report): string {
  const byId = new Map(l.graph.nodes.map((n) => [n.id, n]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const fresh = r.findings.filter((f) => f.rule !== "boundary-denied");
  return pretty({
    ...(l.stale ? { stale: l.stale } : {}),
    since: l.baseline?.commit ?? "unknown",
    added: fresh.map((f) => ({ rule: f.rule, boundary: f.boundary, message: f.message, local: name(f.local), external: name(f.external), ...site(f), key: f.key })),
    removed: r.removed,
    denied: r.findings.filter((f) => f.rule === "boundary-denied").map((f) => ({ boundary: f.boundary, message: f.message, local: name(f.local), ...site(f) })),
  });
}

const site = (f: { path?: string; range?: { start_line: number; start_col: number } }) =>
  f.path ? { path: f.path, line: (f.range?.start_line ?? 0) + 1, column: (f.range?.start_col ?? 0) + 1 } : {};

/** Every crossing, grouped by boundary then package, with its call sites. */
export function boundariesJson(l: Loaded, r: Report, only?: string): string {
  const byId = new Map(l.graph.nodes.map((n) => [n.id, n]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const out: Record<string, unknown> = {};
  for (const b of BOUNDARIES) {
    if (only && b !== only) continue;
    const cs = r.crossings.filter((c) => c.boundary === b);
    if (!cs.length) continue;
    const pkgs = new Map<string, Crossing[]>();
    for (const c of cs) (pkgs.get(c.package) ?? pkgs.set(c.package, []).get(c.package)!).push(c);
    out[b] = {
      label: BOUNDARY_INFO[b].label,
      packages: Object.fromEntries([...pkgs].map(([p, list]) => [p, list.map((c) => ({ dir: c.dir, local: name(c.local), external: name(c.external), provenance: c.provenance, basis: c.basis, ...site(c.site ?? {}) }))])),
    };
  }
  return pretty(out);
}

/** Accepts the given crossing keys, or everything current. Returns how many are accepted now. */
export function acceptKeys(repo: string, l: Loaded, keys?: readonly string[]): number {
  const now = snapshot(l.graph, l.policy, gitHead(repo));
  const b = keys?.length ? accept(l.baseline ? { ...l.baseline, commit: now.commit } : { ...now, crossings: [], packages: [] }, keys) : now;
  writeBaseline(repo, b);
  l.baseline = b;
  return b.crossings.length;
}

/** Callers and callees of every function or type whose name matches. */
export function callsJson(l: Loaded, query: string): string {
  const q = query.toLowerCase();
  const byId = new Map(l.graph.nodes.map((n) => [n.id, n]));
  const hits = l.graph.nodes.filter((n) => (n.kind === "function" || n.kind === "method" || n.kind === "type" || n.kind === "external") && n.name.toLowerCase().includes(q)).slice(0, 20);
  const describe = (id: string) => {
    const n = byId.get(id);
    return n ? `${n.name}${n.path ? ` (${n.path}:${(n.range?.start_line ?? 0) + 1})` : n.kind === "external" ? " (outside the repo)" : ""}` : id;
  };
  return pretty(hits.map((n) => ({
    name: n.name, kind: n.kind, path: n.path, line: n.range ? n.range.start_line + 1 : undefined,
    callers: l.graph.edges.filter((e) => e.kind === "call" && e.to === n.id).map((e) => `${describe(e.from)}${e.provenance === "resolved" ? "" : ` [${e.provenance}]`}`),
    callees: l.graph.edges.filter((e) => e.kind === "call" && e.from === n.id).map((e) => `${describe(e.to)}${e.provenance === "resolved" ? "" : ` [${e.provenance}]`}`),
  })));
}

/** Draws the boundary overview to `.hesperus/view.svg` and returns the markup. */
export async function drawSvg(repo: string, l: Loaded, r: Report): Promise<string> {
  const svg = toSvg(await boundaryPicture(l.graph, l.policy, r));
  fs.mkdirSync(path.join(repo, CACHE_DIR), { recursive: true });
  fs.writeFileSync(path.join(repo, CACHE_DIR, VIEW_FILE), svg);
  return svg;
}

export const isBoundary = (s: string): s is Boundary => (BOUNDARIES as readonly string[]).includes(s);
