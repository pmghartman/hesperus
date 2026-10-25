// What a language frontend supplies: which files it owns, the pinned SCIP indexer that
// resolves them, and syntax facts. Core stays language-free; implementations live in src/lang.
import { Syntax } from "./syntax";

/** How a consumer with network access installs the indexer into an empty directory.
 *  Core and the CLI never download. */
export type Install =
  /** `GOBIN=<dir>/bin go install <package>`; the package carries its `@version`. */
  | { kind: "go"; package: string }
  /** Write these files into the directory, then `npm ci --ignore-scripts`. */
  | { kind: "npm"; package_json: string; package_lock: string };

export interface Tool {
  name: string;
  /** Pinned: recorded in the cache header through the index's tool info. */
  version: string;
  install: Install;
}

/** Install directory name, unique per version so upgrades never mix. */
export const dirName = (t: Tool) => `${t.name}-${t.version}`;

export interface Command { cmd: string; args: string[]; cwd: string }

export interface Frontend {
  id: string;
  /** Lowercase file extensions without the dot. */
  extensions: readonly string[];
  tool(): Tool;
  /** The indexer binary inside an install directory made from `tool().install`. */
  binIn(installDir: string): string;
  /** Extra places a user install may live (e.g. the Go bin dir). */
  searchDirs(): string[];
  /** Repo-relative directories the indexer runs from ("" is the repo root), sorted;
   *  e.g. one per Go module. Index paths are relative to each. */
  roots(files: readonly string[]): string[];
  /** Indexer invocation for the project at `repo` writing SCIP to `out`. May write only under `scratch`, never the repo. */
  command(repo: string, bin: string, out: string, scratch: string): Command;
  /** Loads grammars; `syntax` needs it first. */
  init(): Promise<void>;
  /** Syntax provider for a repo-relative path this frontend owns. */
  syntax(path: string): Syntax | undefined;
}

export function extension(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  // ASCII-only lowercasing, so non-ASCII extensions never match by accident.
  return dot > 0 ? name.slice(dot + 1).replace(/[A-Z]/g, (c) => c.toLowerCase()) : undefined;
}
