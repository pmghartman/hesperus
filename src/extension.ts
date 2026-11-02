// hesperus-vscode: language client for hesperus-lsp, and the viewer webview.

import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { findMaster } from "./master";
import { StatusView } from "./sidebar";

let client: LanguageClient | undefined;
let panel: vscode.WebviewPanel | undefined;
let status: StatusView | undefined;

export async function activate(context: vscode.ExtensionContext) {
  extensionRoot = context.extensionUri.fsPath;
  status = new StatusView(() => statusData(context));
  const hespWatcher = vscode.workspace.createFileSystemWatcher("**/*.hesp");
  const refresh = () => status?.refresh();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("hesperus.status", status),
    hespWatcher,
    hespWatcher.onDidChange(refresh),
    hespWatcher.onDidCreate(refresh),
    hespWatcher.onDidDelete(refresh),
    vscode.window.onDidChangeActiveTextEditor((e) => e?.document.languageId === "hesperus" && refresh()),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("hesperus") && refresh()),
  );
  await startServer(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("hesperus.openViewer", () => openViewer(context)),
    vscode.commands.registerCommand("hesperus.emit", () => emit(context)),
    vscode.commands.registerCommand("hesperus.init", () => init(context)),
    vscode.commands.registerCommand("hesperus.restartServer", async () => {
      await client?.stop();
      client = undefined;
      await startServer(context);
    }),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("hesperus.serverPath")) {
        await client?.stop();
        client = undefined;
        await startServer(context);
      }
    }),
  );
}

export async function deactivate() {
  await client?.stop();
}

function config<T>(key: string, fallback: T): T {
  const v = vscode.workspace.getConfiguration("hesperus").get<T>(key);
  return v === undefined || v === "" ? fallback : v;
}

let extensionRoot = "";

/**
 * Where a tool lives: an explicit setting wins; otherwise the copy bundled in the
 * extension (`bin/hesp`, `bin/hesperus-lsp`, `extractor/cli.js`) when present; otherwise
 * the bare name, found on PATH.
 */
export function resolveTool(root: string, setting: string | undefined, bundled: string, fallback: string, exists: (p: string) => boolean = fs.existsSync): string {
  if (setting && setting !== fallback) return setting;
  const exe = process.platform === "win32" && !bundled.endsWith(".js") ? `${bundled}.exe` : bundled;
  const candidate = path.join(root, exe);
  return exists(candidate) ? candidate : fallback;
}

function hespPath(): string {
  return resolveTool(extensionRoot, vscode.workspace.getConfiguration("hesperus").get<string>("hespPath"), "bin/hesp", "hesp");
}
function serverPath(): string {
  return resolveTool(extensionRoot, vscode.workspace.getConfiguration("hesperus").get<string>("serverPath"), "bin/hesperus-lsp", "hesperus-lsp");
}
/** The extractor entry, or "" when neither a setting nor the bundle provides one. */
function extractorPath(): string {
  return resolveTool(extensionRoot, vscode.workspace.getConfiguration("hesperus").get<string>("extractorPath"), "extractor/cli.js", "");
}
/** Run `.js` extractors with the extension host's own Node, so users need no Node install. */
function nodeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: "1", HESPERUS_NODE: process.execPath };
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function startServer(context: vscode.ExtensionContext) {
  const command = serverPath();
  const serverOptions: ServerOptions = { command, args: [] };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "hesperus" }],
    synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher("**/*.hesp") },
  };
  client = new LanguageClient("hesperus", "Hesperus Language Server", serverOptions, clientOptions);
  try {
    await client.start();
  } catch (e) {
    client = undefined;
    vscode.window.showWarningMessage(`Hesperus: could not start the language server \`${command}\` (${(e as Error).message}). Set hesperus.serverPath.`);
  }
  context.subscriptions.push({ dispose: () => client?.stop() });
}

