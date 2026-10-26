// The editor's language servers (the C/C++, C#, Rust and Dart extensions) as a fallback resolver, for
// languages whose pinned SCIP indexer cannot run here. Results depend on the servers installed, so the
// cache header records `editor-lsp` as the indexer; core stays editor-free and only reads the index.
import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BridgeFile, BridgeRef, BridgeSymbol, bridge, pool, Span } from "./core/bridge";
import { Index } from "./core/scip";
import { init, type Language } from "./engine";
import type { Frontend } from "./core/frontend";

const K = vscode.SymbolKind;
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
    if ("location" in it) out.push({ name: it.name, ...s, range: span(it.location.range), selection: span(it.location.range), children: [] });
    else out.push({ name: it.name, ...s, range: span(it.range), selection: span(it.selectionRange), children: symbols(it.children) });
  }
  return out;
}

const hasCode = (s: BridgeSymbol[]): boolean => s.some((x) => x.shape === "type" || x.shape === "method" || hasCode(x.children));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rel = (repo: string, uri: vscode.Uri) => {
  const p = path.relative(repo, uri.fsPath).split(path.sep).join("/");
  return p.startsWith("..") || path.isAbsolute(p) ? undefined : p;
};

/** One SCIP index of `files` from the editor's language servers. `report` gets progress text. */
export async function editorIndex(
  repo: string, lang: string, files: string[], report: (s: string) => void,
  /** `patience`: seconds to wait for the first answer. `needCode`: refuse a language the server only outlines as data. */
  opts: { patience: number; needCode: boolean; frontend?: Frontend } = { patience: 90, needCode: false },
): Promise<Index> {
  const docs = new Map<string, vscode.Uri>(files.map((f) => [f, vscode.Uri.file(path.join(repo, f))]));
  const outline = async (f: string) =>
    (await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>("vscode.executeDocumentSymbolProvider", docs.get(f)!)) ?? [];
  // A server that is still starting answers with nothing: wait for the first answer from a few files,
  // not for every empty one.
  const probe = files.slice(0, 8);
  let answered = false;
  for (let t = 0; t < opts.patience && !answered; t++) {
    report(t === 0 ? "Waiting for the language server…" : `Waiting for the language server… ${t}s`);
    answered = (await Promise.all(probe.map(outline))).some((s) => s.length > 0);
    if (!answered) await sleep(1000);
  }
  let read = 0;
  const loaded: BridgeFile[] = await pool(files, 12, async (f) => {
    const [text, syms] = answered ? await Promise.all([fs.readFile(path.join(repo, f), "utf8"), outline(f)]) : ["", []];
    if (++read % 20 === 0) report(`Reading symbols ${read}/${files.length}…`);
    return { path: f, language: lang, text, symbols: symbols(syms) };
  });
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
  const fe = opts.frontend;
  // Syntax columns are UTF-8 bytes; the editor counts UTF-16 units.
  const utf16 = (lines: string[], line: number, col: number) => Buffer.from(lines[line] ?? "", "utf8").subarray(0, col).toString("utf8").length;
  const sites = (f: BridgeFile): Span[] => {
    const facts = fe?.syntax(f.path)?.facts(f.text);
    if (!facts) return [];
    const lines = f.text.split("\n");
    const pos = (line: number, col: number) => ({ line, character: utf16(lines, line, col) });
    return facts.calls.map(({ callee: c }) => ({ start: pos(c.start_line, c.start_col), end: pos(c.end_line, c.end_col) }));
  };
  let n = 0;
  return bridge(loaded, async (d): Promise<BridgeRef[]> => {
    if (++n % 25 === 0) report(`Finding references ${n}…`);
    const at = new vscode.Position(d.selection.start.line, d.selection.start.character);
    return inRepo((await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeReferenceProvider", docs.get(d.path)!, at)) ?? []);
  }, {
    concurrency: 16,
    unify: fe?.declarationsAcrossFiles,
    sites,
    definitionsOf: async (p, at) => {
      if (++n % 25 === 0) report(`Resolving calls ${n}…`);
      const r = (await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>("vscode.executeDefinitionProvider", docs.get(p)!, new vscode.Position(at.line, at.character))) ?? [];
      return inRepo(r.map((x) => ("targetUri" in x ? new vscode.Location(x.targetUri, x.targetSelectionRange ?? x.targetRange) : x)));
    },
  });
}

/** The language's editor extension, installed and active; offers to install it when missing. */
export async function ensureExtension(l: Language): Promise<void> {
  let ext = vscode.extensions.getExtension(l.editor.id);
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
