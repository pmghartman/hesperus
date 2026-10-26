import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { before, test } from "node:test";
import { Facts } from "../core/syntax";
import { Cpp, CPP } from "../lang/cpp";
import { CSHARP, CSharp } from "../lang/csharp";
import { DART, Dart } from "../lang/dart";
import { GO, Go } from "../lang/go";
import { JS, Js, TS, TSX } from "../lang/js";
import { Rust, RUST } from "../lang/rust";

before(async () => {
  await Promise.all([Go.init(), Js.init(), Rust.init(), CSharp.init(), Cpp.init(), Dart.init()]);
});

const names = (f: Facts) => f.params.map((p) => [p.name, p.index]);

test("go: finds calls and params", () => {
  const src = "package p\nfunc f(a, b int, _ string) int {\n\tg(a)\n\tx := h.m(b)\n\treturn x\n}\n";
  const f = GO.facts(src);
  assert.equal(f.decls.length, 1);
  assert.deepEqual(names(f), [["a", 0], ["b", 1], ["_", 2]]);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].result_used, false);
  assert.equal(f.calls[1].result_used, true);
  assert.equal(f.calls[1].callee_text, "h.m");
  assert.equal(f.calls[1].callee.start_col, 8); // `m` in "\tx := h.m(b)"
});

test("go: columns are UTF-8 bytes", () => {
  const f = GO.facts('package p\nfunc f() { s := "é😀"; g(s) }\n');
  // "func f() { s := \"" is 17 bytes, then é (2) + 😀 (4) + "\"; " (3).
  assert.equal(f.calls[0].callee.start_col, 26);
  assert.equal(f.calls[0].args[0].end_col, 29);
});

test("javascript: functions, params and calls", () => {
  const src = "function f(a, {b}, c = 1, ...rest) {\n  g(a);\n  const x = this.h.m(c);\n  return new K(x);\n}\nconst k = y => y;\nconst o = { p: function (z) { return z; } };\nitems.map((i) => i);\n";
  const f = JS.facts(src);
  // f, k, o.p are named; the callback passed to map is not.
  assert.equal(f.decls.length, 3);
  assert.deepEqual(names(f), [["a", 0], ["c", 2], ["rest", 3], ["y", 0], ["z", 0]]);
  assert.deepEqual(f.calls.map((c) => [c.callee_text, c.result_used]), [["g", false], ["this.h.m", true], ["K", true], ["items.map", false]]);
  assert.equal(f.calls[1].callee.start_col, 19); // `m` in "  const x = this.h.m(c);"
});

test("typescript and tsx parameters", () => {
  const ts = TS.facts("class C {\n  run(a: number, b?: string): void { this.go(a); }\n}\n");
  assert.deepEqual(names(ts), [["a", 0], ["b", 1]]);
  assert.equal(ts.calls.length, 1);
  const tsx = TSX.facts("export const View = (p: Props) => <div onClick={() => go(p)} />;\n");
  assert.deepEqual(names(tsx), [["p", 0]]);
  assert.equal(tsx.calls[0].callee_text, "go");
});

test("deep nesting does not overflow the stack", () => {
  const f = JS.facts("x = " + "[".repeat(20000) + "]".repeat(20000) + ";\n");
  assert.equal(f.calls.length, 0);
});

// The indexer sees the repo through an overlay; the repo itself gains nothing.
test("js: command writes only scratch", { skip: process.platform === "win32" }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hesperus-js-"));
  const repo = path.join(root, "repo"), scratch = path.join(root, "scratch");
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.mkdirSync(path.join(repo, ".git"));
  fs.writeFileSync(path.join(repo, "src/a.js"), "f()\n");
  // A relative repo path still links to the real entries.
  const rel = path.relative(process.cwd(), repo);
  const c = Js.command(rel, "/bin/scip-typescript", path.join(scratch, "o.scip"), scratch);
  const overlay = path.join(scratch, "js-overlay");
  assert.equal(c.cwd, overlay);
  assert.ok(fs.lstatSync(path.join(overlay, "src")).isSymbolicLink());
  assert.ok(fs.existsSync(path.join(overlay, "src/a.js")));
  assert.ok(!fs.existsSync(path.join(overlay, ".git")));
  assert.match(fs.readFileSync(path.join(overlay, "tsconfig.json"), "utf8"), /preserveSymlinks/);
  assert.deepEqual(fs.readdirSync(repo).sort(), [".git", "src"]);
  fs.rmSync(root, { recursive: true });
});

