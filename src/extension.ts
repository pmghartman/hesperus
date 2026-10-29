import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import * as fs from "node:fs";
import * as aggregate from "./core/aggregate";
import { BOUNDARIES, BOUNDARY_INFO, boundaryGraph, boundaryId, libraryNodes } from "./core/boundary";
import { EdgeKind, Graph, GraphNode } from "./core/ir";
import { defaultPolicy, Policy, Report, Severity } from "./core/lint";
import { Flag, layout, MAX_WIRES } from "./layout";
import { draft, FRONTENDS, genericFiles, ignored, index, isSource, LangResult, load, owner, pin, scan, Scan, sourceFiles, status } from "./engine";
import { entries as flowEntries, Entry, Flow, flow as flowFrom, wayTo } from "./core/flow";
import { connectClaudeCode, hasClaudeCode, registerWithEditor } from "./connect";
import { Narrative, narrativeKey, NARRATIVES_FILE, readNarrative } from "./core/narrate";
import { BRIDGE_TOOL, type BridgeFile } from "./core/bridge";
import { CACHE_DIR } from "./core/cache";
import { sha256Hex } from "./core/hash";
import type { Index } from "./core/scip";
import { flowLayout, FlowLayout } from "./flowchart";
import { crossingsOf, flowInputs } from "./service";
import { Asked, editorIndex, ensureExtension, installExtension, servedBy, servesExtension } from "./editor";

/** More boxes than this stalls the layout for minutes. */
const MAX_BOXES = 500;
/** Entry points sent to the sidebar; it shows a few and unfolds the rest on request. */
const MAX_ENTRIES = 100;

/** Each language's last index and the files it was built from, kept between loads and, under
 *  `.hesperus/outline/`, between sessions: a change then re-indexes only the files it touched. */
interface Last { index: Index; files: Map<string, BridgeFile> }
/** On disk the text is left out; a file is taken as unchanged when its hash still matches. */
interface Outline { tool: string; language: string; index: Index; files: { path: string; hash: string; symbols: BridgeFile["symbols"] }[] }
const OUTLINE_TOOL = `${BRIDGE_TOOL.name} ${BRIDGE_TOOL.version}`;
const outlineDir = (repo: string) => path.join(repo, CACHE_DIR, "outline");
const outlineFile = (repo: string, lang: string) => path.join(outlineDir(repo), `${lang.replace(/[^a-z0-9]+/gi, "_")}.json`);

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** `label` is the state line; `brief` is the note under it, two or three words, with `detail` (the whole
 *  message) as its tooltip and in the output channel. */
type Status =
  | { state: "idle" | "checking"; label: string; brief?: string; detail?: string }
  | { state: "installing" | "indexing"; label: string; brief: string; detail?: string }
  | { state: "ready"; label: string; nodes: number; edges: number }
  | { state: "error"; label: string; brief: string; detail: string };

const STATUS = {
  idle: { state: "idle", label: "Not loaded" },
  /** No cache yet: nothing is written to the repo until a person asks. */
  unindexed: { state: "idle", label: "Not indexed", brief: "Run Index", detail: "Index reads the repo through the editor's language servers and writes the graph to .hesperus/. Nothing is written before that." },
  checking: { state: "checking", label: "Checking cache…" },
} as const;

/** An error's two or three words for the sidebar; the message itself goes in the tooltip. */
function briefOf(detail: string): string {
  const d = detail.toLowerCase();
  if (d.includes("no supported language")) return "No supported language";
  if (d.includes("open a folder")) return "No folder open";
  if (d.includes("extension") && d.includes("not installed")) return "Extension missing";
  if (d.includes("language server")) return "Language server silent";
  if (d.includes("no entry point")) return "No entry point";
  if (d.includes("boxes")) return "Too many boxes";
  return "Failed";
}

/** Callable and structural nodes rank above variables and fields when names tie. */
const FIND_RANK: Record<string, number> = { function: 0, method: 0, type: 1, package: 2, directory: 3, file: 3, boundary: 4, external_package: 4 };

