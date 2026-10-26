// Downloads the pinned SCIP indexers the CLI asks for. The CLI never touches the network;
// recipes and versions come from it (`hesperus tools`), so language knowledge stays in the frontends.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as zlib from "node:zlib";
import type { Install } from "./core/frontend";
import { launch } from "./shell";
import type { ToolStatus } from "./engine";

const PREREQ: Record<Install["kind"], string> = {
  go: "the Go toolchain (`go`), which scip-go also needs to run. Install it from https://go.dev/dl",
  npm: "Node.js 22.13+ with npm, which scip-typescript also needs to run. Install it from https://nodejs.org",
  release: "`tar`, to unpack the download",
  dotnet: "the .NET SDK (`dotnet`), which scip-dotnet also needs to run. Install it from https://dotnet.microsoft.com/download",
  dart: "the Dart SDK (`dart`), which scip_dart also needs to run. Install it from https://dart.dev/get-dart (Flutter ships one)",
};

function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv }, kind: Install["kind"]): Promise<void> {
  const l = launch(cmd, args);
  return new Promise((resolve, reject) =>
    execFile(l.cmd, l.args, { ...opts, shell: l.shell, maxBuffer: 1 << 26 }, (err, _out, errOut) => {
      if (!err) return resolve();
      const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
      reject(new Error(missing ? `\`${cmd}\` not found. Downloading this indexer needs ${PREREQ[kind]}.` : `${cmd} ${args.join(" ")} failed:\n${errOut.trim() || err.message}`));
    }));
}

/** One release file, checked against its pinned hash before anything is written. */
async function download(t: ToolStatus, i: Extract<Install, { kind: "release" }>, tmp: string): Promise<void> {
  const key = `${process.platform}-${process.arch}`;
  const a = i.assets[key];
  if (!a) throw new Error(`${t.name} ${t.version} has no download for ${key} (available: ${Object.keys(i.assets).join(", ")}). Build it yourself and put it on PATH.`);
  const res = await fetch(a.url);
  if (!res.ok) throw new Error(`${a.url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== a.sha256) throw new Error(`${a.url}: sha256 ${got} does not match the pinned ${a.sha256}`);
  const bin = path.join(tmp, "bin");
  await fs.mkdir(bin, { recursive: true });
  const exe = path.join(bin, t.name + (process.platform === "win32" ? ".exe" : ""));
  if (a.archive === "zip") {
    const zip = path.join(tmp, "download.zip");
    await fs.writeFile(zip, bytes);
    await run("tar", ["-xf", zip, "-C", bin], {}, "release");
    await fs.rm(zip);
  } else {
    await fs.writeFile(exe, a.archive === "gz" ? zlib.gunzipSync(bytes) : bytes);
  }
  await fs.chmod(exe, 0o755);
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
  } else if (i.kind === "release") {
    await download(t, i, tmp);
  } else if (i.kind === "dotnet") {
    await run("dotnet", ["tool", "install", i.package, "--version", i.version, "--tool-path", path.join(tmp, "bin")], {}, i.kind);
  } else if (i.kind === "dart") {
    await run("dart", ["pub", "global", "activate", i.package, i.version], { env: { ...process.env, PUB_CACHE: tmp } }, i.kind);
  } else {
    await fs.writeFile(path.join(tmp, "package.json"), i.package_json);
    await fs.writeFile(path.join(tmp, "package-lock.json"), i.package_lock);
    await run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: tmp }, i.kind);
  }
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rename(tmp, dir);
}
