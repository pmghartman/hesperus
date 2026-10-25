// What the CLI and the extension run: frontend registry, indexer runs, cache state.
// Language knowledge stays in src/lang; core stays language-free.
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { build } from "./core/build";
import { CACHE_DIR, checkHeader, Header, ioMessage, readCache, readHeader, writeCache } from "./core/cache";
import { dirName, extension, Frontend, Install } from "./core/frontend";
import { sha256Hex } from "./core/hash";
import { cmpStr, Graph, SCHEMA_VERSION, TOOL_NAME } from "./core/ir";
import * as scip from "./core/scip";
import { Go } from "./lang/go";
import { Js } from "./lang/js";
import { PKG_ROOT } from "./root";

/** Every language frontend. Order is irrelevant to output: indexes merge canonically. */
export const FRONTENDS: readonly Frontend[] = [Go, Js];
const LOCKFILES = ["Cargo.lock", "go.sum", "package-lock.json", "pnpm-lock.yaml", "poetry.lock", "uv.lock", "yarn.lock"];

/** Stamped into package.json at release; recorded in the cache header so an update re-indexes. */
export const VERSION: string = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8")).version;

let ready: Promise<void> | undefined;
/** Loads every grammar once; needed before indexing. */
export const init = () => (ready ??= Promise.all(FRONTENDS.map((f) => f.init())).then(() => {}));

// Output shape of `hesperus tools`; keys sorted, as the Rust CLI printed them.
export interface ToolStatus { bin: string | null; dir: string | null; install: Install; name: string; version: string }
export interface Language { files: number; id: string; tool: string }
export interface Tools { languages: Language[]; other_files: number; tools: ToolStatus[] }
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

/** The pinned install under `toolsDir` first, then PATH, then the frontend's usual places. */
function findTool(f: Frontend, toolsDir?: string): string | null {
  const t = f.tool();
  const dirs = (process.env.PATH ?? "").split(path.delimiter).concat(f.searchDirs());
  const candidates = [...(toolsDir ? [f.binIn(path.join(toolsDir, dirName(t)))] : []), ...dirs.map((d) => path.join(d, t.name))];
  return candidates.find(isFile) ?? null;
}

export function tools(repo: string, toolsDir?: string): Tools {
  const [counts, other] = fileCounts(repo);
  const languages: Language[] = [];
  const out: ToolStatus[] = [];
  for (const f of FRONTENDS) {
    const files = counts.get(f.id) ?? 0;
    if (files === 0) continue;
    const t = f.tool();
    languages.push({ files, id: f.id, tool: t.name });
    const install: Install = t.install.kind === "go"
      ? { kind: "go", package: t.install.package }
      : { kind: "npm", package_json: t.install.package_json, package_lock: t.install.package_lock };
    out.push({ bin: findTool(f, toolsDir), dir: toolsDir ? path.join(toolsDir, dirName(t)) : null, install, name: t.name, version: t.version });
  }
  return { languages, other_files: other, tools: out };
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

export interface IndexOpts { scip?: readonly string[]; toolsDir?: string; lockfiles?: readonly string[] }

/** Indexes the repo into its cache; without `scip` files, runs each detected language's indexer. */
export async function index(repo: string, o: IndexOpts = {}): Promise<Graph> {
  await init();
  const indexes = o.scip?.length
    ? o.scip.map((p) => scip.decode(readOrThrow(p)))
    : await runIndexers(repo, o.toolsDir);
  const indexer = [...new Set(indexes.map(scip.toolOf))].sort(cmpStr).join(", ");
  const g = makeGraph(repo, scip.merge(indexes));
  writeCache(repo, header(repo, o.lockfiles ?? [], indexer), g);
  return g;
}

function readOrThrow(p: string): Buffer {
  try {
    return fs.readFileSync(p);
  } catch (e) {
    throw new Error(`${p}: ${ioMessage(e)}`);
  }
}

/** Runs the indexer of every frontend with files in the repo. Indexer output and any
 *  scratch files go to a temp dir, so the repo itself is never written. */
async function runIndexers(repo: string, toolsDir?: string): Promise<scip.Index[]> {
  const files = listFiles(repo);
  const [counts] = fileCounts(repo, files);
  const active = FRONTENDS.filter((f) => counts.has(f.id));
  if (!active.length) throw new Error(`no supported language in ${repo} (supported: ${FRONTENDS.map((f) => f.id).join(", ")})`);
  const missing = active.filter((f) => findTool(f, toolsDir) === null).map((f) => `${f.tool().name} ${f.tool().version} (for ${f.id})`);
  if (missing.length) throw new Error(`indexer not installed: ${missing.join(", ")}. \`hesperus tools <repo>\` lists how to install each.`);
  const scratch = path.join(os.tmpdir(), `hesperus-${process.pid}`);
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(scratch, { recursive: true });
  try {
    const out: scip.Index[] = [];
    for (const f of active) {
      const roots = f.roots(files);
      for (const [i, root] of roots.entries()) {
        const ix = await runOne(f, path.join(repo, root), findTool(f, toolsDir)!, scratch, `${f.id}-${i}`);
        if (root !== "") for (const d of ix.documents) d.relative_path = `${root}/${d.relative_path}`;
        out.push(ix);
      }
    }
    return out;
  } finally {
    // Does not follow symlinks, so overlays pointing into the repo are safe to remove.
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function runOne(f: Frontend, repo: string, bin: string, scratch: string, name: string): Promise<scip.Index> {
  const out = path.join(scratch, `${name}.scip`);
  const c = f.command(repo, bin, out, scratch);
  const { code, signal, stderr } = await new Promise<{ code: number | null; signal: string | null; stderr: string }>((resolve, reject) => {
    const p = spawn(c.cmd, c.args, { cwd: c.cwd, stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.setEncoding("utf8");
    // Only the tail is reported; keep memory bounded on chatty indexers.
    p.stderr.on("data", (d: string) => (err = (err + d).slice(-65536)));
    p.on("error", (e) => reject(new Error(`${bin}: ${ioMessage(e)}`)));
    p.on("close", (code, signal) => resolve({ code, signal, stderr: err }));
  });
  if (code !== 0) {
    const tail = stderr.split(/\r?\n/).filter((l, i, a) => i < a.length - 1 || l !== "").slice(-20).join("\n");
    throw new Error(`${bin} failed (${signal ? `signal: ${signal}` : `exit status: ${code}`}):\n${tail}`);
  }
  return scip.decode(readOrThrow(out));
}

/** Only documents in git's view of the tree: indexers also report generated, ignored,
 *  and out-of-repo files (build output, cgo caches), which are not the code under review. */
export function makeGraph(repo: string, index: scip.Index): Graph {
  const tree = new Set(listFiles(repo));
  const documents = index.documents.filter((d) => safeRel(d.relative_path) && tree.has(d.relative_path));
  return build({
    index: { ...index, documents },
    readSource: (p) => (safeRel(p) ? readUtf8(path.join(repo, p)) : undefined),
    syntaxFor: (_lang, p) => owner(p)?.syntax(p),
  });
}

export { CACHE_DIR };
