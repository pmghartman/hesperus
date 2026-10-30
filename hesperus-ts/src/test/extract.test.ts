// One fixture per heuristic: extract → golden IR; every IR validates against the schema;
// extraction is deterministic.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { TestContext } from "node:test";
import { extract } from "../extract.js";
import { compileGlob, globMatch } from "../glob.js";
import { classifyUrl, sqlAccess } from "../heuristics.js";
import { Ir, toJson } from "../ir.js";
import { unboundComponent } from "../extract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..", "..");
const repoRoot = path.resolve(pkg, "..");
const fixtures = path.join(pkg, "test", "fixtures");
const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "ir.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

function checkSchema(ir: unknown, what: string) {
  const ok = validate(ir);
  assert.ok(ok, `${what} violates ir.schema.json: ${JSON.stringify(validate.errors, null, 2)}`);
}

function golden(file: string, actual: string) {
  if (process.env.UPDATE_GOLDEN) {
    fs.writeFileSync(file, actual);
    return;
  }
  assert.ok(fs.existsSync(file), `missing golden ${file}; run with UPDATE_GOLDEN=1`);
  assert.equal(actual, fs.readFileSync(file, "utf8"), `golden mismatch: ${file}`);
}

const FIXTURES = ["imports", "routes-express", "routes-bun", "http-out", "stores", "websockets", "io", "bindings"];

for (const name of FIXTURES) {
  test(`fixture ${name}`, () => {
    const dir = path.join(fixtures, name);
    const intent = JSON.parse(fs.readFileSync(path.join(dir, "intent.json"), "utf8")) as Ir;
    checkSchema(intent, `${name}/intent.json`);
    const ir = extract(path.join(dir, "repo"), { intent });
    checkSchema(ir, `${name} actual`);
    assert.equal(ir.generated, "hesperus-ts");
    const json = toJson(ir);
    golden(path.join(dir, "expected.json"), json);
    // deterministic: a second run is byte-identical
    assert.equal(toJson(extract(path.join(dir, "repo"), { intent })), json);
  });
}

test("imports: edges follow every resolution path, type-only imports are ignored", () => {
  const dir = path.join(fixtures, "imports");
  const ir = extract(path.join(dir, "repo"), { intent: JSON.parse(fs.readFileSync(path.join(dir, "intent.json"), "utf8")) });
  const keys = ir.edges.map((e) => `${e.from} -> ${e.to}: ${e.kind}`);
  assert.deepEqual(keys, [
    "app.api -> app.lib: calls",
    "app.api -> app.unresolved: calls",
    "app.api -> app.util: calls",
    "app.api -> app.web: calls",
    "app.unbound.scripts -> app.lib: calls",
  ]);
  const dyn = ir.edges.find((e) => e.to === "app.unresolved")!;
  assert.equal(dyn.resolved, false);
  assert.deepEqual(dyn.at, ["src/api/handler.ts:12"]);
  const apiWeb = ir.edges.find((e) => e.from === "app.api" && e.to === "app.web")!;
  // the namespace import and the dynamic import, not the type import
  assert.deepEqual(apiWeb.at, ["src/api/handler.ts:5", "src/api/handler.ts:8"]);
  const apiLib = ir.edges.find((e) => e.from === "app.api" && e.to === "app.lib")!;
  assert.deepEqual(apiLib.at, ["src/api/handler.ts:2", "src/api/handler.ts:6"]);
  assert.ok(ir.nodes.find((n) => n.id === "app.unbound.tools_gen" && n.src[0] === "tools/gen/**"));
  assert.ok(ir.nodes.find((n) => n.id === "app.unbound.scripts"));
});

