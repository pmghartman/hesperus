// The flow: entry points, the calls they reach in source order, the crossings that end
// each path. Golden against docs/flow.schema.json; deterministic; bounded.

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { flow, FlowCall, FlowCrossing, FlowStep, toFlowJson } from "../flow.js";
import { Ir } from "../ir.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..", "..");
const repoRoot = path.resolve(pkg, "..");
const fixtures = path.join(pkg, "test", "fixtures");
const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "flow.schema.json"), "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

function golden(file: string, actual: string) {
  if (process.env.UPDATE_GOLDEN) {
    fs.writeFileSync(file, actual);
    return;
  }
  assert.ok(fs.existsSync(file), `missing golden ${file}; run with UPDATE_GOLDEN=1`);
  assert.equal(actual, fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"), `golden mismatch: ${file}`);
}

const isCall = (s: FlowStep): s is FlowCall => "call" in s;
const isCrossing = (s: FlowStep): s is FlowCrossing => "boundary" in s;
/** `callee > callee > boundary:node` lines, one per leaf, in order. */
function paths(steps: FlowStep[], prefix: string[] = []): string[] {
  const out: string[] = [];
  for (const s of steps) {
    if (isCrossing(s)) out.push([...prefix, `${s.boundary}:${s.node}:${s.edge}`].join(" > "));
    else {
      const name = s.call.slice(s.call.indexOf("#") + 1) + (s.cut ? `[${s.cut}]` : "");
      if (s.steps?.length) out.push(...paths(s.steps, [...prefix, name]));
      else out.push([...prefix, name].join(" > "));
    }
  }
  return out;
}

test("flow fixture: two routes reach a store and an external host through two levels of calls", () => {
  const dir = path.join(fixtures, "flow");
  const intent = JSON.parse(fs.readFileSync(path.join(dir, "intent.json"), "utf8")) as Ir;
  const f = flow(path.join(dir, "repo"), { intent });
  assert.ok(validate(f), `flow violates flow.schema.json: ${JSON.stringify(validate.errors, null, 2)}`);
  const json = toFlowJson(f);
  golden(path.join(dir, "flow.json"), json);
  assert.equal(toFlowJson(flow(path.join(dir, "repo"), { intent })), json, "deterministic");

  assert.deepEqual(
    f.entries.map((e) => `${e.kind} ${e.label} -> ${e.unit} @${e.at}`),
    ["module cli.ts -> src/cli.ts#<module> @src/cli.ts:1", "route GET /users -> src/handlers/users.ts#listUsers @src/server.ts:5", "route POST /orders -> src/handlers/orders.ts#createOrder @src/server.ts:6", "route GET /health -> src/server.ts#anonymous @src/server.ts:7"],
  );
  const users = f.entries.find((e) => e.label === "GET /users")!;
  // source order: the store through findUsers, then the audit log; the store adopts the intent's `db`
  assert.deepEqual(paths(users.steps), ["findUsers > store:shop.db:reads", "audit > hardware:shop.filesystem:io"]);
  const orders = f.entries.find((e) => e.label === "POST /orders")!;
  assert.deepEqual(paths(orders.steps), ["charge > external:shop.stripe:http", "saveOrder > store:shop.db:writes", "audit > hardware:shop.filesystem:io"]);
  // every step carries a call site; the crossing carries the line of the boundary call
  const charge = orders.steps.find((s) => isCall(s) && s.call.endsWith("#charge")) as FlowCall;
  assert.equal(charge.at, "src/handlers/orders.ts:5");
  assert.equal((charge.steps![0] as FlowCrossing).at, "src/pay/stripe.ts:2");
  assert.equal((charge.steps![0] as FlowCrossing).label, "api.stripe.com");
  // an inline handler is a unit of its own, named by its position
  const health = f.entries.find((e) => e.label === "GET /health")!;
  assert.deepEqual(paths(health.steps), ["health"]);
  // the bin/shebang module runs main, which reaches the store without any route
  const cli = f.entries.find((e) => e.kind === "module")!;
  assert.deepEqual(paths(cli.steps), ["main > findUsers > store:shop.db:reads"]);
  assert.ok(!f.entries.some((e) => e.kind === "main"), "main is not a second entry when its module already is one");
  // units carry the owner the actual IR gives their file
  const owners = Object.fromEntries(f.units.map((u) => [u.id, u.owner]));
  assert.equal(owners["src/handlers/users.ts#listUsers"], "shop.handlers");
  assert.equal(owners["src/db/users.ts#findUsers"], "shop.data");
  assert.equal(owners["src/pay/stripe.ts#charge"], "shop.pay");
  assert.equal(owners["src/cli.ts#main"], "shop.unbound.src");
  assert.equal(f.units.find((u) => u.id === "src/server.ts#anonymous")!.line, 7);
});

test("flow is bounded: cycles, repeats and the depth limit are cut and marked", () => {
  const dir = path.join(fixtures, "flow");
  const f = flow(path.join(dir, "repo"), { intent: null, depth: 1 });
  const users = f.entries.find((e) => e.label === "GET /users")!;
  assert.deepEqual(paths(users.steps), ["findUsers[depth]", "audit[depth]"]);
  // the extractor's own code has recursion: a step on its path is cut as a cycle, a repeat as seen
  const self = flow(pkg, { intent: null, rootName: "ts" });
  assert.ok(validate(self), JSON.stringify(validate.errors));
  const all = JSON.stringify(self);
  assert.ok(all.includes('"cut": "cycle"') || all.includes('"cut":"cycle"'), "a recursive call is cut");
  assert.ok(all.includes('"cut":"seen"'), "a repeated callee is cut");
  const cli = self.entries.find((e) => e.kind === "module" && e.label === "cli.ts")!;
  assert.ok(cli, "the bin entry of this package");
  assert.ok(paths(cli.steps).some((p) => p.startsWith("main > ")), "the module runs main");
  assert.ok(self.entries.every((e) => countSteps(e.steps) <= self.limits.steps));
  assert.equal(JSON.stringify(flow(pkg, { intent: null, rootName: "ts" })), all, "deterministic on a real package");
});

function countSteps(steps: FlowStep[]): number {
  let n = 0;
  for (const s of steps) n += 1 + (isCall(s) && s.steps ? countSteps(s.steps) : 0);
  return n;
}
