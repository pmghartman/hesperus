import assert from "node:assert/strict";
import { test } from "node:test";
import { view } from "../core/aggregate";
import { canonicalize, cmpStr, EdgeKind, GraphEdge, GraphNode, newGraph } from "../core/ir";
import { directories } from "../core/build";
import { decode, parseSymbol, prefix } from "../core/scip";
import { encode } from "./encode";

const n = (id: string): GraphNode => ({ id, kind: "function", name: id });
const e = (from: string, to: string, kind: EdgeKind): GraphEdge => ({ from, to, kind, provenance: "resolved" });

test("rolls up and splits on expand", () => {
  const g = newGraph();
  g.nodes = ["repo", "A", "B", "a1", "a2", "b1"].map(n);
  g.edges = [
    e("repo", "A", "contains"),
    e("repo", "B", "contains"),
    e("A", "a1", "contains"),
    e("A", "a2", "contains"),
    e("B", "b1", "contains"),
    e("a1", "b1", "call"),
    e("a2", "b1", "call"),
    e("a1", "a2", "call"),
  ];
  canonicalize(g);
  let v = view(g, new Set());
  assert.deepEqual(v.nodes, ["A", "B"]);
  assert.equal(v.rollups.length, 1);
  assert.equal(v.rollups[0].weight, 2);
  v = view(g, new Set(["A"]));
  assert.deepEqual(v.nodes, ["A", "B", "a1", "a2"]); // expanded A stays as a container
  assert.equal(v.rollups.reduce((s, r) => s + r.weight, 0), 3);
});

test("parses method symbol", () => {
  const orig = "scip-go gomod example.com/m v1 pkg/sub/Type#Method().";
  const s = parseSymbol(orig)!;
  assert.equal(s.package, "example.com/m");
  assert.equal(prefix(s, orig, 3), "scip-go gomod example.com/m v1 pkg/sub/Type#");
  assert.deepEqual(s.descriptors.map((d) => [d.name, d.kind]), [
    ["pkg", "namespace"],
    ["sub", "namespace"],
    ["Type", "type"],
    ["Method", "method"],
  ]);
});

test("local symbols do not parse", () => {
  assert.equal(parseSymbol("local 12"), undefined);
});

test("escaped names and spaces", () => {
  const orig = "scip-typescript npm my  pkg 1.0 src/`a.ts`/`x``y`.";
  const s = parseSymbol(orig)!;
  assert.equal(s.package, "my pkg");
  assert.deepEqual(s.descriptors.map((d) => d.name), ["src", "a.ts", "x`y"]);
  assert.equal(prefix(s, orig, 2), "scip-typescript npm my  pkg 1.0 src/`a.ts`/");
});

test("strings sort by code point, as UTF-8 bytes do", () => {
  const xs = ["\u{1F600}", "�", "z", "a", ""];
  assert.deepEqual([...xs].sort(cmpStr), ["", "a", "z", "�", "\u{1F600}"]);
});

test("decodes negative ints, packed and unpacked repeats, and rejects junk", () => {
  const bytes = encode({
    documents: [{
      relative_path: "a.go", language: "go", text: "", position_encoding: 0, symbols: [],
      occurrences: [{ range: [1, -2, 3], symbol: "s", symbol_roles: 1, enclosing_range: [] }],
    }],
    external_symbols: [],
  });
  const d = decode(bytes).documents[0];
  assert.deepEqual(d.occurrences[0].range, [1, -2, 3]);
  // Same range unpacked: field 1, wire type 0, three times.
  const occ = Uint8Array.from([0x08, 1, 0x08, 2, 0x08, 3]);
  const doc = Uint8Array.from([0x12, occ.length, ...occ]);
  assert.deepEqual(decode(Uint8Array.from([0x12, doc.length, ...doc])).documents[0].occurrences[0].range, [1, 2, 3]);
  assert.throws(() => decode(Uint8Array.from([0x12, 5, 1])), /invalid SCIP index/);
});

test("directories group top-level packages and files; single-child directories fold", () => {
  const nodes = new Map<string, GraphNode>([
    ["pkg:a", { id: "pkg:a", kind: "package", name: "a" }],
    ["pkg:b", { id: "pkg:b", kind: "package", name: "b" }],
    ["pkg:c", { id: "pkg:c", kind: "package", name: "c" }],
    ["file:x/y/z/one.js", { id: "file:x/y/z/one.js", kind: "file", name: "one.js", path: "x/y/z/one.js" }],
    ["file:x/y/z/two.js", { id: "file:x/y/z/two.js", kind: "file", name: "two.js", path: "x/y/z/two.js" }],
    ["file:root.js", { id: "file:root.js", kind: "file", name: "root.js", path: "root.js" }],
  ]);
  const parent = new Map([...nodes.keys()].map((k) => [k, "repo"]));
  // pkg:a spans internal/a and internal/a/sub; pkg:b is in internal/b; pkg:c is alone under lib.
  const filePkgs = new Map([
    ["internal/a/a.go", new Set(["pkg:a"])],
    ["internal/a/sub/s.go", new Set(["pkg:a"])],
    ["internal/b/b.go", new Set(["pkg:b"])],
    ["lib/only/c.go", new Set(["pkg:c"])],
  ]);
  directories(nodes, parent, filePkgs);
  assert.equal(parent.get("pkg:a"), "dir:internal");
  assert.equal(parent.get("pkg:b"), "dir:internal");
  assert.equal(parent.get("pkg:c"), "repo"); // lib and lib/only hold one child each
  assert.equal(parent.get("file:x/y/z/one.js"), "dir:x/y/z");
  assert.equal(parent.get("dir:x/y/z"), "repo");
  assert.equal(nodes.get("dir:x/y/z")?.name, "x/y/z");
  assert.equal(parent.get("file:root.js"), "repo");
  assert.deepEqual([...nodes.values()].filter((n) => n.kind === "directory").map((n) => n.id).sort(), ["dir:internal", "dir:x/y/z"]);
});
