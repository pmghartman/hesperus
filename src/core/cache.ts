// On-disk cache: untracked dot dir in the analyzed repo, sharded per package.
// A header mismatch fails loudly; nothing is reused silently.
import * as fs from "node:fs";
import * as path from "node:path";
import { parents } from "./aggregate";
import { sha256Hex } from "./hash";
import { arr, canonicalize, cmpStr, Graph, GraphEdge, GraphNode, newGraph, parseEdge, parseNode, pretty } from "./ir";

export const CACHE_DIR = ".hesperus";

export interface Header {
  tool: string;
  tool_version: string;
  schema_version: number;
  /** "name version" of the SCIP indexer, or the LSP server. */
  indexer: string;
  lockfile_hash: string;
  commit: string;
}

const FIELDS = ["tool", "tool_version", "schema_version", "indexer", "lockfile_hash", "commit"] as const;

/** Throws an explanation listing every field that differs. */
export function checkHeader(h: Header, expected: Header) {
  const bad = FIELDS.filter((k) => String(h[k]) !== String(expected[k])).map(
    (k) => `  ${k}: cache has ${JSON.stringify(String(h[k]))}, current is ${JSON.stringify(String(expected[k]))}`,
  );
  if (bad.length) throw new Error(`cache is stale; refusing to reuse it. Delete ${CACHE_DIR}/ or re-run index.\n${bad.join("\n")}`);
}

/** Error text without Node's own path prefix, which callers add. */
export function ioMessage(e: unknown): string {
  const err = e as NodeJS.ErrnoException;
  if (err.code === "ENOENT") return "No such file or directory";
  if (err.code === "EACCES") return "Permission denied";
  return err.message ?? String(e);
}

function io<T>(p: string, f: () => T): T {
  try {
    return f();
  } catch (e) {
    throw new Error(`${p}: ${ioMessage(e)}`);
  }
}

function readJson(p: string): Record<string, unknown> {
  const s = io(p, () => fs.readFileSync(p, "utf8"));
  try {
    const v = JSON.parse(s);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("expected an object");
    return v;
  } catch (e) {
    throw new Error(`${p}: ${(e as Error).message}`);
  }
}

/** Shard key: the package an element belongs to, or "_repo" for repo-level nodes. */
function shardOf(g: Graph): Map<string, string> {
  const par = parents(g);
  const kinds = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const out = new Map<string, string>();
  for (const n of g.nodes) {
    let cur = n.id;
    let key = "_repo";
    for (let i = 0; i <= par.size; i++) {
      const k = kinds.get(cur);
      if (k === "package" || k === "external_package") {
        key = cur;
        break;
      }
      const p = par.get(cur);
      if (p === undefined) break;
      cur = p;
    }
    out.set(n.id, key);
  }
  return out;
}

// Hash keeps file names portable and bounded; the key itself is stored inside.
const shardFile = (key: string) => `shards/${sha256Hex(key).slice(0, 16)}.json`;

interface Shard {
  key: string;
  nodes: GraphNode[];
  /** Edges whose `from` lives in this shard. */
  edges: GraphEdge[];
}

function write(p: string, s: string) {
  io(path.dirname(p), () => fs.mkdirSync(path.dirname(p), { recursive: true }));
  io(p, () => fs.writeFileSync(p, s));
}

/** What a person accepted outlives re-indexing; everything else in the cache is rebuilt. */
const KEEP = new Set(["baseline.json"]);

/** Writes only under `<repo>/.hesperus`. Removes the old cache first, except what a person accepted. */
export function writeCache(repo: string, header: Header, g: Graph) {
  const dir = path.join(repo, CACHE_DIR);
  // Does not follow symlinks.
  const old = io(dir, () => (fs.existsSync(dir) ? fs.readdirSync(dir) : []));
  for (const f of old) if (!KEEP.has(f)) io(path.join(dir, f), () => fs.rmSync(path.join(dir, f), { recursive: true, force: true }));
  const key = shardOf(g);
  const shards = new Map<string, Shard>();
  const shard = (k: string) => {
    let s = shards.get(k);
    if (!s) shards.set(k, (s = { key: k, nodes: [], edges: [] }));
    return s;
  };
  for (const n of g.nodes) shard(key.get(n.id)!).nodes.push(n);
  for (const e of g.edges) shard(key.get(e.from) ?? "_repo").edges.push(e);
  // Keys are package ids or "_repo", never integer-like, so object key order is insertion order.
  const index: Record<string, string> = {};
  for (const k of [...shards.keys()].sort(cmpStr)) {
    const f = shardFile(k);
    write(path.join(dir, f), pretty(shards.get(k)));
    index[k] = f;
  }
  write(path.join(dir, "index.json"), pretty({ shards: index }));
  // Keeps the cache untracked without touching the repo's own ignore files.
  write(path.join(dir, ".gitignore"), "*\n");
  // Header last: its presence means the cache is complete.
  write(path.join(dir, "header.json"), pretty({
    tool: header.tool, tool_version: header.tool_version, schema_version: header.schema_version,
    indexer: header.indexer, lockfile_hash: header.lockfile_hash, commit: header.commit,
  }));
}

export function readHeader(repo: string): Header {
  const p = path.join(repo, CACHE_DIR, "header.json");
  const h = readJson(p);
  const s = (k: string) => {
    if (typeof h[k] !== "string") throw new Error(`${p}: missing or invalid field \`${k}\``);
    return h[k] as string;
  };
  if (!Number.isInteger(h.schema_version)) throw new Error(`${p}: missing or invalid field \`schema_version\``);
  return {
    tool: s("tool"), tool_version: s("tool_version"), schema_version: h.schema_version as number,
    indexer: s("indexer"), lockfile_hash: s("lockfile_hash"), commit: s("commit"),
  };
}

/** Loads every shard after checking the header against `expected`. */
export function readCache(repo: string, expected: Header): Graph {
  checkHeader(readHeader(repo), expected);
  return readShards(repo);
}

/** Loads the named shards only (lazy subtree loading), or all when `only` is undefined. */
export function readShards(repo: string, only?: readonly string[]): Graph {
  const dir = path.join(repo, CACHE_DIR);
  const ip = path.join(dir, "index.json");
  const idx = readJson(ip);
  const shards = idx.shards;
  if (!shards || typeof shards !== "object" || Array.isArray(shards)) throw new Error(`${ip}: missing or invalid field \`shards\``);
  const g = newGraph();
  for (const [k, f] of Object.entries(shards as Record<string, unknown>).sort(([a], [b]) => cmpStr(a, b))) {
    if (only && !only.includes(k)) continue;
    if (typeof f !== "string") throw new Error(`${ip}: invalid shard file for ${k}`);
    const p = path.join(dir, f);
    const s = readJson(p);
    try {
      for (const n of arr(s.nodes, "nodes")) g.nodes.push(parseNode(n));
      for (const e of arr(s.edges, "edges")) g.edges.push(parseEdge(e));
    } catch (e) {
      throw new Error(`${p}: ${(e as Error).message}`);
    }
  }
  canonicalize(g);
  return g;
}
