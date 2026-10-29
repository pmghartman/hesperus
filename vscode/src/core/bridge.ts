// Builds a SCIP index from what an editor's language servers report: document symbols for
// definitions, find-references for uses. Pure: the editor side feeds it, so it runs anywhere.
import { cmpStr } from "./ir";
import { esc, externalSymbol, Index, Occurrence, ROLE_DEFINITION, SymbolInformation } from "./scip";

export const BRIDGE_TOOL = { name: "editor-lsp", version: "4" };

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
export interface BridgeDef { id: string; path: string; selection: Span; shape: BridgeSymbol["shape"] }
export interface BridgeRef { path: string; span: Span }
/** A definition outside the repo: its package, and its name with the types that own it, outermost first. */
export interface BridgeExternal { package: string; names: string[] }

/** UTF-16 column to UTF-8 byte column, as SCIP's default encoding counts. */
function byteCol(lines: string[], p: Pos): number {
  const l = lines[p.line] ?? "";
  return /[^\x00-\x7f]/.test(l) ? Buffer.byteLength(l.slice(0, p.character), "utf8") : p.character;
}

/** Orders ranges by extent: lines first, then columns on one line. */
const size = (r: Span) => (r.end.line - r.start.line) * 1e6 + (r.end.character - (r.end.line === r.start.line ? r.start.character : 0));

const posKey = (a: Pos, b: Pos) => a.line - b.line || a.character - b.character;

/** `qual` is the id without the file, to pair a declaration with its definition in another file. */
interface Entry { occ: Occurrence; def: BridgeDef; size: number; qual: string; shape: BridgeSymbol["shape"]; info: SymbolInformation }
interface Walk { defs: BridgeDef[]; infos: Map<string, SymbolInformation[]>; byFile: Map<string, Occurrence[]>; entries: Entry[] }

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
  const out: Walk = { defs: [], infos: new Map(), byFile: new Map(), entries: [] };
  const seen = new Map<string, Entry>();
  for (const f of files) {
    const lines = texts.get(f.path)!;
    const occs: Occurrence[] = [];
    const infos: SymbolInformation[] = [];
    const base = `lsp ${f.language} workspace . ${f.path.split("/").map((p) => esc(p) + "/").join("")}`;
    const visit = (list: BridgeSymbol[], prefix: string, parent: string, qprefix: string) => {
      const ordinals = new Map<string, number>();
      for (const raw of [...list].sort((a, b) => posKey(a.selection.start, b.selection.start) || cmpStr(a.name, b.name))) {
        const { owners, leaf } = split(raw);
        let pre = prefix, par = parent, qpre = qprefix;
        for (const o of owners) {
          pre += `${esc(o)}#`;
          qpre += `${esc(o)}#`;
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
        const info: SymbolInformation = { symbol: id, documentation: [], relationships: [], kind: leaf.kind, display_name: leaf.name, enclosing_symbol: par };
        const entry: Entry = { occ, def: { id, path: f.path, selection: sel, shape: leaf.shape }, size: size(raw.range), qual: qpre + descriptor(leaf, 0), shape: leaf.shape, info };
        seen.set(id, entry);
        out.entries.push(entry);
        occs.push(occ);
        infos.push(info);
        out.defs.push(seen.get(id)!.def);
        // Bodies hold locals the graph models itself; only containers hold more definitions.
        if (leaf.shape === "namespace" || leaf.shape === "type") visit(raw.children, id, id, qpre + descriptor(leaf, 0));
      }
    };
    visit(f.symbols, base, "", "");
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
export async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(xs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    for (let i = next++; i < xs.length; i = next++) out[i] = await fn(xs[i]);
  }));
  return out;
}

const sameSpan = (a: Span, b: Span) => posKey(a.start, b.start) === 0 && posKey(a.end, b.end) === 0;

export interface BridgeOptions {
  concurrency?: number;
  /** A declaration and its definition in another file are one symbol (header and source files). */
  unify?: boolean;
  /** Call-site name tokens of a file, from syntax. */
  sites?: (f: BridgeFile) => Span[];
  /** Where the language server says the name at `at` is defined, in the repo or outside it. */
  definitionsOf?: (path: string, at: Pos) => Promise<(BridgeRef | BridgeExternal)[]>;
}

/** Pairs a declaration with its definition when exactly two files declare the same qualified name.
 *  More than two (overloads, shared names) stays apart: a guess would invent edges. */