function run(cmd: string, args: string[], cwd: string, input?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = cp.spawn(cmd, args, { cwd, env: nodeEnv() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => resolve({ code: 127, stdout, stderr: stderr + e.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

let lastMaster: string | undefined;

async function loadData(context: vscode.ExtensionContext): Promise<any> {
  const root = workspaceRoot();
  if (!root) return { type: "data", error: "Open a folder first.", intent: null, actual: null, unified: null, flow: null, locations: {} };
  const active = vscode.window.activeTextEditor?.document;
  const activeHesp = active?.languageId === "hesperus" ? active.uri.fsPath : undefined;
  const configured = config("intent", "");
  // an open .hesp file or the setting decides; else the last master shown; else the one on disk
  const master = activeHesp || configured ? findMaster(root, activeHesp, configured) : lastMaster && fs.existsSync(lastMaster) ? lastMaster : findMaster(root, undefined, "");
  if (!master || !fs.existsSync(master)) {
    return { type: "data", error: "No intent file. Open a .hesp file or set hesperus.intent.", intent: null, actual: null, unified: null, flow: null, locations: {} };
  }
  lastMaster = master;
  const hesp = hespPath();
  const intentRes = await run(hesp, ["ir", "--locations", master], root);
  if (intentRes.code === 127) {
    return { type: "data", error: `Cannot run \`${hesp}\`: ${intentRes.stderr.trim()}. Set hesperus.hespPath.`, intent: null, actual: null, unified: null, flow: null, locations: {}, intentPath: master };
  }
  const error = intentRes.code !== 0 ? `hesp ir: ${intentRes.stderr.trim() || intentRes.stdout.trim()}` : undefined;
  const intent = intentRes.code === 0 ? JSON.parse(intentRes.stdout) : null;
  const actualDir = path.resolve(root, config("actualDir", ".hesperus/actual"));
  const actualMaster = path.join(actualDir, path.basename(master));
  let actual: any = null;
  let unified: any = null;
  let actualLocations: Record<string, string> = {};
  if (fs.existsSync(actualMaster)) {
    const a = await run(hesp, ["ir", "--locations", actualMaster], root);
    if (a.code === 0) {
      actual = JSON.parse(a.stdout);
      actualLocations = actual.locations ?? {};
    }
    const u = await run(hesp, ["diff", "--json", master, actualMaster], root);
    if (u.code === 0 || u.code === 1) {
      try {
        unified = JSON.parse(u.stdout);
      } catch {
        unified = null;
      }
    }
  }
  // the flow the extractor wrote beside the actual files (docs/flow.schema.json); unreadable means none
  let flow: any = null;
  const flowPath = path.join(actualDir, "flow.json");
  if (fs.existsSync(flowPath)) {
    try {
      flow = JSON.parse(fs.readFileSync(flowPath, "utf8"));
    } catch {
      flow = null;
    }
  }
  const locations: Record<string, string> = intent?.locations ?? {};
  return { type: "data", error, intent, actual, unified, flow, intentPath: master, locations, actualLocations, masterDir: path.dirname(master), actualDir: path.dirname(actualMaster) };
}

async function openViewer(context: vscode.ExtensionContext) {
  const data = await loadData(context);
  if (!panel) {
    panel = vscode.window.createWebviewPanel("hesperus.viewer", "Hesperus", vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    });
    panel.onDidDispose(() => (panel = undefined));
    panel.webview.html = viewerHtml(panel.webview, context.extensionUri);
    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "ready") {
        const d = await loadData(context);
        panel?.webview.postMessage(d);
      } else if (msg.type === "openDefinition") {
        const d = await loadData(context);
        // the intent declaration when there is one, else the generated file that holds the node
        const intentLoc: string | undefined = d?.locations?.[msg.id];
        const actualLoc: string | undefined = d?.actualLocations?.[msg.id];
        // in Actual mode the generated file is the declaration; otherwise the intent, falling back to actual
        const preferActual = msg.mode === "actual";
        const useActual = preferActual ? !!actualLoc : !intentLoc;
        const loc = useActual ? actualLoc : intentLoc;
        if (!loc) {
          vscode.window.showInformationMessage(`Hesperus: no .hesp file declares ${msg.id}.`);
          return;
        }
        const [file, line] = splitLoc(loc);
        const abs = path.isAbsolute(file) ? file : path.resolve(useActual ? d.actualDir : d.masterDir, file);
        await openAt(abs, line);
      } else if (msg.type === "openSource") {
        const sourceRoot = config("sourceRoot", workspaceRoot() ?? "");
        const abs = path.resolve(sourceRoot, msg.path);
        if (!fs.existsSync(abs)) {
          vscode.window.showWarningMessage(`Hesperus: ${abs} does not exist. Set hesperus.sourceRoot to the repository the actual files describe.`);
          return;
        }
        await openAt(abs, msg.line);
      }
    });
  } else {
    panel.reveal();
    panel.webview.postMessage(data);
  }
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.hesp");
  const refresh = async () => {
    const d = await loadData(context);
    panel?.webview.postMessage(d);
  };
  watcher.onDidChange(refresh);
  watcher.onDidCreate(refresh);
  watcher.onDidDelete(refresh);
  context.subscriptions.push(watcher);
}

/** Write an intent describing the repository as it is, emit its actual, and show both: they start matched. */
async function init(context: vscode.ExtensionContext) {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage("Hesperus: open a folder first.");
    return;
  }
  const configured = config("intent", "");
  if (configured && fs.existsSync(path.resolve(root, configured))) {
    vscode.window.showInformationMessage(`Hesperus: this workspace already has an intent (${configured}).`);
    return;
  }
  const repo = config("sourceRoot", root);
  const args = ["init", "--lang", "ts", repo, "--dir", root, "--out", path.resolve(root, config("actualDir", ".hesperus/actual"))];
  const extractor = extractorPath();
  if (extractor) args.push("--extractor", extractor, "--node", process.execPath);
  const res = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Hesperus: describing the repository" }, () => run(hespPath(), args, root));
  if (res.code !== 0) {
    vscode.window.showErrorMessage(`Hesperus: ${res.stderr.trim() || "init failed"}`);
    return;
  }
  // hesp prints every file it wrote, the intent master first
  const master = res.stdout.trim().split("\n")[0];
  lastMaster = master;
  status?.refresh();
  await openAt(master, 1);
  await openViewer(context);
  const summary = res.stderr.trim().split("\n").find((l) => l.startsWith("hesp init: intent and actual"));
  if (summary?.includes("differ")) vscode.window.showWarningMessage(`Hesperus: ${res.stderr.trim()}`);
  else vscode.window.showInformationMessage(`Hesperus: wrote ${path.basename(master)}; ${summary?.replace("hesp init: ", "") ?? "intent and actual match"}.`);
}

