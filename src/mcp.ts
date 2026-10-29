// An MCP server over stdio, so any agent (Claude Code, or anything that speaks MCP) can ask what the
// repo reaches, who calls what, and what the program does from an entry point. Prompts carry the flow
// into the agent's context, so a person asks `/explain` and nothing is pasted by hand. JSON-RPC, one message per line, no dependency:
// the protocol surface used here is small enough to write out.
import { spawnSync } from "node:child_process";
import * as readline from "node:readline";
import * as path from "node:path";
import { isGroup, parents } from "./core/aggregate";
import { taggedFlow } from "./core/narrate";
import { MAP_CSP, MAP_MIME, MAP_URI, mapHtml } from "./mapapp";
import { boundaryPicture } from "./picture";
import { boundariesJson, callsJson, crossings, flowFor, flowTextOf, isBoundary, load, Loaded, narrate } from "./service";
import { VERSION } from "./engine";

/** A tool's answer: text, or text for the model with data for an MCP App's page. */
type Answer = string | { text: string; structuredContent: Record<string, unknown> };
interface Tool { name: string; title: string; description: string; annotations: Record<string, boolean>; inputSchema: Record<string, unknown>; _meta?: Record<string, unknown>; run: (a: Record<string, unknown>) => Promise<Answer> }
interface PromptArg { name: string; description: string; required?: boolean }
interface Prompt { name: string; title: string; description: string; arguments: PromptArg[]; get: (a: Record<string, string>) => Promise<string> }

const DIR = { dir: { type: "string", description: "Repo root; defaults to the server's repo." } };
// Hints for the host. Nothing here touches the repo's source or anything outside the machine: the
// readers keep only Hesperus's own cache in .hesperus/ current, and the writers write only there too.
const READS = { readOnlyHint: true, openWorldHint: false };
const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const INDEX = { index: { type: "boolean", description: "Re-index from source first (a few seconds; the graph may be stale otherwise)." } };
const ENTRY = { entry: { type: "string", description: "The entry point or callable to start from, by name or graph id; default: the entry point with the largest reach." } };
const str = (a: Record<string, unknown>, k: string) => (typeof a[k] === "string" && (a[k] as string).trim() ? (a[k] as string) : undefined);

