// The questions: entries, one entry as text, reaches, check, and boundaries against a git
// revision on a throwaway repository; the cache is used only while it is fresh.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Ir } from "../ir.js";
import { changedFiles, diffFlows, findEntry, flowAt, loadFlow, reaches, renderConstraints, renderDiff, renderEntries, renderEntry, renderReaches, summarize } from "../query.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..", "..");
const fixture = path.join(pkg, "test", "fixtures", "flow");
const intent = JSON.parse(fs.readFileSync(path.join(fixture, "intent.json"), "utf8")) as Ir;

test("entries, one entry as a tree, reaches and check read as text", () => {
  const { flow: f } = loadFlow(path.join(fixture, "repo"), { intent, cache: null });
  const entries = renderEntries(f);
  assert.match(entries, /^route:src\/handlers\/users\.ts#listUsers\n  route GET \/users  @src\/server\.ts:5  3 functions  -> store shop\.db reads, hardware shop\.filesystem io$/m);
  assert.match(entries, /route GET \/health  @src\/server\.ts:7  2 functions  \(stays inside the program\)/);
  const orders = findEntry(f, "post /orders");
  assert.ok(orders && !("ambiguous" in orders));
  assert.equal(
    renderEntry(f, orders),
    [
      "route POST /orders  @src/server.ts:6",
      "  src/handlers/orders.ts#createOrder [handlers]  @src/handlers/orders.ts:4",
      "    charge [pay]  @src/handlers/orders.ts:5 -> src/pay/stripe.ts:1",
      "      -> external api.stripe.com (shop.stripe) http  @src/pay/stripe.ts:2",
      "    saveOrder [data]  @src/handlers/orders.ts:6 -> src/db/orders.ts:3",
      "      -> store Orders and users (shop.db) writes  @src/db/orders.ts:4",
      "    audit [handlers]  @src/handlers/orders.ts:7 -> src/handlers/audit.ts:2",
      "      -> hardware Filesystem (shop.filesystem) io  @src/handlers/audit.ts:3",
      "",
    ].join("\n"),
  );
  assert.deepEqual(summarize(f, orders).boundaries, ["external shop.stripe http", "store shop.db writes", "hardware shop.filesystem io"]);
  const amb = findEntry(f, "handlers");
  assert.ok(amb && "ambiguous" in amb && amb.ambiguous.length === 2, "both handlers match by unit path");
  assert.equal(findEntry(f, "nothing"), null);
  const hits = reaches(f, "src/handlers/audit.ts", 3);
  assert.equal(renderReaches(f, "src/handlers/audit.ts", 3, hits), "src/handlers/audit.ts:3: reached by 2 entries\n  route:src/handlers/users.ts#listUsers\n    route GET /users via audit\n  route:src/handlers/orders.ts#createOrder\n    route POST /orders via audit\n");
  assert.equal(renderReaches(f, "src/nowhere.ts", undefined, reaches(f, "src/nowhere.ts")), "src/nowhere.ts: no entry point reaches it\n");
  assert.equal(
    renderConstraints(f),
    ["x  forbid shop.data -> shop.db: writes", "     src/db/orders.ts:4  (route:src/handlers/orders.ts#createOrder)", "ok forbid shop.handlers -> shop.db", "ok require shop.pay -> shop.stripe: http", "     src/pay/stripe.ts:2  (route:src/handlers/orders.ts#createOrder)", "x  require shop.server -> shop.pay", ""].join("\n"),
  );
});

test("the cache is used while it is newer than every source file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hesp-cache-"));
  try {
    fs.cpSync(path.join(fixture, "repo"), dir, { recursive: true });
    const cache = path.join(dir, ".hesperus", "actual", "flow.json");
    const first = loadFlow(dir, { intent, cache });
    assert.equal(first.cached, false);
    assert.ok(fs.existsSync(cache));
    assert.equal(loadFlow(dir, { intent, cache }).cached, true);
    // touch a source file into the future: stale
    const f = path.join(dir, "src", "server.ts");
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(f, future, future);
    assert.equal(loadFlow(dir, { intent, cache }).cached, false);
    assert.equal(loadFlow(dir, { intent, cache, fresh: true }).cached, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("boundaries --since: what a change newly reaches, and which entries the changed files sit under", (t) => {
  if (spawnSync("git", ["--version"]).status !== 0) {
    t.skip("no git");
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hesp-since-"));
  try {
    fs.cpSync(path.join(fixture, "repo"), dir, { recursive: true });
    const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    // the change: audit now also posts to Slack, and a new route appears
    const audit = path.join(dir, "src", "handlers", "audit.ts");
    fs.writeFileSync(audit, fs.readFileSync(audit, "utf8") + '\nexport async function notify(what: string) {\n  await fetch("https://hooks.slack.com/x", { method: "POST", body: what });\n}\n');
    const users = path.join(dir, "src", "handlers", "users.ts");
    fs.writeFileSync(users, fs.readFileSync(users, "utf8").replace('audit("list", users.length);', 'audit("list", users.length);\n  await notify("list");').replace('import { audit } from "./audit";', 'import { audit, notify } from "./audit";'));
    const server = path.join(dir, "src", "server.ts");
    fs.writeFileSync(server, fs.readFileSync(server, "utf8").replace("app.listen(3000);", 'app.get("/ping", (_req, res) => res.json(1));\napp.listen(3000);'));
    const after = loadFlow(dir, { intent, cache: null, rootName: "shop" }).flow;
    const before = flowAt(dir, "HEAD", { intent, rootName: "shop" });
    const changed = changedFiles(dir, "HEAD");
    assert.deepEqual(changed, ["src/handlers/audit.ts", "src/handlers/users.ts", "src/server.ts"]);
    const d = diffFlows(before, after, "HEAD", changed);
    assert.deepEqual(
      d.addedCrossings.map((c) => `${c.label}: ${c.boundary} ${c.node} ${c.edge} from ${c.unit} @${c.at}`),
      ["GET /users: external shop.hooks_slack_com http from src/handlers/audit.ts#notify @src/handlers/audit.ts:7"],
    );
    assert.deepEqual(d.removedCrossings, []);
    assert.deepEqual(d.addedEntries.map((e) => e.label), ["GET /ping"]);
    assert.deepEqual(d.removedEntries, []);
    assert.deepEqual(
      d.affected.map((a) => `${a.file}: ${a.entries.join(", ")}`),
      [
        "src/handlers/audit.ts: route:src/handlers/users.ts#listUsers, route:src/handlers/orders.ts#createOrder",
        "src/handlers/users.ts: route:src/handlers/users.ts#listUsers",
        // the inline handlers live in server.ts, so the file is under both anonymous routes
        "src/server.ts: route:src/server.ts#anonymous, route:src/server.ts#anonymous@13",
      ],
    );
    const textOut = renderDiff(diffFlows(before, after, "HEAD", [...changed, "src/unused.ts"]));
    assert.match(textOut, /^since HEAD: 4 source files changed\n/);
    assert.match(textOut, /src\/unused\.ts is under no entry point/);
    assert.match(textOut, /newly reached:\n  \+ GET \/users: external shop\.hooks_slack_com http/);
    assert.match(textOut, /new entry points:\n  \+ route GET \/ping  @src\/server\.ts:13/);
    // the same revision compared with itself changes nothing
    const same = diffFlows(before, before, "HEAD", []);
    assert.match(renderDiff(same), /nothing new leaves the program/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
