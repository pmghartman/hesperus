#!/usr/bin/env node
// `hesperus`: thin wrapper over the engine; also the test harness.
import * as fs from "node:fs";
import * as path from "node:path";
import { view } from "./core/aggregate";
import { pretty, toJson } from "./core/ir";
import { CACHE_DIR, index, load, status, tools } from "./engine";
import { PKG_ROOT } from "./root";

const USAGE = `usage:
  hesperus index <repo> [--scip <index.scip>]... [--tools-dir <dir>] [--lockfile <rel-path>]...
                                                     without --scip, runs each detected language's indexer
  hesperus tools <repo> [--tools-dir <dir>]          languages found and the indexers they need, as JSON
  hesperus status <repo> [--lockfile <rel-path>]...  cache state as JSON: ready, stale, or missing
  hesperus graph <repo> [--lockfile <rel-path>]...   print the cached graph
  hesperus view  <repo> [--expand <node-id>]...      rollups for an expansion state
  hesperus schema                                    print the graph JSON schema`;

interface Opts { positional: string[]; scip: string[]; toolsDir?: string; lockfiles: string[]; expand: Set<string> }

function parse(args: string[]): Opts {
  const o: Opts = { positional: [], scip: [], lockfiles: [], expand: new Set() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const val = () => {
      if (i + 1 >= args.length) throw new Error(`${a} needs a value`);
      return args[++i];
    };
    if (a === "--scip") o.scip.push(val());
    else if (a === "--tools-dir") o.toolsDir = val();
    else if (a === "--lockfile") o.lockfiles.push(val());
    else if (a === "--expand") o.expand.add(val());
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}\n${USAGE}`);
    else o.positional.push(a);
  }
  return o;
}

function repoArg(o: Opts): string {
  const p = o.positional[0];
  if (p === undefined) throw new Error(USAGE);
  if (!fs.statSync(p, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${p}: not a directory`);
  return p;
}

async function run(args: string[]): Promise<string> {
  const [cmd, ...rest] = args;
  if (cmd === undefined) throw new Error(USAGE);
  const o = parse(rest);
  switch (cmd) {
    case "schema":
      return fs.readFileSync(path.join(PKG_ROOT, "schema", "graph.schema.json"), "utf8");
    case "index": {
      const g = await index(repoArg(o), { scip: o.scip, toolsDir: o.toolsDir, lockfiles: o.lockfiles });
      return `indexed ${g.nodes.length} nodes, ${g.edges.length} edges into ${CACHE_DIR}/\n`;
    }
    case "status":
      return JSON.stringify(status(repoArg(o), o.lockfiles)) + "\n";
    case "tools":
      return pretty(tools(repoArg(o), o.toolsDir));
    case "graph":
      return toJson(load(repoArg(o), o.lockfiles));
    case "view":
      return pretty(view(load(repoArg(o), o.lockfiles), o.expand));
    default:
      throw new Error(USAGE);
  }
}

run(process.argv.slice(2)).then(
  (out) => process.stdout.write(out),
  (e) => {
    process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  },
);