const WORSE: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
/** Folders whose changes never touch the graph, before asking git. */
const NOISE = /(^|\/)(\.git|\.hesperus|node_modules|out|dist|build|target|\.next|__pycache__|\.venv|venv)\//;

// One tab per window, showing either the control flow chart from an entry point or the boundary graph;
// the sidebar holds status, the entry points and the boundaries crossed. While an agent edits the repo,
// changed files re-index, findings land in Problems, and both views mark what is new.
class Hesperus {
  private status: Status = STATUS.idle;
  private scanned?: Scan;
  private graph?: Graph;
  /** The graph as drawn: `graph`, with outside calls filed under boundaries when that view is on. */
  private shown?: Graph;
  private parent = new Map<string, string>();
  private policy: Policy = defaultPolicy();
  private report?: Report;
  /** Draw outside calls grouped by what they reach (database, network, ...) instead of by package. */
  private boundaries = true;
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
  /** Leave test code out of the entry points (a user setting, kept across sessions). */
  private get hideTests() { return this.ctx.globalState.get<boolean>("hesperus.hideTests", true); }
  /** The flow drawn last, redrawn when the pane resizes. */
  private lastFlow?: Flow;
  /** The graph pane's size, so the flow takes as many columns as fit it. */
  private viewport?: { width: number; height: number };
  /** Narratives by flow key, read from `.hesperus/narratives.json` where an agent writes them. */
  private narratives = new Map<string, Narrative>();
  /** Each language's last index and the files it was built from: a change re-indexes only what changed. */
  private last = new Map<string, Last>();
  /** Paths changed while an index ran, for the run that follows it. */
  private queued = new Set<string>();
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
  /** The graph drawn is the index's first read, from call sites; find-references is still running. */
  private drafted = false;
  private log = vscode.window.createOutputChannel("Hesperus");

  constructor(private ctx: vscode.ExtensionContext) {}

  /** A line in the Hesperus output channel. */
  note(s: string) {
    this.log.appendLine(s);
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
    view.onDidChangeVisibility(() => view.visible && this.show());
    view.onDidDispose(() => (this.sidebar = undefined));
    if (view.visible) this.show();
  }

  /** The sidebar came up: the graph tab when there is a cache to draw, else the status alone. A repo is
   *  never indexed, and `.hesperus/` never written, until a person presses Index. */
  private show() {
    const folder = this.folder;
    return folder && status(folder.uri.fsPath).state === "missing" && !this.graph ? this.load(false) : this.open();
  }

