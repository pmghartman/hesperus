// What the extension runs: frontend registry, repo scan, graph from per-language indexes, cache state.
// Language knowledge stays in src/lang; core stays language-free.
import { spawnSync } from "node:child_process";
import { BRIDGE_TOOL } from "./core/bridge";
import * as fs from "node:fs";
import * as path from "node:path";
import { build } from "./core/build";
import { CACHE_DIR, checkHeader, Header, readCache, readHeader, writeCache } from "./core/cache";
import { extension, Frontend } from "./core/frontend";
import { sha256Hex } from "./core/hash";
import { cmpStr, Graph, SCHEMA_VERSION, TOOL_NAME } from "./core/ir";
import * as scip from "./core/scip";
import { Cpp } from "./lang/cpp";
import { CSharp } from "./lang/csharp";
import { Dart } from "./lang/dart";
import { Go } from "./lang/go";
import { Js } from "./lang/js";
import { Rust } from "./lang/rust";
import { PKG_ROOT } from "./root";

/** Every language frontend. Order is irrelevant to output: indexes merge canonically. */
export const FRONTENDS: readonly Frontend[] = [Go, Js, Rust, CSharp, Cpp, Dart];
const LOCKFILES = ["Cargo.lock", "go.sum", "package-lock.json", "pnpm-lock.yaml", "poetry.lock", "uv.lock", "yarn.lock"];

/** Stamped into package.json at release; recorded in the cache header so an update re-indexes. */
export const VERSION: string = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8")).version;

let ready: Promise<void> | undefined;
/** Loads every grammar once; needed before indexing. */
export const init = () => (ready ??= Promise.all(FRONTENDS.map((f) => f.init())).then(() => {}));

export interface Language { files: number; id: string; editor: Frontend["editor"] }
export interface Scan { languages: Language[]; other_files: number }
export interface Status { detail: string; state: "ready" | "stale" | "missing" }

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isFile = (p: string) => fs.statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;
const strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** File text when it is valid UTF-8, else undefined. */
function readUtf8(p: string): string | undefined {
  try {
    return strict.decode(fs.readFileSync(p));
  } catch {
    return undefined;
  }
}

export function header(repo: string, lockfiles: readonly string[], indexer: string): Header {
  return { tool: TOOL_NAME, tool_version: VERSION, schema_version: SCHEMA_VERSION, indexer, lockfile_hash: lockfileHash(repo, lockfiles), commit: commit(repo) };
}

function commit(repo: string): string {
  const r = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

function lockfileHash(repo: string, explicit: readonly string[]): string {
  const names = (explicit.length ? [...explicit] : LOCKFILES.filter((n) => isFile(path.join(repo, n)))).sort(cmpStr);
  const parts: Buffer[] = [];
  for (const n of names) {
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(path.join(repo, n));
    } catch {
      bytes = Buffer.alloc(0);
    }
    parts.push(Buffer.from(n), Buffer.from([0]), bytes, Buffer.from([0]));
  }
  return sha256Hex(Buffer.concat(parts));
}

/** Rejects absolute and parent-escaping paths so only repo files are read. */
const safeRel = (p: string) => !path.isAbsolute(p) && !p.split(/[\\/]/).includes("..");

const owner = (p: string) => {
  const e = extension(p);
  return e === undefined ? undefined : FRONTENDS.find((f) => f.extensions.includes(e));
};

/** Repo files per frontend id, plus files no frontend owns. Uses git's view of the tree
 *  (tracked and untracked, minus ignored) so vendored and build output stay out. */
function fileCounts(repo: string, files = listFiles(repo)): [Map<string, number>, number] {
  const counts = new Map<string, number>();
  let other = 0;
  for (const p of files) {
    const f = owner(p);
    if (f) counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
    else other++;
  }
  return [counts, other];
}

