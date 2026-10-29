// CI smoke test: an index built the way the editor bridge builds one yields a resolved call edge
// (Go, Python), a `may` edge where there is no syntax (generic), an unindexed file stays visible,
// a call that resolves outside the repo is an external node under its package, a boolean flag tested
// for truth is a state machine, the same input gives the same bytes, and a message handler becomes an
// automaton.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { bridge } = require("../out/core/bridge");
const { toJson } = require("../out/core/ir");
const { init, makeGraph } = require("../out/engine");
const { automaton } = require("../out/core/automaton");

const sp = (l, c, el, ec) => ({ start: { line: l, character: c }, end: { line: el, character: ec } });
const fn = (name, l, len) => ({ name, shape: "method", kind: 17, range: sp(l, 0, l, len), selection: sp(l, 5, l, 6), children: [] });
const js = (name, l, c, end) => ({ name, shape: "method", kind: 12, range: sp(l, 0, l, end + 40), selection: sp(l, c, l, end), children: [] });
const py = (name, l, end) => ({ name, shape: "method", kind: 17, range: sp(l, 0, l + 1, end), selection: sp(l, 4, l, 5), children: [] });
const GO = "package p\nfunc a() { b() }\nfunc b() {}\n";
const PY = "def a():\n    b()\ndef b():\n    pass\n";
const GO_EXT = "package p\nfunc c() { fmt.Println() }\n";
const FLAG = "let busy = false;\nfunction go() { if (!busy) { busy = true; } }\nfunction stop() { if (busy) { busy = false; } }\n";

// A message-driven player: its automaton has the inputs the handler dispatches on and moves between
// the states its guards allow. The fake server finds definitions by outline and references by name.
const PLAYER = `let state = "idle";
let muted = false;
let loaded = false;

function play() {
  if (!loaded) return;
  if (state === "idle") state = "playing";
  if (state === "paused") state = "playing";
}

function onMessage(m) {
  if (m.type === "load") {
    loaded = true;
  } else if (m.type === "play") {
    play();
  } else if (m.type === "pause") {
    if (state === "playing") state = "paused";
  } else if (m.type === "stop") {
    state = "idle";
  } else if (m.type === "eject") {
    state = "idle";
    loaded = false;
  } else if (m.type === "mute") {
    muted = !muted;
  }
}

window.addEventListener("message", (e) => onMessage(e.data));
`;

// The flow from an entry: steps in call order, named by their doc comments; an if with both sides, a
// loop, a call that leaves the repo as a terminal; opening a step inlines its own; the text form agrees.
async function flowTest(repo) {
  const { indexHeadless } = require("../out/engine");
  const { entries, flow, flowText } = require("../out/core/flow");
  const { flowLayout } = require("../out/flowchart");
  const { flowInputs } = require("../out/service");
  const { defaultPolicy } = require("../out/core/lint");
  const APP = `const fs = require("fs");
/** Runs the job: reads, then saves each row. */
function main(rows) {
  const data = read();
  if (rows.length > 1) {
    for (const r of rows) save(r);
  } else {
    skip();
  }
  return data;
}
// Reads the input file.
function read() { return fs.readFileSync("in.txt", "utf8"); }
/* Writes one row. */
function save(r) { fs.writeFileSync("out.txt", r); }
function skip() {}
`;
  fs.writeFileSync(path.join(repo, "app.js"), APP);
  fs.writeFileSync(path.join(repo, "package.json"), "{}");
  const { graph: g } = await indexHeadless(repo);
  const main = g.nodes.find((n) => n.name === "main" && n.kind === "function");
  assert.equal(main?.doc, "Runs the job: reads, then saves each row.", "doc comment");
  assert.equal(g.nodes.find((n) => n.name === "read")?.doc, "Reads the input file.", "line comment");
  assert.equal(g.nodes.find((n) => n.name === "save")?.doc, "Writes one row.", "block comment");
  const inp = await flowInputs(repo, { graph: g, policy: defaultPolicy() });
  const es = entries(g, inp);
  assert.equal(es[0]?.name, "main", "entry drives the most");
  const f = flow(g, main.id, new Set(), inp);
  const kinds = f.steps.map((s) => s.kind);
  assert.deepEqual(kinds, ["call", "if"], "steps in order");
  const iff = f.steps[1];
  assert.equal(iff.text, "rows.length > 1");
  assert.equal(iff.yes[0]?.kind, "loop", "loop on the yes side");
  assert.equal(iff.yes[0].body[0]?.name, "save");
  assert.equal(iff.no[0]?.name, "skip", "else side");
  const opened = flow(g, main.id, new Set([f.steps[0].id]), inp);
  assert.equal(opened.steps[0].steps?.[0]?.kind, "boundary", "opened call shows its terminal");
  assert.equal(opened.steps[0].steps[0].boundary, "filesystem");
  const text = flowText(opened);
  assert.ok(text.includes("▭ read") && text.includes("Reads the input file.") && text.includes("[Filesystem]") && text.includes("◇ rows.length > 1?"), text);
  const lay = flowLayout(opened);
  assert.ok(lay.boxes.some((b) => b.kind === "if") && lay.boxes.some((b) => b.kind === "loop") && lay.boxes.some((b) => b.kind === "boundary") && lay.boxes.some((b) => b.kind === "frame"), "chart shapes");
  assert.ok(lay.links.some((l) => l.label === "yes") && lay.links.some((l) => l.label === "no") && lay.links.some((l) => l.back), "chart links");
  assert.ok(lay.boxes.every((b) => b.x >= 0 && b.y >= 0), "chart in positive space");
}

