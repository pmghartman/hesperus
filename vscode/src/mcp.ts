// An MCP server over stdio, so any agent (Claude Code, or anything that speaks MCP) can ask what the
// repo reaches, what changed since the last review, and who calls what. JSON-RPC, one message per
// line, no dependency: the protocol surface used here is small enough to write out.
import * as readline from "node:readline";
import * as path from "node:path";
import { acceptKeys, boundariesJson, callsJson, check, checkJson, diffJson, drawSvg, isBoundary, load, Loaded } from "./service";
import { VERSION } from "./engine";

interface Tool { name: string; description: string; inputSchema: Record<string, unknown>; run: (a: Record<string, unknown>) => Promise<string> }

const DIR = { dir: { type: "string", description: "Repo root; defaults to the server's repo." } };
const INDEX = { index: { type: "boolean", description: "Re-index from source first (a few seconds; the graph may be stale otherwise)." } };

export async function serve(repo: string): Promise<void> {
  const loaded = new Map<string, Loaded>();
  const at = (a: Record<string, unknown>) => path.resolve(repo, typeof a.dir === "string" ? a.dir : ".");
  const get = async (a: Record<string, unknown>) => {
    const d = at(a);
    if (a.index === true || !loaded.has(d)) loaded.set(d, await load(d, a.index === true));
    return [d, loaded.get(d)!] as const;
  };
  const tools: Tool[] = [
    {
      name: "hesperus_index", description: "Rebuild the repo's graph from source (no editor needed). Run after editing files, before the other tools.",
      inputSchema: { type: "object", properties: DIR },
      run: async (a) => {
        const d = at(a);
        const l = await load(d, true);
        loaded.set(d, l);
        return `Indexed: ${l.graph.nodes.length} nodes, ${l.graph.edges.length} edges. ${(l.indexed ?? []).map((x) => `${x.id}: ${x.files} files${x.indexed ? "" : " (not indexed)"}`).join("; ")}`;
      },
    },
    {
      name: "hesperus_check", description: "Lint the repo's boundary crossings (database, network, AI, cloud, queues, filesystem, processes, environment) against hesperus.json and the accepted baseline. Errors are policy violations; warnings and info are crossings and dependencies not yet reviewed.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX } },
      run: async (a) => {
        const [d, l] = await get(a);
        return checkJson(l, check(d, l));
      },
    },
    {
      name: "hesperus_diff", description: "What changed since the last accepted review: boundary crossings and dependencies added or removed, and any crossing the policy denies.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX } },
      run: async (a) => {
        const [d, l] = await get(a);
        return diffJson(l, check(d, l));
      },
    },
    {
      name: "hesperus_boundaries", description: "Every call that leaves the repo, grouped by boundary and package, with the function and file:line that makes it.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX, boundary: { type: "string", enum: ["database", "network", "ai", "cloud", "messaging", "filesystem", "process", "environment"] } } },
      run: async (a) => {
        const [d, l] = await get(a);
        return boundariesJson(l, check(d, l), typeof a.boundary === "string" && isBoundary(a.boundary) ? a.boundary : undefined);
      },
    },
    {
      name: "hesperus_calls", description: "Callers and callees of the functions or types whose name contains the query, with file:line and how sure each edge is.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX, name: { type: "string" } }, required: ["name"] },
      run: async (a) => callsJson((await get(a))[1], String(a.name ?? "")),
    },
    {
      name: "hesperus_accept", description: "Mark crossings as reviewed so they stop being reported as new: the given finding keys, or all current crossings when none are given. Use only when the person has reviewed them.",
      inputSchema: { type: "object", properties: { ...DIR, keys: { type: "array", items: { type: "string" } } } },
      run: async (a) => {
        const [d, l] = await get(a);
        return `Accepted; ${acceptKeys(d, l, Array.isArray(a.keys) ? a.keys.map(String) : undefined)} crossings in the baseline.`;
      },
    },
    {
      name: "hesperus_svg", description: "Draw the boundary overview to .hesperus/view.svg (the repo with each boundary as a box on the right, findings in red and amber) and return its path.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX } },
      run: async (a) => {
        const [d, l] = await get(a);
        await drawSvg(d, l, check(d, l));
        return path.join(d, ".hesperus", "view.svg");
      },
    },
  ];
  const resources = [
    { uri: "hesperus://report", name: "Latest lint report", mimeType: "application/json", read: async () => { const [d, l] = await get({}); return checkJson(l, check(d, l)); } },
    { uri: "hesperus://view.svg", name: "Boundary overview", mimeType: "image/svg+xml", read: async () => { const [d, l] = await get({}); return drawSvg(d, l, check(d, l)); } },
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
            instructions: "Hesperus maps what this repo reaches outside itself. Call hesperus_index after editing, then hesperus_diff to see what your changes added; hesperus_check for the full lint; hesperus_calls to see who calls a function.",
          });
        case "ping":
          return reply(id, {});
        case "tools/list":
          return reply(id, { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
        case "tools/call": {
          const t = tools.find((x) => x.name === params.name);
          if (!t) return fail(id, -32602, `unknown tool ${String(params.name)}`);
          try {
            const text = await t.run((params.arguments as Record<string, unknown>) ?? {});
            return reply(id, { content: [{ type: "text", text }] });
          } catch (e) {
            return reply(id, { content: [{ type: "text", text: `hesperus: ${(e as Error).message}` }], isError: true });
          }
        }
        case "resources/list":
          return reply(id, { resources: resources.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })) });
        case "resources/read": {
          const r = resources.find((x) => x.uri === params.uri);
          if (!r) return fail(id, -32602, `unknown resource ${String(params.uri)}`);
          return reply(id, { contents: [{ uri: r.uri, mimeType: r.mimeType, text: await r.read() }] });
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
