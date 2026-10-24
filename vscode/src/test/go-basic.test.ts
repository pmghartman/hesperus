// Fixture: fixtures/go-basic. The SCIP index is built here from source positions so the
// test needs no external indexer; a real scip-go index has the same shape.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { before, test } from "node:test";
import { build } from "../core/build";
import { EdgeKind, Graph, Provenance, toJson } from "../core/ir";
import { decode, Index, Occurrence, Relationship, SymbolInformation } from "../core/scip";
import { init } from "../engine";
import { GO } from "../lang/go";
import { PKG_ROOT } from "../root";
import { encode } from "./encode";

const FIXTURE = path.join(PKG_ROOT, "..", "fixtures", "go-basic");
const CLI = path.join(PKG_ROOT, "out", "cli.js");
const P = "scip-go gomod example.com/basic . `example.com/basic`/";
const sym = (rest: string) => P + rest;

before(() => init());

/** Range of the nth (1-based) occurrence of `needle`. */
function find(src: string, needle: string, nth: number): number[] {
  let from = 0, pos = 0;
  for (let i = 0; i < nth; i++) {
    pos = src.indexOf(needle, from);
    if (pos < 0) throw new Error(`${needle} #${nth}`);
    from = pos + needle.length;
  }
  const line = src.slice(0, pos).split("\n").length - 1;
  const col = pos - (src.lastIndexOf("\n", pos - 1) + 1);
  return [line, col, col + needle.length];
}

/** First character of the nth occurrence of `needle`. */
const first = (src: string, needle: string, nth: number) => {
  const [l, c] = find(src, needle, nth);
  return [l, c, c + 1];
};

const occ = (range: number[], symbol: string, def: boolean): Occurrence => ({ range, symbol, symbol_roles: def ? 1 : 0, enclosing_range: [] });

function index(src: string): Index {
  const f = (n: string, k: number) => find(src, n, k);
  const c = (n: string, k: number) => first(src, n, k);
  const [shape, shapeArea, circle, circleR, circleArea] = [sym("Shape#"), sym("Shape#Area()."), sym("Circle#"), sym("Circle#r."), sym("Circle#Area().")];
  const [double, apply, total, main] = [sym("double()."), sym("apply()."), sym("total()."), sym("main().")];
  const toUpper = "scip-go gomod std . strings/ToUpper().";
  const occurrences = [
    occ(f("Shape", 2), shape, true),
    occ(f("Area", 1), shapeArea, true),
    occ(f("scale", 1), "local 1", true),
    occ(f("Circle", 1), circle, true),
    occ(c("r int", 1), circleR, true),
    occ(f("Area", 2), circleArea, true),
    occ(f("scale", 2), "local 2", true),
    occ(f("double", 1), double, true),
    occ(c("x int", 1), "local 3", true),
    occ(f("apply", 1), apply, true),
    occ(c("f func", 1), "local 4", true),
    occ(c("v int", 1), "local 5", true),
    occ(c("f(v)", 1), "local 4", false),
    occ(f("total", 1), total, true),
    occ(c("s Shape", 1), "local 6", true),
    occ(c("n int", 1), "local 7", true),
    occ(f("double", 2), double, false),
    occ(f("apply", 2), apply, false),
    occ(f("double", 3), double, false),
    occ(f("Area", 3), shapeArea, false),
    occ(f("main", 2), main, true),
    occ(f("ToUpper", 1), toUpper, false),
    occ(f("total", 2), total, false),
  ];
  const rel = (s: string): Relationship => ({ symbol: s, is_reference: false, is_implementation: true, is_type_definition: false, is_definition: false });
  const si = (s: string, name: string, rels: Relationship[]): SymbolInformation => ({
    symbol: s, documentation: [], relationships: rels, kind: 0, display_name: name, enclosing_symbol: "",
  });
  return {
    metadata: { version: 0, tool_info: { name: "scip-go", version: "test", arguments: [] }, project_root: "", text_document_encoding: 0 },
    documents: [{
      relative_path: "main.go",
      occurrences,
      symbols: [{ ...si(shape, "Shape", []), documentation: ["Shape is implemented by Circle."] }, si(circleArea, "Area", [rel(shapeArea)])],
      language: "go",
      text: "",
      position_encoding: 0,
    }],
    external_symbols: [],
  };
}

const read = (p: string) => {
  try {
    return fs.readFileSync(path.join(FIXTURE, p), "utf8");
  } catch {
    return undefined;
  }
};
const goSyntax = (lang: string) => (lang === "go" ? GO : undefined);
const fixtureIndex = () => encode(index(fs.readFileSync(path.join(FIXTURE, "main.go"), "utf8")));

// Round-trips through the wire format.
const make = (): Graph => build({ index: decode(fixtureIndex()), readSource: read, syntaxFor: goSyntax });

function has(g: Graph, kind: EdgeKind, from: string, to: string, prov: Provenance, label?: string): boolean {
  return g.edges.some((e) => e.kind === kind && e.from === from && e.to === to && e.provenance === prov && e.label === label);
}