/** The sidebar's data; null (the welcome, with its init button) while the workspace has no intent. */
async function statusData(context: vscode.ExtensionContext) {
  const root = workspaceRoot();
  if (!root) return null;
  const d = await loadData(context);
  return d.intentPath ? d : null;
}

function splitLoc(loc: string): [string, number] {
  const i = loc.lastIndexOf(":");
  return i < 0 ? [loc, 1] : [loc.slice(0, i), Number(loc.slice(i + 1)) || 1];
}

async function openAt(file: string, line: number) {
  const doc = await vscode.workspace.openTextDocument(file);
  const editor = await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
  const pos = new vscode.Position(Math.max(0, line - 1), 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

export function viewerHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "viewer.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "viewer.css"));
  const nonce = Math.random().toString(36).slice(2);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${style}"><title>Hesperus</title></head><body><div id="app"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
}

async function emit(context: vscode.ExtensionContext) {
  const root = workspaceRoot();
  if (!root) return;
  const active = vscode.window.activeTextEditor?.document;
  const master = findMaster(root, active?.languageId === "hesperus" ? active.uri.fsPath : undefined, config("intent", ""));
  if (!master) {
    vscode.window.showErrorMessage("Hesperus: no intent file. Open a .hesp file or set hesperus.intent.");
    return;
  }
  const repo = config("sourceRoot", root);
  const args = ["emit", "--lang", "ts", repo, "--intent", master, "--out", path.resolve(root, config("actualDir", ".hesperus/actual"))];
  const extractor = extractorPath();
  if (extractor) args.push("--extractor", extractor, "--node", process.execPath);
  const res = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Hesperus: emitting actual from code" }, () => run(hespPath(), args, root));
  if (res.code !== 0) {
    vscode.window.showErrorMessage(`Hesperus: emit failed: ${res.stderr.trim()}`);
    return;
  }
  const flowWritten = fs.existsSync(path.resolve(root, config("actualDir", ".hesperus/actual"), "flow.json"));
  vscode.window.showInformationMessage(`Hesperus: wrote ${res.stdout.trim().split("\n").length} actual files${flowWritten ? " and flow.json" : ""}.`);
  if (panel) panel.webview.postMessage(await loadData(context));
  status?.refresh();
}
