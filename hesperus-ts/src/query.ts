// Questions an agent or a developer asks of a repository, answered from its flow:
// which entry points exist, what one of them reaches, which entries a change sits under,
// what a diff newly reaches outside the program, and whether the constraints hold.
// The flow is cached in `.hesperus/actual/flow.json` and recomputed when any source file
// is newer than it.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { flow, Flow, FlowCall, FlowConstraint, FlowCrossing, FlowEntry, FlowStep, FlowUnit, writeFlow } from "./flow.js";
import { identify, Ir } from "./ir.js";
import { Workspace } from "./workspace.js";

export interface LoadOptions {
  intent: Ir | null;
  rootName?: string;
  /** Where the flow is cached; default `<repo>/.hesperus/actual/flow.json`. */
  cache?: string | null;
  /** Ignore the cache. */
  fresh?: boolean;
}

export const isCall = (s: FlowStep): s is FlowCall => "call" in s;
export const isCrossing = (s: FlowStep): s is FlowCrossing => "boundary" in s;

/** The flow of a repository, from the cache when it is newer than every source file, else recomputed and cached. */
export function loadFlow(repo: string, opts: LoadOptions): { flow: Flow; cached: boolean } {
  const cache = opts.cache === undefined ? path.join(repo, ".hesperus", "actual", "flow.json") : opts.cache;
  if (cache && !opts.fresh && fs.existsSync(cache)) {
    try {
      const stamp = fs.statSync(cache).mtimeMs;
      const ws = new Workspace(repo);
      const inputs = [...ws.files, "package.json", "tsconfig.json"].map((f) => path.join(repo, f));
      const stale = inputs.some((f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > stamp);
      if (!stale) {
        const f = JSON.parse(fs.readFileSync(cache, "utf8")) as Flow;
        if (f.flow === "0.2" && (!opts.rootName || f.root === opts.rootName)) return { flow: f, cached: true };
      }
    } catch {
      // unreadable cache: recompute
    }
  }
  const f = flow(repo, { intent: opts.intent, rootName: opts.rootName });
  if (cache) {
    try {
      writeFlow(f, cache);
    } catch {
      // read-only tree: fine, just not cached
    }
  }
  return { flow: f, cached: false };
}

/** An entry by id, or by label when exactly one matches (case-insensitive, substring). */
export function findEntry(f: Flow, key: string): FlowEntry | { ambiguous: FlowEntry[] } | null {
  const byId = f.entries.find((e) => e.id === key);
  if (byId) return byId;
  const k = key.toLowerCase();
  const exact = f.entries.filter((e) => e.label.toLowerCase() === k);
  if (exact.length === 1) return exact[0];
  const loose = exact.length ? exact : f.entries.filter((e) => e.label.toLowerCase().includes(k) || e.unit.toLowerCase().includes(k));
  if (loose.length === 1) return loose[0];
  return loose.length ? { ambiguous: loose } : null;
}

export interface EntrySummary {
  id: string;
  kind: FlowEntry["kind"];
  label: string;
  unit: string;
  at: string;
  /** Functions reached, counting each once. */
  functions: number;
  /** Boundaries reached: `boundary node edge`, each once, in first-seen order. */
  boundaries: string[];
}

export function summarize(f: Flow, e: FlowEntry): EntrySummary {
  const fns = new Set<string>([e.unit]);
  const bounds: string[] = [];
  const walk = (steps: FlowStep[]) => {
    for (const s of steps) {
      if (isCrossing(s)) {
        const key = `${s.boundary} ${s.node} ${s.edge}`;
        if (!bounds.includes(key)) bounds.push(key);
      } else {
        fns.add(s.call);
        if (s.steps) walk(s.steps);
      }
    }
  };
  walk(e.steps);
  return { id: e.id, kind: e.kind, label: e.label, unit: e.unit, at: e.at, functions: fns.size, boundaries: bounds };
}

/** The entries whose paths pass through a file, or a line of it, with the functions they pass. */
export function reaches(f: Flow, file: string, line?: number): { entry: FlowEntry; units: FlowUnit[] }[] {
  const norm = file.replace(/\\/g, "/").replace(/^\.\//, "");
  const hit = new Set(f.units.filter((u) => u.file === norm && (line === undefined || (u.line <= line && line <= u.end))).map((u) => u.id));
  if (hit.size === 0) return [];
  const byId = new Map(f.units.map((u) => [u.id, u]));
  const out: { entry: FlowEntry; units: FlowUnit[] }[] = [];
  for (const e of f.entries) {
    const found = new Set<string>();
    if (hit.has(e.unit)) found.add(e.unit);
    const walk = (steps: FlowStep[]) => {
      for (const s of steps) {
        if (isCrossing(s)) continue;
        if (hit.has(s.call)) found.add(s.call);
        if (s.steps) walk(s.steps);
      }
    };
    walk(e.steps);
    if (found.size) out.push({ entry: e, units: [...found].map((id) => byId.get(id)!).filter(Boolean) });
  }
  return out;
}

export interface BoundaryChange {
  entry: string;
  label: string;
  boundary: FlowCrossing["boundary"];
  node: string;
  edge: string;
  /** The function the crossing sits in, and the site. */
  unit: string;
  at: string;
}

export interface FlowDiff {
  since: string;
  /** Source files that differ between the two trees. */
  changed: string[];
  /** Entries each changed file sits under now. */
  affected: { file: string; entries: string[] }[];
  addedEntries: EntrySummary[];
  removedEntries: EntrySummary[];
  /** Crossings an entry reaches now and did not before, and the reverse. */
  addedCrossings: BoundaryChange[];
  removedCrossings: BoundaryChange[];
  /** Constraints whose result changed, with the current result. */
  constraints: FlowConstraint[];
}

function crossingsOf(f: Flow): Map<string, BoundaryChange> {
  const out = new Map<string, BoundaryChange>();
  for (const e of f.entries) {
    const walk = (unit: string, steps: FlowStep[]) => {
      for (const s of steps) {
        if (isCrossing(s)) {
          const key = `${e.label}\u0000${s.boundary}\u0000${s.node}\u0000${s.edge}`;
          if (!out.has(key)) out.set(key, { entry: e.id, label: e.label, boundary: s.boundary, node: s.node, edge: s.edge, unit, at: s.at });
        } else if (s.steps) walk(s.call, s.steps);
      }
    };
    walk(e.unit, e.steps);
  }
  return out;
}

/** What `after` reaches that `before` did not, and the reverse. */
export function diffFlows(before: Flow, after: Flow, since: string, changed: string[]): FlowDiff {
  const b = crossingsOf(before);
  const a = crossingsOf(after);
  const addedCrossings = [...a].filter(([k]) => !b.has(k)).map(([, v]) => v);
  const removedCrossings = [...b].filter(([k]) => !a.has(k)).map(([, v]) => v);
  const labels = (f: Flow) => new Set(f.entries.map((e) => `${e.kind}\u0000${e.label}\u0000${e.unit}`));
  const bl = labels(before);
  const al = labels(after);
  const addedEntries = after.entries.filter((e) => !bl.has(`${e.kind}\u0000${e.label}\u0000${e.unit}`)).map((e) => summarize(after, e));
  const removedEntries = before.entries.filter((e) => !al.has(`${e.kind}\u0000${e.label}\u0000${e.unit}`)).map((e) => summarize(before, e));
  const key = (c: FlowConstraint) => `${c.rule} ${c.from} ${c.to} ${c.kind ?? ""}`;
  const was = new Map(before.constraints.map((c) => [key(c), c.satisfied]));
  const constraints = after.constraints.filter((c) => was.get(key(c)) !== c.satisfied);
  const affected = changed.map((file) => ({ file, entries: reaches(after, file).map((r) => r.entry.id) })).filter((x) => x.entries.length);
  return { since, changed, affected, addedEntries, removedEntries, addedCrossings, removedCrossings, constraints };
}

/** Source files changed between a revision and the working tree (or `--staged`/another revision via `to`). */
export function changedFiles(repo: string, since: string, to?: string): string[] {
  const args = ["-C", repo, "diff", "--name-only", since, ...(to ? [to] : [])];
  const out = execFileSync("git", args, { encoding: "utf8" });
  return out.split("\n").map((l) => l.trim()).filter((l) => /\.(ts|tsx|mts|cts)$/.test(l) && !l.endsWith(".d.ts"));
}

/**
 * The flow of a repository at a git revision: its TypeScript sources, package.json and
 * tsconfig files are materialized into a temporary directory and read there.
 */
export function flowAt(repo: string, rev: string, opts: { intent: Ir | null; rootName?: string }): Flow {
  const list = execFileSync("git", ["-C", repo, "ls-tree", "-r", "--name-only", rev], { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && (/\.(ts|tsx|mts|cts)$/.test(l) || /(^|\/)(package\.json|tsconfig\.json|pnpm-workspace\.yaml)$/.test(l)) && !l.split("/").some((p) => p === "node_modules" || p === "dist" || p === "build"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hesperus-at-"));
  try {
    if (list.length) {
      const blob = execFileSync("git", ["-C", repo, "cat-file", "--batch"], { input: list.map((f) => `${rev}:${f}`).join("\n") + "\n", maxBuffer: 1 << 30 });
      let pos = 0;
      for (const f of list) {
        const nl = blob.indexOf(0x0a, pos);
        const header = blob.subarray(pos, nl).toString("utf8");
        pos = nl + 1;
        if (header.endsWith(" missing")) continue;
        const size = Number(header.split(" ")[2]);
        const content = blob.subarray(pos, pos + size);
        pos += size + 1; // trailing newline
        const target = path.join(dir, f);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
      }
    }
    const rootName = opts.rootName ?? opts.intent?.root ?? identify(path.basename(path.resolve(repo)));
    return flow(dir, { intent: opts.intent, rootName });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---- text renderings, for a terminal or an agent reading tool output

export function renderEntries(f: Flow): string {
  const lines: string[] = [];
  for (const e of f.entries) {
    const s = summarize(f, e);
    lines.push(`${e.id}\n  ${e.kind} ${e.label}  @${e.at}  ${s.functions} function${s.functions === 1 ? "" : "s"}${s.boundaries.length ? "  -> " + s.boundaries.join(", ") : "  (stays inside the program)"}`);
  }
  return lines.join("\n") + (lines.length ? "\n" : "no entry points found\n");
}

export function renderEntry(f: Flow, e: FlowEntry): string {
  const units = new Map(f.units.map((u) => [u.id, u]));
  const owner = (id: string) => {
    const u = units.get(id);
    if (!u) return "";
    const c = f.components.find((x) => x.id === u.owner);
    return c ? ` [${c.label ?? c.name}]` : "";
  };
  const lines: string[] = [`${e.kind} ${e.label}  @${e.at}`, `  ${e.unit}${owner(e.unit)}  @${units.get(e.unit)?.file ?? ""}:${units.get(e.unit)?.line ?? ""}`];
  const walk = (steps: FlowStep[], indent: string) => {
    for (const s of steps) {
      if (isCrossing(s)) lines.push(`${indent}-> ${s.boundary} ${s.label} (${s.node}) ${s.edge}${s.resolved ? "" : " unresolved"}  @${s.at}`);
      else {
        const u = units.get(s.call);
        lines.push(`${indent}${s.how ? `(${s.how}) ` : ""}${u?.name ?? s.call}${owner(s.call)}${s.cut ? ` [${s.cut}]` : ""}  @${s.at}${u ? ` -> ${u.file}:${u.line}` : ""}`);
        if (s.steps) walk(s.steps, indent + "  ");
      }
    }
  };
  walk(e.steps, "    ");
  return lines.join("\n") + "\n";
}

export function renderReaches(f: Flow, file: string, line: number | undefined, hits: { entry: FlowEntry; units: FlowUnit[] }[]): string {
  const where = line === undefined ? file : `${file}:${line}`;
  if (!hits.length) return `${where}: no entry point reaches it\n`;
  return `${where}: reached by ${hits.length} entr${hits.length === 1 ? "y" : "ies"}\n` + hits.map((h) => `  ${h.entry.id}\n    ${h.entry.kind} ${h.entry.label} via ${h.units.map((u) => u.name).join(", ")}`).join("\n") + "\n";
}

export function renderConstraints(f: Flow): string {
  if (!f.constraints.length) return "no constraints in the intent\n";
  return (
    f.constraints
      .map((c) => `${c.satisfied ? "ok" : "x "} ${c.rule} ${c.from} -> ${c.to}${c.kind ? `: ${c.kind}` : ""}${c.witnesses.length ? "\n" + c.witnesses.map((w) => `     ${w.at}${w.entries.length ? `  (${w.entries.join(", ")})` : ""}`).join("\n") : ""}`)
      .join("\n") + "\n"
  );
}

export function renderDiff(d: FlowDiff): string {
  const lines: string[] = [`since ${d.since}: ${d.changed.length} source file${d.changed.length === 1 ? "" : "s"} changed`];
  for (const a of d.affected) lines.push(`  ${a.file} is under ${a.entries.join(", ")}`);
  for (const f of d.changed) if (!d.affected.some((a) => a.file === f)) lines.push(`  ${f} is under no entry point`);
  const cross = (c: BoundaryChange) => `${c.label}: ${c.boundary} ${c.node} ${c.edge} from ${c.unit}  @${c.at}`;
  if (d.addedCrossings.length) lines.push("newly reached:", ...d.addedCrossings.map((c) => `  + ${cross(c)}`));
  if (d.removedCrossings.length) lines.push("no longer reached:", ...d.removedCrossings.map((c) => `  - ${cross(c)}`));
  if (d.addedEntries.length) lines.push("new entry points:", ...d.addedEntries.map((e) => `  + ${e.kind} ${e.label}  @${e.at}`));
  if (d.removedEntries.length) lines.push("removed entry points:", ...d.removedEntries.map((e) => `  - ${e.kind} ${e.label}  @${e.at}`));
  if (d.constraints.length) lines.push("constraints that changed:", ...d.constraints.map((c) => `  ${c.satisfied ? "ok" : "x "} ${c.rule} ${c.from} -> ${c.to}${c.kind ? `: ${c.kind}` : ""}`));
  if (!d.addedCrossings.length && !d.removedCrossings.length && !d.addedEntries.length && !d.removedEntries.length && !d.constraints.length) lines.push("nothing new leaves the program; no entry points or constraints changed");
  return lines.join("\n") + "\n";
}
