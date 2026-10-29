import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import * as fs from "node:fs";
import * as aggregate from "./core/aggregate";
import { BOUNDARIES, BOUNDARY_INFO, boundaryGraph, boundaryId, libraryNodes } from "./core/boundary";
import { EdgeKind, Graph, GraphNode } from "./core/ir";
import { accept, defaultPolicy, Finding, lint, Policy, POLICY_FILE, Report, Severity, snapshot } from "./core/lint";
import { Flag, layout, MAX_WIRES } from "./layout";
import { FRONTENDS, genericFiles, ignored, index, isSource, LangResult, load, scan, Scan, sourceFiles, status } from "./engine";
import { entries as flowEntries, Entry, flow as flowFrom } from "./core/flow";
import { flowLayout } from "./flowchart";
import { flowInputs } from "./service";
import { editorIndex, ensureExtension, hasExtension, installExtension } from "./editor";
import { LintSurface } from "./linter";
import { gitHead, readBaseline, readPolicy, STARTER_POLICY, writeBaseline, writeReport } from "./review";

/** More boxes than this stalls the layout for minutes. */
const MAX_BOXES = 500;

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
const FIND_RANK: Record<string, number> = { function: 0, method: 0, type: 1, package: 2, directory: 3, file: 3, boundary: 4, external_package: 4 };

const WORSE: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
/** Folders whose changes never touch the graph, before asking git. */
const NOISE = /(^|\/)(\.git|\.hesperus|node_modules|out|dist|build|target|\.next|__pycache__|\.venv|venv)\//;

// One tab per window, showing either the flow chart (what the program does from an entry point) or the
// boundary map; the sidebar holds status, what to review, and where the program starts. While an agent
// edits the repo, changed files re-index, findings land in Problems, and both views mark what is new.
class Hesperus {
  private status: Status = STATUS.idle;
  private scanned?: Scan;
  private graph?: Graph;
  /** The graph as drawn: `graph`, with outside calls filed under boundaries when that view is on. */
  private shown?: Graph;
  private parent = new Map<string, string>();
  private policy: Policy = defaultPolicy();
  private policyError?: string;
  private report?: Report;
  /** Draw outside calls grouped by what they reach (database, network, ...) instead of by package. */
  private boundaries = true;
  private lintUi: LintSurface;
  private watchTimer?: NodeJS.Timeout;
  private changed = new Set<string>();
  /** A change arrived mid-index; index again once it finishes. */
  private again = false;
  private expanded = new Set<string>();
  /** The flow chart, or the boundary map. */
  private mode: "flow" | "map" = "flow";
  /** The entry point the flow starts from; the one that drives the most code when unset. */
  private entry?: string;
  /** Steps of the flow opened in place. */
  private openSteps = new Set<string>();
  private entryList?: Entry[];
  // Guards tie code to the states it runs in; the automaton view is their picture, so boxes leave them out.
  private hidden = new Set<EdgeKind>(["guard"]);
  /** Outside libraries no boundary claims. Off by default: every box calls the standard library. */
  private external = false;
  private files = false;
  private flow = true;
  private isolated = 0;
  private unindexed = true;
  private panel?: vscode.WebviewPanel;
  private sidebar?: vscode.WebviewView;
  private busy?: Promise<void>;
  private log = vscode.window.createOutputChannel("Hesperus");

  constructor(private ctx: vscode.ExtensionContext) {
    this.lintUi = new LintSurface(ctx);
  }

