#!/usr/bin/env node
// Hesperus from a terminal, a hook or an agent: index a repo without an editor, lint it, draw it,
// or serve it over MCP. The editor extension keeps `.hesperus/` current when the repo is open there;
// `index` does the same from syntax alone.
import * as path from "node:path";
import { CACHE_DIR } from "./core/cache";
import { BOUNDARY_INFO } from "./core/boundary";
import { POLICY_FILE } from "./core/lint";
import { serve } from "./mcp";
import { acceptKeys, check, checkJson, drawSvg, load, VIEW_FILE } from "./service";

const USAGE = `usage: hesperus <command> [dir] [options]

  index [dir]            build the graph from syntax alone (no editor needed) into <dir>/${CACHE_DIR}/
  check [dir]            lint boundary crossings against <dir>/${POLICY_FILE} and the accepted baseline
    --index              re-index first (done anyway when there is no graph yet)
    --json               print the report as JSON
    --svg                also draw the boundary overview to <dir>/${CACHE_DIR}/${VIEW_FILE}
    --accept             accept every current crossing as reviewed, then exit 0
    --max-warnings N     exit 1 when there are more than N warnings (default: no limit)
  svg [dir]              draw the boundary overview to <dir>/${CACHE_DIR}/${VIEW_FILE}
  mcp [dir]              serve the repo to an agent over MCP on stdin/stdout

Boundaries: database, network, AI, cloud, queues, filesystem, processes, environment.
Exit status: 0 clean, 1 findings over the limit or any error, 2 no graph or bad input.`;

async function main(argv: string[]): Promise<number> {
  const flags = new Set<string>(), args: string[] = [];
  let maxWarnings = Infinity;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--max-warnings") maxWarnings = Number(argv[++i]);
    else if (argv[i].startsWith("--")) flags.add(argv[i]);
    else args.push(argv[i]);
  }
  const flag = (f: string) => flags.has(f);
  const cmd = args[0];
  if (!["index", "check", "svg", "mcp"].includes(cmd) || args.length > 2 || flag("--help") || Number.isNaN(maxWarnings)) {
    console.error(USAGE);
    return 2;
  }
  const repo = path.resolve(args[1] ?? ".");
  if (cmd === "mcp") {
    await serve(repo);
    return 0;
  }
  try {
    const l = await load(repo, cmd === "index" || flag("--index"), (s) => console.error(`hesperus: ${s}`));
    if (l.indexed) {
      for (const lang of l.indexed) console.error(`hesperus: ${lang.id}: ${lang.files} files${lang.indexed ? "" : " (not indexed: no headless support)"}`);
      console.error(`hesperus: ${l.graph.nodes.length} nodes, ${l.graph.edges.length} edges.`);
    }
    if (cmd === "index") return 0;
    if (flag("--accept")) {
      console.log(`hesperus: accepted ${acceptKeys(repo, l)} crossings.`);
      return 0;
    }
    const r = check(repo, l);
    if (cmd === "svg" || flag("--svg")) {
      await drawSvg(repo, l, r);
      console.error(`hesperus: drew ${path.join(CACHE_DIR, VIEW_FILE)}`);
      if (cmd === "svg") return 0;
    }
    if (flag("--json")) process.stdout.write(checkJson(l, r));
    else {
      if (l.stale) console.error(`hesperus: stale: ${l.stale}`);
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
  } catch (e) {
    console.error(`hesperus: ${(e as Error).message}`);
    return 2;
  }
}

main(process.argv.slice(2)).then((code) => (process.exitCode = code));