test("hand-checked edges", () => {
  const g = make();
  const [double, apply, total, main] = [sym("double()."), sym("apply()."), sym("total()."), sym("main().")];
  const [shapeArea, circleArea] = [sym("Shape#Area()."), sym("Circle#Area().")];
  const toUpper = "scip-go gomod std . strings/ToUpper().";

  // Calls.
  assert.ok(has(g, "call", total, double, "resolved"));
  assert.ok(has(g, "call", total, apply, "resolved"));
  assert.ok(has(g, "call", total, shapeArea, "resolved"));
  assert.ok(has(g, "call", total, circleArea, "may", "dispatch"));
  assert.ok(has(g, "call", main, total, "resolved"));
  assert.ok(has(g, "call", main, toUpper, "resolved"));
  // Call through a parameter: stub stays, and the function value that reaches it is `may`.
  assert.ok(has(g, "call", apply, `unresolved:${apply}:f`, "unresolved"));
  assert.ok(has(g, "call", apply, double, "may", "via f"));
  // Override.
  assert.ok(has(g, "override", circleArea, shapeArea, "resolved"));
  // Flow: arguments to parameters, returns to assignments, function values.
  assert.ok(has(g, "flow", total, double, "resolved", "arg0:x"));
  assert.ok(has(g, "flow", total, apply, "resolved", "arg0:f"));
  assert.ok(has(g, "flow", total, apply, "resolved", "arg1:v"));
  assert.ok(has(g, "flow", double, apply, "resolved", "fn:arg0:f"));
  assert.ok(has(g, "flow", total, shapeArea, "resolved", "arg0"));
  assert.ok(has(g, "flow", double, total, "resolved", "return"));
  assert.ok(has(g, "flow", apply, total, "resolved", "return"));
  assert.ok(has(g, "flow", toUpper, main, "resolved", "return"));
  assert.ok(has(g, "flow", main, toUpper, "resolved", "arg0"));
  // `total(...)` in `_ = total(..)` feeds an assignment.
  assert.ok(has(g, "flow", total, main, "resolved", "return"));
  // External is labeled by package.
  assert.ok(has(g, "contains", "ext:std", toUpper, "resolved"));
  // Containment: file > type > method, package > file.
  assert.ok(has(g, "contains", sym("Circle#"), circleArea, "resolved"));
  assert.ok(has(g, "contains", "file:main.go", sym("Circle#"), "resolved"));
  assert.ok(has(g, "contains", "pkg:example.com/basic:example.com/basic", "file:main.go", "resolved"));
  // Doc comment comes from the index, base layer.
  assert.equal(g.nodes.find((n) => n.id === sym("Shape#"))?.doc, "Shape is implemented by Circle.");
});

test("golden and determinism", () => {
  const a = toJson(make());
  assert.equal(a, toJson(make()), "two runs differ");
  const golden = path.join(FIXTURE, "expected.graph.json");
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(golden, a);
  assert.ok(fs.existsSync(golden), "golden missing; run with UPDATE_GOLDEN=1");
  assert.equal(a, fs.readFileSync(golden, "utf8"), "graph differs from golden");
  assert.ok(!a.includes(os.homedir()), "absolute path leaked");
});

function tmpRepo(scip: Uint8Array): { repo: string; idx: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hesperus-test-"));
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  for (const f of ["go.mod", "main.go"]) fs.copyFileSync(path.join(FIXTURE, f), path.join(repo, f));
  const idx = path.join(root, "index.scip");
  fs.writeFileSync(idx, scip);
  return { repo, idx };
}

function tree(dir: string): [string, Buffer][] {
  const out: [string, Buffer][] = [];
  const go = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) go(p);
      else out.push([path.relative(dir, p), fs.readFileSync(p)]);
    }
  };
  go(dir);
  return out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

const cli = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", maxBuffer: 1 << 30 });
const ls = (d: string) => fs.readdirSync(d).sort();
const cleanup = (repo: string) => fs.rmSync(path.dirname(repo), { recursive: true, force: true });

// Indexers report files the repo does not hold as code: ignored build output, paths outside it.
test("documents outside git's view of the tree are dropped", () => {
  const idx = index(fs.readFileSync(path.join(FIXTURE, "main.go"), "utf8"));
  const extra = (p: string) => ({
    ...idx.documents[0], relative_path: p, symbols: [],
    occurrences: [occ([0, 0, 3], sym(`gen${idx.documents.length}().`), true)],
  });
  for (const p of ["build/gen.go", "../outside.go", "/abs/gen.go", "missing.go"]) idx.documents.push(extra(p));
  const { repo, idx: file } = tmpRepo(encode(idx));
  fs.mkdirSync(path.join(repo, "build"));
  fs.writeFileSync(path.join(repo, "build", "gen.go"), "package build\n");
  fs.writeFileSync(path.join(repo, ".gitignore"), "build/\n");
  assert.equal(spawnSync("git", ["init", "-q", repo]).status, 0);
  const o = cli("index", repo, "--scip", file);
  assert.equal(o.status, 0, o.stderr);
  assert.equal(cli("graph", repo).stdout, toJson(make()));
  cleanup(repo);
});