test("routes: express and Bun servers become one http ingress with route evidence", () => {
  const ex = path.join(fixtures, "routes-express");
  const ir = extract(path.join(ex, "repo"), { intent: JSON.parse(fs.readFileSync(path.join(ex, "intent.json"), "utf8")) });
  const ingress = ir.nodes.find((n) => n.kind === "ingress")!;
  assert.equal(ingress.id, "svc.api", "adopts the intent ingress by protocol");
  assert.equal(ingress.protocol, "http");
  const e = ir.edges.find((x) => x.from === "svc.api" && x.to === "svc.server" && x.kind === "http")!;
  assert.deepEqual(e.at, ["src/server.ts:3", "src/server.ts:4", "src/server.ts:5", "src/server.ts:6", "src/server.ts:7", "src/server.ts:8"]);
  const bun = path.join(fixtures, "routes-bun");
  const ir2 = extract(path.join(bun, "repo"), { intent: JSON.parse(fs.readFileSync(path.join(bun, "intent.json"), "utf8")) });
  const http = ir2.edges.find((x) => x.kind === "http")!;
  assert.equal(http.from, "bunapp.http");
  assert.deepEqual(http.at, ["src/index.ts:2", "src/index.ts:7", "src/index.ts:8", "src/index.ts:10", "src/index.ts:12"]);
  const ws = ir2.edges.find((x) => x.kind === "ws")!;
  assert.equal(ws.from, "bunapp.ws");
  assert.deepEqual(ws.at, ["src/index.ts:2", "src/index.ts:15"]);
});

test("outbound http: literal hosts become externals, relative and loopback calls hit the own ingress, dynamic is unresolved", () => {
  const dir = path.join(fixtures, "http-out");
  const ir = extract(path.join(dir, "repo"), { intent: JSON.parse(fs.readFileSync(path.join(dir, "intent.json"), "utf8")) });
  const ext = ir.nodes.filter((n) => n.kind === "external").map((n) => `${n.id}=${n.host}`);
  assert.deepEqual(ext, ["app.api_github_com=api.github.com", "app.api_openai_com=api.openai.com", "app.example_org=example.org", "app.hooks_slack_com=hooks.slack.com", "app.payments=api.stripe.com"]);
  const own = ir.edges.find((e) => e.to === "app.web")!;
  assert.deepEqual(own.at, ["src/client.ts:10", "src/client.ts:11"]);
  const un = ir.edges.find((e) => e.to === "app.unresolved")!;
  assert.equal(un.resolved, false);
  assert.deepEqual(un.at, ["src/client.ts:12"]);
  const gh = ir.edges.find((e) => e.to === "app.api_github_com")!;
  assert.deepEqual(gh.at, ["src/client.ts:5", "src/client.ts:6"]);
});

test("stores: engines, reads and writes, undecidable access is both and unresolved", () => {
  const dir = path.join(fixtures, "stores");
  const ir = extract(path.join(dir, "repo"), { intent: JSON.parse(fs.readFileSync(path.join(dir, "intent.json"), "utf8")) });
  const stores = ir.nodes.filter((n) => n.kind === "store").map((n) => `${n.id}=${n.engine}`);
  assert.deepEqual(stores, ["app.data.db=postgres", "app.mongodb=mongodb", "app.mysql=mysql", "app.redis=redis", "app.sqlite=sqlite"]);
  const pg = ir.edges.filter((e) => e.from === "app.data.pg");
  assert.deepEqual(pg.map((e) => `${e.kind}${e.resolved ? "" : "?"}`), ["reads?", "writes?"]);
  assert.deepEqual(pg[0].at, ["src/pg.ts:4", "src/pg.ts:6"]);
  const orm = ir.edges.filter((e) => e.from === "app.data.orm").map((e) => `${e.to}:${e.kind}`);
  assert.deepEqual(orm, ["app.data.db:reads", "app.data.db:writes"]);
  const mysql = ir.edges.filter((e) => e.to === "app.mysql");
  assert.equal(mysql.length, 2);
  assert.ok(mysql.every((e) => !e.resolved));
  assert.deepEqual(ir.edges.filter((e) => e.from === "app.data.cache").map((e) => e.kind), ["reads", "writes"]);
  assert.deepEqual(ir.edges.filter((e) => e.from === "app.data.local").map((e) => e.kind), ["reads", "writes"]);
  assert.deepEqual(ir.edges.filter((e) => e.from === "app.data.mongo").map((e) => e.kind), ["reads", "writes"]);
});

