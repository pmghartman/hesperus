// Fixtures: fixtures/{rust,csharp,cpp,dart}-fsm, each with an index from a real indexer run
// (rust-analyzer 2026-10-19, scip-dotnet 0.2.16, scip-clang v0.4.1, scip_dart 1.8.1). The same
// connection state machine in every language, so the graphs are comparable. Hand-checked.
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { before, test } from "node:test";
import { machines } from "../core/aggregate";
import { build } from "../core/build";
import { Graph, toJson } from "../core/ir";
import { decode } from "../core/scip";
import { Frontend } from "../core/frontend";
import { init } from "../engine";
import { Cpp } from "../lang/cpp";
import { CSharp } from "../lang/csharp";
import { Dart } from "../lang/dart";
import { Rust } from "../lang/rust";
import { PKG_ROOT } from "../root";

const FIXTURES = path.join(PKG_ROOT, "..", "fixtures");

before(() => init());

/** Indexers also report generated files (C#'s obj/); the engine keeps only repo files, so do the same. */
function make(dir: string, scip: string, fe: Frontend): Graph {
  const root = path.join(FIXTURES, dir);
  const index = decode(fs.readFileSync(path.join(root, scip)));
  index.documents = index.documents.filter((d) => fs.existsSync(path.join(root, d.relative_path)));
  return build({ index, readSource: (p) => fs.readFileSync(path.join(root, p), "utf8"), syntaxFor: (_l, p) => fe.syntax(p) });
}

/** Transitions of the connection machine as `from -> to provenance label`, sorted. */
function transitions(g: Graph, local: boolean): string[] {
  const name = new Map(g.nodes.map((n) => [n.id, n.name]));
  return g.edges
    .filter((e) => e.kind === "transition" && e.from.startsWith("state:") && e.from.includes(":local:") === local)
    .map((e) => `${name.get(e.from)} -> ${name.get(e.to)} ${e.provenance} ${e.label}`.toLowerCase())
    .sort();
}

// Go's Conn transitions, by name. `Hangup` reaches Closed through `shut`'s parameter, and `Pause`'s
// Idle is kept out by `to != Idle`. The initial state's label is where the initializer lives.
const conn = (initial: string) => [
  "any -> ? unresolved close",
  "any -> closed may hangup",
  "any -> idle may reset",
  "dialing -> closed resolved event",
  "dialing -> idle resolved event",
  "dialing -> open resolved event",
  "idle -> closed resolved event", // `case Open, Idle:` lists two states for one body
  "idle -> dialing resolved dial",
  `initial -> idle resolved ${initial}`,
  "open -> closed resolved event",
];
const words = ["initial -> space resolved words", "space -> word resolved words", "word -> space resolved words"];

const CASES: [string, string, Frontend, () => Graph, string, string[], [string, number, number][]][] = [
  ["rust-fsm", "rust-analyzer.index.scip", Rust, () => make("rust-fsm", "rust-analyzer.index.scip", Rust), "new", words, [["Conn.state", 6, 10], ["words.state", 3, 3]]],
  ["csharp-fsm", "scip-dotnet.index.scip", CSharp, () => make("csharp-fsm", "scip-dotnet.index.scip", CSharp), "conn.cs", words, [["Conn.state", 6, 10], ["Words.state", 3, 3]]],
  ["cpp-fsm", "scip-clang.index.scip", Cpp, () => make("cpp-fsm", "scip-clang.index.scip", Cpp), "conn", words, [["Conn.state_", 6, 10], ["Words.state", 3, 3]]],
  ["dart-fsm", "scip_dart.index.scip", Dart, () => make("dart-fsm", "scip_dart.index.scip", Dart), "conn.dart", words, [["Conn.state", 6, 10], ["words.state", 3, 3]]],
];

for (const [dir, , , mk, initial, local, ms] of CASES) {
  test(`${dir}: states, transitions and local machine`, () => {
    const g = mk();
    assert.deepEqual(machines(g).map((m) => [m.name, m.states, m.transitions]), ms);
    assert.deepEqual(transitions(g, false), conn(initial));
    assert.deepEqual(transitions(g, true), local);
    // Field flow: `hangup` and `pause` pass a state to `shut`, which writes the field.
    const calls = g.edges.filter((e) => e.kind === "call" && e.provenance === "resolved").map((e) => `${g.nodes.find((n) => n.id === e.from)?.name}>${g.nodes.find((n) => n.id === e.to)?.name}`.toLowerCase());
    assert.ok(calls.includes("hangup>shut") && calls.includes("pause>shut"), calls.join(", "));
  });

  test(`${dir}: golden and determinism`, () => {
    const a = toJson(mk());
    assert.equal(a, toJson(mk()), "two runs differ");
    const golden = path.join(FIXTURES, dir, "expected.graph.json");
    if (process.env.UPDATE_GOLDEN) fs.writeFileSync(golden, a);
    assert.ok(fs.existsSync(golden), "golden missing; run with UPDATE_GOLDEN=1");
    assert.equal(a, fs.readFileSync(golden, "utf8"), "graph differs from golden");
    assert.ok(!a.includes(os.homedir()), "absolute path leaked");
  });
}