async function player(repo) {
  const lines = PLAYER.split("\n");
  const at = (name) => lines.flatMap((l, i) => [...l.matchAll(new RegExp(`\\b${name}\\b`, "g"))].map((m) => sp(i, m.index, i, m.index + name.length)));
  const def = (name, shape, kind) => {
    const sel = at(name)[0], end = shape === "method" ? lines.findIndex((l, i) => i > sel.start.line && l === "}") : sel.start.line;
    return { name, shape, kind, range: sp(sel.start.line, 0, end, lines[end].length), selection: sel, children: [] };
  };
  const symbols = [def("state", "term", 61), def("muted", "term", 61), def("loaded", "term", 61), def("play", "method", 12), def("onMessage", "method", 12)];
  const refs = async (d) => at(symbols.find((s) => d.id.endsWith(`/${s.name}${s.shape === "method" ? "(0)" : ""}.`)).name).slice(1).map((span) => ({ path: "player.js", span }));
  fs.writeFileSync(path.join(repo, "player.js"), PLAYER);
  // `addEventListener` is defined outside the repo, so the function handed to it is an event.
  const listen = at("addEventListener")[0];
  const opts = { sites: () => [listen], definitionsOf: async () => [{ package: "dom", names: ["Window", "addEventListener"] }] };
  const g = makeGraph(repo, await bridge([{ path: "player.js", language: "javascript", text: PLAYER, symbols }], refs, opts), []);
  const a = automaton(g);
  assert.deepEqual(a.inputs.map((i) => i.name), ["eject", "load", "mute", "pause", "play", "stop"], "inputs");
  const name = (id) => a.inputs.find((i) => i.id === id).name;
  const region = a.regions.find((r) => r.dims.length === 2);
  assert.equal(region?.states.length, 4, "loaded × state");
  const of = (loaded, state) => region.states.find((s) => s.values[region.dims.find((d) => d.endsWith("loaded."))][0] === loaded && s.values[region.dims.find((d) => d.endsWith("state."))][0] === `"${state}"`);
  const moves = region.edges.map((e) => `${region.states.indexOf(region.states.find((s) => s.id === e.from))}>${region.states.indexOf(region.states.find((s) => s.id === e.to))}:${e.inputs.map(name)}${e.may ? "?" : ""}`);
  const idle = of("true", "idle"), playing = of("true", "playing");
  assert.ok(of("false", "idle")?.initial, "initial");
  assert.ok(region.edges.some((e) => e.from === idle.id && e.to === playing.id && !e.may && e.inputs.map(name).join() === "play"), `play: ${moves}`);
  assert.ok(of("false", "idle").loops.map(name).includes("play"), "play does nothing until loaded");
  assert.ok(region.edges.every((e) => !e.may), `all certain: ${moves}`);
  assert.equal(a.regions.find((r) => r.dims.length === 1)?.states.length, 2, "muted");
}

