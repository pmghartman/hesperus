// The editor's language servers (the C/C++, C#, Rust and Dart extensions) as a fallback resolver, for
// languages whose pinned SCIP indexer cannot run here. Results depend on the servers installed, so the
// cache header records `editor-lsp` as the indexer; core stays editor-free and only reads the index.
import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BridgeDef, BridgeExternal, BridgeFile, BridgeRef, BridgeSymbol, bridge, pool, Pos, Span } from "./core/bridge";
import type { Range } from "./core/ir";
import type { ImportDecl } from "./core/syntax";
import { Index } from "./core/scip";
import { init, type Language } from "./engine";
import type { Frontend } from "./core/frontend";

const K = vscode.SymbolKind;
const QUERY_MS = 20000;
// SCIP kind numbers: Class 7, Constant 8, Constructor 9, Enum 11, EnumMember 12, Field 15, Function 17,
// Interface 21, Method 26, Namespace 29, Property 41, Struct 49, Variable 61.
const SHAPES: Partial<Record<vscode.SymbolKind, Pick<BridgeSymbol, "shape" | "kind">>> = {
  [K.Namespace]: { shape: "namespace", kind: 29 }, [K.Module]: { shape: "namespace", kind: 29 }, [K.Package]: { shape: "namespace", kind: 29 },
  [K.Class]: { shape: "type", kind: 7 }, [K.Struct]: { shape: "type", kind: 49 }, [K.Interface]: { shape: "type", kind: 21 }, [K.Enum]: { shape: "type", kind: 11 },
  [K.Method]: { shape: "method", kind: 26 }, [K.Constructor]: { shape: "method", kind: 9 }, [K.Function]: { shape: "method", kind: 17 }, [K.Operator]: { shape: "method", kind: 26 },
  [K.Property]: { shape: "term", kind: 41 }, [K.Field]: { shape: "term", kind: 15 }, [K.Variable]: { shape: "term", kind: 61 },
  [K.Constant]: { shape: "term", kind: 8 }, [K.EnumMember]: { shape: "term", kind: 12 },
};

const span = (r: vscode.Range): Span => ({ start: { line: r.start.line, character: r.start.character }, end: { line: r.end.line, character: r.end.character } });

function symbols(items: (vscode.DocumentSymbol | vscode.SymbolInformation)[]): BridgeSymbol[] {
  const out: BridgeSymbol[] = [];
  for (const it of items) {
    const s = SHAPES[it.kind];
    if (!s) continue;
    // The command's answers carry both shapes at once: a SymbolInformation's `location` and a
    // DocumentSymbol's `children`. Only the tree form has the members of a class, so look for it first.
    if ("selectionRange" in it && "children" in it) out.push({ name: it.name, ...s, range: span(it.range), selection: span(it.selectionRange), children: symbols(it.children ?? []) });
    else if ("location" in it) out.push({ name: it.name, ...s, range: span(it.location.range), selection: span(it.location.range), children: [] });
  }
  return out;
}

const hasCode = (s: BridgeSymbol[]): boolean => s.some((x) => x.shape === "type" || x.shape === "method" || hasCode(x.children));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rel = (repo: string, uri: vscode.Uri) => {
  const p = path.relative(repo, uri.fsPath).split(path.sep).join("/");
  return p.startsWith("..") || path.isAbsolute(p) ? undefined : p;
};

/** Package a definition outside the indexed files belongs to, from where its file sits: the directory after
 *  a dependency folder (`node_modules/x`, `site-packages/x`, `pkg/mod/x@v`, a cargo crate), else its folder. */
export function packageOf(uri: vscode.Uri): string {
  const segs = uri.path.split("/").filter((x) => x !== "");
  const file = segs[segs.length - 1] ?? "";
  const at = (name: string) => segs.lastIndexOf(name);
  let i = at("node_modules");
  if (i >= 0 && segs[i + 1]) {
    const scoped = segs[i + 1].startsWith("@") && segs[i + 2];
    const pkg = segs[i + 1] === "@types" && segs[i + 2] ? segs[i + 2] : scoped ? `${segs[i + 1]}/${segs[i + 2]}` : segs[i + 1];
    // TypeScript's own declarations of the language's built-ins.
    return pkg === "typescript" && /^lib\..*\.d\.ts$/.test(file) ? "builtins" : pkg;
  }
  for (const d of ["site-packages", "dist-packages"]) if ((i = at(d)) >= 0 && segs[i + 1]) return segs[i + 1].replace(/\.pyi?$/, "");
  if ((i = at("stdlib")) >= 0 && segs[i + 1]) return segs[i + 1].replace(/\.pyi?$/, "");
  if ((i = segs.findIndex((x, j) => x === "mod" && segs[j - 1] === "pkg")) >= 0) {
    const end = segs.findIndex((x, j) => j > i && x.includes("@"));
    if (end > i) return segs.slice(i + 1, end + 1).join("/").replace(/@[^/]*$/, "");
  }
  if ((i = at("registry")) >= 0 && segs[i + 3]) return segs[i + 3].replace(/-\d+\.\d+.*$/, "");
  if ((i = at("library")) >= 0 && segs[i + 1] && at("rustlib") >= 0) return segs[i + 1];
  return segs[segs.length - 2] ?? uri.scheme;
}