export async function serve(repo: string): Promise<void> {
  const loaded = new Map<string, Loaded>();
  const at = (a: Record<string, unknown>) => path.resolve(repo, typeof a.dir === "string" ? a.dir : ".");
  const get = async (a: Record<string, unknown>) => {
    const d = at(a);
    if (a.index === true || !loaded.has(d)) loaded.set(d, await load(d, a.index === true));
    return [d, loaded.get(d)!] as const;
  };
  /** The boxes open in each repo's map, as its page last left them. */
  const maps = new Map<string, Set<string>>();
  const tools: Tool[] = [
    {
      name: "hesperus_index", title: "Index the repo", annotations: WRITES, description: "Rebuild the repo's graph from source (no editor needed). Run after editing files, before the other tools.",
      inputSchema: { type: "object", properties: DIR },
      run: async (a) => {
        const d = at(a);
        const l = await load(d, true);
        loaded.set(d, l);
        return `Indexed: ${l.graph.nodes.length} nodes, ${l.graph.edges.length} edges. ${(l.indexed ?? []).map((x) => `${x.id}: ${x.files} files${x.indexed ? "" : " (not indexed)"}`).join("; ")}`;
      },
    },
    {
      name: "hesperus_boundaries", title: "List boundary crossings", annotations: READS, description: "Every call that leaves the repo, grouped by boundary and package, with the function and file:line that makes it.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX, boundary: { type: "string", enum: ["database", "network", "ai", "cloud", "messaging", "filesystem", "process", "environment"] } } },
      run: async (a) => {
        const [d, l] = await get(a);
        return boundariesJson(l, crossings(l), typeof a.boundary === "string" && isBoundary(a.boundary) ? a.boundary : undefined);
      },
    },
    {
      name: "hesperus_calls", title: "Find callers and callees", annotations: READS, description: "Callers and callees of the functions or types whose name contains the query, with file:line and how sure each edge is.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX, name: { type: "string" } }, required: ["name"] },
      run: async (a) => callsJson((await get(a))[1], String(a.name ?? "")),
    },
    {
      name: "hesperus_flow", title: "Control flow from an entry point", annotations: READS, description: "The program's control flow as text, from an entry point (the one with the largest reach, or `entry`): the calls it makes in source order, each named by its callee and the comment above it; branches with their conditions as written; loops; catches; and every call that leaves the repo as a terminal with its boundary. Resolved from the code, nothing inferred. Without `entry`, also lists the entry points.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX, ...ENTRY,
        depth: { type: "number", description: "Expand callees this many levels down (default 1, at most 6)." } } },
      run: async (a) => {
        const [d, l] = await get(a);
        return flowTextOf(d, l, crossings(l), str(a, "entry"), [], Math.min(6, Math.max(0, typeof a.depth === "number" ? a.depth : 1)));
      },
    },
    {
      name: "hesperus_narrate", title: "Label a control flow chart", annotations: WRITES, description: "Attach a reading to an entry point's control flow, for the editor to draw on the chart: a one- or two-sentence summary, and the top-level steps grouped into titled phases by step number (hesperus_flow tags them [S1], [S2], …). Checked against the flow: a phase that names steps out of range or out of order is dropped; nothing can add, remove or move a step. Written to .hesperus/narratives.json.",
      inputSchema: { type: "object", properties: { ...DIR, ...ENTRY,
        summary: { type: "string", description: "What this entry does and what it reaches outside the repo, in one or two sentences." },
        phases: { type: "array", description: "Contiguous, ordered, non-overlapping runs of top-level steps, together covering them all; 2 to 7 phases.", items: { type: "object", properties: { title: { type: "string", description: "Two to six words." }, from: { type: "number", description: "First step number, 1-based." }, to: { type: "number", description: "Last step number, inclusive." } }, required: ["title", "from", "to"] } },
        via: { type: "string", description: "Who wrote it (agent or model name), shown beside the summary." } },
        required: ["summary", "phases"] },
      run: async (a) => {
        const [d, l] = await get(a);
        return narrate(d, l, crossings(l), str(a, "entry"), a.summary, a.phases, str(a, "via"));
      },
    },
    {
      name: "hesperus_map", title: "Show the boundary graph", annotations: READS, description: "Show the boundary graph as an interactive picture (pan, zoom, open and close boxes, go to source) where the host draws MCP Apps; elsewhere, a one-line summary. Without arguments it shows the overview.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX,
        toggle: { type: "string", description: "A box id to open or close." },
        open: { type: "array", items: { type: "string" }, description: "Box ids to open." },
        close: { type: "array", items: { type: "string" }, description: "Box ids to close, with everything open inside them." },
        reset: { type: "boolean", description: "Back to the overview." } } },
      _meta: { ui: { resourceUri: MAP_URI }, "ui/resourceUri": MAP_URI },
      run: async (a) => {
        const [d, l] = await get(a);
        const r = crossings(l);
        let open = a.reset === true ? undefined : maps.get(d);
        const asks = typeof a.toggle === "string" || Array.isArray(a.open) || Array.isArray(a.close);
        if (asks) {
          open ??= new Set((await boundaryPicture(l.graph, l.policy, r)).open);
          const par = parents(l.graph);
          const up = (x: string) => (isGroup(x) ? x.slice(5, x.lastIndexOf("#")) : par.get(x));
          const close = (c: string) => {
            open!.delete(c);
            for (const x of [...open!]) for (let p = up(x); p !== undefined; p = up(p)) if (p === c) open!.delete(x);
          };
          if (typeof a.toggle === "string") open.has(a.toggle) ? close(a.toggle) : open.add(a.toggle);
          for (const id of Array.isArray(a.open) ? a.open.map(String) : []) open.add(id);
          for (const id of Array.isArray(a.close) ? a.close.map(String) : []) close(id);
        }
        const { graph: _, open: now, ...layout } = await boundaryPicture(l.graph, l.policy, r, undefined, open);
        maps.set(d, new Set(now));
        const flagged = layout.boxes.filter((b) => b.flag).length;
        return { text: `Boundary graph of ${path.basename(d)}: ${layout.boxes.length} boxes, ${layout.wires.length} wires, ${flagged} flagged.`, structuredContent: { layout } };
      },
    },
    {
      name: "hesperus_open", title: "Open a box's source", annotations: READS, description: "Open the source of a box of the boundary graph in the editor (VS Code's `code -g` when installed, else the system's opener).",
      inputSchema: { type: "object", properties: { ...DIR, id: { type: "string" } }, required: ["id"] },
      run: async (a) => {
        const [d, l] = await get(a);
        const n = l.graph.nodes.find((x) => x.id === a.id);
        if (!n?.path) return `No source for ${String(a.id)}.`;
        const at = `${n.path}:${(n.range?.start_line ?? 0) + 1}`;
        for (const [cmd, ...args] of [["code", "-g", at], [process.platform === "darwin" ? "open" : "xdg-open", n.path]])
          if (spawnSync(cmd, args, { cwd: d, timeout: 15000 }).status === 0) return `Opened ${at}.`;
        return `Nothing here opens ${n.path}.`;
      },
    },
  ];
  const resources = [
    { uri: MAP_URI, name: "Boundary graph", mimeType: MAP_MIME, _meta: { ui: { csp: MAP_CSP, prefersBorder: true } }, read: async () => mapHtml() },
  ];
  // Prompts: the repo's facts already in the message, with what to do about them. A host lists them as
  // slash commands (`/hesperus:explain`), so a person types a word and the agent has the chart.
  const ENTRY_ARG: PromptArg = { name: "entry", description: "Entry point or callable to start from, by name; default: the one with the largest reach." };
  const prompts: Prompt[] = [
    {
      name: "explain", title: "Explain a control flow", description: "Explain what the program does from an entry point, from its control flow chart, and label the chart with a summary and phases.", arguments: [ENTRY_ARG],
      get: async (a) => {
        const [d, l] = await get({});
        const r = crossings(l);
        const { entries, flow: f } = await flowFor(d, l, r, a.entry, 2);
        if (!f) return `No entry point or callable matches "${a.entry ?? ""}" in ${path.basename(d)}. Entry points: ${entries.slice(0, 20).map((e) => e.name).join(", ")}.`;
        return [
          `Hesperus traced the control flow of the repository "${path.basename(d)}" from the entry point ${f.entry.name} (${f.entry.path}:${f.entry.line}), by static analysis. Each line is a step the code takes, in source order: ▭ a call into the repo (with the comment above the callee), ⬚ a call that leaves the repo (with its boundary), ◇ a branch with its condition as written, ↻ a loop, ⚠ a catch. Indented lines are the steps inside the one above. Callees are expanded two levels. The top-level steps are tagged [S1] to [S${f.steps.length}].`,
          "", taggedFlow(f), "",
          "Explain to the person what this entry point does, phase by phase, in plain terms, and point out each call that leaves the repo and whether it looks intended. Read the source where the chart alone is not enough; do not describe steps the chart does not show.",
          `Then call hesperus_narrate with entry "${f.entry.name}", a one- or two-sentence summary, and the phases as {title, from, to} over the step numbers 1 to ${f.steps.length} (contiguous, ordered, covering every step; two to seven phases), so the editor draws them on the chart.`,
        ].join("\n");
      },
    },
    {
      name: "impact", title: "Impact of changing a function", description: "What calls a function and what it calls, and what would be affected by changing it.", arguments: [{ name: "name", description: "The function or type, by name.", required: true }],
      get: async (a) => {
        const [d, l] = await get({});
        const r = crossings(l);
        const name = a.name ?? "";
        const { flow: f } = await flowFor(d, l, r, name, 1);
        return [
          `Hesperus indexed the repository "${path.basename(d)}" by static analysis. Callers and callees of every function or type whose name contains "${name}", with file:line and how sure each edge is (resolved, may, unresolved):`,
          "", callsJson(l, name), "",
          ...(f ? [`Control flow from ${f.entry.name} (${f.entry.path}:${f.entry.line}), callees expanded one level:`, "", taggedFlow(f), ""] : []),
          `Say what changing ${name} would affect: every caller, transitively where the chain is short, and every call that leaves the repo beneath it. Name the files and lines to read or change. Where an edge is 'may' or 'unresolved', say so and check the source before relying on it.`,
        ].join("\n");
      },
    },
  ];

  const out = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + "\n");
  const reply = (id: unknown, result: unknown) => out({ jsonrpc: "2.0", id, result });
  const fail = (id: unknown, code: number, message: string) => out({ jsonrpc: "2.0", id, error: { code, message } });
  const handle = async (m: { id?: unknown; method?: string; params?: Record<string, unknown> }) => {
    const { id, method, params = {} } = m;
    const notification = id === undefined;
    try {
      switch (method) {
        case "initialize":
          return reply(id, {
            protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-03-26",
            capabilities: { tools: {}, resources: {}, prompts: {} },
            serverInfo: { name: "hesperus", version: VERSION },
            instructions: "Hesperus is a static-analysis index of this repo: its call graph, control flow from each entry point, and every call that leaves the repo (boundary crossings). Call hesperus_index after editing; hesperus_boundaries for what the repo reaches outside itself; hesperus_calls to see who calls a function; hesperus_flow for the control flow from an entry point (depth 2 to read a whole feature); hesperus_narrate to label a control flow chart in the editor with a summary and phases. Prompts: explain, impact.",
          });
        case "ping":
          return reply(id, {});
        case "tools/list":
          return reply(id, { tools: tools.map(({ name, title, description, annotations, inputSchema, _meta }) => ({ name, title, description, inputSchema, annotations: { title, ...annotations }, ...(_meta ? { _meta } : {}) })) });
        case "tools/call": {
          const t = tools.find((x) => x.name === params.name);
          if (!t) return fail(id, -32602, `unknown tool ${String(params.name)}`);
          try {
            const answer = await t.run((params.arguments as Record<string, unknown>) ?? {});
            if (typeof answer === "string") return reply(id, { content: [{ type: "text", text: answer }] });
            return reply(id, { content: [{ type: "text", text: answer.text }], structuredContent: answer.structuredContent });
          } catch (e) {
            return reply(id, { content: [{ type: "text", text: `hesperus: ${(e as Error).message}` }], isError: true });
          }
        }
        case "prompts/list":
          return reply(id, { prompts: prompts.map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args })) });
        case "prompts/get": {
          const p = prompts.find((x) => x.name === params.name);
          if (!p) return fail(id, -32602, `unknown prompt ${String(params.name)}`);
          const args = Object.fromEntries(Object.entries((params.arguments as Record<string, unknown>) ?? {}).filter(([, v]) => typeof v === "string" && (v as string).trim()).map(([k, v]) => [k, (v as string).trim()]));
          const text = await p.get(args);
          return reply(id, { description: p.description, messages: [{ role: "user", content: { type: "text", text } }] });
        }
        case "resources/list":
          return reply(id, { resources: resources.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })) });
        case "resources/read": {
          const r = resources.find((x) => x.uri === params.uri);
          if (!r) return fail(id, -32602, `unknown resource ${String(params.uri)}`);
          return reply(id, { contents: [{ uri: r.uri, mimeType: r.mimeType, text: await r.read(), ...("_meta" in r ? { _meta: r._meta } : {}) }] });
        }
        default:
          if (!notification) fail(id, -32601, `unknown method ${String(method)}`);
      }
    } catch (e) {
      if (!notification) fail(id, -32603, (e as Error).message);
    }
  };
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let chain: Promise<unknown> = Promise.resolve();
  for await (const line of rl) {
    if (!line.trim()) continue;
    let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(line);
    } catch {
      fail(null, -32700, "parse error");
      continue;
    }
    // One at a time, in order: every tool reads and writes the same cache files.
    chain = chain.then(() => handle(msg));
  }
  await chain;
}
