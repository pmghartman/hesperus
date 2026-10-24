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