/** What a calls-only run leaves for the whole run after it: the files it read and each call site's answer. */
export interface Asked { files: Map<string, BridgeFile>; definitions: Map<string, Promise<(BridgeRef | BridgeExternal)[]>> }

/** One SCIP index of `files` from the editor's language servers. `report` gets progress text. */
export async function editorIndex(
  repo: string, lang: string, files: string[], report: (s: string) => void,
  /** `patience`: seconds to wait for the first answer. `needCode`: refuse a language the server only outlines as data.
   *  `keep` receives every file as read, for the next run. `previous`: last time's index and files, and the
   *  paths changed since (gone ones included): only those are read and asked again. `calls`: no find-references,
   *  only each call site's definition; quick, and short of the uses that are not calls. `asked`: filled by such a
   *  run and taken by the whole one after it, so neither a file nor a call site is asked twice. `log` gets a
   *  line with each phase's count and time. */
  opts: { patience: number; needCode: boolean; frontend?: Frontend; keep?: Map<string, BridgeFile>; previous?: { index: Index; files: ReadonlyMap<string, BridgeFile>; changed: ReadonlySet<string> }; calls?: boolean; asked?: Asked; log?: (s: string) => void } = { patience: 90, needCode: false },
): Promise<Index> {
  const t0 = Date.now();
  const docs = new Map<string, vscode.Uri>(files.map((f) => [f, vscode.Uri.file(path.join(repo, f))]));
  const prev = opts.previous;
  const fresh = prev ? files.filter((f) => prev.changed.has(f) || !prev.files.has(f)) : files;
  const ask = async (f: string) =>
    (await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>("vscode.executeDocumentSymbolProvider", docs.get(f)!)) ?? [];
  const fe = opts.frontend;
  // Some servers (cpptools) answer only for documents the editor has opened, and an unparsed file
  // answers empty at first: open it, then retry an empty answer a few times. Only when the file has
  // something to outline: syntax says so where there is a frontend; without one, a single retry.
  const declares = (f: string, text: string) => (fe ? (fe.syntax(f)?.facts(text).symbols.length ?? 1) > 0 : undefined);
  const outline = async (f: string, text: string) => {
    let s = await ask(f);
    const d = declares(f, text);
    const tries = d === false ? 0 : d === true ? 4 : 1;
    for (let i = 0; i < tries && !s.length; i++) {
      if (i === 0) await Promise.resolve(vscode.workspace.openTextDocument(docs.get(f)!)).catch(() => {});
      await sleep(500 * (i + 1));
      s = await ask(f);
    }
    return s;
  };
  // A server that is still starting answers with nothing: wait for the first answer from a few files,
  // not for every empty one.
  const probe = (fresh.length ? fresh : files).slice(0, 8);
  const asked = opts.asked;
  let answered = fresh.length === 0 || !!asked?.files.size;
  for (let t = 0; t < opts.patience && !answered; t++) {
    report(t === 0 ? "Waiting for the language server…" : `Waiting for the language server… ${t}s`);
    answered = (await Promise.all(probe.map(ask))).some((s) => s.length > 0);
    if (!answered) await sleep(1000);
  }
  let read = 0;
  const again = new Set(fresh);
  const loaded: BridgeFile[] = await pool(files, 12, async (f) => {
    const kept = prev?.files.get(f);
    if (kept && !again.has(f)) return kept;
    const had = asked?.files.get(f);
    if (had) return had;
    const text = answered ? await fs.readFile(path.join(repo, f), "utf8") : "";
    const syms = answered ? await outline(f, text) : [];
    if (++read % 20 === 0) report(`Reading symbols ${read}/${fresh.length}…`);
    return { path: f, language: lang, text, symbols: symbols(syms) };
  });
  for (const m of [opts.keep, asked?.files]) if (m) for (const f of loaded) m.set(f.path, f);
  if (!answered) throw new Error(`No language server answered for ${lang} files. Install the editor's extension for the language (C/C++, C#, Rust analyzer, Dart) and reload.`);
  if (opts.needCode && !loaded.some((f) => hasCode(f.symbols))) throw new Error(`The editor outlines ${lang} files but finds no functions or types in them.`);
  const inRepo = (locs: vscode.Location[]): BridgeRef[] => {
    const out: BridgeRef[] = [];
    for (const l of locs) {
      const p = rel(repo, l.uri);
      if (p !== undefined) out.push({ path: p, span: span(l.range) });
    }
    return out;
  };
  await init();
  const tRead = Date.now();
  // Syntax columns are UTF-8 bytes; the editor counts UTF-16 units.
  const utf16 = (lines: string[], line: number, col: number) => Buffer.from(lines[line] ?? "", "utf8").subarray(0, col).toString("utf8").length;
  const spans = (f: BridgeFile, rs: Range[]): Span[] => {
    const lines = f.text.split("\n");
    const pos = (line: number, col: number) => ({ line, character: utf16(lines, line, col) });
    return rs.map((c) => ({ start: pos(c.start_line, c.start_col), end: pos(c.end_line, c.end_col) }));
  };
  const sites = (f: BridgeFile): Span[] => {
    const facts = fe?.syntax(f.path)?.facts(f.text);
    return facts ? spans(f, facts.calls.map((c) => c.callee)) : [];
  };
  // Every name token that may use a definition, when syntax reads every file: also the names this file
  // imports from the repo under names of its own (`import { a as b }`), whose uses resolve to `a`.
  const tokenized = !!fe && files.every((f) => fe.syntax(f)?.names);
  const uses = (f: BridgeFile, wanted: (name: string) => boolean): Span[] => {
    const syn = fe!.syntax(f.path)!;
    const fromRepo = (d: ImportDecl) => !fe!.imports || fe!.imports.local(d.module, f.path, d.member !== undefined ? [d.member] : []).length > 0;
    const aliases = new Set(syn.facts(f.text).imports.filter(fromRepo).map((d) => d.local.toLowerCase()));
    return spans(f, syn.names!(f.text, (n) => wanted(n) || aliases.has(n.toLowerCase())));
  };
  // Uses a token never names: a constructor's (`new Foo`, `Foo()`), an operator's (`a + b`), and what the
  // language calls by convention. Those definitions are asked for their references.
  const named = (d: BridgeDef) => d.kind !== 9 && /^[\p{L}_$][\p{L}\p{N}_$]*[?!]?$/u.test(d.token) && !fe?.implicit?.test(d.token);
  // A server that never answers one query must not stall the run: give up on it after this long.
  const within = <T>(p: Thenable<T>, fallback: T) => Promise.race([Promise.resolve(p), sleep(QUERY_MS).then(() => fallback)]);
  // Names an outside definition by the outline of its own file: the types around it, then itself.
  const outlines = new Map<string, Promise<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>>();
  const outside = async (l: vscode.Location): Promise<BridgeExternal> => {
    const k = l.uri.toString();
    if (!outlines.has(k)) outlines.set(k, within(vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>("vscode.executeDocumentSymbolProvider", l.uri), []).then((x) => x ?? [], () => []));
    const names: string[] = [];
    for (let list = await outlines.get(k)!; ; ) {
      const hit = list.find((x): x is vscode.DocumentSymbol => "range" in x && x.range.contains(l.range.start));
      if (!hit) break;
      names.push(hit.name);
      if (hit.selectionRange.contains(l.range.start)) break;
      list = hit.children;
    }
    return { package: packageOf(l.uri), names };
  };
  // Where the name at a call site or other token is defined: in the repo, or the package outside it.
  const definition = async (p: string, at: Pos): Promise<(BridgeRef | BridgeExternal)[]> => {
    const r = (await within(vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>("vscode.executeDefinitionProvider", docs.get(p)!, new vscode.Position(at.line, at.character)), [])) ?? [];
    const locs = r.map((x) => ("targetUri" in x ? new vscode.Location(x.targetUri, x.targetSelectionRange ?? x.targetRange) : x));
    // Files outside this index (other repos, installed packages, ignored folders) are dependencies.
    const ours = locs.filter((l) => docs.has(rel(repo, l.uri) ?? ""));
    return ours.length ? inRepo(ours) : Promise.all(locs.slice(0, 1).map(outside));
  };
  // How long each phase took, for the output channel: reading, then references, then definitions.
  const phase = { refs: 0, refsAt: 0, defs: 0, defsAt: 0 };
  const ix = await bridge(loaded, async (d, done, total): Promise<BridgeRef[]> => {
    if (opts.calls) return [];
    if (!phase.refsAt) phase.refsAt = Date.now();
    phase.refs = total;
    if (done % 10 === 0 || done === total) report(`Finding references ${done}/${total}…`);
    const at = new vscode.Position(d.selection.start.line, d.selection.start.character);
    return inRepo((await within(vscode.commands.executeCommand<vscode.Location[]>("vscode.executeReferenceProvider", docs.get(d.path)!, at), [])) ?? []);
  }, {
    concurrency: 32,
    unify: fe?.declarationsAcrossFiles,
    // Declarations paired across files can change ids when any file does, so those languages index whole.
    ...(prev && !fe?.declarationsAcrossFiles ? { only: prev.changed, previous: prev.index } : {}),
    sites,
    ...(tokenized && !opts.calls ? { uses, named } : {}),
    definitionsOf: (p, at, done, total) => {
      if (!phase.defsAt) phase.defsAt = Date.now();
      phase.defs = total;
      if (done % 25 === 0 || done === total) report(`${opts.calls ? "Resolving calls" : "Resolving names"} ${done}/${total}…`);
      const k = `${p}\0${at.line}:${at.character}`;
      const had = asked?.definitions.get(k);
      if (had) return had;
      const q = definition(p, at);
      asked?.definitions.set(k, q);
      return q;
    },
  });
  const now = Date.now(), secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const refsEnd = phase.defsAt || now;
  opts.log?.(`${lang}${opts.calls ? " (calls)" : ""}: ${fresh.length} files read in ${secs(tRead - t0)}; ` +
    `references of ${phase.refs} definitions in ${secs(phase.refsAt ? refsEnd - phase.refsAt : 0)}; ` +
    `definitions at ${phase.defs} ${tokenized && !opts.calls ? "names" : "call sites"} in ${secs(phase.defsAt ? now - phase.defsAt : 0)}`);
  return ix;
}