function unify(w: Walk) {
  const groups = new Map<string, Entry[]>();
  for (const e of w.entries) (groups.get(e.qual) ?? groups.set(e.qual, []).get(e.qual)!).push(e);
  const alias = new Map<string, string>();
  for (const g of groups.values()) {
    if (g.length !== 2 || g[0].def.path === g[1].def.path || g[0].shape !== g[1].shape) continue;
    // Types keep the fuller definition's id; members keep the declaration's, so they stay in their class.
    const whole = g[0].shape === "type" || g[0].shape === "namespace";
    const [a, b] = [...g].sort((x, y) => (whole ? y.size - x.size : x.size - y.size) || cmpStr(x.def.id, y.def.id));
    alias.set(b.def.id, a.def.id);
  }
  if (!alias.size) return;
  // Ids embed their owners, so an aliased type renames its members too.
  const olds = [...alias.keys()].sort((x, y) => y.length - x.length || cmpStr(x, y));
  const to = (id: string) => {
    for (const o of olds) if (id.startsWith(o)) return alias.get(o)! + id.slice(o.length);
    return id;
  };
  for (const e of w.entries) {
    e.occ.symbol = e.def.id = e.info.symbol = to(e.def.id);
    if (e.info.enclosing_symbol) e.info.enclosing_symbol = to(e.info.enclosing_symbol);
  }
  for (const [path, infos] of w.infos) {
    const seen = new Set<string>();
    w.infos.set(path, infos.filter((i) => !seen.has(i.symbol) && seen.add(i.symbol)));
  }
}

const within = (p: Pos, s: Span) => posKey(s.start, p) <= 0 && posKey(p, s.end) <= 0;

/** One SCIP index for `files`; `refsOf` asks the language server where a definition is used. */
export async function bridge(files: BridgeFile[], refsOf: (d: BridgeDef, done: number, total: number) => Promise<BridgeRef[]>, opts: BridgeOptions = {}): Promise<Index> {
  const sorted = [...files].sort((a, b) => cmpStr(a.path, b.path));
  const texts = new Map(sorted.map((f) => [f.path, f.text.split("\n")] as const));
  const w = walk(sorted, texts);
  if (opts.unify) unify(w);
  const concurrency = opts.concurrency ?? 8;
  // Types and namespaces never carry edges of their own (containment comes from the outline), so only
  // callables and values are asked. Each answer can take a language server seconds on a large repo.
  const asked = w.defs.map((d, i) => ({ d, i })).filter(({ d }) => d.shape === "method" || d.shape === "term");
  const refs: BridgeRef[][] = w.defs.map(() => []);
  let done = 0;
  await pool(asked, concurrency, async ({ d, i }) => void (refs[i] = await refsOf(d, ++done, asked.length)));
  const covered = new Set<string>();
  const key = (path: string, p: Pos) => `${path}\0${p.line}:${p.character}`;
  w.defs.forEach((d, i) => {
    for (const r of refs[i]) {
      const lines = texts.get(r.path);
      const occs = w.byFile.get(r.path);
      if (!lines || !occs || (r.path === d.path && sameSpan(r.span, d.selection))) continue;
      occs.push({ symbol: d.id, symbol_roles: 0, ...span(lines, r.span) });
      covered.add(key(r.path, r.span.start));
    }
  });
  // Find-references misses calls (macros, templates, headers still loading); a call site's own
  // definition lookup does not. Only sites the references left unexplained are asked.
  const { sites, definitionsOf } = opts;
  if (sites && definitionsOf) {
    const byPath = new Map<string, BridgeDef[]>();
    for (const d of w.defs) (byPath.get(d.path) ?? byPath.set(d.path, []).get(d.path)!).push(d);
    const todo = sorted.flatMap((f) => sites(f).filter((s) => !covered.has(key(f.path, s.start))).map((s) => ({ path: f.path, site: s })));
    const found = await pool(todo, concurrency, (t) => definitionsOf(t.path, t.site.start));
    const lang = new Map(sorted.map((f) => [f.path, f.language]));
    todo.forEach((t, i) => {
      const inside = found[i].filter((l): l is BridgeRef => "path" in l);
      const hit = inside.map((l) => (byPath.get(l.path) ?? []).find((d) => within(l.span.start, d.selection))).find((d) => d !== undefined);
      // Only when every answer lies outside: an in-repo answer that is no definition (a local) stays unresolved.
      const ext = inside.length ? undefined : found[i].find((l): l is BridgeExternal => "package" in l);
      const symbol = hit?.id ?? (ext && externalSymbol(lang.get(t.path)!, ext.package, ext.names));
      if (symbol) w.byFile.get(t.path)!.push({ symbol, symbol_roles: 0, ...span(texts.get(t.path)!, t.site) });
    });
  }
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