test("js: grammar by extension", () => {
  assert.ok(Js.syntax("web/a.mjs"));
  assert.ok(Js.syntax("web/a.TSX"));
  assert.equal(Js.syntax("web/a.css"), undefined);
});

test("go: one root per module, wherever go.mod sits", () => {
  assert.deepEqual(Go.roots(["svc/b/go.mod", "go.mod", "svc/a/go.mod", "svc/a/x/testdata/go.mod", "main.go"]), ["", "svc/a", "svc/b"]);
  assert.deepEqual(Go.roots(["backend/go.mod", "backend/cmd/x/main.go"]), ["backend"]);
  assert.throws(() => Go.roots(["a.go"]), /no go.mod/);
});

/** Operand as `receiver.name` for names, else its form. */
const show = (o: { form: string; receiver: string; text: string }) => (o.form === "name" ? o.text : `${o.form}:${o.text}`);
const calls = (f: Facts) => f.calls.map((c) => [c.callee_text, c.values.map(show), c.result_used]);
const guards = (f: Facts) => f.guards.map((g) => `${g.left.text}${g.equal ? "==" : "!="}${g.right.text}${g.certain ? "" : "?"}`);

test("rust: functions, calls, assignments and match guards", () => {
  const src = "const IDLE: u8 = 0;\nimpl C {\n  fn f(&mut self, a: u8, _: u8, b: u8) -> u8 {\n    let mut s = IDLE;\n    self.g(b);\n    s = a;\n    match self.st { S::A | S::B => { s += 1; } _ => {} }\n    if self.st != S::A || a == 1 { h(s) } else { 0 }\n  }\n}\n";
  const f = RUST.facts(src);
  assert.equal(f.decls.length, 1);
  // `self` is not a parameter; `_` is nameless and only takes an index.
  assert.deepEqual(names(f), [["a", 0], ["b", 2]]);
  assert.deepEqual(calls(f), [["self.g", ["b"], false], ["h", ["s"], true]]);
  assert.deepEqual(guards(f), ["self.st==S::A", "self.st==S::B", "self.st!=S::A?", "a==1?"]);
  assert.equal(f.consts.length, 1);
  // `let mut s = IDLE` and `s = a` and `s += 1`: one declaration, two statements.
  assert.deepEqual(f.assigns.map((a) => a.init), [true, false, false]);
});

test("csharp: methods, switch fallthrough and initializers", () => {
  const src = "class C {\n  State st = State.Idle;\n  void M(int a, int b) {\n    const int K = 1;\n    st = State.Open; n++;\n    Run(a); this.Go(b); var c = new C { st = State.Idle };\n    switch (st) { case State.A: case State.B: Run(1); break; default: break; }\n  }\n}\n";
  const f = CSHARP.facts(src);
  assert.deepEqual(names(f), [["a", 0], ["b", 1]]);
  assert.deepEqual(calls(f).map((c) => c[0]), ["Run", "this.Go", "C", "Run"]);
  // `case A:` has no body of its own; both labels guard the body that follows.
  assert.deepEqual(guards(f), ["st==State.A", "st==State.B"]);
  assert.equal(f.guards[0].certain, true);
  assert.equal(f.guards[1].certain, true);
  assert.equal(f.consts.length, 1);
  assert.equal(f.assigns.filter((a) => a.init).length, 3); // field, local `c`, object initializer
});

