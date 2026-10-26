// Builds a SCIP index from what an editor's language servers report: document symbols for
// definitions, find-references for uses. Pure: the editor side feeds it, so it runs anywhere.
import { cmpStr } from "./ir";
import { Index, Occurrence, ROLE_DEFINITION, SymbolInformation } from "./scip";

export const BRIDGE_TOOL = { name: "editor-lsp", version: "1" };

/** Line and UTF-16 character, as language servers report them. */
export interface Pos { line: number; character: number }
export interface Span { start: Pos; end: Pos }

/** `shape` fixes the symbol descriptor; `kind` is the SCIP kind number. */
export interface BridgeSymbol {
  name: string;
  shape: "namespace" | "type" | "method" | "term";
  kind: number;
  range: Span;
  selection: Span;
  children: BridgeSymbol[];
}
export interface BridgeFile { path: string; language: string; text: string; symbols: BridgeSymbol[] }
export interface BridgeDef { id: string; path: string; selection: Span }
export interface BridgeRef { path: string; span: Span }

const PLAIN = /^[A-Za-z0-9_+\-$]+$/;
const esc = (s: string) => (PLAIN.test(s) ? s : "`" + s.replace(/`/g, "``") + "`");

/** UTF-16 column to UTF-8 byte column, as SCIP's default encoding counts. */
function byteCol(lines: string[], p: Pos): number {
  const l = lines[p.line] ?? "";
  return /[^\x00-\x7f]/.test(l) ? Buffer.byteLength(l.slice(0, p.character), "utf8") : p.character;
}

/** Orders ranges by extent: lines first, then columns on one line. */
const size = (r: Span) => (r.end.line - r.start.line) * 1e6 + (r.end.character - (r.end.line === r.start.line ? r.start.character : 0));

const posKey = (a: Pos, b: Pos) => a.line - b.line || a.character - b.character;

interface Walk { defs: BridgeDef[]; infos: Map<string, SymbolInformation[]>; byFile: Map<string, Occurrence[]> }

function descriptor(s: BridgeSymbol, ordinal: number): string {
  const n = esc(s.name);
  if (s.shape === "namespace") return `${n}/`;
  if (s.shape === "type") return `${n}#`;
  if (s.shape === "method") return `${n}(${ordinal}).`;
  return `${n}.`;
}

/** C++ writes out-of-class members as `Type::member`; the qualifier becomes owning types. */
function split(s: BridgeSymbol): { owners: string[]; leaf: BridgeSymbol } {
  const parts = s.name.split("::").filter((p) => p !== "");
  if (parts.length < 2 || s.shape === "namespace") return { owners: [], leaf: s };
  return { owners: parts.slice(0, -1), leaf: { ...s, name: parts[parts.length - 1] } };
}

function walk(files: BridgeFile[], texts: Map<string, string[]>): Walk {
  const out: Walk = { defs: [], infos: new Map(), byFile: new Map() };
  const seen = new Map<string, { occ: Occurrence; def: BridgeDef; size: number }>();
  for (const f of files) {
    const lines = texts.get(f.path)!;
    const occs: Occurrence[] = [];
    const infos: SymbolInformation[] = [];
    const base = `lsp ${f.language} workspace . ${f.path.split("/").map((p) => esc(p) + "/").join("")}`;
    const visit = (list: BridgeSymbol[], prefix: string, parent: string) => {
      const ordinals = new Map<string, number>();
      for (const raw of [...list].sort((a, b) => posKey(a.selection.start, b.selection.start) || cmpStr(a.name, b.name))) {
        const { owners, leaf } = split(raw);
        let pre = prefix, par = parent;
        for (const o of owners) {
          pre += `${esc(o)}#`;
          par = pre;
        }
        const key = `${pre}\0${leaf.shape}\0${leaf.name}`;
        const k = ordinals.get(key) ?? 0;
        ordinals.set(key, k + 1);
        const id = pre + descriptor(leaf, k);
        const sel = raw.selection;
        const occ: Occurrence = { symbol: id, symbol_roles: ROLE_DEFINITION, ...span(lines, sel, raw.range) };
        const old = seen.get(id);
        if (old) {
          // A declaration and its out-of-line definition share a symbol; the one with the body wins.
          if (size(raw.range) > old.size) Object.assign(old.occ, occ), (old.def.selection = sel), (old.size = size(raw.range));
          continue;
        }
        seen.set(id, { occ, def: { id, path: f.path, selection: sel }, size: size(raw.range) });
        occs.push(occ);
        infos.push({ symbol: id, documentation: [], relationships: [], kind: leaf.kind, display_name: leaf.name, enclosing_symbol: par });
        out.defs.push(seen.get(id)!.def);
        // Bodies hold locals the graph models itself; only containers hold more definitions.
        if (leaf.shape === "namespace" || leaf.shape === "type") visit(raw.children, id, id);
      }
    };
    visit(f.symbols, base, "");
    out.byFile.set(f.path, occs);
    out.infos.set(f.path, infos);
  }
  return out;
}

/** SCIP's compact range: three ints on one line, four across lines; columns in UTF-8 bytes. */
function span(lines: string[], s: Span, enclosing?: Span): Pick<Occurrence, "range" | "enclosing_range"> {
  const arr = (r: Span) => {
    const a = byteCol(lines, r.start), b = byteCol(lines, r.end);
    return r.start.line === r.end.line ? [r.start.line, a, b] : [r.start.line, a, r.end.line, b];
  };
  return { range: arr(s), enclosing_range: enclosing ? arr(enclosing) : [] };
}

/** Runs `fn` over `xs`, `n` at a time; results keep input order. */
async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(xs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    for (let i = next++; i < xs.length; i = next++) out[i] = await fn(xs[i]);
  }));
  return out;
}

