// The SCIP data model the graph builder reads (the editor bridge produces it), and the symbol grammar.
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
/** Constant and EnumMember: values a field may hold, never locations. */
export const CONSTANT_KINDS: readonly number[] = [8, 12];
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