// Imports: a call the language server leaves unresolved resolves through the import that binds its
// callee. A namespace import of a Node built-in becomes the quoted module under `node`, a named import
// of a package its package, a relative import the repo definition it names; a name no import binds
// stays unresolved.
async function imports(repo) {
  const { crossings } = require("../out/core/boundary");
  const A = `import * as fs from "node:fs";
import { get } from "axios";
import { helper } from "./util";
const cp = require("child_process");
function a() { fs.readFileSync(p); get(u); helper(); cp.spawn(c); mystery(); }
`;
  const U = "export function helper() {}\n";
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src/a.ts"), A);
  fs.writeFileSync(path.join(repo, "src/util.ts"), U);
  const def = (name, l, c, end) => ({ name, shape: "method", kind: 17, range: sp(l, 0, l, end), selection: sp(l, c, l, c + name.length), children: [] });
  const files = [
    { path: "src/a.ts", language: "javascript", text: A, symbols: [def("a", 4, 9, A.split("\n")[4].length)] },
    { path: "src/util.ts", language: "javascript", text: U, symbols: [def("helper", 0, 16, U.length - 1)] },
  ];
  const g = makeGraph(repo, await bridge(files, async () => []), []);
  const name = new Map(g.nodes.map((n) => [n.id, n.name]));
  const calls = g.edges.filter((e) => e.kind === "call" && e.from.endsWith("/a(0).")).map((e) => `${e.provenance}:${name.get(e.to)}`).sort();
  assert.deepEqual(calls, ['resolved:"child_process".spawn', 'resolved:"fs".readFileSync', "resolved:get", "resolved:helper", "unresolved:mystery"], `calls: ${calls}`);
  assert.ok(g.edges.some((e) => e.kind === "call" && e.from.endsWith("/a(0).") && e.to.endsWith("/helper(0).") && e.to.includes("`util.ts`")), "relative import reaches the repo definition");
  assert.deepEqual(crossings(g).map((c) => `${c.boundary}:${c.package}`), ["network:axios", "process:child_process", "filesystem:fs"], "classified through imports");
}

// Headless: with no language server at all, a same-file call, a call through a relative import and a
// call into a Node built-in all resolve; the CLI lints and draws; the MCP server answers over stdio.
async function headless(repo) {
  const { spawn } = require("node:child_process");
  const { indexHeadless } = require("../out/engine");
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src/a.ts"), 'import * as fs from "node:fs";\nimport { helper } from "./util";\nexport class C { m() { this.n(); } n() {} }\nfunction local() {}\nexport function a() { local(); helper(); fs.readFileSync("x"); new C().m(); }\n');
  fs.writeFileSync(path.join(repo, "src/util.ts"), "export function helper() {}\n");
  fs.writeFileSync(path.join(repo, "m.py"), "import subprocess\ndef run():\n    subprocess.run(['ls'])\n    go()\ndef go():\n    pass\n");
  const { graph: g, languages } = await indexHeadless(repo);
  assert.deepEqual(languages.map((l) => `${l.id}:${l.files}:${l.indexed}`).sort(), ["javascript:2:true", "python:1:true"], "languages");
  const name = new Map(g.nodes.map((n) => [n.id, n.name]));
  const from = (tail) => g.edges.filter((e) => e.kind === "call" && e.from.endsWith(tail)).map((e) => `${e.provenance}:${name.get(e.to)}`).sort();
  // `new C()` is a constructor (dropped, as the editor path drops conversions); `.m()` on the instance has no type to go by.
  assert.deepEqual(from("/a(0)."), ['resolved:"fs".readFileSync', "resolved:helper", "resolved:local", "unresolved:new C().m"], `a: ${from("/a(0).")}`);
  assert.deepEqual(from("C#m(0)."), ["resolved:n"], `this.n: ${from("C#m(0).")}`);
  assert.deepEqual(from("/run(0)."), ["resolved:go", "resolved:run"], `python: ${from("/run(0).")}`);
  const cli = path.join(__dirname, "..", "out", "cli.js");
  const run = (args) => require("node:child_process").spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const first = run(["check", repo, "--json", "--svg"]);
  assert.equal(first.status, 0, first.stderr);
  const report = JSON.parse(first.stdout);
  assert.deepEqual(report.summary, { errors: 0, warnings: 0, info: 0, removed: 0 }, "first lint records the baseline");
  assert.ok(fs.readFileSync(path.join(repo, ".hesperus", "view.svg"), "utf8").includes("Filesystem"), "svg names the boundary");
  fs.appendFileSync(path.join(repo, "src/a.ts"), 'import axios from "axios";\nexport function b() { return axios.get("/"); }\n');
  const second = run(["check", repo, "--index", "--json"]);
  assert.equal(second.status, 0, `warnings alone pass: ${second.stderr}`);
  assert.equal(run(["check", repo, "--max-warnings", "0"]).status, 1, "over the warning limit, exit 1");
  assert.deepEqual(JSON.parse(second.stdout).findings.map((f) => `${f.rule}:${f.boundary}`).sort(), ["new-crossing:network", "new-dependency:network"], "new network crossing");
  // The committed bundle is the same CLI, with nothing from node_modules.
  const bundled = require("node:child_process").spawnSync(process.execPath, [path.join(__dirname, "..", "..", "plugin", "dist", "hesperus.js"), "check", repo, "--index", "--json"], { encoding: "utf8" });
  assert.equal(bundled.status, 0, `dist: ${bundled.stderr}`);
  assert.equal(JSON.parse(bundled.stdout).findings.length, 2, "dist lints the same");
  // MCP over stdio: initialize, list, call.
  const mcp = spawn(process.execPath, [cli, "mcp", repo], { stdio: ["pipe", "pipe", "inherit"] });
  const replies = new Map();
  let buf = "";
  const done = new Promise((resolve) => mcp.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      replies.set(m.id, m);
      if (m.id === 3) resolve();
    }
  }));
  const send = (o) => mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...o }) + "\n");
  send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } } });
  send({ method: "notifications/initialized" });
  send({ id: 2, method: "tools/list" });
  send({ id: 3, method: "tools/call", params: { name: "hesperus_diff", arguments: {} } });
  await done;
  mcp.stdin.end();
  assert.equal(replies.get(1).result.serverInfo.name, "hesperus");
  assert.ok(replies.get(2).result.tools.some((t) => t.name === "hesperus_check"), "tools listed");
  const diff = JSON.parse(replies.get(3).result.content[0].text);
  assert.deepEqual(diff.added.map((f) => f.rule).sort(), ["new-crossing", "new-dependency"], `diff: ${JSON.stringify(diff)}`);
}

