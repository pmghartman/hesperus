#!/usr/bin/env node
// Hesperus from a terminal, a hook or an agent: index a repo without an editor, trace its control flow,
// or serve it over MCP. The editor extension keeps `.hesperus/` current when the repo is open there;
// `index` does the same from syntax alone.
import * as path from "node:path";
import { CACHE_DIR } from "./core/cache";
import { serve } from "./mcp";
import { crossings, flowTextOf, load } from "./service";

const USAGE = `usage: hesperus <command> [dir] [options]

  index [dir]            build the graph from syntax alone (no editor needed) into <dir>/${CACHE_DIR}/
  flow [dir]             control flow from an entry point: calls in source order, branches, loops, boundary crossings
    --index              re-index first (done anyway when there is no graph yet)
    --entry NAME         start from this function or file (default: the entry point with the largest reach)
    --depth N            expand callees N levels down (default 1)
  mcp [dir]              serve the repo to an agent over MCP on stdin/stdout (tools, resources, prompts)

Boundaries: database, network, AI, cloud, queues, filesystem, processes, environment.
Exit status: 0 done, 1 error, 2 no graph or bad input.`;

async function main(argv: string[]): Promise<number> {
  const flags = new Set<string>(), args: string[] = [];
  let entry: string | undefined, depth = 1;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--entry") entry = argv[++i];
    else if (argv[i] === "--depth") depth = Number(argv[++i]);
    else if (argv[i].startsWith("--")) flags.add(argv[i]);
    else args.push(argv[i]);
  }
  const flag = (f: string) => flags.has(f);
  const cmd = args[0];
  if (!["index", "flow", "mcp"].includes(cmd) || Number.isNaN(depth) || args.length > 2 || flag("--help")) {
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
    if (l.stale) console.error(`hesperus: stale: ${l.stale}`);
    process.stdout.write(await flowTextOf(repo, l, crossings(l), entry, [], depth));
    return 0;
  } catch (e) {
    console.error(`hesperus: ${(e as Error).message}`);
    return 1;
  }
}

main(process.argv.slice(2)).then((code) => (process.exitCode = code));
