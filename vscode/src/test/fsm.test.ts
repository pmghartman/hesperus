// Fixtures: fixtures/go-fsm and fixtures/js-fsm, each with an index from a real indexer run
// (scip-go 0.2.9, scip-typescript 0.5.2). States, transitions and field flow, hand-checked.
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { before, test } from "node:test";
import { machines, view } from "../core/aggregate";
import { build } from "../core/build";
import { Graph, toJson } from "../core/ir";
import { decode } from "../core/scip";
import { stateId } from "../core/states";
import { Syntax } from "../core/syntax";
import { init } from "../engine";
import { GO } from "../lang/go";
import { JS } from "../lang/js";
import { PKG_ROOT } from "../root";

const FIXTURES = path.join(PKG_ROOT, "..", "fixtures");

before(() => init());

function make(dir: string, scip: string, syntax: Syntax): Graph {
  const root = path.join(FIXTURES, dir);
  const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
  return build({ index: decode(fs.readFileSync(path.join(root, scip))), readSource: read, syntaxFor: () => syntax });
}
const go = () => make("go-fsm", "scip-go.index.scip", GO);
const js = () => make("js-fsm", "scip-typescript.index.scip", JS);

/** Transitions as `from -> to provenance label`, by state name. */
function transitions(g: Graph, loc: string): string[] {
  const name = new Map(g.nodes.map((n) => [n.id, n.name]));
  return g.edges
    .filter((e) => e.kind === "transition" && e.from.startsWith(`state:${loc}:`))
    .map((e) => `${name.get(e.from)} -> ${name.get(e.to)} ${e.provenance} ${e.label}`)
    .sort();
}

/** scip-go versions symbols by the enclosing git checkout, so read the prefix off the index. */
const goPrefix = (g: Graph) => g.nodes.find((n) => n.id.endsWith("`example.com/fsm`/Conn#state."))!.id.slice(0, -"Conn#state.".length);

const flows = (g: Graph, label: string) => g.edges.filter((e) => e.kind === "flow" && e.label === label);

test("go: states and transitions of Conn.state", () => {
  const g = go();
  const P = goPrefix(g);
  const loc = P + "Conn#state.";
  assert.deepEqual(transitions(g, loc), [
    "Dialing -> Closed resolved Event",
    "Dialing -> Idle resolved Event",
    "Dialing -> Open resolved Event",
    "Idle -> Closed resolved Event", // `case Open, Idle:` lists two states for one body
    "Idle -> Dialing resolved Dial",
    "Open -> Closed resolved Event",
    "any -> ? unresolved Close", // a parameter no call site fills
    "any -> Closed may Hangup", // through `shut`'s parameter, triggered at the call site; `Pause`
    // passes Idle, which `to != Idle` keeps from the write
    "any -> Idle may Reset", // no guard: could leave any state
    "initial -> Idle resolved New", // keyed literal element
  ]);
  // States are contained by the field and point at the constants' definitions.
  const idle = g.nodes.find((n) => n.id === stateId(loc, P + "Idle."))!;
  assert.deepEqual([idle.kind, idle.path, idle.range?.start_line], ["state", "conn.go", 6]);
  assert.ok(g.edges.some((e) => e.kind === "contains" && e.from === loc && e.to === idle.id));
  assert.equal(g.nodes.find((n) => n.id === stateId(loc, "?"))?.kind, "unresolved");
  // A counter is written and read but never tested for equality: flow, no states.
  const tries = P + "Conn#tries.";
  assert.ok(!g.nodes.some((n) => n.id.startsWith(`state:${tries}:`)));
  assert.ok(flows(g, "write").some((e) => e.from === P + "Conn#Dial()." && e.to === tries));
  assert.ok(flows(g, "read").some((e) => e.from === tries && e.to === P + "Conn#Event()."));
  // Field flow: every writer and reader of the state field.
  const writers = new Set(flows(g, "write").filter((e) => e.to === loc).map((e) => e.from.slice(P.length)));
  assert.deepEqual([...writers].sort(), ["Conn#Close().", "Conn#Dial().", "Conn#Event().", "Conn#Reset().", "Conn#shut().", "New()."]);
  const readers = new Set(flows(g, "read").filter((e) => e.from === loc).map((e) => e.to.slice(P.length)));
  assert.deepEqual([...readers].sort(), ["Conn#Dial().", "Conn#Event().", "Conn#Live()."]);
  // Constants are never written, so they get no flow edges.
  assert.ok(!flows(g, "read").some((e) => e.from === P + "Idle."));
  assert.deepEqual(machines(g).map((m) => [m.name, m.states, m.transitions]), [["Conn.state", 6, 10], ["Words.state", 3, 3]]);
});

