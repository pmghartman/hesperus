// Downloads the pinned SCIP indexers the CLI asks for. The CLI never touches the network;
// recipes and versions come from it (`hesperus tools`), so language knowledge stays in the frontends.
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Install } from "./core/frontend";
import type { ToolStatus } from "./engine";

const PREREQ: Record<Install["kind"], string> = {
  go: "the Go toolchain (`go`), which scip-go also needs to run. Install it from https://go.dev/dl",
  npm: "Node.js 22.13+ with npm, which scip-typescript also needs to run. Install it from https://nodejs.org",
};

function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv }, kind: Install["kind"]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { ...opts, maxBuffer: 1 << 26 }, (err, _out, errOut) => {
      if (!err) return resolve();
      const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
      reject(new Error(missing ? `\`${cmd}\` not found. Downloading this indexer needs ${PREREQ[kind]}.` : `${cmd} ${args.join(" ")} failed:\n${errOut.trim() || err.message}`));
    }));
}

/** Installs into `<dir>.partial`, then renames, so a cancelled download never looks installed. */
export async function install(t: ToolStatus): Promise<void> {
  if (!t.dir) throw new Error(`no install directory for ${t.name}`);
  const dir = t.dir;
  const tmp = dir + ".partial";
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.mkdir(tmp, { recursive: true });
  const i = t.install;
  if (i.kind === "go") {
    await run("go", ["install", i.package], { cwd: tmp, env: { ...process.env, GOBIN: path.join(tmp, "bin") } }, i.kind);
  } else {
    await fs.writeFile(path.join(tmp, "package.json"), i.package_json);
    await fs.writeFile(path.join(tmp, "package-lock.json"), i.package_lock);
    await run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: tmp }, i.kind);
  }
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rename(tmp, dir);
}