  /** The chart's tab, revealed where it is; made in `column` when there is none. */
  open(column: vscode.ViewColumn = vscode.ViewColumn.Active) {
    if (this.panel) this.panel.reveal(undefined, true);
    else {
      const name = this.folder?.name;
      const p = vscode.window.createWebviewPanel(
        "hesperus",
        name ? `Hesperus: ${name}` : "Hesperus",
        { viewColumn: column, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.media] },
      );
      p.iconPath = vscode.Uri.joinPath(this.media, "tab.svg");
      p.webview.html = page(p.webview, this.media, "graph", GRAPH_BODY);
      p.webview.onDidReceiveMessage((m) => this.onGraph(m));
      p.onDidDispose(() => (this.panel = undefined));
      this.panel = p;
    }
    return this.load(false);
  }

  /** Downloads missing indexers and indexes when the cache is missing or stale (or `force`), then renders.
   *  `keep` holds the user's place: what is open stays open (a re-index after an edit). */
  load(force: boolean, keep = false, changed?: readonly string[]): Promise<void> {
    if (this.busy) {
      if (keep) {
        this.again = true;
        for (const p of changed ?? []) this.queued.add(p);
      }
      return this.busy;
    }
    this.busy = this.doLoad(force, keep, changed).finally(() => {
      this.busy = undefined;
      if (this.again) {
        this.again = false;
        const next = [...this.queued];
        this.queued.clear();
        void this.load(true, true, next);
      }
    });
    return this.busy;
  }

  /** `changed`: the paths a watched edit touched. With a previous index in memory, only they are read and
   *  asked about again; the rest of each language's index is kept, so an edit shows in seconds. */
  private async doLoad(force: boolean, keep = false, changed?: readonly string[]) {
    const folder = this.folder;
    if (!folder) return this.fail("Open a folder to index it.");
    const repo = folder.uri.fsPath;
    const unpin = pin(repo);
    try {
      this.setStatus(STATUS.checking);
      this.scanned = scan(repo);
      const st = status(repo);
      // Indexing is the person's call: until they press Index, nothing is read through the language
      // servers and nothing is written to the repo. No cache, or a stale one (another version, the CLI,
      // another commit), waits for that press; only a current cache is loaded as it is.
      if (!force && st.state !== "ready" && !this.graph)
        return this.setStatus(st.state === "missing" ? STATUS.unindexed : { state: "idle", label: "Index stale", brief: "Run Index", detail: st.detail });
      // A watched edit in a fresh session: the outlines a session before wrote come back, and the files
      // edited since (another session, the agent while the editor was shut) count as changed too.
      if (keep && !this.last.size && st.state !== "missing") {
        const edited = this.loadOutlines(repo);
        if (edited?.length) changed = [...(changed ?? []), ...edited];
      }
      if (force || (changed?.length && this.last.size)) {
        // A change (watched, or found on disk since the last session), with last time's indexes at hand:
        // only the changed files are read again. Index pressed is a whole read.
        const partial = changed !== undefined && this.last.size > 0 && (keep || !force);
        // Why it indexes, in a few words; the cache's own account of being stale is the tooltip.
        let [brief, why] = partial ? [`${changed?.length ?? 0} files changed`, undefined] : force ? ["Index requested", undefined] : st.state === "missing" ? ["No cache", undefined] : ["Cache stale", st.detail];
        if (!partial) this.last.clear();
        if (!this.scanned.languages.length) throw new Error("No supported language found in this folder.");
        // Every language's server starts now, so none waits for the one indexed before it.
        for (const l of this.scanned.languages) {
          const first = sourceFiles(repo, l.id)[0];
          if (first && servedBy(l)) vscode.workspace.openTextDocument(path.join(repo, first)).then(undefined, () => {});
        }
        // A whole read is drawn first from its call sites alone (each call's definition, quick), then read
        // again with find-references, which on a large repo keeps a server busy for minutes to an hour.
        // The second read takes the first one's files and answers instead of asking them again.
        const asked = new Map<string, Asked>();
        const failed = new Map<string, string>();
        // Each language resolves on its own; one that cannot (extension missing or silent) leaves its files
        // as unindexed nodes and the rest of the repo still builds.
        const languages = async (calls: boolean) => {
          const results: LangResult[] = [];
          for (const l of this.scanned!.languages) {
            const files = sourceFiles(repo, l.id);
            const prev = partial ? this.last.get(l.id) : undefined;
            // What to read again: the changed files of this language, and any that came or went.
            const mine = new Set((changed ?? []).filter((p) => owner(p)?.id === l.id));
            if (prev) {
              const now = new Set(files);
              for (const p of prev.files.keys()) if (!now.has(p)) mine.add(p);
              for (const p of files) if (!prev.files.has(p)) mine.add(p);
              if (!mine.size) {
                results.push({ lang: l.id, index: prev.index });
                continue;
              }
            }
            const no = failed.get(l.id);
            if (no !== undefined) {
              results.push({ lang: l.id, error: no });
              continue;
            }
            try {
              if (!asked.has(l.id)) {
                this.setStatus({ state: "installing", label: `Checking the ${l.editor.name} extension…`, brief, detail: why });
                // In the background (no Hesperus view open) a missing extension is not worth a prompt.
                if (!this.panel && !this.sidebar && !servedBy(l)) throw new Error(`The ${l.editor.name} extension (${l.editor.id}) is not installed.`);
                await ensureExtension(l);
              }
              const a = asked.get(l.id) ?? asked.set(l.id, { files: new Map(), definitions: new Map() }).get(l.id)!;
              const kept = new Map<string, BridgeFile>();
              const ix = await editorIndex(repo, l.id, files, (s) => this.setStatus({ state: "indexing", label: `${l.editor.name}: ${s}`, brief, detail: why }), {
                patience: 90, needCode: false, frontend: FRONTENDS.find((f) => f.id === l.id), keep: kept, calls, asked: a, log: (s) => this.log.appendLine(s),
                ...(prev ? { previous: { index: prev.index, files: prev.files, changed: mine } } : {}),
              });
              if (!calls) this.last.set(l.id, { index: ix, files: kept });
              results.push({ lang: l.id, index: ix });
            } catch (e) {
              this.log.appendLine(`${l.id}: ${msg(e)}`);
              if (!prev) failed.set(l.id, msg(e));
              results.push(prev ? { lang: l.id, index: prev.index } : { lang: l.id, error: msg(e) });
            }
          }
          return results;
        };
        if (!partial) {
          this.graph = await draft(repo, await languages(true));
          this.entryList = undefined;
          this.relint();
          this.drafted = true;
          brief = "Calls drawn";
          await this.render();
        }
        const results = await languages(false);
        // Files no frontend owns: kept when the editor has a language server that finds code in them.
        // Definitions and references only, so their calls are `may` edges; silence just leaves them out.
        for (const g of this.scanned.generic) {
          const key = `generic:${g.ext}`;
          const files = genericFiles(repo, g.ext);
          const prev = partial ? this.last.get(key) : undefined;
          if (prev && files.length === prev.files.size && !(changed ?? []).some((p) => p.endsWith(`.${g.ext}`))) {
            results.push({ lang: key, index: prev.index });
            continue;
          }
          // No installed extension declares the file type: no server will ever answer, so do not wait for one.
          if (!servesExtension(g.ext)) continue;
          try {
            this.setStatus({ state: "indexing", label: `.${g.ext}: asking the editor…`, brief, detail: why });
            const kept = new Map<string, BridgeFile>();
            const ix = await editorIndex(repo, "generic", files, (s) => this.setStatus({ state: "indexing", label: `.${g.ext}: ${s}`, brief, detail: why }), { patience: 4, needCode: true, keep: kept, log: (s) => this.log.appendLine(s) });
            this.last.set(key, { index: ix, files: kept });
            results.push({ lang: key, index: ix });
          } catch (e) {
            this.log.appendLine(`.${g.ext}: ${msg(e)}`);
            if (prev) results.push({ lang: key, index: prev.index });
          }
        }
        await index(repo, results);
        this.saveOutlines(repo);
        this.graph = undefined;
        if (!keep && !this.drafted) this.expanded.clear();
      }
      if (!this.graph) {
        this.graph = load(repo);
        this.entryList = undefined;
        this.relint((keep || this.drafted) && this.expanded.size > 0);
      }
      this.setStatus({ state: "ready", label: "Ready", nodes: this.graph.nodes.length, edges: this.graph.edges.length });
      await this.render();
    } catch (e) {
      this.fail(msg(e));
    } finally {
      this.drafted = false;
      unpin();
    }
  }

  /** An error state: a few words in the sidebar, the message in its tooltip and the output channel. */
  private fail(detail: string) {
    this.log.appendLine(`error: ${detail}`);
    this.setStatus({ state: "error", label: "Error", brief: briefOf(detail), detail });
  }

  /** Writes each language's index and file outlines beside the graph, for the next session. */
  private saveOutlines(repo: string) {
    try {
      fs.mkdirSync(outlineDir(repo), { recursive: true });
      for (const [lang, l] of this.last) {
        const files = [...l.files.values()].map((f) => ({ path: f.path, hash: sha256Hex(f.text), symbols: f.symbols }));
        const language = files.length ? l.files.values().next().value!.language : lang.replace(/:.*/, "");
        const out: Outline = { tool: OUTLINE_TOOL, language, index: l.index, files };
        fs.writeFileSync(outlineFile(repo, lang), JSON.stringify(out));
      }
    } catch (e) {
      this.log.appendLine(`outline: ${msg(e)}`);
    }
  }

  /** Reads the outlines a session before wrote, with each file's text as it is now. Returns the paths whose
   *  text changed since (or are gone), or undefined when there is nothing usable on disk. */
  private loadOutlines(repo: string): string[] | undefined {
    let names: string[];
    try {
      names = fs.readdirSync(outlineDir(repo)).filter((n) => n.endsWith(".json"));
    } catch {
      return undefined;
    }
    const edited: string[] = [];
    const byLang = new Map(this.scanned?.languages.map((l) => [outlineFile(repo, l.id), l.id] as const) ?? []);
    for (const g of this.scanned?.generic ?? []) byLang.set(outlineFile(repo, `generic:${g.ext}`), `generic:${g.ext}`);
    for (const n of names) {
      const file = path.join(outlineDir(repo), n);
      const lang = byLang.get(file);
      if (!lang) continue;
      try {
        const o = JSON.parse(fs.readFileSync(file, "utf8")) as Outline;
        if (o.tool !== OUTLINE_TOOL || !Array.isArray(o.files) || !o.index?.documents) continue;
        const files = new Map<string, BridgeFile>();
        for (const f of o.files) {
          let text: string | undefined;
          try {
            text = fs.readFileSync(path.join(repo, f.path), "utf8");
          } catch {
            text = undefined;
          }
          if (text === undefined || sha256Hex(text) !== f.hash) edited.push(f.path);
          // A changed file is read again anyway; keeping it lets the language's file set compare whole.
          files.set(f.path, { path: f.path, language: o.language, text: text ?? "", symbols: f.symbols });
        }
        this.last.set(lang, { index: o.index, files });
      } catch (e) {
        this.log.appendLine(`outline ${n}: ${msg(e)}`);
      }
    }
    if (!this.last.size) return undefined;
    this.log.appendLine(`outlines: ${this.last.size} languages, ${edited.length} files changed since`);
    return edited;
  }

  /** Counts the crossings and rebuilds the drawn graph. The policy and the accepted baseline are not in
   *  use for now: nothing is new, nothing is denied, and nothing is written. */
  private relint(keepView = false) {
    if (!this.graph) return;
    this.report = crossingsOf(this.graph, this.policy);
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
      if (this.mode === "flow") return await this.renderFlow(folder.uri.fsPath, extra.anchor, extra.focus);
      this.panel.title = `Graph: ${folder.name}`;
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
      this.postSidebar(laid.omitted ? `${laid.omitted} lighter wires omitted (${MAX_WIRES} drawn).` : undefined);
      // Folders and files the flow view opened have no box left to close them by: listed instead.
      const byId = new Map(g.nodes.map((n) => [n.id, n]));
      const opened = aggregate.dissolved(g, this.expanded, this.opts).map((id) => ({ id, name: byId.get(id)?.name ?? id, path: byId.get(id)?.path ?? null }));
      this.panel.webview.postMessage({ type: "layout", layout: laid, hidden: [...this.hidden], opened, ...extra });
    } catch (e) {
      this.fail(msg(e));
    }
  }

  /** The entry points, computed once per graph; tests left out when the filter is on. */
  private async entriesOf(repo: string): Promise<Entry[]> {
    if (!this.entryList && this.graph) this.entryList = flowEntries(this.graph, await flowInputs(repo, { graph: this.graph, policy: this.policy }, this.report));
    return this.shownEntries();
  }

  private shownEntries(): Entry[] {
    const all = this.entryList ?? [];
    return this.hideTests ? all.filter((e) => !e.test) : all;
  }

  /** The flow chart from the chosen entry (or the one that drives the most code), its opened steps inlined. */
  private async renderFlow(repo: string, anchor?: string, focus?: string) {
    if (!this.panel || !this.graph) return;
    const all = await this.entriesOf(repo);
    const ids = new Set(this.graph.nodes.map((n) => n.id));
    if (this.entry && !ids.has(this.entry)) this.entry = undefined;
    const id = this.entry ?? all[0]?.id;
    const inp = await flowInputs(repo, { graph: this.graph, policy: this.policy }, this.report);
    const f = id ? flowFrom(this.graph, id, this.openSteps, inp) : undefined;
    this.lastFlow = f;
    this.postSidebar();
    if (!f) {
      this.panel.webview.postMessage({ type: "status", status: { state: "error", label: "Error", brief: "No entry point", detail: "No entry point: nothing in the repo is reached from outside it, or nothing is indexed. Search a symbol by name to trace from it." } });
      return;
    }
    this.panel.title = `Trace: ${f.entry.name}`;
    this.panel.webview.postMessage({ type: "flow", layout: this.chart(f, repo), anchor, focus });
  }

  private chart(f: Flow, repo: string): FlowLayout {
    return flowLayout(f, { narrative: this.narrativeOf(f, repo), viewport: this.viewport });
  }

  /** The narrative an agent wrote for this entry (`hesperus_narrate`), from this session or `.hesperus/narratives.json`. */
  private narrativeOf(f: Flow, repo: string): Narrative | undefined {
    const key = narrativeKey(f);
    let n = this.narratives.get(key);
    if (!n) {
      n = readNarrative(repo, key);
      if (n) this.narratives.set(key, n);
    }
    return n;
  }

  private setStatus(s: Status) {
    this.status = s;
    this.postSidebar();
    // "checking" runs on every open, and an index runs on under its first drawing: leave the drawing up meanwhile.
    if (s.state !== "checking" && !(this.drafted && (s.state === "indexing" || s.state === "installing"))) this.panel?.webview.postMessage({ type: "status", status: s });
  }

  private postSidebar(found?: string) {
    const entries = this.shownEntries();
    this.sidebar?.webview.postMessage({
      type: "state",
      status: this.status,
      mode: this.mode,
      entry: this.entry ?? entries[0]?.id ?? null,
      entries: entries.slice(0, MAX_ENTRIES).map((e) => ({ id: e.id, name: e.name, doc: e.doc ?? null, path: e.path, line: e.line, reach: e.reach, kind: e.kind })),
      moreEntries: Math.max(0, entries.length - MAX_ENTRIES),
      tests: (this.entryList ?? []).filter((e) => e.test).length,
      hideTests: this.hideTests,
      watch: this.watching,
      crossings: BOUNDARIES.filter((b) => this.report?.counts[b]).map((b) => ({ id: b, label: BOUNDARY_INFO[b].label, doc: BOUNDARY_INFO[b].doc, ...this.report!.counts[b]! })),
      repo: this.folder?.name ?? null,
      languages: (this.scanned?.languages ?? []).map((l) => ({ ...l, installed: servedBy(l) !== undefined })),
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
    if (!best) return this.postSidebar(`No match: ${query}`);
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

  /** The chart at the code under the cursor: from the entry point that reaches the callable there, with
   *  every call on the way opened, centred on the call into it. A callable nothing reaches is traced
   *  from itself. Module-level code is the file's own on-load flow. */
  async traceHere() {
    const ed = vscode.window.activeTextEditor, folder = this.folder;
    if (!ed || !folder) return;
    const rel = vscode.workspace.asRelativePath(ed.document.uri, false).replace(/\\/g, "/");
    if (ed.document.uri.scheme !== "file" || rel.startsWith("..") || path.isAbsolute(rel)) return;
    if (!this.graph) {
      if (status(folder.uri.fsPath).state === "missing") {
        await vscode.commands.executeCommand("hesperus.graph.focus");
        return void vscode.window.showInformationMessage("Hesperus: run Index in the sidebar first.");
      }
      await this.open(vscode.ViewColumn.Beside);
      if (!this.graph) return;
    }
    const line = ed.selection.active.line;
    const inFile = this.graph.nodes.filter((n) => n.path === rel);
    let target: GraphNode | undefined;
    for (const n of inFile) {
      if (!n.range || !(n.kind === "function" || n.kind === "method") || line < n.range.start_line || line > n.range.end_line) continue;
      if (!target || (n.range.end_line - n.range.start_line) < (target.range!.end_line - target.range!.start_line)) target = n;
    }
    target ??= inFile.find((n) => n.kind === "file");
    if (!target) return void vscode.window.showInformationMessage(`Hesperus: ${rel} is not in the index.`);
    const repo = folder.uri.fsPath;
    await this.entriesOf(repo);
    const way = wayTo(this.graph, this.entryList ?? [], target.id) ?? { entry: target.id, open: [] };
    this.mode = "flow";
    this.entry = way.entry;
    this.openSteps = new Set(way.open);
    const from = this.graph.nodes.find((n) => n.id === way.entry);
    this.postSidebar(way.last ? `${target.name} · from ${from?.name ?? way.entry}, ${way.open.length} calls down` : `${target.name} · ${target.kind}`);
    // Beside the code, not over it; a chart already open is brought up where it is.
    if (!this.panel) await this.open(vscode.ViewColumn.Beside);
    else this.panel.reveal(undefined, true);
    await this.render({ focus: way.last ?? target.id });
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

  private get watching() {
    return vscode.workspace.getConfiguration("hesperus").get<boolean>("watch", true);
  }

  /** A file changed on disk. Source re-indexes after a quiet spell. */
  onChange(uri: vscode.Uri) {
    const folder = this.folder;
    if (!folder || !this.graph) return;
    const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
    // An agent labelled a flow through the MCP server: the chart picks it up at once.
    if (rel === NARRATIVES_FILE) {
      this.narratives.clear();
      return void (this.mode === "flow" && this.render());
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
      this.load(true, true, paths.filter((p) => !skip.has(p)));
    }, delay);
  }

  private async onSidebar(m: { type: string; query?: string; id?: string }) {
    if (m.type === "ready") this.postSidebar();
    else if (m.type === "tests") {
      await this.ctx.globalState.update("hesperus.hideTests", !this.hideTests);
      if (this.entry && this.hideTests && this.entryList?.find((e) => e.id === this.entry)?.test) this.entry = undefined;
      this.postSidebar();
      if (this.panel && this.mode === "flow") await this.render();
    } else if (m.type === "watch") {
      // User settings: writing workspace settings would put a file in the repo under review.
      await vscode.workspace.getConfiguration("hesperus").update("watch", !this.watching, vscode.ConfigurationTarget.Global);
      this.postSidebar();
    } else if (m.type === "boundary" && m.id) {
      if (!this.boundaries) (this.boundaries = true, this.reshape());
      await this.reveal(boundaryId(m.id as (typeof BOUNDARIES)[number]), true);
    } else if (m.type === "flow" || m.type === "map") {
      this.mode = m.type;
      // The sidebar marks the current view at once, even when there is nothing to draw yet.
      this.postSidebar();
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
      // Opening the tab loads without indexing; a forced load while that runs would be dropped, so wait for it.
      if (!this.panel) await this.open();
      await this.load(true);
    } else if (m.type === "install" && m.id) {
      if (!this.panel) await this.open();
      this.setStatus({ state: "installing", label: "Installing extension…", brief: "Installing", detail: m.id });
      await installExtension(m.id);
      await this.load(true);
    } else if (m.type === "find" && m.query) await this.find(m.query);
  }

  /** True, with a note in the sidebar, when the open boxes would draw more than the layout can handle. */
  private tooBig() {
    if (!this.shown) return false;
    const n = aggregate.view(this.shown, this.expanded, this.opts).nodes.length;
    if (n <= MAX_BOXES) return false;
    this.postSidebar(`${n.toLocaleString()} boxes exceeds the ${MAX_BOXES} limit; close a box first.`);
    return true;
  }

  /** Whether `id` (a node or a tier) lies beneath container `c`. Tier ids are `tier:<parent>#<key>`. */
  private inside(id: string, c: string) {
    const up = (x: string) => (aggregate.isGroup(x) ? x.slice(5, x.lastIndexOf("#")) : this.parent.get(x));
    for (let p = up(id); p !== undefined; p = up(p)) if (p === c) return true;
    return false;
  }

  private async onGraph(m: { type: string; id?: string; open?: string[]; close?: string[]; anchor?: string; seq?: number; path?: string; line?: number; width?: number; height?: number }) {
    const folder = this.folder;
    if (m.type === "viewport" && m.width && m.height) {
      // The pane's size decides the flow's columns: a resize lays the chart out again for the new shape
      // and fits it, unless the columns come out the same, when the pane just refits what it has.
      const was = this.viewport;
      this.viewport = { width: m.width, height: m.height };
      if (was && this.mode === "flow" && this.lastFlow && folder && this.panel) {
        const laid = this.chart(this.lastFlow, folder.uri.fsPath);
        this.panel.webview.postMessage({ type: "flow", layout: laid, fit: true });
      }
    } else if (m.type === "ready") {
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
    } else if (m.type === "close" && m.id) {
      // Closing forgets what was open inside, as zooming out does.
      this.expanded.delete(m.id);
      for (const x of [...this.expanded]) if (this.inside(x, m.id)) this.expanded.delete(x);
      await this.render();
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
    vscode.commands.registerCommand("hesperus.traceHere", () => h.traceHere()),
    vscode.commands.registerCommand("hesperus.connectClaudeCode", async () => {
      try {
        const note = await connectClaudeCode(ctx, (s) => h.note(s), true);
        void vscode.window.showInformationMessage(`Hesperus: ${note ?? "Claude Code is not set up on this machine (no ~/.claude.json), so there is nothing to register with."}`);
      } catch (e) {
        void vscode.window.showErrorMessage(`Hesperus: ${msg(e)}`);
      }
    }),
  );
  // The MCP server, found without a hand-written config: by the editor's own registry, and by Claude
  // Code at user scope (every repo it opens), refreshed whenever the installed CLI's path changes.
  registerWithEditor(ctx, (s) => h.note(s));
  if (vscode.workspace.getConfiguration("hesperus").get<boolean>("claudeCode", true) && hasClaudeCode())
    connectClaudeCode(ctx, (s) => h.note(s)).then((r) => r && h.note(r), (e) => h.note(`claude code: ${msg(e)}`));
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
<div id="tools"><button id="auto" title="Semantic zoom: zooming in expands boxes" aria-pressed="true"><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3M5 7h4M7 5v4"/></svg></button><span class="sep"></span><button id="out" title="Zoom out"><svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg></button><span id="zoom">100%</span><button id="in" title="Zoom in"><svg viewBox="0 0 16 16"><path d="M3.5 8h9M8 3.5v9"/></svg></button><button id="fit" title="Fit to pane"><svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg></button></div>
<div id="opened" hidden></div><div id="msg">Loading…</div><div id="story" hidden></div><div id="tip" hidden></div>`;

const SIDEBAR_BODY = `<header><div class="repo" id="repo"></div><div id="state" class="state"></div></header>
<div id="detail" class="note" hidden></div>
<ul id="missing" class="missing" hidden></ul>
<div class="bar"><div class="switch" role="group" aria-label="View"><button id="flow" aria-pressed="true" title="Trace: control flow from an entry point, with branches, loops and boundary crossings">Trace</button><button id="map" aria-pressed="false" title="Graph: packages and files, with every call that leaves the repo grouped by boundary">Graph</button></div><button id="reindex" class="secondary" title="Index the repo through the editor's language servers; the graph is written to .hesperus/">Index</button></div>
<form id="find" role="search"><input id="q" type="search" placeholder="Symbol or file to trace" spellcheck="false" aria-label="Find a symbol"></form>
<div id="found" hidden></div>
<section id="sec-entries"><button class="head" aria-expanded="true"><span class="chev"></span><span class="label">Entry points</span><span id="entry-count" class="badge"></span></button>
<div class="body"><ul id="entries" class="rows"></ul><div id="more" class="foot" hidden><button id="unfold" class="link"></button><span id="more-note"></span></div></div></section>
<section id="sec-reaches"><button class="head" aria-expanded="true"><span class="chev"></span><span class="label">Boundaries</span><span id="reach-count" class="badge"></span></button>
<div class="body"><ul id="crossings" class="rows"></ul></div></section>
<footer><label class="check" title="Leave test files and folders out of the entry points"><input type="checkbox" id="tests"><span>Hide tests</span><span id="test-count" class="badge"></span></label><label class="check" title="Re-index the files that change on disk, so an agent's edits show as findings"><input type="checkbox" id="watch"><span>Re-index on change</span></label></footer>`;
