// vscode-hesperus: language client for hesperus-lsp, and the viewer webview.

import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let panel: vscode.WebviewPanel | undefined;

export async function activate(context: vscode.ExtensionContext) {
  await startServer(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("hesperus.openViewer", () => openViewer(context)),
    vscode.commands.registerCommand("hesperus.emit", () => emit(context)),
    vscode.commands.registerCommand("hesperus.restartServer", async () => {
      await client?.stop();
      client = undefined;
      await startServer(context);
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

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function startServer(context: vscode.ExtensionContext) {
  const command = config("serverPath", "hesperus-lsp");
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
    const child = cp.spawn(cmd, args, { cwd, env: process.env });
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

/** The intent master for the active editor: the configured file, else the file that imports the active one. */
export function findMaster(root: string, active: string | undefined, configured: string): string | undefined {
  if (configured) return path.resolve(root, configured);
  if (!active) return undefined;
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "target") continue;
        walk(path.join(dir, e.name), depth + 1);
      } else if (e.name.endsWith(".hesp")) files.push(path.join(dir, e.name));
    }
  };
  walk(root, 0);
  const importers = new Map<string, string>();
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(/^\s*import\s+"([^"]+)"/gm)) importers.set(path.resolve(path.dirname(f), m[1]), f);
  }
  let cur = path.resolve(active);
  const seen = new Set<string>();
  while (importers.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = importers.get(cur)!;
  }
  return cur;
}

async function loadData(context: vscode.ExtensionContext): Promise<any | undefined> {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage("Hesperus: open a folder first.");
    return;
  }
  const active = vscode.window.activeTextEditor?.document;
  const master = findMaster(root, active?.languageId === "hesperus" ? active.uri.fsPath : undefined, config("intent", ""));
  if (!master || !fs.existsSync(master)) {
    vscode.window.showErrorMessage("Hesperus: no intent file. Open a .hesp file or set hesperus.intent.");
    return;
  }
  const hesp = config("hespPath", "hesp");
  const intentRes = await run(hesp, ["ir", "--locations", master], root);
  if (intentRes.code !== 0) {
    vscode.window.showErrorMessage(`Hesperus: hesp ir failed: ${intentRes.stderr.trim() || intentRes.stdout.trim()}`);
    if (intentRes.code === 127) return;
  }
  const intent = intentRes.code === 0 ? JSON.parse(intentRes.stdout) : null;
  const actualDir = path.resolve(root, config("actualDir", ".hesperus/actual"));
  const actualMaster = path.join(actualDir, path.basename(master));
  let actual: any = null;
  let unified: any = null;
  if (fs.existsSync(actualMaster)) {
    const a = await run(hesp, ["ir", actualMaster], root);
    if (a.code === 0) actual = JSON.parse(a.stdout);
    const u = await run(hesp, ["diff", "--json", master, actualMaster], root);
    if (u.code === 0 || u.code === 1) {
      try {
        unified = JSON.parse(u.stdout);
      } catch {
        unified = null;
      }
    }
  }
  const locations: Record<string, string> = intent?.locations ?? {};
  return { type: "data", intent, actual, unified, intentPath: master, locations, masterDir: path.dirname(master) };
}

async function openViewer(context: vscode.ExtensionContext) {
  const data = await loadData(context);
  if (!data) return;
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
        if (d) panel?.webview.postMessage(d);
      } else if (msg.type === "openDefinition") {
        const d = await loadData(context);
        const loc: string | undefined = d?.locations?.[msg.id];
        if (!loc) {
          vscode.window.showInformationMessage(`Hesperus: ${msg.id} is not declared in the intent (actual-only).`);
          return;
        }
        const [file, line] = splitLoc(loc);
        const abs = path.isAbsolute(file) ? file : path.resolve(d.masterDir, file);
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
    if (d) panel?.webview.postMessage(d);
  };
  watcher.onDidChange(refresh);
  watcher.onDidCreate(refresh);
  watcher.onDidDelete(refresh);
  context.subscriptions.push(watcher);
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
  const extractor = config("extractorPath", "");
  if (extractor) args.push("--extractor", extractor);
  const res = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Hesperus: emitting actual from code" }, () => run(config("hespPath", "hesp"), args, root));
  if (res.code !== 0) {
    vscode.window.showErrorMessage(`Hesperus: emit failed: ${res.stderr.trim()}`);
    return;
  }
  vscode.window.showInformationMessage(`Hesperus: wrote ${res.stdout.trim().split("\n").length} actual files.`);
  if (panel) {
    const d = await loadData(context);
    if (d) panel.webview.postMessage(d);
  }
  void context;
}