// Boundary lint: calls into axios and child_process cross the network and process boundaries; a policy
// denies one, a baseline taken before the second call makes it new, and the boundary view draws both
// boundaries as sinks.
async function boundaries(repo) {
  const { crossings, boundaryGraph } = require("../out/core/boundary");
  const { lint, parsePolicy, snapshot, accept } = require("../out/core/lint");
  const aggregate = require("../out/core/aggregate");
  const { layout } = require("../out/layout");
  const API = "function load() { return axios.get(\"/x\"); }\nfunction run() { spawn(\"ls\"); }\n";
  const lines = API.split("\n");
  const tok = (name) => { const l = lines.findIndex((x) => x.includes(name + "(")), c = lines[l].indexOf(name + "("); return sp(l, c, l, c + name.length); };
  const def = (name, l) => ({ name, shape: "method", kind: 12, range: sp(l, 0, l, lines[l].length), selection: sp(l, 9, l, 9 + name.length), children: [] });
  fs.writeFileSync(path.join(repo, "api.js"), API);
  const make = async (withSpawn) => {
    const sites = [tok("get"), ...(withSpawn ? [tok("spawn")] : [])];
    const outside = { [tok("get").start.character]: { package: "axios", names: ["AxiosInstance", "get"] }, [tok("spawn").start.character]: { package: "node", names: ['"node:child_process"', "spawn"] } };
    const opts = { sites: (f) => (f.path === "api.js" ? sites : []), definitionsOf: async (p, at) => (p === "api.js" && sites.some((s) => s.start.line === at.line && s.start.character === at.character) ? [outside[at.character]] : []) };
    return makeGraph(repo, await bridge([{ path: "api.js", language: "javascript", text: API, symbols: [def("load", 0), def("run", 1)] }], async () => [], opts), []);
  };
  const before = await make(false), g = await make(true);
  assert.deepEqual(crossings(g).map((c) => `${c.boundary}:${c.package}`), ["network:axios", "process:node:child_process"], "classified");
  const policy = parsePolicy(JSON.stringify({ rules: [{ paths: ["api.js"], deny: ["network"], reason: "no I/O here" }] }));
  const r = lint(g, policy, snapshot(before, policy, "c0"));
  const rules = r.findings.map((f) => `${f.rule}:${f.boundary}`).sort();
  assert.deepEqual(rules, ["boundary-denied:network", "new-crossing:process", "new-dependency:process"], `findings: ${rules}`);
  assert.equal(r.findings.find((f) => f.rule === "boundary-denied").severity, "error");
  assert.deepEqual(lint(g, policy, accept(snapshot(before, policy, "c0"), r.findings.map((f) => f.key))).findings.map((f) => f.rule), ["boundary-denied"], "accepted");
  assert.equal(lint(g, policy).findings.filter((f) => f.rule !== "boundary-denied").length, 0, "no baseline, nothing new");
  const bg = boundaryGraph(g);
  const v = aggregate.view(bg, aggregate.overview(bg, aggregate.OVERVIEW_NODES, { flow: true }), { flow: true });
  const laid = await layout(bg, v, { flow: true });
  const sinks = laid.boxes.filter((b) => b.node.kind === "boundary").map((b) => `${b.id}:${b.role}`).sort();
  assert.deepEqual(sinks, ["boundary:network:sink", "boundary:process:sink"], `boundary boxes: ${sinks}`);
  assert.ok(laid.wires.some((w) => w.to === "boundary:network"), "wire to the network");
}