/** Installed extensions with code of their own that declare a language (`contributes.languages`), by
 *  language id. A grammar-only extension (no `main`) declares a language without serving it. */
function contributors(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of vscode.extensions.all) {
    const pkg = e.packageJSON as { main?: string; browser?: string; contributes?: { languages?: { id?: string }[] } } | undefined;
    if (!pkg?.main && !pkg?.browser) continue;
    for (const l of pkg.contributes?.languages ?? []) if (l.id) (out.get(l.id) ?? out.set(l.id, []).get(l.id)!).push(e.id);
  }
  return out;
}

/** Whether an installed extension with code of its own declares a language for files of this extension
 *  (`.vue`, `.ps1`): without one, no server will ever outline them. */
export function servesExtension(ext: string): boolean {
  const dot = `.${ext.toLowerCase()}`;
  for (const e of vscode.extensions.all) {
    const pkg = e.packageJSON as { main?: string; browser?: string; contributes?: { languages?: { extensions?: string[] }[] } } | undefined;
    if (!pkg?.main && !pkg?.browser) continue;
    for (const l of pkg.contributes?.languages ?? []) if (l.extensions?.some((x) => x.toLowerCase() === dot)) return true;
  }
  return false;
}

/** The installed extension that serves the language: the one the frontend names when it is there, else
 *  any installed extension that declares the language id (a server comes with the extension that
 *  declares its language), since a different Go or Python extension answers the same queries. */
