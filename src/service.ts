// What the CLI and the MCP server do with a repo: index it headlessly, list what it reaches, trace
// control flow, take an agent's narrative. One place, so every agent-facing surface agrees.
import * as fs from "node:fs";
import * as path from "node:path";
import { BOUNDARIES, Boundary, BOUNDARY_INFO, Crossing } from "./core/boundary";
import { CACHE_DIR, readHeader, readShards } from "./core/cache";
import { Graph, pretty } from "./core/ir";
import { defaultPolicy, lint, Policy, Report, snapshot } from "./core/lint";
import { gitHead, HeadlessOutcome, headlessLanguages, indexHeadless, init, owner, sourcesStamp } from "./engine";
import { entries, Entry, flow, Flow, FlowInputs, flowText } from "./core/flow";
import { Severity } from "./core/lint";
import { checkNarrative, narrativeKey, PhaseAsk, writeNarrative } from "./core/narrate";

export interface Loaded { graph: Graph; policy: Policy; stale?: string; indexed?: HeadlessOutcome["languages"] }

export function hasCache(repo: string): boolean {
  try {
    readHeader(repo);
    return true;
  } catch {
    return false;
  }
}

/** The stamp of the sources the last headless index read (`sourcesStamp`). */
const stampFile = (repo: string) => path.join(repo, CACHE_DIR, "sources");

/** The graph, re-indexed when asked or when there is none yet; asked, but with no file changed since
 *  the last index, the cached graph is the one indexing would build, so it is kept. */
export async function load(repo: string, index = false, report?: (s: string) => void): Promise<Loaded> {
  let indexed: HeadlessOutcome["languages"] | undefined;
  if (index || !hasCache(repo)) {
    const stamp = sourcesStamp(repo);
    let last = "";
    try {
      if (hasCache(repo)) last = fs.readFileSync(stampFile(repo), "utf8");
    } catch {}
    if (stamp === last) indexed = headlessLanguages(repo);
    else {
      indexed = (await indexHeadless(repo, [], report)).languages;
      fs.writeFileSync(stampFile(repo), stamp);
    }
  }
  const h = readHeader(repo);
  const graph = readShards(repo);
  const policy = defaultPolicy();
  const head = gitHead(repo);
  const stale = h.commit !== head ? `graph built at ${h.commit.slice(0, 12)}, HEAD is ${head.slice(0, 12)}; run \`hesperus index\` or \`hesperus flow --index\`` : undefined;
  return { graph, policy, stale, indexed };
}

/** Every call that leaves the repo, by boundary, as a report with no findings: the policy and the accepted
 *  baseline are not in use for now, so nothing is new and nothing is denied, and nothing is written. */
export const crossingsOf = (g: Graph, policy: Policy): Report => lint(g, policy, snapshot(g, policy, "none"));
export const crossings = (l: Loaded): Report => crossingsOf(l.graph, l.policy);

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

/** What the flow needs from a repo: its files' syntax (grammars loaded on demand), the policy's extra
 *  boundary packages, and the lint's findings per crossing. */
export async function flowInputs(repo: string, l: Loaded, r?: Report): Promise<FlowInputs> {
  const langs = new Set<string>();
  for (const n of l.graph.nodes) if (n.path && (n.kind === "function" || n.kind === "method" || n.kind === "file")) { const f = owner(n.path); if (f) langs.add(f.id); }
  await init([...langs]);
  const flags = new Map<string, { severity: Severity; notes: string[] }>();
  for (const f of r?.findings ?? []) {
    const k = `${f.local}\0${f.external}`;
    const x = flags.get(k);
    if (x) x.notes.push(f.message);
    else flags.set(k, { severity: f.severity, notes: [f.message] });
  }
  return {
    readSource: (p) => { try { return fs.readFileSync(path.join(repo, p), "utf8"); } catch { return undefined; } },
    syntaxFor: (p) => owner(p)?.syntax(p),
    importsFor: (p) => owner(p)?.imports,
    extra: l.policy.boundaries,
    flags,
  };
}

/** The entry points, and the flow from one of them: the first, or the one `pick` names (a graph id, or a
 *  name to match). Step ids in `open` are inlined. */