test("go: a local holds a state machine, scoped to its function", () => {
  const g = go();
  const words = goPrefix(g) + "Words().";
  const loc = `local:${words}:state`;
  const n = g.nodes.find((x) => x.id === loc)!;
  assert.deepEqual([n.kind, n.name, n.path], ["variable", "state", "conn.go"]);
  assert.ok(g.edges.some((e) => e.kind === "contains" && e.from === words && e.to === loc));
  // `const ( space = iota; word )` inside the function are its states; `n` has none.
  assert.deepEqual(transitions(g, loc), ["initial -> space resolved Words", "space -> word resolved Words", "word -> space resolved Words"]);
  assert.ok(!g.nodes.some((x) => x.id === `local:${words}:n`));
  // A local's reads and writes stay inside its function: no flow edges.
  assert.ok(!g.edges.some((e) => e.kind === "flow" && (e.from === loc || e.to === loc)));
});

test("js: string states of Door.state", () => {
  const g = js();
  const loc = "scip-typescript npm . . `door.js`/Door#state.";
  assert.deepEqual(transitions(g, loc), [
    "\"closed\" -> \"locked\" resolved lock",
    "\"closed\" -> \"open\" resolved open",
    "\"locked\" -> \"closed\" resolved unlock", // `&& key` keeps the guard certain
    "\"open\" -> \"closed\" resolved close",
    "initial -> \"closed\" resolved door.js", // class field initializer
  ]);
  // A `let` local against `const` locals holding literals.
  const words = "scip-typescript npm . . `door.js`/words().";
  assert.deepEqual(transitions(g, `local:${words}:state`), ["SPACE -> WORD resolved words", "WORD -> SPACE resolved words", "initial -> SPACE resolved words"]);
  assert.deepEqual(machines(g).map((m) => m.name), ["Door.state", "words.state"]);
});

test("js: switch fallthrough and `||` make guards uncertain", () => {
  const f = JS.facts(`switch (s.k) { case "a": case "b": s.k = "c"; case "d": s.k = "e"; break; }\nif (s.k === "x" || ok) s.k = "y";`);
  const g = (v: string) => f.guards.find((x) => x.right.text === v)!;
  assert.deepEqual(g('"a"').body, g('"b"').body, "empty case shares the next body");
  assert.equal(g('"b"').certain, true);
  assert.equal(g('"d"').certain, false, "entered by falling through");
  assert.equal(g('"x"').certain, false);
  assert.deepEqual(f.assigns.map((a) => [a.target.receiver, a.target.text, a.value.form]), [["s", "s.k", "literal"], ["s", "s.k", "literal"], ["s", "s.k", "literal"]]);
});

test("go: `!` drops a guard, `&&` keeps it, `!=` is an inequality", () => {
  const f = GO.facts(`package p\nfunc f() {\n\tif !(c.s == A) { c.s = B }\n\tif c.s == A && ok { c.s = C }\n\tif c.s != D || ok {}\n}\n`);
  assert.deepEqual(f.guards.map((g) => [g.left.text, g.right.text, g.equal, g.certain]), [["c.s", "A", true, true], ["c.s", "D", false, false]]);
});

test("a location's states stay out of call tiers", () => {
  const g = go();
  const loc = goPrefix(g) + "Conn#state.";
  const v = view(g, new Set(g.edges.filter((e) => e.kind === "contains").map((e) => e.from)));
  assert.ok(!v.groups.some((gr) => gr.parent === loc));
  assert.ok(v.rollups.some((r) => r.kind === "transition"));
});

for (const [dir, mk] of [["go-fsm", go], ["js-fsm", js]] as const) {
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