(async () => {
  await init();
  const files = [
    { path: "p.go", language: "go", text: GO, symbols: [fn("a", 1, 16), fn("b", 2, 11)] },
    { path: "m.py", language: "python", text: PY, symbols: [py("a", 0, 7), py("b", 2, 8)] },
    { path: "g.foo", language: "generic", text: PY, symbols: [py("a", 0, 7), py("b", 2, 8)] },
    { path: "q.go", language: "go", text: GO_EXT, symbols: [fn("c", 1, 26)] },
    { path: "f.js", language: "javascript", text: FLAG, symbols: [{ name: "busy", shape: "term", kind: 61, range: sp(0, 0, 0, 16), selection: sp(0, 4, 0, 8), children: [] }, js("go", 1, 9, 11), js("stop", 2, 9, 13)] },
  ];
  // The editor answers a definition lookup at `Println` with a file outside the repo.
  const opts = {
    sites: (f) => (f.path === "q.go" ? [sp(1, 15, 1, 22)] : []),
    definitionsOf: async (p, at) => (p === "q.go" && at.character === 15 ? [{ package: "fmt", names: ["Println"] }] : []),
  };
  const busy = [sp(1, 21, 1, 25), sp(1, 29, 1, 33), sp(2, 22, 2, 26), sp(2, 30, 2, 34)].map((span) => ({ path: "f.js", span }));
  const refs = async (d) => (d.id.endsWith("/busy.") ? busy : d.id.endsWith("/b(0).") ? [{ path: d.path, span: d.path === "p.go" ? sp(1, 11, 1, 12) : sp(1, 4, 1, 5) }] : []);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "hesperus-smoke-"));
  try {
    for (const [name, text] of [["p.go", GO], ["m.py", PY], ["g.foo", PY], ["q.go", GO_EXT], ["f.js", FLAG], ["x.cs", "class X {}\n"]]) fs.writeFileSync(path.join(repo, name), text);
    const make = async () => toJson(makeGraph(repo, await bridge(files, refs, opts), [{ path: "x.cs", reason: "no C# extension" }]));
    const out = await make();
    const g = JSON.parse(out);
    const call = (file, prov) => g.edges.some((e) => e.kind === "call" && e.from.includes(file) && e.from.endsWith("/a(0).") && e.to.endsWith("/b(0).") && e.provenance === prov);
    assert.ok(call("`p.go`", "resolved"), "go call");
    assert.ok(call("`m.py`", "resolved"), "python call");
    assert.ok(call("`g.foo`", "may"), "generic reference");
    assert.equal(g.nodes.find((n) => n.id === "file:x.cs")?.unindexed, true);
    const ext = g.edges.find((e) => e.kind === "call" && e.from.endsWith("/c(0).") && e.provenance === "resolved");
    assert.equal(g.nodes.find((n) => n.id === ext?.to)?.name, "Println", "external call");
    assert.ok(g.edges.some((e) => e.kind === "contains" && e.from === "ext:fmt" && e.to === ext.to), "external package");
    const moves = g.edges.filter((e) => e.kind === "transition").map((e) => `${e.from.split(":").pop()}>${e.to.split(":").pop()}`).sort();
    assert.deepEqual(moves, ["#initial>false", "false>true", "true>false"], "flag machine");
    assert.equal(await make(), out);
    await player(repo);
    for (const [name, test] of [["boundary", boundaries], ["imports", imports], ["headless", headless], ["flow", flowTest]]) {
      const other = fs.mkdtempSync(path.join(os.tmpdir(), `hesperus-${name}-`));
      try {
        await test(other);
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }
    }
    console.log("smoke ok");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
