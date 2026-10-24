import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import { EdgeKind, Graph, GraphNode, View } from "./graph";
import { layout } from "./layout";
import { install, Tools } from "./tools";

let bundled: string | undefined;

/** The CLI shipped in this platform's package, made executable once; zip extraction may drop the mode. */
async function initBundled(ctx: vscode.ExtensionContext) {
  const p = vscode.Uri.joinPath(ctx.extensionUri, "bin", process.platform === "win32" ? "hesperus.exe" : "hesperus").fsPath;
  try {
    await fs.access(p);
    if (process.platform !== "win32") await fs.chmod(p, 0o755);
    bundled = p;
  } catch {
    bundled = undefined;
  }
}

function cli(args: string[]): Promise<string> {
  // An explicit setting wins (development builds); else the bundled binary; else PATH.
  const bin = vscode.workspace.getConfiguration("hesperus").get<string>("cliPath") || bundled || "hesperus";
  return new Promise((resolve, reject) =>
    execFile(bin, args, { maxBuffer: 1 << 29 }, (err, out, errOut) => {
      if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT")
        return reject(new Error(`Hesperus CLI not found at "${bin}". This platform's package has no bundled CLI; set hesperus.cliPath in settings.`));
      err ? reject(new Error(errOut.trim() || err.message)) : resolve(out);
    }));
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Status =
  | { state: "idle" | "checking"; label: string }
  | { state: "installing" | "indexing"; label: string; reason: string }
  | { state: "ready"; label: string; nodes: number; edges: number }
  | { state: "error"; label: string; detail: string };

const STATUS = {
  idle: { state: "idle", label: "Not loaded" },
  checking: { state: "checking", label: "Checking cache…" },
} as const;

/** Callable and structural nodes rank above variables and fields when names tie. */
const FIND_RANK: Record<string, number> = { function: 0, method: 0, type: 1, package: 2, file: 3, external_package: 4 };

// One graph tab per window; the sidebar is its control panel (status, errors, view options).
class Hesperus {
  private status: Status = STATUS.idle;
  private tools?: Tools;
  private graph?: Graph;
  private parent = new Map<string, string>();
  private expanded = new Set<string>();
  private hidden = new Set<EdgeKind>();
  private panel?: vscode.WebviewPanel;
  private sidebar?: vscode.WebviewView;
  private busy?: Promise<void>;

  constructor(private ctx: vscode.ExtensionContext) {}

  private get folder() {
    return vscode.workspace.workspaceFolders?.[0];
  }
  private get media() {
    return vscode.Uri.joinPath(this.ctx.extensionUri, "media");
  }
  private get toolsDir() {
    return vscode.Uri.joinPath(this.ctx.globalStorageUri, "tools").fsPath;
  }

  attachSidebar(view: vscode.WebviewView) {
    this.sidebar = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.media] };
    view.webview.html = page(view.webview, this.media, "sidebar", SIDEBAR_BODY);
    view.webview.onDidReceiveMessage((m) => this.onSidebar(m));
    view.onDidChangeVisibility(() => view.visible && this.open());
    view.onDidDispose(() => (this.sidebar = undefined));
    if (view.visible) this.open();
  }

  open() {
    if (this.panel) this.panel.reveal(undefined, true);
    else {
      const name = this.folder?.name;
      const p = vscode.window.createWebviewPanel(
        "hesperus",
        name ? `Graph: ${name}` : "Hesperus",
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.media] },
      );
      p.iconPath = vscode.Uri.joinPath(this.media, "graph.svg");
      p.webview.html = page(p.webview, this.media, "graph", GRAPH_BODY);
      p.webview.onDidReceiveMessage((m) => this.onGraph(m));
      p.onDidDispose(() => (this.panel = undefined));
      this.panel = p;
    }
    return this.load(false);
  }

  /** Downloads missing indexers and indexes when the cache is missing or stale (or `force`), then renders. */
  load(force: boolean): Promise<void> {
    if (this.busy) return this.busy;
    this.busy = this.doLoad(force).finally(() => (this.busy = undefined));
    return this.busy;
  }

  private async doLoad(force: boolean) {
    const folder = this.folder;
    if (!folder) return this.setStatus({ state: "error", label: "Error", detail: "Open a folder to see its graph." });
    const repo = folder.uri.fsPath;
    try {
      this.setStatus(STATUS.checking);
      this.tools = JSON.parse(await cli(["tools", repo, "--tools-dir", this.toolsDir]));
      const st: { state: string; detail: string } = JSON.parse(await cli(["status", repo]));
      if (force || st.state !== "ready") {
        const reason = force ? "Re-index requested." : st.state === "missing" ? "No cache yet." : st.detail;
        for (const t of this.tools!.tools.filter((t) => !t.bin)) {
          this.setStatus({ state: "installing", label: `Downloading ${t.name} ${t.version}…`, reason: "One-time download into the extension's storage." });
          await install(t);
        }
        this.tools = JSON.parse(await cli(["tools", repo, "--tools-dir", this.toolsDir]));
        const names = this.tools!.tools.map((t) => t.name).join(" + ");
        this.setStatus({ state: "indexing", label: `Indexing with ${names}…`, reason });
        await cli(["index", repo, "--tools-dir", this.toolsDir]);
        this.graph = undefined;
        this.expanded.clear();
      }
      if (!this.graph) {
        this.graph = JSON.parse(await cli(["graph", repo])) as Graph;
        this.parent = new Map(this.graph.edges.filter((e) => e.kind === "contains").map((e) => [e.to, e.from]));
      }
      this.setStatus({ state: "ready", label: "Ready", nodes: this.graph.nodes.length, edges: this.graph.edges.length });
      await this.render();
    } catch (e) {
      this.setStatus({ state: "error", label: "Error", detail: msg(e) });
    }
  }

  private async render(extra: { anchor?: string; focus?: string } = {}) {
    const folder = this.folder;
    if (!this.panel || !this.graph || !folder) return;
    try {
      const args = [...this.expanded].sort().flatMap((e) => ["--expand", e]);
      const view: View = JSON.parse(await cli(["view", folder.uri.fsPath, ...args]));
      this.panel.webview.postMessage({ type: "layout", layout: await layout(this.graph, view), hidden: [...this.hidden], ...extra });
    } catch (e) {
      this.setStatus({ state: "error", label: "Error", detail: msg(e) });
    }
  }

  private setStatus(s: Status) {
    this.status = s;
    this.postSidebar();
    // "checking" runs on every open; leave the current drawing up meanwhile.
    if (s.state !== "checking") this.panel?.webview.postMessage({ type: "status", status: s });
  }

  private postSidebar(found?: string) {
    this.sidebar?.webview.postMessage({
      type: "state",
      status: this.status,
      hidden: [...this.hidden],
      repo: this.folder?.name ?? null,
      tools: this.tools ?? null,
      found,
    });
  }

  /** Best name match; expands its ancestors so it is drawn, then centres on it. */
  private async find(query: string) {
    const q = query.trim().toLowerCase();
    if (!q || !this.graph) return;
    const score = (n: GraphNode) => {
      const name = n.name.toLowerCase();
      const m = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : n.id.toLowerCase().includes(q) ? 3 : -1;
      return m < 0 ? null : [m, FIND_RANK[n.kind] ?? 5, n.name.length, n.id] as const;
    };
    let best: GraphNode | undefined, bestKey: readonly [number, number, number, string] | undefined;
    for (const n of this.graph.nodes) {
      const k = score(n);
      if (k && (!bestKey || k < bestKey)) [best, bestKey] = [n, k];
    }
    if (!best) return this.postSidebar(`No node matches “${query}”.`);
    for (let p = this.parent.get(best.id); p && this.parent.has(p); p = this.parent.get(p)) this.expanded.add(p);
    this.postSidebar(`${best.name} · ${best.kind.replace("_", " ")}`);
    if (!this.panel) await this.open();
    await this.render({ focus: best.id });
  }

  private async onSidebar(m: { type: string; kind?: EdgeKind; query?: string }) {
    if (m.type === "ready") this.postSidebar();
    else if (m.type === "open") await this.open();
    else if (m.type === "reindex") {
      if (!this.panel) this.open();
      await this.load(true);
    } else if (m.type === "collapse") {
      this.expanded.clear();
      await this.render();
      this.panel?.webview.postMessage({ type: "fit" });
    } else if (m.type === "fit") this.panel?.webview.postMessage({ type: "fit" });
    else if (m.type === "find" && m.query) await this.find(m.query);
    else if (m.type === "kind" && m.kind) {
      this.hidden.has(m.kind) ? this.hidden.delete(m.kind) : this.hidden.add(m.kind);
      this.postSidebar();
      this.panel?.webview.postMessage({ type: "hidden", hidden: [...this.hidden] });
    }
  }

  private async onGraph(m: { type: string; id?: string }) {
    const folder = this.folder;
    if (m.type === "ready") {
      if (this.status.state === "ready") await this.render();
      else this.panel?.webview.postMessage({ type: "status", status: this.status });
    } else if (m.type === "toggle" && m.id) {
      this.expanded.has(m.id) ? this.expanded.delete(m.id) : this.expanded.add(m.id);
      await this.render({ anchor: m.id });
    } else if (m.type === "open" && folder) {
      const n = this.graph?.nodes.find((x) => x.id === m.id);
      if (!n?.path || !n.range) return;
      const uri = vscode.Uri.joinPath(folder.uri, n.path);
      const r = new vscode.Range(n.range.start_line, n.range.start_col, n.range.end_line, n.range.end_col);
      await vscode.window.showTextDocument(uri, { selection: r, viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
    }
  }
}

export async function activate(ctx: vscode.ExtensionContext) {
  await initBundled(ctx);
  const h = new Hesperus(ctx);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider("hesperus.graph", { resolveWebviewView: (v) => h.attachSidebar(v) }),
    vscode.commands.registerCommand("hesperus.openGraph", () => h.open()),
    vscode.commands.registerCommand("hesperus.refresh", () => h.load(true)),
  );
}