  private get opts(): aggregate.ViewOptions {
    return { files: this.files, flow: this.flow };
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

  /** Downloads missing indexers and indexes when the cache is missing or stale (or `force`), then renders.
   *  `keep` holds the user's place: what is open stays open (a re-index after an edit). */
  load(force: boolean, keep = false): Promise<void> {
    if (this.busy) {
      if (keep) this.again = true;
      return this.busy;
    }
    this.busy = this.doLoad(force, keep).finally(() => {
      this.busy = undefined;
      if (this.again) (this.again = false, this.load(true, true));
    });
    return this.busy;
  }

  private async doLoad(force: boolean, keep = false) {
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
            // In the background (no Hesperus view open) a missing extension is not worth a prompt.
            if (!this.panel && !this.sidebar && !hasExtension(l.editor.id)) throw new Error(`The ${l.editor.name} extension (${l.editor.id}) is not installed.`);
            await ensureExtension(l);
            const ix = await editorIndex(repo, l.id, sourceFiles(repo, l.id), (s) => this.setStatus({ state: "indexing", label: `${l.editor.name}: ${s}`, reason }), { patience: 90, needCode: false, frontend: FRONTENDS.find((f) => f.id === l.id) });
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
        if (!keep) this.expanded.clear();
      }
      if (!this.graph) {
        this.graph = load(repo);
        this.entryList = undefined;
        this.relint(keep && this.expanded.size > 0);
      }
      this.setStatus({ state: "ready", label: "Ready", nodes: this.graph.nodes.length, edges: this.graph.edges.length });
      await this.render();
    } catch (e) {
      this.setStatus({ state: "error", label: "Error", detail: msg(e) });
    }
  }

  /** Reads the policy and baseline, lints, publishes findings, and rebuilds the drawn graph. The first lint
   *  of a repo accepts what it already does, so only what changes after that is new. */
  private relint(keepView = false) {
    const folder = this.folder;
    if (!folder || !this.graph) return;
    const repo = folder.uri.fsPath;
    try {
      this.policy = readPolicy(repo);
      this.policyError = undefined;
    } catch (e) {
      this.policy = defaultPolicy();
      this.policyError = msg(e);
    }
    let base = readBaseline(repo);
    if (!base) writeBaseline(repo, (base = snapshot(this.graph, this.policy, gitHead(repo))));
    this.report = lint(this.graph, this.policy, base);
    try {
      writeReport(repo, this.graph, this.report);
    } catch (e) {
      this.log.appendLine(`report: ${msg(e)}`);
    }
    this.lintUi.publish(folder.uri, this.report, this.policyError);
    this.reshape(keepView);
  }

  /** The drawn graph for the current options; `keepView` keeps open what still exists. */
  private reshape(keepView = false) {
    if (!this.graph) return;
    this.shown = this.boundaries ? boundaryGraph(this.graph, this.policy.boundaries) : this.graph;
    this.parent = new Map(this.shown.edges.filter((e) => e.kind === "contains").map((e) => [e.to, e.from]));
    if (keepView) {
      const ids = new Set(this.shown.nodes.map((n) => n.id));
      this.expanded = new Set([...this.expanded].filter((id) => ids.has(id) || aggregate.isGroup(id)));
    } else this.expanded = aggregate.overview(this.shown, aggregate.OVERVIEW_NODES, this.opts);
  }

  /** Findings drawn on the graph: per call edge (from, to), the worst severity and the messages. */
  private flags(): Map<string, Flag> {
    const out = new Map<string, Flag>();
    for (const f of this.report?.findings ?? []) {
      const [from, to] = f.key.startsWith("in ") ? [f.external, f.local] : [f.local, f.external];
      const k = `${from}\0${to}`;
      out.set(k, merge(out.get(k), { severity: f.severity, notes: [f.message] }));
    }
    return out;
  }

  private async render(extra: { anchor?: string; focus?: string; seq?: number } = {}) {
    const folder = this.folder;
    if (!this.panel || !this.graph || !folder) return;
    try {
      if (this.mode === "flow") return await this.renderFlow(folder.uri.fsPath, extra.anchor);
      this.panel.title = `Map: ${folder.name}`;
      const g = this.shown ?? this.graph;
      const all = aggregate.view(g, this.expanded, this.opts);
      const ext = this.external ? all : this.boundaries ? aggregate.withoutNodes(all, libraryNodes(g)) : aggregate.withoutExternal(g, all);
      const v = this.unindexed ? ext : aggregate.withoutUnindexed(g, ext);
      this.isolated = v.isolated ?? 0;
      const flags = this.flags();
      const flagsOf = (r: aggregate.Rollup) => (r.kind === "call" ? r.edges.map((i) => flags.get(`${g.edges[i].from}\0${g.edges[i].to}`)).filter((f): f is Flag => !!f) : []);
      const laid = await layout(g, v, { flow: this.flow, keep: (r) => flagsOf(r).length > 0 });
      // A wire, and the boxes at its ends, carry the worst finding beneath it.
      const boxes = new Map(laid.boxes.map((b) => [b.id, b]));
      for (const w of laid.wires)
        for (const r of w.rollups)
          for (const f of flagsOf(r)) {
            w.flag = merge(w.flag, f);
            for (const id of [w.from, w.to]) {
              const b = boxes.get(id);
              if (b) b.flag = merge(b.flag, f);
            }
          }
      this.postSidebar(laid.omitted ? `Drawing the ${MAX_WIRES} heaviest wires; ${laid.omitted} lighter ones are left out.` : undefined);
      this.panel.webview.postMessage({ type: "layout", layout: laid, hidden: [...this.hidden], ...extra });
    } catch (e) {
      this.setStatus({ state: "error", label: "Error", detail: msg(e) });
    }
  }

  /** The entry points, computed once per graph. */
  private async entriesOf(repo: string): Promise<Entry[]> {
    if (!this.entryList && this.graph) this.entryList = flowEntries(this.graph, await flowInputs(repo, { graph: this.graph, policy: this.policy }, this.report));
    return this.entryList ?? [];
  }

  /** The flow chart from the chosen entry (or the one that drives the most code), its opened steps inlined. */
  private async renderFlow(repo: string, anchor?: string) {
    if (!this.panel || !this.graph) return;
    const all = await this.entriesOf(repo);
    const ids = new Set(this.graph.nodes.map((n) => n.id));
    if (this.entry && !ids.has(this.entry)) this.entry = undefined;
    const id = this.entry ?? all[0]?.id;
    const inp = await flowInputs(repo, { graph: this.graph, policy: this.policy }, this.report);
    const f = id ? flowFrom(this.graph, id, this.openSteps, inp) : undefined;
    this.postSidebar();
    if (!f) {
      this.panel.webview.postMessage({ type: "status", status: { state: "error", label: "Error", detail: "No entry point found: nothing in the repo is called from outside it, or nothing is indexed yet. Find a function by name to chart it." } });
      return;
    }
    this.panel.title = `Flow: ${f.entry.name}`;
    this.panel.webview.postMessage({ type: "flow", layout: flowLayout(f), anchor });
  }

  private setStatus(s: Status) {
    this.status = s;
    this.postSidebar();
    this.lintUi.busy(s.state === "installing" || s.state === "indexing" ? s.label : undefined);
    // "checking" runs on every open; leave the current drawing up meanwhile.
    if (s.state !== "checking") this.panel?.webview.postMessage({ type: "status", status: s });
  }

  private postSidebar(found?: string) {
    const entries = this.entryList ?? [];
    this.sidebar?.webview.postMessage({
      type: "state",
      status: this.status,
      mode: this.mode,
      entry: this.entry ?? entries[0]?.id ?? null,
      entries: entries.slice(0, 40).map((e) => ({ id: e.id, name: e.name, doc: e.doc ?? null, path: e.path, line: e.line, reach: e.reach })),
      moreEntries: Math.max(0, entries.length - 40),
      watch: this.watching,
      policy: { exists: !!this.folder && fs.existsSync(vscode.Uri.joinPath(this.folder.uri, POLICY_FILE).fsPath), error: this.policyError ?? null },
      findings: (this.report?.findings ?? []).slice(0, 200).map((f, i) => ({ i, rule: f.rule, severity: f.severity, message: f.message, path: f.path ?? null, line: (f.range?.start_line ?? 0) + 1 })),
      totalFindings: this.report?.findings.length ?? 0,
      removed: this.report?.removed.length ?? 0,
      crossings: BOUNDARIES.filter((b) => this.report?.counts[b]).map((b) => ({ id: b, label: BOUNDARY_INFO[b].label, doc: BOUNDARY_INFO[b].doc, ...this.report!.counts[b]! })),
      repo: this.folder?.name ?? null,
      languages: (this.scanned?.languages ?? []).map((l) => ({ ...l, installed: hasExtension(l.editor.id) })),
      found,
    });
  }

  /** Best name match; expands its ancestors so it is drawn, then centres on it. */
  private async find(query: string) {
    const q = query.trim().toLowerCase();
    const g = this.shown ?? this.graph;
    if (!q || !g) return;
    const score = (n: GraphNode) => {
      const name = n.name.toLowerCase();
      const m = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : n.id.toLowerCase().includes(q) ? 3 : -1;
      return m < 0 ? null : [m, FIND_RANK[n.kind] ?? 5, n.name.length, n.id] as const;
    };
    let best: GraphNode | undefined, bestKey: readonly [number, number, number, string] | undefined;
    for (const n of g.nodes) {
      const k = score(n);
      if (k && (!bestKey || k < bestKey)) [best, bestKey] = [n, k];
    }
    if (!best) return this.postSidebar(`No node matches “${query}”.`);
    if (this.mode === "flow" && (best.kind === "function" || best.kind === "method" || best.kind === "file") && best.path) {
      this.entry = best.id;
      this.openSteps.clear();
      this.postSidebar(`${best.name} · ${best.kind}`);
      if (!this.panel) await this.open();
      await this.render();
      return;
    }
    this.postSidebar(`${best.name} · ${best.kind.replace("_", " ")}`);
    await this.reveal(best.id);
  }

  /** Expands a node's ancestors (and `open` itself) so it is drawn, then centres on it. */
  private async reveal(id: string, open = false) {
    const g = this.shown ?? this.graph;
    if (!g) return;
    if (open) this.expanded.add(id);
    this.mode = "map";
    const chain = new Set<string>([id]);
    for (let p = this.parent.get(id); p && this.parent.has(p); p = this.parent.get(p)) (this.expanded.add(p), chain.add(p));
    // Open any layer the target or its ancestors sit in; layers can nest.
    for (let more = true; more; ) {
      more = false;
      for (const gr of aggregate.view(g, this.expanded, this.opts).groups)
        if (!gr.expanded && gr.members.some((m) => chain.has(m))) (this.expanded.add(gr.id), (more = true));
    }
    if (!this.panel) await this.open();
    await this.render({ focus: id });
  }

  /** Builds the graph and lints in the background when a folder opens, so findings show with no sidebar open. */
  async background() {
    const folder = this.folder;
    if (!folder || this.graph) return;
    if (status(folder.uri.fsPath).state === "missing") return; // First index waits for the user to open Hesperus.
    await this.load(false);
  }

  /** Accepts findings as reviewed: they stop being new. Denied crossings stay until code or policy changes. */
  async acceptKeys(keys?: string[]) {
    const folder = this.folder;
    if (!folder || !this.graph || !this.report) return;
    const repo = folder.uri.fsPath;
    const all = !keys;
    keys ??= [...new Set(this.report.findings.filter((f) => f.rule !== "boundary-denied").map((f) => f.key))];
    if (!keys.length && !this.report.removed.length) return void vscode.window.showInformationMessage("Hesperus: nothing new to accept.");
    if (all) {
      const ok = await vscode.window.showWarningMessage(`Accept ${keys.length} new crossings and dependencies as reviewed?`, { modal: true }, "Accept");
      if (ok !== "Accept") return;
    }
    // Accepting everything takes the code as it is now, which also forgets crossings that are gone.
    const base = all ? snapshot(this.graph, this.policy, gitHead(repo)) : readBaseline(repo) ?? snapshot(this.graph, this.policy, gitHead(repo));
    writeBaseline(repo, accept(base, keys));
    this.relint(true);
    this.postSidebar();
    await this.render();
  }

  /** Opens the call site and centres the graph on the code that crosses. */
  async showFinding(f?: Finding) {
    const folder = this.folder;
    if (!folder || !f) return;
    if (f.path && f.range) {
      const r = new vscode.Range(f.range.start_line, f.range.start_col, f.range.end_line, f.range.end_col);
      await vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri, f.path), { selection: r, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
    }
    await this.reveal(f.local);
  }

  async openPolicy() {
    const folder = this.folder;
    if (!folder) return;
    const uri = vscode.Uri.joinPath(folder.uri, POLICY_FILE);
    if (!fs.existsSync(uri.fsPath)) await vscode.workspace.fs.writeFile(uri, Buffer.from(STARTER_POLICY));
    await vscode.window.showTextDocument(uri);
  }

  private get watching() {
    return vscode.workspace.getConfiguration("hesperus").get<boolean>("watch", true);
  }

  /** A file changed on disk. The policy re-lints at once; source re-indexes after a quiet spell. */
  onChange(uri: vscode.Uri) {
    const folder = this.folder;
    if (!folder || !this.graph) return;
    const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
    if (rel === POLICY_FILE) {
      this.relint(true);
      this.postSidebar();
      return void this.render();
    }
    if (!this.watching || NOISE.test(rel) || !isSource(rel)) return;
    this.changed.add(rel);
    clearTimeout(this.watchTimer);
    const delay = vscode.workspace.getConfiguration("hesperus").get<number>("watchDelay", 1500);
    this.watchTimer = setTimeout(() => {
      const paths = [...this.changed];
      this.changed.clear();
      const skip = ignored(folder.uri.fsPath, paths);
      if (paths.every((p) => skip.has(p))) return;
      this.log.appendLine(`changed: ${paths.slice(0, 5).join(", ")}${paths.length > 5 ? ` and ${paths.length - 5} more` : ""}`);
      this.load(true, true);
    }, delay);
  }

  private async onSidebar(m: { type: string; query?: string; id?: string; index?: number }) {
    if (m.type === "ready") this.postSidebar();
    else if (m.type === "accept") await this.acceptKeys();
    else if (m.type === "finding" && m.index !== undefined) await this.showFinding(this.report?.findings[m.index]);
    else if (m.type === "policy") await this.openPolicy();
    else if (m.type === "watch") {
      // User settings: writing workspace settings would put a file in the repo under review.
      await vscode.workspace.getConfiguration("hesperus").update("watch", !this.watching, vscode.ConfigurationTarget.Global);
      this.postSidebar();
    } else if (m.type === "boundary" && m.id) {
      if (!this.boundaries) (this.boundaries = true, this.reshape());
      await this.reveal(boundaryId(m.id as (typeof BOUNDARIES)[number]), true);
    } else if (m.type === "flow" || m.type === "map") {
      this.mode = m.type;
      if (!this.panel) await this.open();
      else await this.render();
      this.panel?.webview.postMessage({ type: "fit" });
    } else if (m.type === "entry" && m.id) {
      this.mode = "flow";
      this.entry = m.id;
      this.openSteps.clear();
      if (!this.panel) await this.open();
      else await this.render();
      this.panel?.webview.postMessage({ type: "fit" });
    } else if (m.type === "reindex") {
      if (!this.panel) this.open();
      await this.load(true);
    } else if (m.type === "install" && m.id) {
      if (!this.panel) this.open();
      this.setStatus({ state: "installing", label: "Installing extension…", reason: m.id });
      await installExtension(m.id);
      await this.load(true);
    } else if (m.type === "find" && m.query) await this.find(m.query);
  }

  /** True, with a note in the sidebar, when the open boxes would draw more than the layout can handle. */
  private tooBig() {
    if (!this.shown) return false;
    const n = aggregate.view(this.shown, this.expanded, this.opts).nodes.length;
    if (n <= MAX_BOXES) return false;
    this.postSidebar(`Opening that would draw ${n.toLocaleString()} boxes; the limit is ${MAX_BOXES}. Close something first.`);
    return true;
  }

  /** Whether `id` (a node or a tier) lies beneath container `c`. Tier ids are `tier:<parent>#<key>`. */
  private inside(id: string, c: string) {
    const up = (x: string) => (aggregate.isGroup(x) ? x.slice(5, x.lastIndexOf("#")) : this.parent.get(x));
    for (let p = up(id); p !== undefined; p = up(p)) if (p === c) return true;
    return false;
  }

  private async onGraph(m: { type: string; id?: string; open?: string[]; close?: string[]; anchor?: string; seq?: number; path?: string; line?: number }) {
    const folder = this.folder;
    if (m.type === "ready") {
      if (this.status.state === "ready") await this.render();
      else this.panel?.webview.postMessage({ type: "status", status: this.status });
    } else if (m.type === "flowToggle" && m.id) {
      this.openSteps.has(m.id) ? this.openSteps.delete(m.id) : this.openSteps.add(m.id);
      await this.render({ anchor: m.id });
    } else if (m.type === "openAt" && folder && m.path) {
      const line = Math.max(0, (m.line ?? 1) - 1);
      await vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri, m.path), { selection: new vscode.Range(line, 0, line, 0), viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
    } else if (m.type === "toggle" && m.id) {
      const before = new Set(this.expanded);
      this.expanded.has(m.id) ? this.expanded.delete(m.id) : this.expanded.add(m.id);
      if (this.tooBig()) this.expanded = before;
      await this.render({ anchor: m.id });
    } else if (m.type === "zoom") {
      const before = new Set(this.expanded);
      // Semantic zoom. Closing a box forgets what was open inside it, so reopening shows one level.
      for (const id of m.open ?? []) this.expanded.add(id);
      for (const id of m.close ?? []) {
        this.expanded.delete(id);
        for (const x of [...this.expanded]) if (this.inside(x, id)) this.expanded.delete(x);
      }
      if (this.tooBig()) this.expanded = before;
      await this.render({ anchor: m.anchor, seq: m.seq });
    } else if (m.type === "open" && folder) {
      const n = (this.shown ?? this.graph)?.nodes.find((x) => x.id === m.id);
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
    vscode.commands.registerCommand("hesperus.accept", () => h.acceptKeys()),
    vscode.commands.registerCommand("hesperus.acceptKeys", (keys: string[]) => h.acceptKeys(keys)),
    vscode.commands.registerCommand("hesperus.showFinding", (f?: Finding) => h.showFinding(f)),
    vscode.commands.registerCommand("hesperus.policy", () => h.openPolicy()),
  );
  // Agents write files without the editor saving them, so the watcher is on disk, not on documents.
  const w = vscode.workspace.createFileSystemWatcher("**/*");
  ctx.subscriptions.push(w, w.onDidChange((u) => h.onChange(u)), w.onDidCreate((u) => h.onChange(u)), w.onDidDelete((u) => h.onChange(u)));
  // A repo indexed before lints as soon as it opens, sidebar or not.
  void h.background();
}