export async function flowOf(repo: string, l: Loaded, r: Report, pick?: string, open: Iterable<string> = []): Promise<{ entries: Entry[]; flow?: Flow }> {
  const inp = await flowInputs(repo, l, r);
  const all = entries(l.graph, inp);
  let entry = pick === undefined ? all[0] : all.find((e) => e.id === pick);
  if (!entry && pick !== undefined) {
    const q = pick.toLowerCase();
    entry = all.find((e) => e.name.toLowerCase() === q) ?? all.find((e) => e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q));
    // Any callable, entry or not: a flow can start anywhere.
    if (!entry) {
      const n = l.graph.nodes.find((x) => x.id === pick) ?? l.graph.nodes.find((x) => x.path && (x.kind === "function" || x.kind === "method") && x.name.toLowerCase() === q);
      if (n) return { entries: all, flow: flow(l.graph, n.id, new Set(open), inp) };
    }
  }
  return { entries: all, flow: entry ? flow(l.graph, entry.id, new Set(open), inp) : undefined };
}

/** The flow as text: the entry points when none is picked and there are several, else the steps. */
export async function flowTextOf(repo: string, l: Loaded, r: Report, pick?: string, open?: Iterable<string>, depth = 0): Promise<string> {
  const { entries: all, flow: f } = await flowOf(repo, l, r, pick, open);
  if (!f) return pick === undefined ? "No entry point: nothing in the repo is reached from outside it, or nothing is indexed.\n" : `No entry point or callable matches "${pick}". Entry points: ${all.slice(0, 20).map((e) => e.name).join(", ")}\n`;
  const out = depth > 0 ? await deepen(l, r, f, depth, repo, open) : f;
  const head = pick === undefined && all.length > 1 ? `Entry points (${all.length}): ${all.slice(0, 12).map((e) => `${e.name} [${e.reach}]`).join(", ")}${all.length > 12 ? ", …" : ""}\n\n` : "";
  return head + flowText(out);
}

/** The flow `depth` levels deep, as text with its top-level steps tagged, for an agent to read; the entry
 *  points when `pick` names none. */
export async function flowFor(repo: string, l: Loaded, r: Report, pick?: string, depth = 2): Promise<{ entries: Entry[]; flow?: Flow }> {
  const { entries: all, flow: f } = await flowOf(repo, l, r, pick);
  return { entries: all, flow: f && depth > 0 ? await deepen(l, r, f, depth, repo) : f };
}

/** Takes an agent's narrative of an entry's control flow, checked against the flow, and keeps it under
 *  `.hesperus/` for the editor to draw. Returns what was kept, or why nothing was. */
export async function narrate(repo: string, l: Loaded, r: Report, pick: string | undefined, summary: unknown, phases: unknown, via?: string): Promise<string> {
  const { entries: all, flow: f } = await flowOf(repo, l, r, pick);
  if (!f) return `No entry point or callable matches "${pick ?? ""}". Entry points: ${all.slice(0, 20).map((e) => e.name).join(", ")}`;
  const n = checkNarrative(summary, phases as PhaseAsk[], f, via);
  if (!n) return `Nothing usable: give a summary string and phases as [{title, from, to}] over steps 1 to ${f.steps.length} of ${f.entry.name}.`;
  writeNarrative(repo, narrativeKey(f), n);
  const dropped = Array.isArray(phases) ? phases.length - n.phases.length : 0;
  return `Kept for ${f.entry.name} (${f.entry.path}:${f.entry.line}): ${n.phases.length} phases over ${f.steps.length} top-level steps${dropped > 0 ? `; ${dropped} dropped (out of range or out of order)` : ""}. The editor draws it on the control flow chart.`;
}

/** Opens every call `depth` levels down, so a terminal sees the whole tree at once. */
async function deepen(l: Loaded, r: Report, f: Flow, depth: number, repo: string, open: Iterable<string> = []): Promise<Flow> {
  const ids = new Set(open);
  let cur = f;
  for (let d = 0; d < depth; d++) {
    let more = false;
    const walk = (steps: typeof cur.steps) => {
      for (const s of steps) {
        if (s.kind === "call") { if (!ids.has(s.id)) (ids.add(s.id), (more = true)); if (s.steps) walk(s.steps); }
        else if (s.kind === "if") (walk(s.yes), walk(s.no));
        else if (s.kind === "loop" || s.kind === "catch") walk(s.body);
        else if (s.kind === "switch") for (const c of s.cases) walk(c.body);
      }
    };
    walk(cur.steps);
    if (!more) break;
    cur = (await flowOf(repo, l, r, f.entry.id, ids)).flow ?? cur;
  }
  return cur;
}

export const isBoundary = (s: string): s is Boundary => (BOUNDARIES as readonly string[]).includes(s);