export function deactivate() {}

function page(webview: vscode.Webview, media: vscode.Uri, name: string, body: string): string {
  const nonce = randomBytes(16).toString("hex");
  const css = webview.asWebviewUri(vscode.Uri.joinPath(media, `${name}.css`));
  const js = webview.asWebviewUri(vscode.Uri.joinPath(media, `${name}.js`));
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${css}"></head><body>${body}
<script nonce="${nonce}" src="${js}"></script></body></html>`;
}

const GRAPH_BODY = `<svg id="view" xmlns="http://www.w3.org/2000/svg"><g id="scene"></g></svg>
<div id="tools"><button id="out" title="Zoom out">−</button><span id="zoom">100%</span><button id="in" title="Zoom in">+</button><button id="fit" title="Fit to window">⤢</button></div>
<div id="hint">Scroll to zoom · drag to pan · click to expand · ⌘/Ctrl-click or double-click opens source</div>
<div id="msg">Loading…</div><div id="tip" hidden></div>`;

const SIDEBAR_BODY = `<section><div id="repo" class="repo"></div>
<div id="state" class="state"></div><pre id="detail" hidden></pre>
<div class="row"><button id="open">Open graph</button><button id="reindex" class="secondary" title="Re-run the indexers">Re-index</button></div></section>
<section><h3>Find</h3><form id="find"><input id="q" type="search" placeholder="Function, type, package…" spellcheck="false"></form><div id="found" class="muted"></div></section>
<section><h3>View</h3><div class="row"><button id="fit" class="secondary">Fit</button><button id="collapse" class="secondary">Collapse all</button></div>
<label><input type="checkbox" data-kind="call"><span class="swatch call"></span>Calls</label>
<label><input type="checkbox" data-kind="flow"><span class="swatch flow"></span>Data flow</label>
<label><input type="checkbox" data-kind="override"><span class="swatch override"></span>Overrides</label></section>
<section><h3>Languages</h3><ul id="langs" class="langs"></ul></section>
<section><h3>Edge certainty</h3><div class="legend">
<div><svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" class="l"/></svg>resolved</div>
<div><svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" class="l may"/></svg>may (dynamic dispatch)</div>
<div><svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" class="l unresolved"/></svg>unresolved</div></div></section>`;
