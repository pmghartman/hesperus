#!/usr/bin/env node
// hesperus-ts: the extractor and the questions it answers.
//
//   extract <repo> [--intent ir.json] [--root name] [--flow flow.json]   actual IR on stdout; --flow also writes the flow
//   flow <repo> [entry] [--json]        one entry as a tree (or the whole flow as JSON)
//   entries <repo> [--json]             every entry point, what it reaches
//   reaches <repo> <file[:line]>...     which entry points pass through a file or line
//   boundaries <repo> --since <rev>     what a diff newly reaches outside the program
//   check <repo>                        the intent's constraints; exit 1 on a violation
//   explain <file.ts>                   the facts of one file and the rule rows they fire
//   rules                               the rule table as JSON
//   mcp <repo>                          the same questions as an MCP server on stdio
//
// The intent IR comes from --intent, or from stdin for `extract` (empty means no bindings),
// or from `.hesperus/actual/intent.json` next to the cached flow when neither is given.
// Queries use the cached `.hesperus/actual/flow.json` when it is newer than every source
// file; --fresh recomputes.

import * as fs from "node:fs";
import * as path from "node:path";
import { applyRules } from "./engine.js";
import { extract } from "./extract.js";
import { factsOf, newProject } from "./facts.js";
import { flow, toFlowJson, writeFlow } from "./flow.js";
import { Ir, toJson } from "./ir.js";
import { changedFiles, diffFlows, findEntry, flowAt, loadFlow, reaches, renderConstraints, renderDiff, renderEntries, renderEntry, renderReaches, summarize } from "./query.js";
import { RULES } from "./rules.js";

const COMMANDS = ["extract", "flow", "entries", "reaches", "boundaries", "check", "explain", "rules", "mcp"];

