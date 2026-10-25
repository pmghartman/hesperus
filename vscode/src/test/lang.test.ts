import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { before, test } from "node:test";
import { Facts } from "../core/syntax";
import { GO, Go } from "../lang/go";
import { JS, Js, TS, TSX } from "../lang/js";

before(async () => {
  await Go.init();
  await Js.init();
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
