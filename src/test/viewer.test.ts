// Webview render tests: the flow pipeline, its layout, the legend, blast radius, determinism.
// Runs under plain node: the viewer code has no DOM dependency.

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";

import { componentLabel, entryGroups, FlowJson, flowView, reaches } from "../viewer/flow.js";
import { layout } from "../viewer/layout.js";
import { View } from "../viewer/model.js";
import { renderLegend, renderSvg } from "../viewer/render.js";

const here = __dirname;
const fixtures = path.resolve(here, "..", "..", "test", "fixtures");
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(fixtures, f), "utf8"));

function golden(file: string, actual: string) {
  const p = path.join(fixtures, file);
  if (process.env.UPDATE_GOLDEN) {
    fs.writeFileSync(p, actual);
    return;
  }
  assert.ok(fs.existsSync(p), `missing golden ${p}; run with UPDATE_GOLDEN=1`);
  assert.equal(actual, fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"), `golden mismatch ${file}`);
}

test("one entry is a left-to-right pipeline ending in its boundaries, every step clickable", () => {
  const f = read("flow.json") as FlowJson;
  const fv = flowView(f, "route:src/handlers/orders.ts#createOrder")!;
  assert.equal(fv.entry.label, "POST /orders");
  // call order, not name order: charge, saveOrder, audit
  assert.deepEqual(
    fv.view.nodes.map((n) => n.id),
    ["route:src/handlers/orders.ts#createOrder", "src/handlers/orders.ts#createOrder", "src/pay/stripe.ts#charge", "src/db/orders.ts#saveOrder", "src/handlers/audit.ts#audit"],
  );
  assert.deepEqual(fv.view.outside.map((n) => n.id), ["shop.stripe", "shop.db", "shop.filesystem"]);
  // components are named as the intent names them (label, else name)
  assert.deepEqual(fv.owners.map((o) => `${o.label}:${o.tint}`), ["handlers:0", "pay:1", "data:2"]);
  assert.equal(componentLabel(f, "shop.db"), "Orders and users");
  assert.equal(fv.view.outside[1].label, "Orders and users");
  const l = layout(fv.view, { fold: false });
  const at = (id: string) => l.nodes.find((n) => n.node.id === id)!;
  assert.ok(at(fv.entry.id).x < at("src/handlers/orders.ts#createOrder").x, "entry first");
  assert.ok(at("src/handlers/orders.ts#createOrder").x < at("src/pay/stripe.ts#charge").x, "caller left of callee");
  assert.equal(new Set(l.nodes.filter((n) => !n.outside).map((n) => n.x)).size, 3, "one column per call depth, never folded");
  assert.ok(at("shop.stripe").outside && at("shop.stripe").x > at("src/pay/stripe.ts#charge").x, "boundaries on the right");
  const svg = renderSvg(l, { graph: fv.graph, title: fv.entry.label });
  assert.ok(svg.startsWith("<svg ") && svg.includes('data-mode="flow"'));
  assert.ok(svg.includes('class="node kind-entry"'), "entry box");
  assert.ok(svg.includes('class="node kind-function tint-1"'), "functions tinted by owner");
  assert.ok(svg.includes('class="node kind-store outside"'), "boundaries drawn outside");
  assert.ok(svg.includes('data-from="src/pay/stripe.ts#charge" data-to="shop.stripe" data-kind="http"'), "path leaves to the external host");
  assert.ok(svg.includes('data-from="src/db/orders.ts#saveOrder" data-to="shop.db" data-kind="writes"'));
  assert.ok(svg.includes('data-from="src/handlers/orders.ts#createOrder" data-to="src/pay/stripe.ts#charge" data-kind="calls"'));
  // every box carries a source line to open
  for (const n of [...fv.view.nodes, ...fv.view.outside]) assert.match(n.at[0], /^src\/.+:\d+$/, n.id);
  const legend = renderLegend(fv.owners);
  assert.ok(legend.includes("tint-2") && legend.includes("data"));
  assert.deepEqual(entryGroups(f).map((g) => `${g.kind}:${g.entries.length}`), ["route:3", "module:1"]);
  // repeated calls fold into one counted edge; the bin module runs main
  const cli = flowView(f, "module:src/cli.ts#<module>")!;
  assert.deepEqual(cli.view.nodes.map((n) => n.name), ["cli.ts", "<module>", "main", "findUsers"]);
  // an unknown entry falls back to the first
  assert.equal(flowView(f, "nope")!.entry.id, f.entries[0].id);
  golden("render-flow-orders.svg", svg);
  const again = flowView(f, fv.entry.id)!;
  assert.equal(renderSvg(layout(again.view, { fold: false }), { graph: again.graph, title: again.entry.label }), svg, "deterministic");
});

test("blast radius: which entries pass through a file or a line", () => {
  const f = read("flow.json") as FlowJson;
  assert.deepEqual(
    reaches(f, "src/db/users.ts").map((h) => `${h.entry.label} via ${h.units.map((u) => u.name).join(",")}`),
    ["cli.ts via findUsers", "GET /users via findUsers"],
  );
  assert.deepEqual(reaches(f, "src/handlers/audit.ts", 3).map((h) => h.entry.label), ["GET /users", "POST /orders"]);
  assert.deepEqual(reaches(f, "src/handlers/audit.ts", 1), [], "a line outside every declaration");
  assert.deepEqual(reaches(f, "src/nowhere.ts"), []);
  // constraints come evaluated, with the entries that pass each witness
  assert.deepEqual(
    f.constraints.map((c) => `${c.rule} ${c.from}->${c.to} ${c.satisfied ? "ok" : "x"}`),
    ["forbid shop.data->shop.db x", "forbid shop.handlers->shop.db ok", "require shop.pay->shop.stripe ok", "require shop.server->shop.pay x"],
  );
});

test("layout: cycles do not break ranking, rows keep the order they are given", () => {
  const node = (id: string) => ({ id, kind: "function", name: id, label: null, at: [], detail: [] });
  const view: View = {
    focus: "e",
    nodes: [node("e"), node("a"), node("b"), node("d")],
    outside: [],
    edges: [
      { from: "e", to: "a", kind: "calls", resolved: true, count: 1, at: [] },
      { from: "a", to: "b", kind: "calls", resolved: true, count: 1, at: [] },
      { from: "b", to: "a", kind: "calls", resolved: true, count: 1, at: [] },
      { from: "b", to: "d", kind: "calls", resolved: true, count: 1, at: [] },
    ],
  };
  const l = layout(view, { fold: false });
  const xs = Object.fromEntries(l.nodes.map((n) => [n.node.id, n.x]));
  assert.ok(xs.e < xs.a && xs.a < xs.b && xs.b < xs.d);
  assert.equal(l.edges.length, 4);
  // folding (the default) packs a long chain into a grid for a small viewport
  const folded = layout(view, { viewport: { width: 400, height: 400 } });
  assert.ok(new Set(folded.nodes.map((n) => n.x)).size < 4);
});