test("websockets: servers are a ws ingress, clients reach externals or unresolved", () => {
  const dir = path.join(fixtures, "websockets");
  const ir = extract(path.join(dir, "repo"), { intent: JSON.parse(fs.readFileSync(path.join(dir, "intent.json"), "utf8")) });
  const ws = ir.edges.filter((e) => e.kind === "ws").map((e) => `${e.from} -> ${e.to}${e.resolved ? "" : "?"}`);
  assert.deepEqual(ws, ["rt.client -> rt.feed", "rt.client -> rt.unresolved?", "rt.client -> rt.ws", "rt.ws -> rt.server"]);
  assert.deepEqual(ir.edges.find((e) => e.to === "rt.server")!.at, ["src/server.ts:2", "src/sio.ts:2"]);
});

test("io: filesystem and process access", () => {
  const dir = path.join(fixtures, "io");
  const ir = extract(path.join(dir, "repo"), { intent: JSON.parse(fs.readFileSync(path.join(dir, "intent.json"), "utf8")) });
  const io = ir.edges.filter((e) => e.kind === "io").map((e) => `${e.from} -> ${e.to}`);
  assert.deepEqual(io, ["tool.bun -> tool.filesystem", "tool.bun -> tool.processes", "tool.files -> tool.filesystem", "tool.procs -> tool.processes"]);
  const files = ir.edges.find((e) => e.from === "tool.files")!;
  assert.deepEqual(files.at, ["src/files.ts:3", "src/files.ts:4", "src/import-only.ts:1"]);
  // `hardware disk` in the intent does not bind: hardware binds by name
  assert.ok(!ir.nodes.some((n) => n.id === "tool.disk"));
});

test("bindings: specificity, braces, `?`, adoption inside a subsystem, file layout", () => {
  const dir = path.join(fixtures, "bindings");
  const ir = extract(path.join(dir, "repo"), { intent: JSON.parse(fs.readFileSync(path.join(dir, "intent.json"), "utf8")) });
  const ids = ir.nodes.map((n) => n.id);
  assert.deepEqual(ids, ["sys", "sys.mesh", "sys.mesh.ledger", "sys.mesh.peers", "sys.mesh.store", "sys.mesh.tailscale", "sys.web", "sys.web.pair", "sys.web.short", "sys.web.ui"]);
  assert.deepEqual(ir.files, [{ path: "sys.hesp", root: "sys" }, { path: "mesh.hesp", root: "sys.mesh" }, { path: "web.hesp", root: "sys.web" }]);
  const e = ir.edges.map((x) => `${x.from} -> ${x.to}: ${x.kind}`);
  assert.deepEqual(e, ["sys.mesh.peers -> sys.mesh.store: calls", "sys.mesh.peers -> sys.mesh.tailscale: http", "sys.mesh.store -> sys.mesh.ledger: writes", "sys.web.ui -> sys.web.short: calls"]);
  // util.ts binds to the subsystem itself and produces no component
  assert.ok(!ids.some((i) => i.includes("util")));
});

test("glob matcher", () => {
  const m = (g: string, p: string) => globMatch(compileGlob(g), p);
  assert.ok(m("src/**", "src/a.ts"));
  assert.ok(m("src/**", "src/x/y/z.ts"));
  assert.ok(!m("src/**", "lib/a.ts"));
  assert.ok(m("src/**/*.tsx", "src/a.tsx"));
  assert.ok(m("src/**/*.tsx", "src/deep/er/a.tsx"));
  assert.ok(!m("src/**/*.tsx", "src/a.ts"));
  assert.ok(m("src/*.ts", "src/a.ts"));
  assert.ok(!m("src/*.ts", "src/d/a.ts"));
  assert.ok(m("src/{a,b}.ts", "src/b.ts"));
  assert.ok(!m("src/{a,b}.ts", "src/c.ts"));
  assert.ok(m("src/??.ts", "src/ab.ts"));
  assert.ok(!m("src/??.ts", "src/abc.ts"));
  assert.ok(m("./src/a.ts", "src/a.ts"));
  assert.ok(m("packages/*/src/**", "packages/util/src/index.ts"));
  assert.equal(compileGlob("packages/mesh/**").literalPrefix, "packages/mesh/");
  assert.equal(compileGlob("src/web/{a,b}.ts").literalPrefix, "src/web/");
});

