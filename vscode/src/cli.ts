#!/usr/bin/env node
// Headless lint over the graph the editor last built: for agents, hooks and scripts. It does not index;
// the extension keeps `.hesperus/` current while it runs.
import * as path from "node:path";
import { CACHE_DIR, readHeader, readShards } from "./core/cache";
import { BOUNDARY_INFO } from "./core/boundary";
import { Graph } from "./core/ir";
import { accept, lint, Policy, POLICY_FILE, reportToJson, snapshot } from "./core/lint";
import { gitHead, readBaseline, readPolicy, writeBaseline, writeReport } from "./review";

const USAGE = `usage: hesperus check [dir] [--json] [--accept] [--max-warnings N]

Lints boundary crossings (database, network, AI, cloud, queues, filesystem, processes, environment) in
the graph under <dir>/${CACHE_DIR}/ against <dir>/${POLICY_FILE} and the accepted baseline.
  --json            print the report as JSON
  --accept          accept every current crossing as reviewed, then exit 0
  --max-warnings N  exit 1 when there are more than N warnings (default: no limit)
Exit status: 0 clean, 1 findings over the limit or any error, 2 no graph or bad input.`;

function main(argv: string[]): number {
  const flags = new Set<string>(), args: string[] = [];
  let maxWarnings = Infinity;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--max-warnings") maxWarnings = Number(argv[++i]);
    else if (argv[i].startsWith("--")) flags.add(argv[i]);
    else args.push(argv[i]);
  }
  const flag = (f: string) => flags.has(f);
  if (args[0] !== "check" || args.length > 2 || flag("--help") || Number.isNaN(maxWarnings)) {
    console.error(USAGE);
    return 2;
  }
  const repo = path.resolve(args[1] ?? ".");
  let g: Graph, policy: Policy, stale: string | undefined;
  try {
    const h = readHeader(repo);
    g = readShards(repo);
    policy = readPolicy(repo);
    const head = gitHead(repo);
    // The commit is the one staleness signal a script can check without re-indexing.
    if (h.commit !== head) stale = `graph built at ${h.commit.slice(0, 12)}, HEAD is ${head.slice(0, 12)}; Hesperus refreshes it while the repo is open in the editor`;
  } catch (e) {
    console.error(`hesperus: ${(e as Error).message}\nOpen the folder in VS Code with the Hesperus extension to build the graph.`);
    return 2;
  }
  const base = readBaseline(repo);
  if (flag("--accept")) {
    const now = snapshot(g, policy, gitHead(repo));
    writeBaseline(repo, base ? accept({ ...base, commit: now.commit }, [...now.crossings, ...now.packages]) : now);
    console.log(`hesperus: accepted ${now.crossings.length} crossings.`);
    return 0;
  }
  const r = lint(g, policy, base);
  writeReport(repo, g, r, stale);
  if (flag("--json")) process.stdout.write(reportToJson(g, r, stale));
  else {
    if (stale) console.error(`hesperus: stale: ${stale}`);
    for (const f of r.findings) {
      const at = f.path ? `${f.path}:${(f.range?.start_line ?? 0) + 1}:${(f.range?.start_col ?? 0) + 1}` : "-";
      console.log(`${at}  ${f.severity}  ${f.message}  [${f.rule}]`);
    }
    for (const k of r.removed) console.log(`-  info  No longer crossing: ${k}  [removed]`);
    const totals = Object.entries(r.counts).map(([b, n]) => `${BOUNDARY_INFO[b as keyof typeof BOUNDARY_INFO].label} ${n!.out + n!.in}`).join(", ");
    console.log(`\n${r.findings.length} findings. Crossings: ${totals || "none"}.`);
  }
  const errors = r.findings.filter((f) => f.severity === "error").length;
  const warnings = r.findings.filter((f) => f.severity === "warning").length;
  return errors || warnings > maxWarnings ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