export function servedBy(l: Pick<Language, "id" | "editor">): string | undefined {
  if (vscode.extensions.getExtension(l.editor.id)) return l.editor.id;
  return contributors().get(l.id)?.[0];
}

/** The language's editor extension, installed and active; offers to install it when missing. */
export async function ensureExtension(l: Language): Promise<void> {
  const have = servedBy(l);
  let ext = have ? vscode.extensions.getExtension(have) : undefined;
  if (!ext) {
    const pick = await vscode.window.showInformationMessage(
      `Hesperus reads ${l.files.toLocaleString()} ${l.editor.name} files through the ${l.editor.name} extension, which is not installed.`,
      "Install", "Skip");
    if (pick !== "Install") throw new Error(`The ${l.editor.name} extension (${l.editor.id}) is not installed.`);
    await installExtension(l.editor.id);
    ext = vscode.extensions.getExtension(l.editor.id);
    if (!ext) throw new Error(`The ${l.editor.name} extension (${l.editor.id}) did not install.`);
  }
  if (!ext.isActive) await Promise.resolve(ext.activate()).catch(() => {});
}

export async function installExtension(id: string): Promise<void> {
  await vscode.commands.executeCommand("workbench.extensions.installExtension", id);
  for (let i = 0; i < 60 && !vscode.extensions.getExtension(id); i++) await sleep(1000);
}

export const hasExtension = (id: string) => vscode.extensions.getExtension(id) !== undefined;