test("url and sql classification, unbound naming", () => {
  assert.deepEqual(classifyUrl("https://api.github.com/x"), { host: "api.github.com", relative: false });
  assert.deepEqual(classifyUrl("wss://Stream.Example.com:443/feed"), { host: "stream.example.com", relative: false });
  assert.deepEqual(classifyUrl("/api/x"), { host: null, relative: true });
  assert.deepEqual(classifyUrl("http://localhost:3000"), { host: null, relative: true });
  assert.deepEqual(classifyUrl("http://[::1]:3000/x"), { host: null, relative: true });
  assert.deepEqual(classifyUrl("https://${host}/x"), { host: null, relative: false });
  assert.deepEqual(classifyUrl(null), { host: null, relative: false });
  assert.equal(sqlAccess("  SELECT 1"), "reads");
  assert.equal(sqlAccess("with x as (select 1) select * from x"), "reads");
  assert.equal(sqlAccess("INSERT INTO t"), "writes");
  assert.equal(sqlAccess("DELETE FROM t"), "writes");
  assert.equal(sqlAccess("CREATE TABLE t"), "writes");
  assert.equal(sqlAccess("whatever"), "unknown");
  assert.equal(unboundComponent("scripts/build.ts"), "scripts");
  assert.equal(unboundComponent("apps/web/tests/x.ts"), "apps_web");
  assert.equal(unboundComponent("index.ts"), "root");
  assert.equal(unboundComponent("a/b.ts"), "a");
});

test("the Phosphorus intent and actual IR validate against the schema (when hesp and the repo are present)", (t: TestContext) => {
  const hesp = process.env.HESP_BIN ?? path.join(repoRoot, "target", "debug", "hesp");
  // a sibling of the checkout, or of the main repository when this is a worktree under .claude/worktrees
  const phosphorus = process.env.PHOSPHORUS_REPO ?? [path.resolve(repoRoot, "..", "phosphorus"), path.resolve(repoRoot, "..", "..", "..", "..", "phosphorus")].find((p) => fs.existsSync(p)) ?? path.resolve(repoRoot, "..", "phosphorus");
  if (!fs.existsSync(hesp)) {
    t.skip(`no hesp binary at ${hesp}; set HESP_BIN`);
    return;
  }
  const intentJson = execFileSync(hesp, ["ir", path.join(repoRoot, "examples", "phosphorus", "phosphorus.hesp")], { encoding: "utf8" });
  const intent = JSON.parse(intentJson) as Ir;
  checkSchema(intent, "phosphorus intent IR");
  if (!fs.existsSync(phosphorus)) {
    t.skip(`no Phosphorus checkout at ${phosphorus}; set PHOSPHORUS_REPO`);
    return;
  }
  const actual = extract(phosphorus, { intent });
  checkSchema(actual, "phosphorus actual IR");
  assert.ok(actual.nodes.length > 40);
  assert.ok(actual.edges.some((e) => e.from === "phosphorus.server.server" && e.to === "phosphorus.mesh.peers" && e.kind === "calls"));
  assert.ok(actual.nodes.some((n) => n.id === "phosphorus.tailscale" && n.host === "api.tailscale.com"), "adopts the intent external by host");
  assert.equal(toJson(actual), toJson(extract(phosphorus, { intent })));
});
