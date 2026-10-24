// Protobuf encoder for the SCIP subset tests build by hand; proto3 defaults are omitted.
import { Document, Index, Occurrence, Relationship, SymbolInformation } from "../core/scip";

class Writer {
  private bytes: number[] = [];
  private varint(v: number) {
    // Negative int32 is sign-extended to 64 bits: ten bytes.
    let lo = v >>> 0, hi = v < 0 ? 0xffffffff : 0;
    while (hi !== 0 || lo > 0x7f) {
      this.bytes.push((lo & 0x7f) | 0x80);
      lo = ((lo >>> 7) | (hi << 25)) >>> 0;
      hi >>>= 7;
    }
    this.bytes.push(lo);
  }
  private tag(field: number, wire: number) {
    this.varint((field << 3) | wire);
  }
  int32(field: number, v: number) {
    if (v !== 0) (this.tag(field, 0), this.varint(v));
  }
  bool(field: number, v: boolean) {
    if (v) (this.tag(field, 0), this.varint(1));
  }
  bytesField(field: number, b: Uint8Array) {
    this.tag(field, 2);
    this.varint(b.length);
    for (const x of b) this.bytes.push(x);
  }
  string(field: number, s: string) {
    if (s !== "") this.bytesField(field, Buffer.from(s, "utf8"));
  }
  packed(field: number, vs: number[]) {
    if (!vs.length) return;
    const w = new Writer();
    for (const v of vs) w.varint(v);
    this.bytesField(field, w.finish());
  }
  message(field: number, w: Writer) {
    this.bytesField(field, w.finish());
  }
  finish = () => Uint8Array.from(this.bytes);
}

function occurrence(o: Occurrence): Writer {
  const w = new Writer();
  w.packed(1, o.range);
  w.string(2, o.symbol);
  w.int32(3, o.symbol_roles);
  w.packed(7, o.enclosing_range);
  return w;
}

function relationship(r: Relationship): Writer {
  const w = new Writer();
  w.string(1, r.symbol);
  w.bool(2, r.is_reference);
  w.bool(3, r.is_implementation);
  w.bool(4, r.is_type_definition);
  w.bool(5, r.is_definition);
  return w;
}

function symbolInformation(s: SymbolInformation): Writer {
  const w = new Writer();
  w.string(1, s.symbol);
  for (const d of s.documentation) w.string(3, d);
  for (const r of s.relationships) w.message(4, relationship(r));
  w.int32(5, s.kind);
  w.string(6, s.display_name);
  if (s.signature_documentation) w.message(7, document(s.signature_documentation));
  w.string(8, s.enclosing_symbol);
  return w;
}

function document(d: Document): Writer {
  const w = new Writer();
  w.string(1, d.relative_path);
  for (const o of d.occurrences) w.message(2, occurrence(o));
  for (const s of d.symbols) w.message(3, symbolInformation(s));
  w.string(4, d.language);
  w.string(5, d.text);
  w.int32(6, d.position_encoding);
  return w;
}

export function encode(i: Index): Uint8Array {
  const w = new Writer();
  if (i.metadata) {
    const m = new Writer();
    m.int32(1, i.metadata.version);
    const t = i.metadata.tool_info;
    if (t) {
      const tw = new Writer();
      tw.string(1, t.name);
      tw.string(2, t.version);
      for (const a of t.arguments) tw.string(3, a);
      m.message(2, tw);
    }
    m.string(3, i.metadata.project_root);
    m.int32(4, i.metadata.text_document_encoding);
    w.message(1, m);
  }
  for (const d of i.documents) w.message(2, document(d));
  for (const s of i.external_symbols) w.message(3, symbolInformation(s));
  return w.finish();
}