function listFiles(repo: string): string[] {
  const git = spawnSync("git", ["-C", repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { maxBuffer: 1 << 30 });
  if (git.status === 0) return git.stdout.toString("utf8").split("\0").filter((p) => p !== "");
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (fs.statSync(p, { throwIfNoEntry: false })?.isDirectory()) walk(p);
      else out.push(path.relative(repo, p).replace(/\\/g, "/"));
    }
  };
  walk(repo);
  return out;
}

/** Languages found in the repo, with the editor extension each needs. */
export function scan(repo: string): Scan {
  const [counts, other] = fileCounts(repo);
  const languages: Language[] = [];
  for (const f of FRONTENDS) {
    const files = counts.get(f.id) ?? 0;
    if (files > 0) languages.push({ files, id: f.id, editor: f.editor });
  }
  return { languages, other_files: other };
}

export function status(repo: string, lockfiles: readonly string[] = []): Status {
  let h: Header;
  try {
    h = readHeader(repo);
  } catch (e) {
    return { detail: msg(e), state: "missing" };
  }
  try {
    checkHeader(h, header(repo, lockfiles, h.indexer));
    return { detail: "", state: "ready" };
  } catch (e) {
    return { detail: msg(e), state: "stale" };
  }
}

/** The cached graph, after checking the header against the repo as it is now. */
export function load(repo: string, lockfiles: readonly string[] = []): Graph {
  const cached = readHeader(repo);
  return readCache(repo, header(repo, lockfiles, cached.indexer));
}

/** Repo-relative files the language owns, sorted. */
export function sourceFiles(repo: string, lang: string): string[] {
  return listFiles(repo).filter((p) => owner(p)?.id === lang).sort(cmpStr);
}

/** One language's outcome: an index, or why there is none. */
export type LangResult = { lang: string; index: scip.Index } | { lang: string; error: string };

/** Builds the graph from each language's own result and writes the cache. A language that failed
 *  contributes its files as unindexed nodes; the rest of the repo is unaffected. */
export async function index(repo: string, results: readonly LangResult[], lockfiles: readonly string[] = []): Promise<Graph> {
  await init();
  const indexes = results.flatMap((r) => ("index" in r ? [r.index] : []));
  const unindexed = results
    .filter((r): r is { lang: string; error: string } => "error" in r)
    .flatMap((r) => sourceFiles(repo, r.lang).map((path) => ({ path, reason: r.error })));
  const g = makeGraph(repo, scip.merge(indexes), unindexed);
  writeCache(repo, header(repo, lockfiles, `${BRIDGE_TOOL.name} ${BRIDGE_TOOL.version}`), g);
  return g;
}

/** Only documents in git's view of the tree: indexers also report generated, ignored,
 *  and out-of-repo files (build output, cgo caches), which are not the code under review. */
export function makeGraph(repo: string, index: scip.Index, unindexed: { path: string; reason: string }[] = []): Graph {
  const tree = new Set(listFiles(repo));
  const documents = index.documents.filter((d) => safeRel(d.relative_path) && tree.has(d.relative_path));
  return build({
    index: { ...index, documents },
    readSource: (p) => (safeRel(p) ? readUtf8(path.join(repo, p)) : undefined),
    syntaxFor: (_lang, p) => owner(p)?.syntax(p),
    unindexed,
  });
}

export { CACHE_DIR };

export interface Unindexed { lang: string; files: number; editor: Frontend["editor"]; reason: string }

/** Languages with unindexed files in the graph, from the graph itself so a cached one reports them too. */
export function unindexedLanguages(g: Graph): Unindexed[] {
  const out = new Map<string, Unindexed>();
  for (const n of g.nodes) {
    const f = n.unindexed && n.path !== undefined ? owner(n.path) : undefined;
    if (!f) continue;
    const u = out.get(f.id) ?? out.set(f.id, { lang: f.id, files: 0, editor: f.editor, reason: n.doc ?? "" }).get(f.id)!;
    u.files++;
  }
  return [...out.values()].sort((a, b) => cmpStr(a.lang, b.lang));
}
