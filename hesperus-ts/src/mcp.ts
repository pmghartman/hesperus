// The same questions as the CLI, as an MCP server on stdio: an agent calls `reaches`
// before editing a file, `flow` to read what an entry does, `boundaries` on its diff and
// `check` before it is done. Every answer is text an agent can quote; `json` gives the data.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as path from "node:path";
import { z } from "zod";
import { toFlowJson } from "./flow.js";
import { Ir } from "./ir.js";
import { changedFiles, diffFlows, entriesForReading, findEntry, flowAt, loadFlow, reaches, renderConstraints, renderDiff, renderEntries, renderEntry, renderReaches, summarize } from "./query.js";

export async function serve(repo: string, opts: { intent: Ir | null; rootName?: string }): Promise<void> {
  const server = new McpServer({ name: "hesperus", version: "0.1.0" });
  const load = (fresh?: boolean) => loadFlow(repo, { intent: opts.intent, rootName: opts.rootName, fresh: !!fresh }).flow;
  const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
  const fresh = z.boolean().optional().describe("Recompute even when the cached flow is newer than every source file.");
  const json = z.boolean().optional().describe("Return JSON instead of text.");

  server.registerTool(
    "entries",
    {
      description: "Every entry point of the repository (route handlers, main, bin modules, command handlers, host-called exports) with how many functions it reaches and which boundaries (stores, hosts, filesystem, processes, own ingress) its paths end in. Start here to learn what the program does.",
      inputSchema: { fresh, json },
    },
    async (a) => {
      const f = load(a.fresh);
      return text(a.json ? JSON.stringify(entriesForReading(f).map((e) => summarize(f, e)), null, 2) : renderEntries(f));
    },
  );
  server.registerTool(
    "flow",
    {
      description: "What one entry point does: the functions it calls in source order, nested call by call, each with its file:line, down to where each path leaves the program. `entry` is an id from `entries` or a label such as `POST /orders`.",
      inputSchema: { entry: z.string().describe("Entry id or label (substring is fine when unique)."), fresh, json },
    },
    async (a) => {
      const f = load(a.fresh);
      const e = findEntry(f, a.entry);
      if (!e) return text(`no entry matches ${a.entry}; call entries`);
      if ("ambiguous" in e) return text(`${e.ambiguous.length} entries match ${a.entry}:\n${e.ambiguous.map((x) => `  ${x.id}  ${x.label}`).join("\n")}`);
      return text(a.json ? JSON.stringify(e, null, 2) : renderEntry(f, e));
    },
  );
  server.registerTool(
    "reaches",
    {
      description: "Blast radius: which entry points pass through a file, or one line of it, and through which functions. Call before editing a file to know what a change affects.",
      inputSchema: { file: z.string().describe("Repository-relative path."), line: z.number().int().optional(), fresh, json },
    },
    async (a) => {
      const f = load(a.fresh);
      const file = a.file.replace(/\\/g, "/").replace(/^\.\//, "");
      const hits = reaches(f, file, a.line);
      return text(a.json ? JSON.stringify(hits.map((h) => ({ id: h.entry.id, kind: h.entry.kind, label: h.entry.label, via: h.units.map((u) => u.id) })), null, 2) : renderReaches(f, file, a.line, hits));
    },
  );
  server.registerTool(
    "boundaries",
    {
      description: "What the working tree newly reaches outside the program compared with a git revision: new stores, hosts, filesystem or process use per entry point, new or removed entry points, constraints whose result changed, and which entries each changed file sits under. Call on your diff before finishing.",
      inputSchema: { since: z.string().describe("A git revision, e.g. HEAD, main, a sha."), json },
    },
    async (a) => {
      const f = load(true);
      try {
        const before = flowAt(repo, a.since, { intent: opts.intent, rootName: f.root });
        const d = diffFlows(before, f, a.since, changedFiles(repo, a.since));
        return text(a.json ? JSON.stringify(d, null, 2) : renderDiff(d, f));
      } catch (e) {
        return text(`git: ${(e as Error).message.split("\n")[0]}`);
      }
    },
  );
  server.registerTool(
    "check",
    {
      description: "The intent's require/forbid constraints checked against every function in the repository, with the witness sites and the entry points that pass through them.",
      inputSchema: { fresh, json },
    },
    async (a) => {
      const f = load(a.fresh);
      return text(a.json ? JSON.stringify(f.constraints, null, 2) : renderConstraints(f));
    },
  );
  server.registerTool(
    "dump",
    { description: "The whole flow as JSON (docs/flow.schema.json). Large; prefer the other tools.", inputSchema: { fresh } },
    async (a) => text(toFlowJson(load(a.fresh))),
  );

  process.stderr.write(`hesperus mcp: serving ${path.resolve(repo)} on stdio\n`);
  await server.connect(new StdioServerTransport());
}
