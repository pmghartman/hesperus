#!/usr/bin/env node
// hesperus-ts extract <repo> [--intent ir.json]: reads the intent IR from --intent or
// stdin (empty stdin means no bindings) and prints the actual IR as JSON.

import * as fs from "node:fs";
import * as path from "node:path";
import { applyRules } from "./engine.js";
import { extract } from "./extract.js";
import { factsOf, newProject } from "./facts.js";
import { Ir, toJson } from "./ir.js";
import { RULES } from "./rules.js";

function usage(): never {
  process.stderr.write("usage: hesperus-ts extract <repo> [--intent <ir.json>] [--root <name>]\n       hesperus-ts explain <file.ts>   # the facts of one file and the rule rows they fire\n       hesperus-ts rules               # the rule table as JSON\n");
  process.exit(2);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "rules") {
    process.stdout.write(JSON.stringify(RULES, null, 2) + "\n");
    return;
  }
  if (args[0] === "explain" && args[1]) {
    const file = path.resolve(args[1]);
    const facts = factsOf(newProject(), path.basename(file), fs.readFileSync(file, "utf8"));
    const findings = applyRules(facts);
    process.stdout.write(JSON.stringify({ facts: facts.facts, findings }, null, 2) + "\n");
    return;
  }
  if (args[0] !== "extract" || !args[1]) usage();
  const repo = path.resolve(args[1]);
  let intentPath: string | null = null;
  let rootName: string | undefined;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--intent") intentPath = args[++i] ?? usage();
    else if (args[i] === "--root") rootName = args[++i] ?? usage();
    else usage();
  }
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
    process.stderr.write(`hesperus-ts: ${repo} is not a directory\n`);
    process.exit(2);
  }
  const text = intentPath ? fs.readFileSync(intentPath, "utf8") : await readStdin();
  let intent: Ir | null = null;
  if (text.trim()) {
    try {
      intent = JSON.parse(text) as Ir;
    } catch (e) {
      process.stderr.write(`hesperus-ts: intent is not JSON: ${(e as Error).message}\n`);
      process.exit(2);
    }
    if (intent!.hesperus !== "0.1") {
      process.stderr.write(`hesperus-ts: intent IR version ${intent!.hesperus} is not 0.1\n`);
      process.exit(2);
    }
  }
  const ir = extract(repo, { intent, rootName });
  process.stdout.write(toJson(ir));
}

main().catch((e) => {
  process.stderr.write(`hesperus-ts: ${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
