import { test } from "node:test";
import assert from "node:assert/strict";
import { View } from "./core/aggregate";
import { Graph } from "./core/ir";
import { layout } from "./layout";

const n = (id: string, kind: "package" | "function" = "function") => ({ id, kind, name: id });
const g: Graph = {
  schema_version: 1,
  nodes: [n("repo"), n("A", "package"), n("B", "package"), n("a1"), n("b1")],
  edges: [
    { from: "repo", to: "A", kind: "contains", provenance: "resolved" },
    { from: "repo", to: "B", kind: "contains", provenance: "resolved" },
    { from: "A", to: "a1", kind: "contains", provenance: "resolved" },
    { from: "B", to: "b1", kind: "contains", provenance: "resolved" },
    { from: "a1", to: "b1", kind: "call", provenance: "resolved" },
  ],
};
const view: View = {
  nodes: ["A", "B", "a1"],
  rollups: [{ from: "a1", to: "B", kind: "call", weight: 1, resolved: 1, may: 0, unresolved: 0, edges: [4] }],
  groups: [],
};

test("layout is deterministic and nests expanded containers", async () => {
  const a = JSON.stringify(await layout(g, view));
  const b = JSON.stringify(await layout({ ...g, nodes: [...g.nodes].reverse() }, { ...view, nodes: [...view.nodes].reverse() }));
  assert.equal(a, b);
  const l = await layout(g, view);
  const A = l.boxes.find((x) => x.id === "A")!, a1 = l.boxes.find((x) => x.id === "a1")!;
  assert.ok(A.container && a1.x >= A.x && a1.y >= A.y && a1.x + a1.w <= A.x + A.w);
  const B = l.boxes.find((x) => x.id === "B")!;
  assert.ok(B.expandable && !B.container && !a1.expandable);
});

test("rollups between one pair share a routed wire", async () => {
  const flow = { ...view.rollups[0], kind: "flow" as const };
  const l = await layout(g, { ...view, rollups: [flow, view.rollups[0]] });
  assert.equal(l.wires.length, 1);
  assert.deepEqual(l.wires[0].rollups.map((r) => r.kind), ["call", "flow"]);
  // Routed in root coordinates: starts at a1's right edge, ends at B's left edge.
  const a1 = l.boxes.find((x) => x.id === "a1")!, B = l.boxes.find((x) => x.id === "B")!;
  const [s, e] = [l.wires[0].points[0], l.wires[0].points.at(-1)!];
  assert.ok(Math.abs(s.x - (a1.x + a1.w)) < 1 && Math.abs(e.x - B.x) < 1, JSON.stringify({ s, e, a1, B }));
});

test("both directions between a pair share one wire, oriented along the call", async () => {
  const back = { ...view.rollups[0], from: "B", to: "a1", kind: "flow" as const };
  const l = await layout(g, { ...view, rollups: [back, view.rollups[0]] });
  assert.equal(l.wires.length, 1);
  assert.equal(l.wires[0].from, "a1");
  assert.deepEqual(l.wires[0].rollups.map((r) => [r.kind, r.from]), [["call", "a1"], ["flow", "B"]]);
});

test("wires between siblings inside a container end on their boxes", async () => {
  const h: Graph = {
    schema_version: 1,
    nodes: [n("repo"), n("A", "package"), n("a1"), n("a2"), n("B", "package")],
    edges: [
      { from: "repo", to: "A", kind: "contains", provenance: "resolved" },
      { from: "repo", to: "B", kind: "contains", provenance: "resolved" },
      { from: "A", to: "a1", kind: "contains", provenance: "resolved" },
      { from: "A", to: "a2", kind: "contains", provenance: "resolved" },
      { from: "a1", to: "a2", kind: "call", provenance: "resolved" },
      { from: "B", to: "A", kind: "call", provenance: "resolved" },
    ],
  };
  const r = (from: string, to: string, i: number) => ({ from, to, kind: "call" as const, weight: 1, resolved: 1, may: 0, unresolved: 0, edges: [i] });
  const l = await layout(h, { nodes: ["A", "B", "a1", "a2"], rollups: [r("B", "A", 5), r("a1", "a2", 4)], groups: [] });
  const box = (id: string) => l.boxes.find((x) => x.id === id)!;
  const off = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
    Math.hypot(Math.max(b.x - p.x, 0, p.x - b.x - b.w), Math.max(b.y - p.y, 0, p.y - b.y - b.h));
  for (const w of l.wires) {
    assert.ok(off(w.points[0], box(w.from)) < 1, `${w.from} start`);
    assert.ok(off(w.points.at(-1)!, box(w.to)) < 1, `${w.to} end`);
  }
});

test("wires from a container into its own descendants end on their boxes", async () => {
  const h: Graph = {
    schema_version: 1,
    nodes: [n("repo"), n("X", "package"), n("F", "package"), n("G", "package"), n("s1"), n("s2"), n("f1")],
    edges: [
      { from: "repo", to: "X", kind: "contains", provenance: "resolved" },
      { from: "repo", to: "F", kind: "contains", provenance: "resolved" },
      { from: "F", to: "G", kind: "contains", provenance: "resolved" },
      { from: "F", to: "f1", kind: "contains", provenance: "resolved" },
      { from: "G", to: "s1", kind: "contains", provenance: "resolved" },
      { from: "G", to: "s2", kind: "contains", provenance: "resolved" },
      { from: "F", to: "s1", kind: "call", provenance: "unresolved" },
      { from: "s2", to: "X", kind: "call", provenance: "resolved" },
      { from: "f1", to: "s2", kind: "call", provenance: "resolved" },
    ],
  };
  const r = (from: string, to: string, i: number) => ({ from, to, kind: "call" as const, weight: 1, resolved: 1, may: 0, unresolved: 0, edges: [i] });
  const l = await layout(h, { nodes: ["X", "F", "G", "s1", "s2", "f1"], rollups: [r("F", "s1", 6), r("s2", "X", 7), r("f1", "s2", 8)], groups: [] });
  const box = (id: string) => l.boxes.find((x) => x.id === id)!;
  const off = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
    Math.hypot(Math.max(b.x - p.x, 0, p.x - b.x - b.w), Math.max(b.y - p.y, 0, p.y - b.y - b.h));
  assert.equal(l.wires.length, 3);
  for (const w of l.wires) {
    assert.ok(off(w.points[0], box(w.from)) < 1, `${w.from} start`);
    assert.ok(off(w.points.at(-1)!, box(w.to)) < 1, `${w.to} end`);
  }
});
