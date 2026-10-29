// Hesperus's MCP server, found by the agents on the machine without a hand-written config. Claude Code
// is registered at user scope (its own `claude mcp add -s user`, or the same entry in ~/.claude.json
// when the CLI is not on PATH), so every repo it opens can call hesperus_flow, hesperus_boundaries and
// the rest; the server reads the repo it is started in. The editor's own MCP registry (Copilot agent mode
// and anything else that reads it) gets the server through the extension's definition provider. The
// registration names the installed extension's CLI, so it is refreshed when the extension updates.
import * as vscode from "vscode";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const SERVER = "hesperus";
const KEY = "hesperus.mcpRegistered";

export const cliPath = (ctx: vscode.ExtensionContext) => path.join(ctx.extensionPath, "out", "cli.js");

/** Whether Claude Code is set up on this machine at all: it writes ~/.claude.json on first run. */
const claudeFile = () => path.join(os.homedir(), ".claude.json");
export const hasClaudeCode = () => fs.existsSync(claudeFile());

/** The `claude` executable on PATH, as the shell would find it: on Windows through PATHEXT, where the
 *  npm install leaves a `claude.cmd` shim and the native installer a `claude.exe`. */
function findClaude(): string | undefined {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").map((e) => e.toLowerCase()) : [""];
  for (const d of dirs) for (const e of exts) {
    const p = path.join(d, `claude${e}`);
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {}
  }
  return undefined;
}

/** Runs the Claude Code CLI with no shell in the way. A `.cmd` shim can only run under cmd.exe, which
 *  gets one quoted command line built here (every argument is a literal or a path, never user text),
 *  rather than Node's shell option, which concatenates arguments unescaped. */
function claude(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const exe = findClaude();
  if (!exe) return { status: 127, stdout: "", stderr: "claude: not found on PATH" };
  const opts = { encoding: "utf8" as const, windowsHide: true, timeout: 20000 };
  if (/\.(cmd|bat)$/i.test(exe)) {
    const line = [exe, ...args].map((a) => `"${a}"`).join(" ");
    return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${line}"`], { ...opts, windowsVerbatimArguments: true });
  }
  return spawnSync(exe, args, opts);
}

/** Registers (or re-points) the server with Claude Code at user scope. Returns what was done, or
 *  undefined when Claude Code is not on this machine. `force` registers even when the stored record
 *  says the installed CLI is already registered. */
export async function connectClaudeCode(ctx: vscode.ExtensionContext, log: (s: string) => void, force = false): Promise<string | undefined> {
  if (!hasClaudeCode()) return undefined;
  const cli = cliPath(ctx);
  if (!force && ctx.globalState.get<string>(KEY) === cli) return "Claude Code already has Hesperus's MCP server.";
  // The CLI keeps the file's shape right; the file itself is the fallback when the CLI is not on PATH.
  const have = claude(["--version"]);
  let how: string;
  if (have.status === 0) {
    claude(["mcp", "remove", "-s", "user", SERVER]);
    const r = claude(["mcp", "add", "-s", "user", SERVER, "--", "node", cli, "mcp"]);
    if (r.status !== 0) {
      log(`claude mcp add: ${(r.stderr || r.stdout).trim()}`);
      throw new Error(`Claude Code did not take the server: ${(r.stderr || r.stdout).trim().slice(0, 200)}`);
    }
    how = "claude mcp add -s user";
  } else {
    const file = claudeFile();
    const j = JSON.parse(fs.readFileSync(file, "utf8")) as { mcpServers?: Record<string, unknown> };
    j.mcpServers = { ...(j.mcpServers ?? {}), [SERVER]: { type: "stdio", command: "node", args: [cli, "mcp"] } };
    fs.writeFileSync(file, JSON.stringify(j, null, 2));
    how = "~/.claude.json";
  }
  await ctx.globalState.update(KEY, cli);
  log(`registered the MCP server with Claude Code (${how}): node ${cli} mcp`);
  return `Claude Code now has Hesperus's MCP server (${how}); it serves whichever repo Claude Code is started in.`;
}

/** The editor's MCP registry, where the API exists (VS Code 1.101+): the server for the open folder. */
export function registerWithEditor(ctx: vscode.ExtensionContext, log: (s: string) => void): void {
  const lm = (vscode as unknown as { lm?: { registerMcpServerDefinitionProvider?: (id: string, p: unknown) => vscode.Disposable } }).lm;
  const Def = (vscode as unknown as { McpStdioServerDefinition?: new (label: string, command: string, args: string[], env?: Record<string, string>, version?: string) => unknown }).McpStdioServerDefinition;
  if (!lm?.registerMcpServerDefinitionProvider || !Def) return;
  const changed = new vscode.EventEmitter<void>();
  try {
    ctx.subscriptions.push(lm.registerMcpServerDefinitionProvider("hesperus.mcp", {
      onDidChangeMcpServerDefinitions: changed.event,
      provideMcpServerDefinitions: () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        return folder ? [new Def("Hesperus", "node", [cliPath(ctx), "mcp", folder.uri.fsPath])] : [];
      },
    }), changed, vscode.workspace.onDidChangeWorkspaceFolders(() => changed.fire()));
  } catch (e) {
    log(`editor mcp registry: ${(e as Error).message}`);
  }
}
