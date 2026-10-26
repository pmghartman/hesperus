// Indexers that restore or build (dotnet, dart pub, cargo without a lockfile) write beside the sources.
// Run them on a copy under scratch so the analyzed repo is never written.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { CACHE_DIR } from "../core/cache";
import { sha256Hex } from "../core/hash";
import { cmpStr } from "../core/ir";

function files(repo: string): string[] {
  const git = spawnSync("git", ["-C", repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { maxBuffer: 1 << 30 });
  if (git.status === 0) return git.stdout.toString("utf8").split("\0").filter((p) => p !== "");
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === CACHE_DIR || e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(repo, p).replace(/\\/g, "/"));
    }
  };
  walk(repo);
  return out;
}

/** Copies the repo's files (git's view: tracked and untracked, minus ignored) to a directory under `scratch`,
 *  named by `id` and the repo path so several roots never collide, and returns it. */
export function mirror(repo: string, scratch: string, id: string): string {
  const dst = path.join(scratch, `${id}-${sha256Hex(path.resolve(repo)).slice(0, 8)}`);
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  for (const f of files(repo).sort(cmpStr)) {
    const from = path.join(repo, f);
    if (!fs.statSync(from, { throwIfNoEntry: false })?.isFile()) continue;
    fs.mkdirSync(path.dirname(path.join(dst, f)), { recursive: true });
    fs.copyFileSync(from, path.join(dst, f));
  }
  return dst;
}