test("cli cache is deterministic and fails loudly when stale", () => {
  const bytes = fixtureIndex();
  const a = tmpRepo(bytes), b = tmpRepo(bytes);
  for (const { repo, idx } of [a, b]) {
    const o = cli("index", repo, "--scip", idx);
    assert.equal(o.status, 0, o.stderr);
  }
  // Fresh checkout in another directory: identical bytes.
  assert.deepEqual(tree(path.join(a.repo, ".hesperus")), tree(path.join(b.repo, ".hesperus")));
  // Read-only toward the repo: only the cache was added.
  assert.deepEqual(ls(a.repo), [".hesperus", "go.mod", "main.go"]);
  // Cached graph equals the in-memory build.
  let o = cli("graph", a.repo);
  assert.equal(o.status, 0, o.stderr);
  assert.equal(o.stdout, toJson(make()));
  // A lockfile change invalidates the cache loudly.
  fs.writeFileSync(path.join(a.repo, "go.sum"), "x\n");
  o = cli("graph", a.repo);
  assert.notEqual(o.status, 0);
  assert.match(o.stderr, /lockfile_hash/);
  cleanup(a.repo);
  cleanup(b.repo);
});

function state(repo: string): string {
  const o = cli("status", repo);
  assert.equal(o.status, 0, o.stderr);
  return JSON.parse(o.stdout).state;
}

// Without --scip, index runs the indexer in the repo and writes only the cache.
test("index runs the indexer and status tracks the cache", { skip: process.platform === "win32" }, () => {
  const { repo, idx } = tmpRepo(fixtureIndex());
  // A stand-in scip-go at the pinned install location; same flags: `--output <path>`.
  const tools = path.join(path.dirname(repo), "tools");
  const fake = path.join(tools, "scip-go-0.2.9", "bin", "scip-go");
  fs.mkdirSync(path.dirname(fake), { recursive: true });
  fs.writeFileSync(fake, `#!/bin/sh\ncp '${idx}' "$2"\n`, { mode: 0o755 });
  const t = JSON.parse(cli("tools", repo, "--tools-dir", tools).stdout);
  assert.equal(t.languages[0].id, "go");
  assert.equal(t.tools[0].bin, fake);
  assert.equal(t.tools[0].install.kind, "go");
  assert.equal(state(repo), "missing");
  let o = cli("index", repo, "--tools-dir", tools);
  assert.equal(o.status, 0, o.stderr);
  assert.equal(state(repo), "ready");
  assert.deepEqual(ls(repo), [".hesperus", "go.mod", "main.go"]);
  assert.equal(cli("graph", repo).stdout, toJson(make()));
  fs.writeFileSync(path.join(repo, "go.sum"), "x\n");
  assert.equal(state(repo), "stale");
  // No supported files at all: a clear error instead of an empty graph.
  fs.rmSync(path.join(repo, "main.go"));
  o = cli("index", repo, "--tools-dir", tools);
  assert.notEqual(o.status, 0);
  assert.match(o.stderr, /no supported language/);
  cleanup(repo);
});

// Index produced by a real scip-go 0.2.9 run over this fixture (typed ranges,
// interface methods as `MethodSpecification` terms).
test("real scip-go index", () => {
  const idx = decode(fs.readFileSync(path.join(FIXTURE, "scip-go.index.scip")));
  const g = build({ index: idx, readSource: read, syntaxFor: goSyntax });
  const s = (r: string) => `scip-go gomod example.com/basic 2389aa4271eb \`example.com/basic\`/${r}`;
  const [double, apply, total, main] = [s("double()."), s("apply()."), s("total()."), s("main().")];
  const [shapeArea, circleArea] = [s("Shape#Area."), s("Circle#Area().")];
  const toUpper = "scip-go gomod github.com/golang/go/src go1.22 strings/ToUpper().";
  assert.ok(has(g, "call", total, double, "resolved"));
  assert.ok(has(g, "call", total, apply, "resolved"));
  assert.ok(has(g, "call", total, shapeArea, "resolved"));
  assert.ok(has(g, "call", total, circleArea, "may", "dispatch"));
  assert.ok(has(g, "call", main, total, "resolved"));
  assert.ok(has(g, "call", main, toUpper, "resolved"));
  assert.ok(has(g, "call", apply, `unresolved:${apply}:f`, "unresolved"));
  assert.ok(has(g, "call", apply, double, "may", "via f"));
  assert.ok(has(g, "override", circleArea, shapeArea, "resolved"));
  assert.ok(has(g, "flow", total, double, "resolved", "arg0:x"));
  assert.ok(has(g, "flow", total, apply, "resolved", "arg1:v"));
  assert.ok(has(g, "flow", double, apply, "resolved", "fn:arg0:f"));
  assert.ok(has(g, "flow", double, total, "resolved", "return"));
  assert.ok(has(g, "flow", main, total, "resolved", "arg1:n"));
  assert.equal(toJson(g), toJson(build({ index: idx, readSource: read, syntaxFor: goSyntax })));
});