export function deactivate() {}

/** `into` with `f` folded in: the worse severity, and up to four distinct notes. */
function merge(into: Flag | undefined, f: Flag): Flag {
  const m = into ?? { severity: f.severity, notes: [] };
  if (WORSE[f.severity] < WORSE[m.severity]) m.severity = f.severity;
  for (const n of f.notes) if (m.notes.length < 4 && !m.notes.includes(n)) m.notes.push(n);
  return m;
}

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

const GRAPH_BODY = `<svg id="view" xmlns="http://www.w3.org/2000/svg"><g id="scene"></g><g id="labels"></g></svg>
<div id="tools"><button id="auto" title="Semantic Zoom: zooming in opens boxes" aria-pressed="true"><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3M5 7h4M7 5v4"/></svg></button><span class="sep"></span><button id="out" title="Zoom Out"><svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg></button><span id="zoom">100%</span><button id="in" title="Zoom In"><svg viewBox="0 0 16 16"><path d="M3.5 8h9M8 3.5v9"/></svg></button><button id="fit" title="Fit to Window"><svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg></button></div>
<div id="msg">Loading…</div><div id="tip" hidden></div>`;

const SIDEBAR_BODY = `<header><div id="repo" class="repo"></div><div id="state" class="state"></div></header>
<pre id="detail" hidden></pre>
<ul id="missing" class="missing" hidden></ul>
<div class="actions"><button id="flow" title="What the program does, step by step from an entry point">Flow</button><button id="map" class="secondary" title="What the repo reaches outside itself: databases, the network, models, files">Map</button><button id="reindex" class="secondary" title="Read the repo again">Re-index</button></div>
<form id="find"><input id="q" type="search" placeholder="Find a function or file to chart" spellcheck="false" aria-label="Find"></form><div id="found" class="muted"></div>
<section><h3>Starts from</h3><ul id="entries" class="entries"></ul><div id="more" class="muted" hidden></div></section>
<section id="review"><h3>Review<span class="tools"><button id="policy" class="link" title="Rules for what each part of the repo may reach">Policy</button><button id="accept" class="link" title="Mark every new crossing and dependency as reviewed">Accept All</button></span></h3>
<div id="summary" class="summary"></div><pre id="policy-error" class="err" hidden></pre><ul id="findings" class="findings"></ul></section>
<section><h3>Reaches</h3><ul id="crossings" class="langs"></ul></section>
<label title="Re-index when files change on disk, so edits an agent makes show up as findings"><input type="checkbox" id="watch">Watch for changes</label>`;
