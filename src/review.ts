// Files the lint reads and writes: the policy at the repo root (people write it), and the accepted
// baseline and latest report under `.hesperus/` (the tool writes them). Shared by the extension and the CLI.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { CACHE_DIR } from "./core/cache";
import { Graph, pretty } from "./core/ir";
import { BASELINE_FILE, Baseline, baselineToJson, parseBaseline, parsePolicy, Policy, POLICY_FILE, REPORT_FILE, Report, reportToJson } from "./core/lint";

export function gitHead(repo: string): string {
  const r = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

/** Makes `.hesperus/` with its ignore file, so a policy written before the first index stays untracked. */
export function ensureCacheDir(repo: string) {
  const dir = path.join(repo, CACHE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, ".gitignore");
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n");
}

/** The policy, or the default when the repo has none. Throws on a malformed file. */
export function readPolicy(repo: string): Policy {
  const p = path.join(repo, POLICY_FILE);
  return parsePolicy(fs.existsSync(p) ? fs.readFileSync(p, "utf8") : undefined);
}

const baselinePath = (repo: string) => path.join(repo, CACHE_DIR, BASELINE_FILE);

export function readBaseline(repo: string): Baseline | undefined {
  try {
    return parseBaseline(fs.readFileSync(baselinePath(repo), "utf8"));
  } catch {
    return undefined;
  }
}

export function writeBaseline(repo: string, b: Baseline) {
  fs.mkdirSync(path.join(repo, CACHE_DIR), { recursive: true });
  fs.writeFileSync(baselinePath(repo), baselineToJson(b));
}

export function writeReport(repo: string, g: Graph, r: Report, stale?: string) {
  fs.mkdirSync(path.join(repo, CACHE_DIR), { recursive: true });
  fs.writeFileSync(path.join(repo, CACHE_DIR, REPORT_FILE), reportToJson(g, r, stale));
}

/** A starting policy: nothing enforced yet, an example in the comment. */
export const STARTER_POLICY = pretty({
  $comment: "Boundaries: database, network, ai, cloud, messaging, filesystem, process, environment. Example rule: {\"paths\": [\"src/core/**\"], \"deny\": [\"network\", \"database\"], \"reason\": \"core stays pure\"}",
  boundaries: {},
  rules: [],
  review: { crossings: "warning", dependencies: "info" },
});
