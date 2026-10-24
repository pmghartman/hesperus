// Minimal SCIP schema (field numbers from scip.proto), a protobuf decoder for it, and the symbol grammar.
import { cmpStr, Range } from "./ir";

export interface Index { metadata?: Metadata; documents: Document[]; external_symbols: SymbolInformation[] }
export interface Metadata { version: number; tool_info?: ToolInfo; project_root: string; text_document_encoding: number }
export interface ToolInfo { name: string; version: string; arguments: string[] }
export interface Document {
  relative_path: string;
  occurrences: Occurrence[];
  symbols: SymbolInformation[];
  language: string;
  text: string;
  position_encoding: number;
}
export interface Occurrence {
  range: number[];
  symbol: string;
  symbol_roles: number;
  enclosing_range: number[];
  // Typed forms (oneof in scip.proto); preferred over the deprecated int arrays.
  single_line_range?: SingleLineRange;
  multi_line_range?: MultiLineRange;
  single_line_enclosing_range?: SingleLineRange;
  multi_line_enclosing_range?: MultiLineRange;
}
export interface SingleLineRange { line: number; start_character: number; end_character: number }
export interface MultiLineRange { start_line: number; start_character: number; end_line: number; end_character: number }
export interface SymbolInformation {
  symbol: string;
  documentation: string[];
  relationships: Relationship[];
  kind: number;
  display_name: string;
  signature_documentation?: Document;
  enclosing_symbol: string;
}
export interface Relationship { symbol: string; is_reference: boolean; is_implementation: boolean; is_type_definition: boolean; is_definition: boolean }

export const ROLE_DEFINITION = 0x1;
export const KIND_FIELD = 15;
export const KIND_VARIABLE = 61;
/** Constructor, Function, Method, AbstractMethod, MethodSpecification, StaticMethod. */
export const CALLABLE_KINDS: readonly number[] = [9, 17, 26, 66, 67, 80];

// Field values as SCIP stores them; i32 cast to u32 as the IR's ranges are unsigned.
const u = (x: number) => x >>> 0;

function typed(s?: SingleLineRange, m?: MultiLineRange): Range | undefined {
  if (m) return { start_line: u(m.start_line), start_col: u(m.start_character), end_line: u(m.end_line), end_col: u(m.end_character) };
  if (s) return { start_line: u(s.line), start_col: u(s.start_character), end_line: u(s.line), end_col: u(s.end_character) };
  return undefined;
}

export function parseRange(r: number[]): Range | undefined {
  if (r.length === 3) return { start_line: u(r[0]), start_col: u(r[1]), end_line: u(r[0]), end_col: u(r[2]) };
  if (r.length === 4) return { start_line: u(r[0]), start_col: u(r[1]), end_line: u(r[2]), end_col: u(r[3]) };
  return undefined;
}

export const occRange = (o: Occurrence) => typed(o.single_line_range, o.multi_line_range) ?? parseRange(o.range);
export const occEnclosing = (o: Occurrence) =>
  typed(o.single_line_enclosing_range, o.multi_line_enclosing_range) ?? parseRange(o.enclosing_range);

// Protobuf wire format: proto3 defaults, repeated scalars packed or not, repeated
// singular messages merged, unknown fields skipped.
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

class Reader {
  constructor(readonly b: Uint8Array, public p: number, readonly end: number) {}

  /** Low 32 bits as i32, plus whether any bit was set (for bools). */
  varint(): { lo: number; nz: boolean } {
    let lo = 0, shift = 0, nz = false, c: number;
    do {
      if (this.p >= this.end) throw new Error("buffer underflow");
      if (shift >= 70) throw new Error("invalid varint");
      c = this.b[this.p++];
      if (c & 0x7f) nz = true;
      if (shift < 32) lo |= (c & 0x7f) << shift;
      shift += 7;
    } while (c & 0x80);
    return { lo: lo | 0, nz };
  }
  int32 = () => this.varint().lo;
  len(): number {
    const { lo } = this.varint();
    const n = lo >>> 0;
    if (n > this.end - this.p) throw new Error("buffer underflow");
    return n;
  }
  sub(): Reader {
    const n = this.len();
    const r = new Reader(this.b, this.p, this.p + n);
    this.p += n;
    return r;
  }
  string(): string {
    const r = this.sub();
    try {
      return utf8.decode(this.b.subarray(r.p, r.end));
    } catch {
      throw new Error("invalid string value: data is not UTF-8 encoded");
    }
  }
  skip(wire: number, field: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.fixed(8);
    else if (wire === 2) {
      const n = this.len(); // before reading `p`: `p += len()` would add to the stale value
      this.p += n;
    }
    else if (wire === 5) this.fixed(4);
    else if (wire === 3) {
      for (;;) {
        if (this.p >= this.end) throw new Error("unexpected end of group");
        const t = this.varint().lo >>> 0;
        if ((t & 7) === 4) {
          if (t >>> 3 !== field) throw new Error("unexpected end group tag");
          return;
        }
        this.skip(t & 7, t >>> 3);
      }
    } else throw new Error(`invalid wire type value: ${wire}`);
  }
  private fixed(n: number) {
    if (this.end - this.p < n) throw new Error("buffer underflow");
    this.p += n;
  }
}

