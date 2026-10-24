import { test } from "node:test";
import assert from "node:assert/strict";
import { Graph, View } from "./graph";
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
});
