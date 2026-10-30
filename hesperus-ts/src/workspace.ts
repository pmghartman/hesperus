// The repository: which TypeScript files exist and how one file's import specifier
// resolves to another file (relative paths, tsconfig `paths`, workspace packages).

import * as fs from "node:fs";
import * as path from "node:path";
import { compileGlob, globMatch } from "./glob.js";

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", ".git", ".hesperus", "coverage", ".next", "target"]);
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

export class Workspace {
  /** Repository-relative file paths with `/` separators, sorted. */
  readonly files: string[];
  private readonly fileSet: Set<string>;
  private readonly packages: Map<string, string> = new Map(); // name -> dir
  private readonly paths: { pattern: string; targets: string[] }[] = [];
  private baseUrl = "";

  constructor(readonly root: string) {
    this.files = walk(root, "").sort();
    this.fileSet = new Set(this.files);
    this.loadWorkspaces();
    this.loadTsconfigPaths();
  }

  has(rel: string): boolean {
    return this.fileSet.has(rel);
  }

  read(rel: string): string {
    return fs.readFileSync(path.join(this.root, rel), "utf8");
  }

  private loadWorkspaces() {
    const pkgPath = path.join(this.root, "package.json");
    if (!fs.existsSync(pkgPath)) return;
    let pkg: any;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    } catch {
      return;
    }
    let patterns: string[] = Array.isArray(pkg.workspaces) ? pkg.workspaces : Array.isArray(pkg.workspaces?.packages) ? pkg.workspaces.packages : [];
    if (patterns.length === 0) {
      // pnpm
      const pnpm = path.join(this.root, "pnpm-workspace.yaml");
      if (fs.existsSync(pnpm)) {
        for (const line of fs.readFileSync(pnpm, "utf8").split("\n")) {
          const m = /^\s*-\s*['"]?([^'"#\s]+)/.exec(line);
          if (m) patterns.push(m[1]);
        }
      }
    }
    if (patterns.length === 0) return;
    const globs = patterns.map((p) => compileGlob(p.replace(/\/$/, "")));
    // candidate package dirs: every directory holding a package.json, up to depth 4
    const dirs = packageDirs(this.root, "", 0);
    for (const d of dirs) {
      if (!globs.some((g) => globMatch(g, d))) continue;
      try {
        const p = JSON.parse(fs.readFileSync(path.join(this.root, d, "package.json"), "utf8"));
        if (typeof p.name === "string") this.packages.set(p.name, d);
      } catch {
        // not a package
      }
    }
  }

