// An MCP server over stdio, so any agent (Claude Code, or anything that speaks MCP) can ask what the
// repo reaches, what changed since the last review, and who calls what. JSON-RPC, one message per
// line, no dependency: the protocol surface used here is small enough to write out.
import { spawnSync } from "node:child_process";
import * as readline from "node:readline";
import * as path from "node:path";
import { isGroup, parents } from "./core/aggregate";
import { MAP_CSP, MAP_MIME, MAP_URI, mapHtml } from "./mapapp";
import { boundaryPicture } from "./picture";
import { acceptKeys, boundariesJson, callsJson, check, checkJson, diffJson, drawSvg, flowTextOf, isBoundary, load, Loaded, ViewAsk } from "./service";
import { VERSION } from "./engine";

/** A tool's answer: text, or text for the model with data for an MCP App's page. */
type Answer = string | { text: string; structuredContent: Record<string, unknown> };
interface Tool { name: string; title: string; description: string; annotations: Record<string, boolean>; inputSchema: Record<string, unknown>; _meta?: Record<string, unknown>; run: (a: Record<string, unknown>) => Promise<Answer> }

const DIR = { dir: { type: "string", description: "Repo root; defaults to the server's repo." } };
// Hints for the host. Nothing here touches the repo's source or anything outside the machine: the
// readers keep only Hesperus's own cache in .hesperus/ current, and the writers write only there too.
const READS = { readOnlyHint: true, openWorldHint: false };
const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const INDEX = { index: { type: "boolean", description: "Re-index from source first (a few seconds; the graph may be stale otherwise)." } };

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
      name: "hesperus_check", title: "Lint boundary crossings", annotations: READS, description: "Lint the repo's boundary crossings (database, network, AI, cloud, queues, filesystem, processes, environment) against hesperus.json and the accepted baseline. Errors are policy violations; warnings and info are crossings and dependencies not yet reviewed.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX } },
      run: async (a) => {
        const [d, l] = await get(a);
        return checkJson(l, check(d, l));
      },
    },
    {
      name: "hesperus_diff", title: "Changes since the last review", annotations: READS, description: "What changed since the last accepted review: boundary crossings and dependencies added or removed, and any crossing the policy denies.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX } },
      run: async (a) => {
        const [d, l] = await get(a);
        return diffJson(l, check(d, l));
      },
    },
    {
      name: "hesperus_boundaries", title: "List boundary crossings", annotations: READS, description: "Every call that leaves the repo, grouped by boundary and package, with the function and file:line that makes it.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX, boundary: { type: "string", enum: ["database", "network", "ai", "cloud", "messaging", "filesystem", "process", "environment"] } } },
      run: async (a) => {
        const [d, l] = await get(a);
        return boundariesJson(l, check(d, l), typeof a.boundary === "string" && isBoundary(a.boundary) ? a.boundary : undefined);
      },
    },
    {
      name: "hesperus_calls", title: "Find callers and callees", annotations: READS, description: "Callers and callees of the functions or types whose name contains the query, with file:line and how sure each edge is.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX, name: { type: "string" } }, required: ["name"] },
      run: async (a) => callsJson((await get(a))[1], String(a.name ?? "")),
    },
    {
      name: "hesperus_flow", title: "What the program does, top down", annotations: READS, description: "The program as a flow chart in text: from an entry point (the one that drives the most code, or `entry`), the steps it takes in order, each named by its function and the comment above it, the decisions between them with their conditions, loops, and every call that leaves the repo as a terminal with its boundary. Resolved from the code, nothing inferred. Without `entry`, also lists the entry points.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX,
        entry: { type: "string", description: "A function or file to start from, by name or graph id." },
        depth: { type: "number", description: "Open calls this many levels down (default 1, at most 6)." } } },
      run: async (a) => {
        const [d, l] = await get(a);
        return flowTextOf(d, l, check(d, l), typeof a.entry === "string" ? a.entry : undefined, [], Math.min(6, Math.max(0, typeof a.depth === "number" ? a.depth : 1)));
      },
    },
    {
      name: "hesperus_accept", title: "Accept crossings as reviewed", annotations: WRITES, description: "Mark crossings as reviewed so they stop being reported as new: the given finding keys, or all current crossings when none are given. Use only when the person has reviewed them.",
      inputSchema: { type: "object", properties: { ...DIR, keys: { type: "array", items: { type: "string" } } } },
      run: async (a) => {
        const [d, l] = await get(a);
        return `Accepted; ${acceptKeys(d, l, Array.isArray(a.keys) ? a.keys.map(String) : undefined)} crossings in the baseline.`;
      },
    },
    {
      name: "hesperus_svg", title: "Draw the boundary overview", annotations: WRITES, description: "Draw the boundary overview to .hesperus/view.svg (the repo with each boundary as a box on the right, findings in red and amber) and return its path. With `columns`, laid out top to bottom for a tall pane that many cells wide, its boxes and wires in cells written to .hesperus/view.json beside it.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX,
        columns: { type: "number", description: "Lay the picture out for a tall pane this many cells wide." },
        open: { type: "array", items: { type: "string" }, description: "Box ids to open in place of the overview's." },
        focus: { type: "string", description: "A box id to outline." } } },
      run: async (a) => {
        const [d, l] = await get(a);
        const ask: ViewAsk = {
          ...(Array.isArray(a.open) ? { open: a.open.map(String) } : {}),
          ...(typeof a.focus === "string" ? { focus: a.focus } : {}),
          ...(typeof a.columns === "number" ? { portrait: true, columns: a.columns } : {}),
        };
        await drawSvg(d, l, check(d, l), ask);
        return path.join(d, ".hesperus", "view.svg");
      },
    },
    {
      name: "hesperus_map", title: "Show the boundary map", annotations: READS, description: "Show the boundary map as an interactive graph (pan, zoom, open and close boxes, go to source) where the host draws MCP Apps; elsewhere, a one-line summary. Without arguments it shows the overview.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX,
        toggle: { type: "string", description: "A box id to open or close." },
        open: { type: "array", items: { type: "string" }, description: "Box ids to open." },
        close: { type: "array", items: { type: "string" }, description: "Box ids to close, with everything open inside them." },
        reset: { type: "boolean", description: "Back to the overview." } } },
      _meta: { ui: { resourceUri: MAP_URI }, "ui/resourceUri": MAP_URI },
      run: async (a) => {
        const [d, l] = await get(a);
        const r = check(d, l);
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
        return { text: `Boundary map of ${path.basename(d)}: ${layout.boxes.length} boxes, ${layout.wires.length} wires, ${flagged} flagged.`, structuredContent: { layout } };
      },
    },
    {
      name: "hesperus_open", title: "Open a box's source", annotations: READS, description: "Open the source of a box of the boundary map in the editor (VS Code's `code -g` when installed, else the system's opener).",
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
    { uri: "hesperus://report", name: "Latest lint report", mimeType: "application/json", read: async () => { const [d, l] = await get({}); return checkJson(l, check(d, l)); } },
    { uri: "hesperus://view.svg", name: "Boundary overview", mimeType: "image/svg+xml", read: async () => { const [d, l] = await get({}); return drawSvg(d, l, check(d, l)); } },
    { uri: MAP_URI, name: "Boundary map", mimeType: MAP_MIME, _meta: { ui: { csp: MAP_CSP, prefersBorder: true } }, read: async () => mapHtml() },
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
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "hesperus", version: VERSION },
            instructions: "Hesperus maps what this repo reaches outside itself. Call hesperus_index after editing, then hesperus_diff to see what your changes added; hesperus_check for the full lint; hesperus_calls to see who calls a function; hesperus_flow for what the program does, step by step from an entry point.",
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
