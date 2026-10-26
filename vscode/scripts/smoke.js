// CI smoke test: an index built the way the editor bridge builds one yields a resolved call edge
// (Go, Python), a `may` edge where there is no syntax (generic), an unindexed file stays visible,
// and the same input gives the same bytes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { bridge } = require("../out/core/bridge");
const { toJson } = require("../out/core/ir");
const { init, makeGraph } = require("../out/engine");

const sp = (l, c, el, ec) => ({ start: { line: l, character: c }, end: { line: el, character: ec } });
const fn = (name, l, len) => ({ name, shape: "method", kind: 17, range: sp(l, 0, l, len), selection: sp(l, 5, l, 6), children: [] });
const py = (name, l, end) => ({ name, shape: "method", kind: 17, range: sp(l, 0, l + 1, end), selection: sp(l, 4, l, 5), children: [] });
const GO = "package p\nfunc a() { b() }\nfunc b() {}\n";
const PY = "def a():\n    b()\ndef b():\n    pass\n";

(async () => {
  await init();
  const files = [
    { path: "p.go", language: "go", text: GO, symbols: [fn("a", 1, 16), fn("b", 2, 11)] },
    { path: "m.py", language: "python", text: PY, symbols: [py("a", 0, 7), py("b", 2, 8)] },
    { path: "g.foo", language: "generic", text: PY, symbols: [py("a", 0, 7), py("b", 2, 8)] },
  ];
  const refs = async (d) => (d.id.endsWith("/b(0).") ? [{ path: d.path, span: d.path === "p.go" ? sp(1, 11, 1, 12) : sp(1, 4, 1, 5) }] : []);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "hesperus-smoke-"));
  try {
    for (const [name, text] of [["p.go", GO], ["m.py", PY], ["g.foo", PY], ["x.cs", "class X {}\n"]]) fs.writeFileSync(path.join(repo, name), text);
    const make = async () => toJson(makeGraph(repo, await bridge(files, refs), [{ path: "x.cs", reason: "no C# extension" }]));
    const out = await make();
    const g = JSON.parse(out);
    const call = (file, prov) => g.edges.some((e) => e.kind === "call" && e.from.includes(file) && e.from.endsWith("/a(0).") && e.to.endsWith("/b(0).") && e.provenance === prov);
    assert.ok(call("`p.go`", "resolved"), "go call");
    assert.ok(call("`m.py`", "resolved"), "python call");
    assert.ok(call("`g.foo`", "may"), "generic reference");
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