function usage(): never {
  process.stderr.write(
    [
      "usage: hesperus-ts extract <repo> [--intent <ir.json>] [--root <name>] [--flow <flow.json>]",
      "       hesperus-ts flow <repo> [<entry>] [--intent <ir.json>] [--json] [--fresh]",
      "       hesperus-ts entries <repo> [--json] [--fresh]",
      "       hesperus-ts reaches <repo> <file[:line]>... [--json]",
      "       hesperus-ts boundaries <repo> --since <rev> [--json]",
      "       hesperus-ts check <repo>",
      "       hesperus-ts explain <file.ts>",
      "       hesperus-ts rules",
      "       hesperus-ts mcp <repo>",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

interface Opts {
  intent: Ir | null;
  rootName?: string;
  json: boolean;
  fresh: boolean;
  since?: string;
  flowPath?: string;
  rest: string[];
}

function parseIntent(text: string): Ir {
  let intent: Ir;
  try {
    intent = JSON.parse(text) as Ir;
  } catch (e) {
    process.stderr.write(`hesperus-ts: intent is not JSON: ${(e as Error).message}\n`);
    process.exit(2);
  }
  if (intent.hesperus !== "0.1") {
    process.stderr.write(`hesperus-ts: intent IR version ${intent.hesperus} is not 0.1\n`);
    process.exit(2);
  }
  return intent;
}

/** Options after `<command> <repo>`; the intent from --intent, else stdin for extract, else the cached one. */
async function parse(args: string[], repo: string, stdinIntent: boolean): Promise<Opts> {
  const o: Opts = { intent: null, json: false, fresh: false, rest: [] };
  let intentPath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--intent") intentPath = args[++i] ?? usage();
    else if (a === "--root") o.rootName = args[++i] ?? usage();
    else if (a === "--flow") o.flowPath = args[++i] ?? usage();
    else if (a === "--since") o.since = args[++i] ?? usage();
    else if (a === "--json") o.json = true;
    else if (a === "--fresh") o.fresh = true;
    else if (a.startsWith("--")) usage();
    else o.rest.push(a);
  }
  const cached = path.join(repo, ".hesperus", "actual", "intent.json");
  const text = intentPath ? fs.readFileSync(intentPath, "utf8") : stdinIntent ? await readStdin() : fs.existsSync(cached) ? fs.readFileSync(cached, "utf8") : "";
  if (text.trim()) o.intent = parseIntent(text);
  return o;
}

function repoArg(a: string | undefined): string {
  if (!a) usage();
  const repo = path.resolve(a);
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
    process.stderr.write(`hesperus-ts: ${repo} is not a directory\n`);
    process.exit(2);
  }
  return repo;
}

/** Remember the intent beside the cached flow, so later queries bind the same way. */
function rememberIntent(repo: string, intent: Ir | null) {
  const dir = path.join(repo, ".hesperus", "actual");
  try {
    if (intent) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "intent.json"), JSON.stringify(intent, null, 2) + "\n");
    }
  } catch {
    // read-only tree
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || !COMMANDS.includes(cmd)) usage();
  if (cmd === "rules") {
    process.stdout.write(JSON.stringify(RULES, null, 2) + "\n");
    return;
  }
  if (cmd === "explain") {
    if (!args[1]) usage();
    const file = path.resolve(args[1]);
    const facts = factsOf(newProject(), path.basename(file), fs.readFileSync(file, "utf8"));
    const findings = applyRules(facts);
    process.stdout.write(JSON.stringify({ facts: facts.facts, findings }, null, 2) + "\n");
    return;
  }
  const repo = repoArg(args[1]);
  const o = await parse(args.slice(2), repo, cmd === "extract");
  if (cmd === "extract") {
    const ir = extract(repo, { intent: o.intent, rootName: o.rootName });
    if (o.flowPath) {
      writeFlow(flow(repo, { intent: o.intent, rootName: o.rootName }), path.resolve(o.flowPath));
      rememberIntent(repo, o.intent);
    }
    process.stdout.write(toJson(ir));
    return;
  }
  if (cmd === "mcp") {
    const { serve } = await import("./mcp.js");
    await serve(repo, { intent: o.intent, rootName: o.rootName });
    return;
  }
  const { flow: f } = loadFlow(repo, { intent: o.intent, rootName: o.rootName, fresh: o.fresh });
  switch (cmd) {
    case "flow": {
      if (!o.rest[0]) {
        process.stdout.write(toFlowJson(f));
        return;
      }
      const e = findEntry(f, o.rest[0]);
      if (!e) {
        process.stderr.write(`hesperus-ts: no entry matches ${o.rest[0]}; run \`hesperus-ts entries\`\n`);
        process.exit(1);
      }
      if ("ambiguous" in e) {
        process.stderr.write(`hesperus-ts: ${e.ambiguous.length} entries match ${o.rest[0]}:\n${e.ambiguous.map((x) => `  ${x.id}`).join("\n")}\n`);
        process.exit(1);
      }
      process.stdout.write(o.json ? JSON.stringify(e, null, 2) + "\n" : renderEntry(f, e));
      return;
    }
    case "entries":
      process.stdout.write(o.json ? JSON.stringify(f.entries.map((e) => summarize(f, e)), null, 2) + "\n" : renderEntries(f));
      return;
    case "reaches": {
      if (!o.rest.length) usage();
      const results = o.rest.map((spec) => {
        const m = /^(.*?)(?::(\d+))?$/.exec(spec)!;
        const file = path.relative(repo, path.resolve(repo, m[1])).split(path.sep).join("/");
        const line = m[2] ? Number(m[2]) : undefined;
        return { file, line, hits: reaches(f, file, line) };
      });
      process.stdout.write(o.json ? JSON.stringify(results.map((r) => ({ file: r.file, line: r.line ?? null, entries: r.hits.map((h) => ({ id: h.entry.id, kind: h.entry.kind, label: h.entry.label, via: h.units.map((u) => u.id) })) })), null, 2) + "\n" : results.map((r) => renderReaches(f, r.file, r.line, r.hits)).join(""));
      return;
    }
    case "boundaries": {
      if (!o.since) usage();
      let before;
      let changed;
      try {
        before = flowAt(repo, o.since, { intent: o.intent, rootName: f.root });
        changed = changedFiles(repo, o.since);
      } catch (e) {
        process.stderr.write(`hesperus-ts: git: ${(e as Error).message.split("\n")[0]}\n`);
        process.exit(2);
      }
      const d = diffFlows(before, f, o.since, changed);
      process.stdout.write(o.json ? JSON.stringify(d, null, 2) + "\n" : renderDiff(d));
      return;
    }
    case "check": {
      process.stdout.write(o.json ? JSON.stringify(f.constraints, null, 2) + "\n" : renderConstraints(f));
      if (f.constraints.some((c) => !c.satisfied)) process.exit(1);
      return;
    }
  }
}

main().catch((e) => {
  process.stderr.write(`hesperus-ts: ${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
