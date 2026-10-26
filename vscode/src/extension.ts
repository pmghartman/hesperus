import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import * as aggregate from "./core/aggregate";
import { EdgeKind, Graph, GraphNode } from "./core/ir";
import { layout } from "./layout";
import { genericFiles, index, LangResult, load, scan, Scan, sourceFiles, status, unindexedLanguages } from "./engine";
import { editorIndex, ensureExtension, hasExtension, installExtension } from "./editor";

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
const FIND_RANK: Record<string, number> = { function: 0, method: 0, type: 1, package: 2, directory: 3, file: 3, external_package: 4 };

// One graph tab per window; the sidebar is its control panel (status, errors, view options).
class Hesperus {
  private status: Status = STATUS.idle;
  private scanned?: Scan;
  private graph?: Graph;
  private parent = new Map<string, string>();
  private machines: aggregate.Machine[] = [];
  private expanded = new Set<string>();
  private hidden = new Set<EdgeKind>();
  private external = true;
  private files = false;
  private unindexed = true;
  private panel?: vscode.WebviewPanel;
  private sidebar?: vscode.WebviewView;
  private busy?: Promise<void>;
  private log = vscode.window.createOutputChannel("Hesperus");

  constructor(private ctx: vscode.ExtensionContext) {}

  private get opts(): aggregate.ViewOptions {
    return { files: this.files };
  }
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
      p.iconPath = vscode.Uri.joinPath(this.media, "icon.svg");
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
      this.scanned = scan(repo);
      const st = status(repo);
      if (force || st.state !== "ready") {
        const reason = force ? "Re-index requested." : st.state === "missing" ? "No cache yet." : st.detail;
        if (!this.scanned.languages.length) throw new Error("No supported language found in this folder.");
        // Each language resolves on its own; one that cannot (extension missing or silent) leaves its files
        // as unindexed nodes and the rest of the repo still builds.
        const results: LangResult[] = [];
        for (const l of this.scanned.languages) {
          try {
            this.setStatus({ state: "installing", label: `Checking the ${l.editor.name} extension…`, reason });
            await ensureExtension(l);
            const ix = await editorIndex(repo, l.id, sourceFiles(repo, l.id), (s) => this.setStatus({ state: "indexing", label: `${l.editor.name}: ${s}`, reason }));
            results.push({ lang: l.id, index: ix });
          } catch (e) {
            this.log.appendLine(`${l.id}: ${msg(e)}`);
            results.push({ lang: l.id, error: msg(e) });
          }
        }
        // Files no frontend owns: kept when the editor has a language server that finds code in them.
        // Definitions and references only, so their calls are `may` edges; silence just leaves them out.
        for (const g of this.scanned.generic) {
          try {
            this.setStatus({ state: "indexing", label: `.${g.ext}: asking the editor…`, reason });
            const ix = await editorIndex(repo, "generic", genericFiles(repo, g.ext), (s) => this.setStatus({ state: "indexing", label: `.${g.ext}: ${s}`, reason }), { patience: 4, needCode: true });
            results.push({ lang: `generic:${g.ext}`, index: ix });
          } catch (e) {
            this.log.appendLine(`.${g.ext}: ${msg(e)}`);
          }
        }
        await index(repo, results);
        this.graph = undefined;
        this.expanded.clear();
      }
      if (!this.graph) {
        this.graph = load(repo);
        this.parent = new Map(this.graph.edges.filter((e) => e.kind === "contains").map((e) => [e.to, e.from]));
        this.expanded = aggregate.overview(this.graph, aggregate.OVERVIEW_NODES, this.opts);
        this.machines = aggregate.machines(this.graph);
      }
      this.setStatus({ state: "ready", label: "Ready", nodes: this.graph.nodes.length, edges: this.graph.edges.length });
      await this.render();
    } catch (e) {
      this.setStatus({ state: "error", label: "Error", detail: msg(e) });
    }
  }

  private async render(extra: { anchor?: string; focus?: string; seq?: number } = {}) {
    const folder = this.folder;
    if (!this.panel || !this.graph || !folder) return;
    try {
      const all = aggregate.view(this.graph, this.expanded, this.opts);
      const ext = this.external ? all : aggregate.withoutExternal(this.graph, all);
      const v = this.unindexed ? ext : aggregate.withoutUnindexed(this.graph, ext);
      this.panel.webview.postMessage({ type: "layout", layout: await layout(this.graph, v), hidden: [...this.hidden], ...extra });
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
      external: this.external,
      files: this.files,
      unindexed: this.unindexed,
      repo: this.folder?.name ?? null,
      languages: (this.scanned?.languages ?? []).map((l) => ({ ...l, installed: hasExtension(l.editor.id) })),
      generic: this.scanned?.generic ?? [],
      other: this.scanned?.other_files ?? 0,
      missing: this.graph ? unindexedLanguages(this.graph).map((m) => ({ ...m, installed: hasExtension(m.editor.id) })) : [],
      machines: this.machines,
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
    this.postSidebar(`${best.name} · ${best.kind.replace("_", " ")}`);
    await this.reveal(best.id);
  }

  /** Expands a node's ancestors (and `open` itself) so it is drawn, then centres on it. */
  private async reveal(id: string, open = false) {
    if (!this.graph) return;
    if (open) this.expanded.add(id);
    const chain = new Set<string>([id]);
    for (let p = this.parent.get(id); p && this.parent.has(p); p = this.parent.get(p)) (this.expanded.add(p), chain.add(p));
    // Open any layer the target or its ancestors sit in; layers can nest.
    for (let more = true; more; ) {
      more = false;
      for (const gr of aggregate.view(this.graph, this.expanded, this.opts).groups)
        if (!gr.expanded && gr.members.some((m) => chain.has(m))) (this.expanded.add(gr.id), (more = true));
    }
    if (!this.panel) await this.open();
    await this.render({ focus: id });
  }

  private async onSidebar(m: { type: string; kind?: EdgeKind; query?: string; id?: string }) {
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
    else if (m.type === "files") {
      this.files = !this.files;
      this.postSidebar();
      await this.render();
    } else if (m.type === "unindexed") {
      this.unindexed = !this.unindexed;
      this.postSidebar();
      await this.render();
    } else if (m.type === "install" && m.id) {
      if (!this.panel) this.open();
      this.setStatus({ state: "installing", label: "Installing extension…", reason: m.id });
      await installExtension(m.id);
      await this.load(true);
    } else if (m.type === "external") {
      this.external = !this.external;
      this.postSidebar();
      await this.render();
    } else if (m.type === "find" && m.query) await this.find(m.query);
    else if (m.type === "machine" && m.id) await this.reveal(m.id, true);
    else if (m.type === "kind" && m.kind) {
      this.hidden.has(m.kind) ? this.hidden.delete(m.kind) : this.hidden.add(m.kind);
      this.postSidebar();
      this.panel?.webview.postMessage({ type: "hidden", hidden: [...this.hidden] });
    }
  }

  /** Whether `id` (a node or a tier) lies beneath container `c`. Tier ids are `tier:<parent>#<key>`. */
  private inside(id: string, c: string) {
    const up = (x: string) => (aggregate.isGroup(x) ? x.slice(5, x.lastIndexOf("#")) : this.parent.get(x));
    for (let p = up(id); p !== undefined; p = up(p)) if (p === c) return true;
    return false;
  }

  private async onGraph(m: { type: string; id?: string; open?: string[]; close?: string[]; anchor?: string; seq?: number }) {
    const folder = this.folder;
    if (m.type === "ready") {
      if (this.status.state === "ready") await this.render();
      else this.panel?.webview.postMessage({ type: "status", status: this.status });
    } else if (m.type === "toggle" && m.id) {
      this.expanded.has(m.id) ? this.expanded.delete(m.id) : this.expanded.add(m.id);
      await this.render({ anchor: m.id });
    } else if (m.type === "zoom") {
      // Semantic zoom. Closing a box forgets what was open inside it, so reopening shows one level.
      for (const id of m.open ?? []) this.expanded.add(id);
      for (const id of m.close ?? []) {
        this.expanded.delete(id);
        for (const x of [...this.expanded]) if (this.inside(x, id)) this.expanded.delete(x);
      }
      await this.render({ anchor: m.anchor, seq: m.seq });
    } else if (m.type === "open" && folder) {
      const n = this.graph?.nodes.find((x) => x.id === m.id);
      if (!n?.path || !n.range) return;
      const uri = vscode.Uri.joinPath(folder.uri, n.path);
      const r = new vscode.Range(n.range.start_line, n.range.start_col, n.range.end_line, n.range.end_col);
      await vscode.window.showTextDocument(uri, { selection: r, viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
    }
  }
}

export function activate(ctx: vscode.ExtensionContext) {
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
<div id="tools"><button id="auto" title="Semantic Zoom: zooming in opens boxes, zooming out closes them" aria-pressed="true"><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3M5 7h4M7 5v4"/></svg></button><span class="sep"></span><button id="out" title="Zoom Out"><svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg></button><span id="zoom">100%</span><button id="in" title="Zoom In"><svg viewBox="0 0 16 16"><path d="M3.5 8h9M8 3.5v9"/></svg></button><button id="fit" title="Fit to Window"><svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg></button></div>
<div id="msg">Loading…</div><div id="tip" hidden></div>`;

const SIDEBAR_BODY = `<header><div id="repo" class="repo"></div><div id="state" class="state"></div></header>
<pre id="detail" hidden></pre>
<div class="actions"><button id="open">Open Graph</button><button id="reindex" class="secondary" title="Read the repo again through the editor's language servers">Re-index</button></div>
<form id="find"><input id="q" type="search" placeholder="Find a function, type, or package" spellcheck="false" aria-label="Find"></form><div id="found" class="muted"></div>
<section><h3>Show<span class="tools"><button id="fit" class="link" title="Fit the graph to the window">Fit</button><button id="collapse" class="link" title="Collapse every container">Collapse All</button></span></h3>
<label><input type="checkbox" data-kind="call"><span class="swatch call"></span>Calls</label>
<label><input type="checkbox" data-kind="flow"><span class="swatch flow"></span>Data flow</label>
<label><input type="checkbox" data-kind="override"><span class="swatch override"></span>Overrides</label>
<label><input type="checkbox" data-kind="transition"><span class="swatch transition"></span>State transitions</label>
<label title="Packages outside the repo, such as the standard library"><input type="checkbox" id="external"><span class="swatch external"></span>External libraries</label>
<label title="Files in a language the editor could not resolve, drawn with no definitions or edges"><input type="checkbox" id="unindexed"><span class="swatch unindexed"></span>Unindexed files</label>
<label title="Off: packages and folders are boundaries around their types and functions. On: files sit between them."><input type="checkbox" id="files"><span class="swatch files"></span>Files</label>
<div class="legend"><span><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" class="l"/></svg>resolved</span><span><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" class="l may"/></svg>may</span><span><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" class="l unresolved"/></svg>unresolved</span></div></section>
<section><h3>State machines</h3><ul id="machines" class="machines"></ul></section>
<section id="missing-section" hidden><h3>Not indexed</h3><ul id="missing" class="langs"></ul></section>
<section><h3>Languages</h3><ul id="langs" class="langs"></ul></section>
<p class="hint">Zoom in to open boxes, zoom out to close them, or click a box to toggle it. ⌘/Ctrl-click or double-click opens its source. Hover to trace edges; click a wire or shift-click a box to pin it, Esc to clear.</p>`;
