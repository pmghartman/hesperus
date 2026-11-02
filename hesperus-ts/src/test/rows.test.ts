// The trace rows: router mount prefixes, middleware chains, Bun `routes` objects, timers,
// event handlers and emits, configuration reads. Golden on the flow-rows fixture.

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { flow, toFlowJson } from "../flow.js";
import { findEntry, renderEntry } from "../query.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..", "..");
const repoRoot = path.resolve(pkg, "..");
const dir = path.join(pkg, "test", "fixtures", "flow-rows");
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "flow.schema.json"), "utf8")));

test("rows: mounts, chains, route objects, timers, events, env reads", () => {
  const f = flow(path.join(dir, "repo"), { intent: null, rootName: "rows" });
  assert.ok(validate(f), JSON.stringify(validate.errors, null, 2));
  const json = toFlowJson(f);
  const golden = path.join(dir, "flow.json");
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(golden, json);
  else assert.equal(json, fs.readFileSync(golden, "utf8").replace(/\r\n/g, "\n"), "golden mismatch");
  assert.deepEqual(
    f.entries.map((e) => `${e.kind} ${e.label} -> ${e.unit}`),
    [
      // the router mounted at /api prefixes its routes; a route with two handlers is one entry
      "route GET /api/items -> src/items.ts#list",
      "route POST /api/items -> src/auth.ts#auth",
      "route GET /health -> src/app.ts#anonymous",
      "event on tick -> src/app.ts#sweep",
      "event on created -> src/events.ts#onCreated",
      // Bun: the fetch handler, the routes object (plain and per-method), the pathname match inside fetch
      "route Bun.serve -> src/bun.ts#serve.fetch",
      "route GET /api/users -> src/routes.ts#listUsers",
      "route POST /api/users -> src/routes.ts#addUser",
      "route ROUTE /api/status -> src/routes.ts#routes./api/status",
      "route MATCH /legacy -> src/bun.ts#serve.fetch",
      // a shebang file is a module entry; the function it hands to setInterval is a timer step
      "module daemon.ts -> src/daemon.ts#<module>",
    ],
  );
  const daemon = findEntry(f, "daemon.ts");
  assert.ok(daemon && !("ambiguous" in daemon));
  assert.equal(renderEntry(f, daemon), ["module daemon.ts  @src/daemon.ts:1", "  src/daemon.ts#<module> [src]  @src/daemon.ts:1", "    (timer) onCreated [src]  @src/daemon.ts:3 -> src/events.ts:3", "      -> config PORT (rows.env) reads  @src/events.ts:4", ""].join("\n"));
  const post = findEntry(f, "POST /api/items");
  assert.ok(post && !("ambiguous" in post));
  assert.equal(
    renderEntry(f, post),
    ["route POST /api/items  @src/app.ts:9", "  src/auth.ts#auth [src]  @src/auth.ts:1", "    -> config API_TOKEN (rows.env) reads  @src/auth.ts:2", "    (next) create [src]  @src/app.ts:9 -> src/items.ts:6", "      -> store postgres (rows.postgres) writes  @src/items.ts:7", ""].join("\n"),
  );
  // the event handler reached through an emit, on a bus declared in another file
  const tick = findEntry(f, "on tick");
  assert.ok(tick && !("ambiguous" in tick));
  assert.equal(renderEntry(f, tick), ["event on tick  @src/app.ts:17", "  src/app.ts#sweep [src]  @src/app.ts:13", "    (event) onCreated [src]  @src/app.ts:14 -> src/events.ts:3", "      -> config PORT (rows.env) reads  @src/events.ts:4", ""].join("\n"));
  // env reads are one crossing per variable per function; the unit table carries end lines
  const auth = f.units.find((u) => u.id === "src/auth.ts#auth")!;
  assert.deepEqual([auth.line, auth.end], [1, 3]);
});

test("rows: the steps of a timer or an emit carry `how`, plain calls do not", () => {
  const f = flow(path.join(dir, "repo"), { intent: null, rootName: "rows" });
  const hows = new Set<string>();
  const walk = (steps: typeof f.entries[number]["steps"]) => {
    for (const s of steps) {
      if ("call" in s) {
        hows.add(s.how ?? "call");
        if (s.steps) walk(s.steps);
      }
    }
  };
  for (const e of f.entries) walk(e.steps);
  // this fixture has no plain repository call on an entry path: every step is a chain, timer or event hop
  assert.deepEqual([...hows].sort(), ["event", "next", "timer"]);
  const plain = flow(path.join(pkg, "test", "fixtures", "flow", "repo"), { intent: null, rootName: "shop" });
  hows.clear();
  for (const e of plain.entries) walk(e.steps);
  assert.deepEqual([...hows], ["call"]);
});