type Fields = (r: Reader, field: number, wire: number) => boolean;

/** Calls `f` for each field; fields it does not claim are skipped. */
function each(r: Reader, f: Fields) {
  while (r.p < r.end) {
    const t = r.varint().lo >>> 0;
    const field = t >>> 3, wire = t & 7;
    if (field === 0) throw new Error("invalid tag value: 0");
    if (!f(r, field, wire)) r.skip(wire, field);
  }
}

function expect(wire: number, want: number) {
  if (wire !== want) throw new Error(`invalid wire type: ${wire} (expected ${want})`);
}

function repeatedInt32(r: Reader, wire: number, out: number[]) {
  if (wire === 2) {
    const s = r.sub();
    while (s.p < s.end) out.push(s.int32());
  } else {
    expect(wire, 0);
    out.push(r.int32());
  }
}

const int32 = (r: Reader, wire: number) => (expect(wire, 0), r.int32());
const bool = (r: Reader, wire: number) => (expect(wire, 0), r.varint().nz);
const string = (r: Reader, wire: number) => (expect(wire, 2), r.string());
const message = <T>(r: Reader, wire: number, dec: (r: Reader, into?: T) => T, into?: T) => (expect(wire, 2), dec(r.sub(), into));

function toolInfo(r: Reader, t: ToolInfo = { name: "", version: "", arguments: [] }): ToolInfo {
  each(r, (r, f, w) => {
    if (f === 1) t.name = string(r, w);
    else if (f === 2) t.version = string(r, w);
    else if (f === 3) t.arguments.push(string(r, w));
    else return false;
    return true;
  });
  return t;
}

function metadata(r: Reader, m: Metadata = { version: 0, project_root: "", text_document_encoding: 0 }): Metadata {
  each(r, (r, f, w) => {
    if (f === 1) m.version = int32(r, w);
    else if (f === 2) m.tool_info = message(r, w, toolInfo, m.tool_info);
    else if (f === 3) m.project_root = string(r, w);
    else if (f === 4) m.text_document_encoding = int32(r, w);
    else return false;
    return true;
  });
  return m;
}

function singleLine(r: Reader, s: SingleLineRange = { line: 0, start_character: 0, end_character: 0 }): SingleLineRange {
  each(r, (r, f, w) => {
    if (f === 1) s.line = int32(r, w);
    else if (f === 2) s.start_character = int32(r, w);
    else if (f === 3) s.end_character = int32(r, w);
    else return false;
    return true;
  });
  return s;
}

function multiLine(r: Reader, m: MultiLineRange = { start_line: 0, start_character: 0, end_line: 0, end_character: 0 }): MultiLineRange {
  each(r, (r, f, w) => {
    if (f === 1) m.start_line = int32(r, w);
    else if (f === 2) m.start_character = int32(r, w);
    else if (f === 3) m.end_line = int32(r, w);
    else if (f === 4) m.end_character = int32(r, w);
    else return false;
    return true;
  });
  return m;
}

function occurrence(r: Reader, o: Occurrence = { range: [], symbol: "", symbol_roles: 0, enclosing_range: [] }): Occurrence {
  each(r, (r, f, w) => {
    if (f === 1) repeatedInt32(r, w, o.range);
    else if (f === 2) o.symbol = string(r, w);
    else if (f === 3) o.symbol_roles = int32(r, w);
    else if (f === 7) repeatedInt32(r, w, o.enclosing_range);
    else if (f === 8) o.single_line_range = message(r, w, singleLine, o.single_line_range);
    else if (f === 9) o.multi_line_range = message(r, w, multiLine, o.multi_line_range);
    else if (f === 10) o.single_line_enclosing_range = message(r, w, singleLine, o.single_line_enclosing_range);
    else if (f === 11) o.multi_line_enclosing_range = message(r, w, multiLine, o.multi_line_enclosing_range);
    else return false;
    return true;
  });
  return o;
}

function relationship(r: Reader, x: Relationship = { symbol: "", is_reference: false, is_implementation: false, is_type_definition: false, is_definition: false }): Relationship {
  each(r, (r, f, w) => {
    if (f === 1) x.symbol = string(r, w);
    else if (f === 2) x.is_reference = bool(r, w);
    else if (f === 3) x.is_implementation = bool(r, w);
    else if (f === 4) x.is_type_definition = bool(r, w);
    else if (f === 5) x.is_definition = bool(r, w);
    else return false;
    return true;
  });
  return x;
}

function symbolInformation(r: Reader, s: SymbolInformation = { symbol: "", documentation: [], relationships: [], kind: 0, display_name: "", enclosing_symbol: "" }): SymbolInformation {
  each(r, (r, f, w) => {
    if (f === 1) s.symbol = string(r, w);
    else if (f === 3) s.documentation.push(string(r, w));
    else if (f === 4) s.relationships.push(message(r, w, relationship));
    else if (f === 5) s.kind = int32(r, w);
    else if (f === 6) s.display_name = string(r, w);
    else if (f === 7) s.signature_documentation = message(r, w, document, s.signature_documentation);
    else if (f === 8) s.enclosing_symbol = string(r, w);
    else return false;
    return true;
  });
  return s;
}

