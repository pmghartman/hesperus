// Webview render tests: the three modes, drill-down aggregation, legend, determinism,
// and the layout golden. Runs under plain node: the viewer code has no DOM dependency.

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";

import { layout } from "../viewer/layout.js";
import { graphFromIr, graphFromUnified, Mode, viewAt } from "../viewer/model.js";
import { renderBreadcrumb, renderLegend, renderSvg } from "../viewer/render.js";

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
  assert.equal(actual, fs.readFileSync(p, "utf8"), `golden mismatch ${file}`);
}

const graphs = {
  intent: () => graphFromIr(read("intent-nested.json")),
  actual: () => graphFromIr(read("actual-nested.json")),
  unified: () => graphFromUnified(read("unified-nested.json")),
};

for (const mode of ["intent", "actual", "unified"] as Mode[]) {
  test(`renders the ${mode} mode at the root and one level down`, () => {
    const g = graphs[mode]();
    const view = viewAt(g, g.root);
    const svg = renderSvg(layout(view), { mode, graph: g, title: g.root });
    assert.ok(svg.startsWith("<svg "), "is an svg");
    assert.ok(svg.includes(`data-mode="${mode}"`));
    // every subsystem at the root level is a container box
    for (const id of ["mesh.peers", "mesh.store", "mesh.web"]) assert.ok(svg.includes(`data-id="${id}" data-kind="subsystem" data-container="true"`), `${id} present`);
    // edges are aggregated to the root level with counts
    const peersStore = /<g class="edge kind-[a-z]+ status-[a-z-]+" data-from="mesh.peers" data-to="mesh.store" data-kind="(reads|writes)" data-count="(\d+)"/g;
    const matches = [...svg.matchAll(peersStore)];
    assert.ok(matches.length >= 1, "peers → store edges exist at the root level");
    if (mode === "unified") {
      assert.ok(svg.includes("status-match"), "match coloring");
      assert.ok(svg.includes("status-actual-only"), "actual-only coloring");
      assert.ok(svg.includes("status-intent-only"), "intent-only coloring");
      // the folded reads edge counts intent-only dial→log and actual-only gossip→log
      const reads = svg.match(/data-from="mesh.peers" data-to="mesh.store" data-kind="reads" data-count="(\d+)"/);
      assert.ok(reads && Number(reads[1]) === 2, `aggregated reads count is 2: ${reads?.[0]}`);
      assert.ok(svg.includes('class="edge kind-reads status-actual-only"'), "worst status wins on an aggregated edge");
    } else {
      assert.ok(!/class="(node|edge) [^"]*status-(match|actual-only|intent-only|conflict)/.test(svg), "no diff coloring outside unified");
      assert.ok(/class="node [^"]*status-none/.test(svg));
    }
    // drill into peers: its components and the outside store it writes to
    const inner = viewAt(g, "mesh.peers");
    const ids = inner.nodes.map((n) => n.id);
    assert.ok(ids.includes("mesh.peers.accept") && ids.includes("mesh.peers.link"));
    assert.deepEqual(inner.outside.map((n) => n.id), mode === "intent" ? ["mesh.store", "mesh.web"] : ["mesh.store", "mesh.web"]);
    const innerSvg = renderSvg(layout(inner), { mode, graph: g, title: "mesh.peers" });
    assert.ok(innerSvg.includes('data-id="mesh.store"') && innerSvg.includes("outside"), "outside node drawn");
    assert.ok(innerSvg.includes('data-from="mesh.peers.link" data-to="mesh.peers.accept" data-kind="ws"'));
    // legend and breadcrumb
    const legend = renderLegend(mode);
    assert.ok(legend.includes(`data-mode="${mode}"`));
    if (mode === "unified") for (const s of ["match", "intent-only", "actual-only", "conflict"]) assert.ok(legend.includes(`status-${s}`), `legend has ${s}`);
    const crumbs = renderBreadcrumb(g, "mesh.peers.accept");
    assert.ok(crumbs.includes('data-focus="mesh"') && crumbs.includes('data-focus="mesh.peers"') && crumbs.includes('data-focus="mesh.peers.accept"'));
    golden(`render-${mode}-root.svg`, svg);
    golden(`render-${mode}-peers.svg`, innerSvg);
    // deterministic
    assert.equal(renderSvg(layout(viewAt(g, g.root)), { mode, graph: g, title: g.root }), svg);
  });
}

test("layout is layered: a caller sits left of its callee, rows sorted by kind then name", () => {
  const g = graphs.intent();
  const l = layout(viewAt(g, "mesh.peers"));
  const at = (id: string) => l.nodes.find((n) => n.node.id === id)!;
  assert.ok(at("mesh.peers.link").x < at("mesh.peers.accept").x, "link -> accept goes left to right");
  assert.ok(at("mesh.store").outside && at("mesh.store").x > at("mesh.peers.accept").x, "outside nodes on the right");
  assert.equal(l.edges.length, viewAt(g, "mesh.peers").edges.length);
  const json = JSON.stringify(l.nodes.map((n) => [n.node.id, n.x, n.y, n.outside]), null, 2) + "\n";
  golden("layout-peers.json", json);
});

test("cycles do not break ranking", () => {
  const g = graphFromIr({
    root: "c",
    nodes: [
      { id: "c", kind: "system", name: "c", parent: null },
      { id: "c.a", kind: "component", name: "a", parent: "c" },
      { id: "c.b", kind: "component", name: "b", parent: "c" },
      { id: "c.d", kind: "component", name: "d", parent: "c" },
    ],
    edges: [
      { from: "c.a", to: "c.b", kind: "calls" },
      { from: "c.b", to: "c.a", kind: "calls" },
      { from: "c.b", to: "c.d", kind: "calls" },
    ],
  });
  const l = layout(viewAt(g, "c"));
  const xs = Object.fromEntries(l.nodes.map((n) => [n.node.id, n.x]));
  assert.ok(xs["c.a"] < xs["c.b"] && xs["c.b"] < xs["c.d"]);
  assert.equal(l.edges.length, 3);
});