test("cpp: definitions, qualified and member calls, switch", () => {
  const src = "void C::M(int a, int, int *b) {\n  const int K = 1;\n  st_ = S::Open; n++;\n  run(a); obj.f(1); ns::g(2); p->h(*b);\n  if (st_ == S::A && a) { }\n  switch (st_) { case S::A: case S::B: run(1); break; }\n}\n";
  const f = CPP.facts(src);
  assert.equal(f.decls.length, 1);
  assert.deepEqual(names(f), [["a", 0], ["b", 2]]);
  assert.deepEqual(calls(f).map((c) => c[0]), ["run", "obj.f", "ns::g", "p->h", "run"]);
  assert.deepEqual(guards(f), ["st_==S::A", "st_==S::A", "st_==S::B"]);
  assert.equal(f.consts.length, 1);
});

test("dart: sibling selectors form calls and operands", () => {
  const src = "class C {\n  State st = State.idle;\n  void m(int a, [int b = 1]) {\n    run(3);\n  }\n  void n(int a, {int c = 2}) {\n    st = State.open; n++;\n    run(a); this.go(b); obj.f(1); var k = C();\n    if (st == State.idle && a != 1) { run(2); }\n    switch (st) { case State.a: case State.b: run(1); break; default: break; }\n  }\n}\n";
  const f = DART.facts(src);
  // `[b]` is positional; `{c}` binds by name and is left out so positions stay right.
  assert.deepEqual(names(f), [["a", 0], ["b", 1], ["a", 0]]);
  assert.equal(f.decls.length, 2);
  assert.deepEqual(calls(f).map((c) => c[0]), ["run", "run", "this.go", "obj.f", "C", "run", "run"]);
  assert.deepEqual(guards(f), ["st==State.idle", "a!=1", "st==State.a", "st==State.b"]);
  assert.equal(f.calls[1].result_used, false);
  assert.equal(f.calls[4].result_used, true);
});

test("new languages: columns are UTF-8 bytes", () => {
  const f = RUST.facts('fn f() { let s = "é😀"; g(s); }\n');
  // `fn f() { let s = "` is 18 bytes, then é (2) + 😀 (4) + `"; ` (3).
  assert.equal(f.calls[0].callee.start_col, 27);
});

test("roots: outermost project files", () => {
  assert.deepEqual(Rust.roots(["Cargo.toml", "a/Cargo.toml", "x/y/Cargo.toml"]), [""]);
  assert.deepEqual(Rust.roots(["a/Cargo.toml", "b/c/Cargo.toml", "a/d/Cargo.toml"]), ["a", "b/c"]);
  assert.throws(() => Rust.roots(["src/lib.rs"]), /no Cargo.toml/);
  assert.deepEqual(CSharp.roots(["App.sln", "src/App/App.csproj"]), [""]);
  assert.deepEqual(CSharp.roots(["a/A.csproj", "b/B.csproj"]), ["a", "b"]);
  assert.throws(() => CSharp.roots(["A.cs"]), /no .sln or .csproj/);
  assert.deepEqual(Dart.roots(["pubspec.yaml", "example/pubspec.yaml"]), [""]);
  assert.throws(() => Dart.roots(["lib/a.dart"]), /no pubspec.yaml/);
  assert.deepEqual(Cpp.roots(["src/a.cpp"]), [""]);
});

test("release installs pin a sha256 per platform", () => {
  for (const f of [Rust, Cpp]) {
    const i = f.tool().install;
    assert.equal(i.kind, "release");
    if (i.kind !== "release") continue;
    for (const [key, a] of Object.entries(i.assets)) {
      assert.match(key, /^(darwin|linux|win32)-(arm64|x64)$/);
      assert.match(a.sha256, /^[0-9a-f]{64}$/);
      assert.ok(a.url.startsWith("https://github.com/") && a.url.includes(f.tool().version), a.url);
    }
  }
});
