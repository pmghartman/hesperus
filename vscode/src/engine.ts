// What the extension runs: frontend registry, repo scan, graph from per-language indexes, cache state.
// Language knowledge stays in src/lang; core stays language-free.
import { spawnSync } from "node:child_process";
import { BRIDGE_TOOL } from "./core/bridge";
import { headlessIndex, HEADLESS_TOOL } from "./headless";
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
import { Ruby } from "./lang/ruby";
import { Python } from "./lang/python";
import { Php } from "./lang/php";
import { Kotlin } from "./lang/kotlin";
import { Java } from "./lang/java";
import { Rust } from "./lang/rust";
import { PKG_ROOT } from "./root";

/** Every language frontend. Order is irrelevant to output: indexes merge canonically. */
export const FRONTENDS: readonly Frontend[] = [Go, Js, Rust, CSharp, Cpp, Dart, Python, Java, Kotlin, Php, Ruby];
const LOCKFILES = ["Cargo.lock", "go.sum", "package-lock.json", "pnpm-lock.yaml", "poetry.lock", "uv.lock", "yarn.lock"];

/** Stamped into package.json at release; recorded in the cache header so an update re-indexes. */
export const VERSION: string = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8")).version;

let ready: Promise<void> | undefined;
/** Loads every grammar once; needed before indexing. */
export const init = () => (ready ??= Promise.all(FRONTENDS.map((f) => f.init())).then(() => {}));

export interface Language { files: number; id: string; editor: Frontend["editor"] }
/** Files no frontend owns, grouped by extension: candidates for the generic fallback. */
export interface Generic { ext: string; files: number }
export interface Scan { languages: Language[]; generic: Generic[]; other_files: number }

/** Data, markup, documents and binaries: never source the editor could outline as code. */
const NOT_CODE = new Set((
  "md markdown mdx txt rst adoc json jsonc json5 yaml yml toml ini cfg conf properties env xml xsd xsl xslt svg html htm css scss sass less csv tsv " +
  "lock log sum mod map snap diff patch png jpg jpeg gif ico webp bmp tiff pdf zip gz tgz tar bz2 xz 7z rar woff woff2 ttf otf eot mp3 mp4 mov avi wav " +
  "wasm bin exe dll so dylib class jar war o a obj lib pyc node vsix ipynb"
).split(" "));

/** Extension of a file no frontend owns and that could be source, else undefined. */
const genericExt = (p: string) => {
  const e = extension(p);
  return e !== undefined && !owner(p) && !NOT_CODE.has(e) ? e : undefined;
};
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

/** Of the paths given, those `.gitattributes` marks `linguist-generated` or `linguist-vendored`:
 *  a committed bundle or vendored copy is someone else's code, and indexing it can cost more than the repo. */
function generated(repo: string, paths: readonly string[]): Set<string> {
  if (!paths.length) return new Set();
  const r = spawnSync("git", ["-C", repo, "check-attr", "-z", "--stdin", "linguist-generated", "linguist-vendored"], { input: paths.join("\0") + "\0", maxBuffer: 1 << 28 });
  const out = new Set<string>();
  if (r.status !== 0) return out;
  // NUL-separated triples: path, attribute, value.
  const f = r.stdout.toString("utf8").split("\0");
  for (let i = 0; i + 2 < f.length; i += 3) if (f[i + 2] === "set" || f[i + 2] === "true") out.add(f[i]);
  return out;
}

function listFiles(repo: string): string[] {
  const git = spawnSync("git", ["-C", repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { maxBuffer: 1 << 30 });
  if (git.status === 0) {
    const all = git.stdout.toString("utf8").split("\0").filter((p) => p !== "");
    const skip = generated(repo, all);
    return skip.size ? all.filter((p) => !skip.has(p)) : all;
  }
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
  const byExt = new Map<string, number>();
  for (const p of listFiles(repo)) {
    const e = genericExt(p);
    if (e !== undefined) byExt.set(e, (byExt.get(e) ?? 0) + 1);
  }
  const generic = [...byExt].map(([ext, files]) => ({ ext, files })).sort((a, b) => cmpStr(a.ext, b.ext));
  return { languages, generic, other_files: other - generic.reduce((n, g) => n + g.files, 0) };
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

/** Whether a repo-relative path is code some frontend, or the generic fallback, would read. */
export const isSource = (p: string) => owner(p) !== undefined || genericExt(p) !== undefined;

/** The paths git ignores, of those given. */
export function ignored(repo: string, paths: readonly string[]): Set<string> {
  if (!paths.length) return new Set();
  const r = spawnSync("git", ["-C", repo, "check-ignore", "-z", "--stdin"], { input: paths.join("\0") + "\0", maxBuffer: 1 << 26 });
  return new Set(r.status === 0 ? r.stdout.toString("utf8").split("\0").filter((p) => p !== "") : []);
}

/** Repo-relative files the language owns, sorted. */
export function sourceFiles(repo: string, lang: string): string[] {
  return listFiles(repo).filter((p) => owner(p)?.id === lang).sort(cmpStr);
}

/** Repo-relative files of one generic extension, sorted. */
export function genericFiles(repo: string, ext: string): string[] {
  return listFiles(repo).filter((p) => genericExt(p) === ext).sort(cmpStr);
}

/** One language's outcome: an index, or why there is none. */
export type LangResult = { lang: string; index: scip.Index } | { lang: string; error: string };

/** Builds the graph from each language's own result and writes the cache. A language that failed
 *  contributes its files as unindexed nodes; the rest of the repo is unaffected. */
export async function index(repo: string, results: readonly LangResult[], lockfiles: readonly string[] = [], indexer = `${BRIDGE_TOOL.name} ${BRIDGE_TOOL.version}`): Promise<Graph> {
  await init();
  const indexes = results.flatMap((r) => ("index" in r ? [r.index] : []));
  const unindexed = results
    .filter((r): r is { lang: string; error: string } => "error" in r)
    .flatMap((r) => sourceFiles(repo, r.lang).map((path) => ({ path, reason: r.error })));
  const g = makeGraph(repo, scip.merge(indexes), unindexed);
  writeCache(repo, header(repo, lockfiles, indexer), g);
  return g;
}

export interface HeadlessOutcome { graph: Graph; languages: { id: string; files: number; indexed: boolean }[] }

/** Indexes every language in the repo from syntax alone and writes the cache. Languages whose
 *  syntax has no outline become unindexed nodes, as a language with no server does in the editor. */
export async function indexHeadless(repo: string, lockfiles: readonly string[] = [], report: (s: string) => void = () => {}): Promise<HeadlessOutcome> {
  await init();
  const s = scan(repo);
  const results: LangResult[] = [];
  const languages: HeadlessOutcome["languages"] = [];
  for (const l of s.languages) {
    const fe = FRONTENDS.find((f) => f.id === l.id)!;
    languages.push({ id: l.id, files: l.files, indexed: !!fe.headless });
    if (!fe.headless) {
      results.push({ lang: l.id, error: `No headless indexer for ${l.editor.name}; open the repo in VS Code with the Hesperus extension to index it.` });
      continue;
    }
    report(`Indexing ${l.files.toLocaleString()} ${l.editor.name} files…`);
    results.push({ lang: l.id, index: await headlessIndex(repo, fe, sourceFiles(repo, l.id)) });
  }
  const graph = await index(repo, results, lockfiles, `${HEADLESS_TOOL.name} ${HEADLESS_TOOL.version}`);
  return { graph, languages };
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
    importsFor: (_lang, p) => owner(p)?.imports,
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