  private loadTsconfigPaths() {
    const tsconfig = path.join(this.root, "tsconfig.json");
    if (!fs.existsSync(tsconfig)) return;
    try {
      const text = fs.readFileSync(tsconfig, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/,(\s*[}\]])/g, "$1");
      const cfg = JSON.parse(text);
      const opts = cfg.compilerOptions ?? {};
      this.baseUrl = typeof opts.baseUrl === "string" ? opts.baseUrl.replace(/^\.\//, "").replace(/\/$/, "") : "";
      for (const [pattern, targets] of Object.entries(opts.paths ?? {})) {
        if (Array.isArray(targets)) this.paths.push({ pattern, targets: targets as string[] });
      }
    } catch {
      // unreadable tsconfig: no path mappings
    }
  }

  /** Resolve an import specifier from `fromFile` to a repository file, or null for a package. */
  resolve(fromFile: string, spec: string): string | null {
    if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
      return this.resolveFile(base);
    }
    if (spec.startsWith("/")) return null;
    if (spec.startsWith("node:") || spec.startsWith("bun:")) return null;
    // tsconfig paths
    for (const { pattern, targets } of this.paths) {
      const star = pattern.indexOf("*");
      let rest: string | null = null;
      if (star < 0) {
        if (spec === pattern) rest = "";
      } else {
        const pre = pattern.slice(0, star);
        const post = pattern.slice(star + 1);
        if (spec.startsWith(pre) && spec.endsWith(post) && spec.length >= pre.length + post.length) rest = spec.slice(pre.length, spec.length - post.length);
      }
      if (rest === null) continue;
      for (const t of targets) {
        const target = t.replace("*", rest);
        const base = path.posix.normalize(path.posix.join(this.baseUrl, target));
        const hit = this.resolveFile(base);
        if (hit) return hit;
      }
    }
    // workspace packages: the longest package name that prefixes the specifier
    let best: { name: string; dir: string } | null = null;
    for (const [name, dir] of this.packages) {
      if ((spec === name || spec.startsWith(name + "/")) && (!best || name.length > best.name.length)) best = { name, dir };
    }
    if (best) {
      const sub = spec.slice(best.name.length).replace(/^\//, "");
      if (sub) {
        const hit = this.resolveFile(path.posix.join(best.dir, sub));
        if (hit) return hit;
      }
      return this.packageEntry(best.dir) ?? this.anyFileUnder(best.dir);
    }
    return null;
  }

  private packageEntry(dir: string): string | null {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(this.root, dir, "package.json"), "utf8"));
      const candidates: string[] = [];
      const ex = p.exports;
      const pushExport = (v: any) => {
        if (typeof v === "string") candidates.push(v);
        else if (v && typeof v === "object") for (const k of ["import", "default", "require", "types", "bun", "node"]) if (v[k]) pushExport(v[k]);
      };
      if (ex) pushExport(typeof ex === "object" && !Array.isArray(ex) && ex["."] ? ex["."] : ex);
      for (const k of ["module", "main", "source", "types"]) if (typeof p[k] === "string") candidates.push(p[k]);
      candidates.push("src/index.ts", "index.ts", "src/main.ts");
      for (const c of candidates) {
        const hit = this.resolveFile(path.posix.normalize(path.posix.join(dir, c)));
        if (hit) return hit;
      }
    } catch {
      // no package.json
    }
    return this.resolveFile(dir);
  }

  private anyFileUnder(dir: string): string | null {
    const prefix = dir.replace(/\/$/, "") + "/";
    return this.files.find((f) => f.startsWith(prefix)) ?? null;
  }

  /** `base` may be a file without extension, a `.js` path, or a directory. */
  private resolveFile(base: string): string | null {
    const b = base.replace(/^\.\//, "");
    if (this.fileSet.has(b)) return b;
    const swapped = b.replace(/\.(js|jsx|mjs|cjs)$/, (m) => ({ ".js": ".ts", ".jsx": ".tsx", ".mjs": ".mts", ".cjs": ".cts" })[m] ?? m);
    if (swapped !== b && this.fileSet.has(swapped)) return swapped;
    const noDist = swapped.replace(/(^|\/)dist\//, "$1src/");
    if (noDist !== swapped && this.fileSet.has(noDist)) return noDist;
    for (const ext of EXTENSIONS) if (this.fileSet.has(b + ext)) return b + ext;
    for (const ext of EXTENSIONS) if (this.fileSet.has(b + "/index" + ext)) return b + "/index" + ext;
    return null;
  }
}

function walk(root: string, rel: string): string[] {
  const out: string[] = [];
  const abs = rel ? path.join(root, rel) : root;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      out.push(...walk(root, r));
    } else if (e.isFile()) {
      if (e.name.endsWith(".d.ts")) continue;
      if (EXTENSIONS.some((x) => e.name.endsWith(x))) out.push(r);
    }
  }
  return out;
}

function packageDirs(root: string, rel: string, depth: number): string[] {
  const out: string[] = [];
  if (depth > 4) return out;
  const abs = rel ? path.join(root, rel) : root;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (fs.existsSync(path.join(root, r, "package.json"))) out.push(r);
    out.push(...packageDirs(root, r, depth + 1));
  }
  return out;
}
