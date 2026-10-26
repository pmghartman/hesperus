// CI smoke test: an index built the way the editor bridge builds one yields a resolved call edge,
// an unindexed file stays visible, and the same input gives the same bytes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { bridge } = require("../out/core/bridge");
const { toJson } = require("../out/core/ir");
const { init, makeGraph } = require("../out/engine");

const sp = (l, c, el, ec) => ({ start: { line: l, character: c }, end: { line: el, character: ec } });
const fn = (name, l, len) => ({ name, shape: "method", kind: 17, range: sp(l, 0, l, len), selection: sp(l, 5, l, 6), children: [] });
const SRC = "package p\nfunc a() { b() }\nfunc b() {}\n";

(async () => {
  await init();
  const files = [{ path: "p.go", language: "go", text: SRC, symbols: [fn("a", 1, 16), fn("b", 2, 11)] }];
  const refs = async (d) => (d.id.endsWith("/b(0).") ? [{ path: "p.go", span: sp(1, 11, 1, 12) }] : []);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "hesperus-smoke-"));
  try {
    fs.writeFileSync(path.join(repo, "p.go"), SRC);
    fs.writeFileSync(path.join(repo, "x.cs"), "class X {}\n");
    const make = async () => toJson(makeGraph(repo, await bridge(files, refs), [{ path: "x.cs", reason: "no C# extension" }]));
    const out = await make();
    const g = JSON.parse(out);
    const call = g.edges.find((e) => e.kind === "call" && e.from.endsWith("/a(0).") && e.to.endsWith("/b(0)."));
    assert.equal(call?.provenance, "resolved");
    assert.equal(g.nodes.find((n) => n.id === "file:x.cs")?.unindexed, true);
    assert.equal(await make(), out);
    console.log("smoke ok");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