const sameSpan = (a: Span, b: Span) => posKey(a.start, b.start) === 0 && posKey(a.end, b.end) === 0;

/** One SCIP index for `files`; `refsOf` asks the language server where a definition is used. */
export async function bridge(files: BridgeFile[], refsOf: (d: BridgeDef) => Promise<BridgeRef[]>, concurrency = 8): Promise<Index> {
  const sorted = [...files].sort((a, b) => cmpStr(a.path, b.path));
  const texts = new Map(sorted.map((f) => [f.path, f.text.split("\n")] as const));
  const w = walk(sorted, texts);
  const refs = await pool(w.defs, concurrency, refsOf);
  w.defs.forEach((d, i) => {
    for (const r of refs[i]) {
      const lines = texts.get(r.path);
      const occs = w.byFile.get(r.path);
      if (!lines || !occs || (r.path === d.path && sameSpan(r.span, d.selection))) continue;
      occs.push({ symbol: d.id, symbol_roles: 0, ...span(lines, r.span) });
    }
  });
  return {
    metadata: { version: 0, tool_info: { name: BRIDGE_TOOL.name, version: BRIDGE_TOOL.version, arguments: [] }, project_root: "", text_document_encoding: 1 },
    documents: sorted.map((f) => ({
      relative_path: f.path,
      language: f.language,
      text: "",
      position_encoding: 1,
      occurrences: dedupe(w.byFile.get(f.path)!),
      symbols: w.infos.get(f.path)!.sort((a, b) => cmpStr(a.symbol, b.symbol)),
    })),
    external_symbols: [],
  };
}

const startOf = (o: Occurrence) => [o.range[0], o.range[1]];

/** Canonical order, one occurrence per (range, symbol, role). */
function dedupe(occs: Occurrence[]): Occurrence[] {
  const key = (o: Occurrence) => `${startOf(o).join(",")}\0${o.symbol}\0${o.symbol_roles}`;
  const m = new Map<string, Occurrence>();
  for (const o of occs) if (!m.has(key(o))) m.set(key(o), o);
  return [...m.values()].sort((a, b) => {
    const x = startOf(a), y = startOf(b);
    return x[0] - y[0] || x[1] - y[1] || cmpStr(a.symbol, b.symbol) || a.symbol_roles - b.symbol_roles;
  });
}