function document(r: Reader, d: Document = { relative_path: "", occurrences: [], symbols: [], language: "", text: "", position_encoding: 0 }): Document {
  each(r, (r, f, w) => {
    if (f === 1) d.relative_path = string(r, w);
    else if (f === 2) d.occurrences.push(message(r, w, occurrence));
    else if (f === 3) d.symbols.push(message(r, w, symbolInformation));
    else if (f === 4) d.language = string(r, w);
    else if (f === 5) d.text = string(r, w);
    else if (f === 6) d.position_encoding = int32(r, w);
    else return false;
    return true;
  });
  return d;
}

function index(r: Reader): Index {
  const i: Index = { documents: [], external_symbols: [] };
  each(r, (r, f, w) => {
    if (f === 1) i.metadata = message(r, w, metadata, i.metadata);
    else if (f === 2) i.documents.push(message(r, w, document));
    else if (f === 3) i.external_symbols.push(message(r, w, symbolInformation));
    else return false;
    return true;
  });
  return i;
}

export function decode(bytes: Uint8Array): Index {
  try {
    return index(new Reader(bytes, 0, bytes.length));
  } catch (e) {
    throw new Error(`invalid SCIP index: ${(e as Error).message}`);
  }
}

/** "name version" from the index's tool info. */
export function toolOf(i: Index): string {
  const t = i.metadata?.tool_info;
  return t ? `${t.name} ${t.version}` : "unknown";
}

/** One index from several indexers' output. Each indexer owns its own symbol scheme,
 *  so documents and symbols concatenate; order is canonicalized by path, then by symbol. */
export function merge(indexes: Index[]): Index {
  const out: Index = { documents: [], external_symbols: [] };
  for (const i of indexes) {
    out.documents.push(...i.documents);
    out.external_symbols.push(...i.external_symbols);
  }
  out.documents.sort((a, b) => cmpStr(a.relative_path, b.relative_path));
  out.external_symbols.sort((a, b) => cmpStr(a.symbol, b.symbol));
  return out;
}

export type DescKind = "namespace" | "type" | "term" | "method" | "type_param" | "parameter" | "meta" | "macro";
export interface Descriptor { name: string; kind: DescKind }
export interface Symbol {
  package: string;
  descriptors: Descriptor[];
  /** Code point offset in the source string where each descriptor ends. */
  ends: number[];
}

/** Symbol string of the first `n` descriptors (n >= 1), cut from the original. */
export const prefix = (s: Symbol, orig: string, n: number) => Array.from(orig).slice(0, s.ends[n - 1]).join("");

const SUFFIX: Record<string, DescKind> = { "/": "namespace", "#": "type", ".": "term", ":": "meta", "!": "macro" };

/** Undefined for `local N` symbols and anything malformed. */
export function parseSymbol(s: string): Symbol | undefined {
  if (!s || s.startsWith("local ")) return undefined;
  // scheme manager name version, space-separated; "  " escapes a space.
  const b = Array.from(s);
  const parts: string[] = [];
  let i = 0;
  while (parts.length < 4) {
    let cur = "";
    for (;;) {
      if (i >= b.length) return undefined;
      if (b[i] === " ") {
        if (b[i + 1] === " ") {
          cur += " ";
          i += 2;
          continue;
        }
        i += 1;
        break;
      }
      cur += b[i++];
    }
    parts.push(cur);
  }
  const base = i;
  const rest = b.slice(i);
  const descriptors: Descriptor[] = [];
  const ends: number[] = [];
  let j = 0;
  while (j < rest.length) {
    let name = "";
    if (rest[j] === "[" || rest[j] === "(") {
      const close = rest[j] === "[" ? "]" : ")";
      j++;
      while (j < rest.length && rest[j] !== close) name += rest[j++];
      j++;
      descriptors.push({ name, kind: close === "]" ? "type_param" : "parameter" });
      ends.push(base + j);
      continue;
    }
    if (rest[j] === "`") {
      j++;
      while (j < rest.length) {
        if (rest[j] === "`") {
          if (rest[j + 1] === "`") {
            name += "`";
            j += 2;
            continue;
          }
          j++;
          break;
        }
        name += rest[j++];
      }
    } else {
      while (j < rest.length && !"/#.:!(".includes(rest[j])) name += rest[j++];
    }
    let kind: DescKind;
    const c = rest[j];
    if (c === "(") {
      // method: name(disambiguator).
      while (j < rest.length && rest[j] !== ")") j++;
      j++; // ')'
      kind = "method";
    } else if (c !== undefined && SUFFIX[c]) kind = SUFFIX[c];
    else return undefined;
    j++; // suffix char ('.' of a method, or the single suffix)
    descriptors.push({ name, kind });
    ends.push(base + j);
  }
  return { package: parts[2], descriptors, ends };
}
