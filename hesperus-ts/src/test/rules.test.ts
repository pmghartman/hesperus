// A fixture per rule row: every row in the table has a snippet that fires it, and
// fires it with the effect the row declares.

import assert from "node:assert/strict";
import { test } from "node:test";
import { applyRules, Finding } from "../engine.js";
import { factsOf, newProject } from "../facts.js";
import { RULES } from "../rules.js";

const project = newProject();

function run(code: string): Finding[] {
  return applyRules(factsOf(project, "snippet.ts", code));
}

type Expect = Partial<Finding> & { kind: Finding["kind"] };

/** One snippet per rule id, with what it must produce. */
const CASES: Record<string, { code: string; expect: Expect }> = {
  "route.framework": { code: 'import express from "express";\nconst app = express();\napp.get("/users", () => {});\n', expect: { kind: "ingress", protocol: "http", detail: "GET /users" } },
  "route.framework-factory": { code: 'import { Hono } from "hono";\nimport express from "express";\nconst app = express();\n', expect: { kind: "ingress", protocol: "http", detail: "express" } },
  "route.framework-new": { code: 'import { Hono } from "hono";\nconst app = new Hono();\n', expect: { kind: "ingress", protocol: "http" } },
  "route.bun-serve": { code: "Bun.serve({ port: 80, fetch() { return new Response(); } });\n", expect: { kind: "ingress", protocol: "http", detail: "Bun.serve" } },
  "route.serve-adapter": { code: 'import { serve } from "@hono/node-server";\nserve({ fetch: () => new Response() });\n', expect: { kind: "ingress", protocol: "http" } },
  "route.node-http": { code: 'import * as http from "node:http";\nhttp.createServer(() => {}).listen(80);\n', expect: { kind: "ingress", protocol: "http" } },
  "route.pathname-compare": { code: 'declare const url: URL;\nif (url.pathname === "/api/x") {}\n', expect: { kind: "ingress", protocol: "http", detail: "MATCH /api/x" } },
  "route.pathname-prefix": { code: 'declare const url: URL;\nif (url.pathname.startsWith("/api/")) {}\n', expect: { kind: "ingress", protocol: "http", detail: "STARTSWITH /api/" } },
  "ws.server-new": { code: 'import { WebSocketServer } from "ws";\nconst s = new WebSocketServer({ port: 1 });\n', expect: { kind: "ingress", protocol: "ws" } },
  "ws.socketio-call": { code: 'import io from "socket.io";\nconst s = io(3000);\n', expect: { kind: "ingress", protocol: "ws" } },
  "ws.upgrade": { code: "declare const server: { upgrade(r: unknown): boolean };\ndeclare const req: unknown;\nserver.upgrade(req);\n", expect: { kind: "ingress", protocol: "ws" } },
  "ws.bun-serve-option": { code: "Bun.serve({ websocket: { message() {} }, fetch() { return new Response(); } });\n", expect: { kind: "ingress", protocol: "ws" } },
  "ws.server-import": { code: 'import { WebSocket } from "ws";\nexport type T = WebSocket;\n', expect: { kind: "ingress", protocol: "ws" } },
  "ws.client-global": { code: 'const s = new WebSocket("wss://feed.example.com/x");\n', expect: { kind: "by-url", edge: "ws", url: "wss://feed.example.com/x" } },
  "ws.client-ws-package": { code: 'import WebSocket from "ws";\nconst s = new WebSocket("wss://feed.example.com/x");\n', expect: { kind: "by-url", edge: "ws" } },
  "ws.client-socketio": { code: 'import { io } from "socket.io-client";\nconst s = io("https://chat.example.com");\n', expect: { kind: "by-url", edge: "ws", url: "https://chat.example.com" } },
  "http.fetch-global": { code: 'await fetch("https://api.github.com/x");\n', expect: { kind: "by-url", edge: "http", url: "https://api.github.com/x" } },
  "http.fetch-package": { code: 'import fetch from "node-fetch";\nawait fetch("https://api.github.com/x");\n', expect: { kind: "by-url", edge: "http" } },
  "http.axios": { code: 'import axios from "axios";\nawait axios.post("https://hooks.slack.com/x", {});\n', expect: { kind: "by-url", edge: "http", url: "https://hooks.slack.com/x" } },
  "http.got-ky": { code: 'import ky from "ky";\nawait ky.get("https://example.org/");\n', expect: { kind: "by-url", edge: "http" } },
  "http.node-request": { code: 'import https from "node:https";\nhttps.get("https://example.org/", () => {});\n', expect: { kind: "by-url", edge: "http" } },
  "store.postgres.sql": { code: 'import { Pool } from "pg";\nconst p = new Pool();\nawait p.query("SELECT 1");\n', expect: { kind: "store", engine: "postgres", access: "reads" } },
  "store.postgres.sql-tagged": { code: 'import postgres from "postgres";\nconst sql = postgres();\nawait sql`INSERT INTO t VALUES (1)`;\n', expect: { kind: "store", engine: "postgres", access: "writes" } },
  "store.postgres.import": { code: 'import type { Pool } from "pg";\nimport pg from "pg";\nexport const x = pg;\n', expect: { kind: "store", engine: "postgres", access: "unknown" } },
  "store.mysql.sql": { code: 'import mysql from "mysql2/promise";\nconst c = await mysql.createConnection({});\nawait c.execute("DELETE FROM t");\n', expect: { kind: "store", engine: "mysql", access: "writes" } },
  "store.mysql.sql-tagged": { code: 'import mysql from "mysql2";\nconst c = mysql.createConnection({});\nc.query`SELECT 1`;\n', expect: { kind: "store", engine: "mysql", access: "reads" } },
  "store.mysql.import": { code: 'import mysql from "mysql2";\nexport const m = mysql;\n', expect: { kind: "store", engine: "mysql", access: "unknown" } },
  "store.sqlite.sql": { code: 'import { Database } from "bun:sqlite";\nconst db = new Database("x");\ndb.run("insert into t values (1)");\n', expect: { kind: "store", engine: "sqlite", access: "writes" } },
  "store.sqlite.sql-tagged": { code: 'import Database from "better-sqlite3";\nconst db = new Database("x");\ndb.prepare`select 1`;\n', expect: { kind: "store", engine: "sqlite", access: "reads" } },
  "store.sqlite.import": { code: 'import Database from "better-sqlite3";\nexport const D = Database;\n', expect: { kind: "store", engine: "sqlite", access: "unknown" } },
  "store.mongodb.reads": { code: 'import { MongoClient } from "mongodb";\nconst c = new MongoClient("mongodb://x");\nawait c.db("a").collection("b").find({}).toArray();\n', expect: { kind: "store", engine: "mongodb", access: "reads" } },
  "store.mongodb.writes": { code: 'import mongoose from "mongoose";\nconst User = mongoose.model("User");\nawait User.create({});\n', expect: { kind: "store", engine: "mongodb", access: "writes" } },
  "store.mongodb.import": { code: 'import { MongoClient } from "mongodb";\nexport const M = MongoClient;\n', expect: { kind: "store", engine: "mongodb", access: "unknown" } },
  "store.redis.reads": { code: 'import Redis from "ioredis";\nconst r = new Redis();\nawait r.hgetall("k");\n', expect: { kind: "store", engine: "redis", access: "reads" } },
  "store.redis.writes": { code: 'import { createClient } from "redis";\nconst r = createClient();\nawait r.set("k", "v");\n', expect: { kind: "store", engine: "redis", access: "writes" } },
  "store.redis.import": { code: 'import Redis from "ioredis";\nexport const R = Redis;\n', expect: { kind: "store", engine: "redis", access: "unknown" } },
  "store.prisma.sql": { code: 'import { PrismaClient } from "@prisma/client";\nconst prisma = new PrismaClient();\nawait prisma.$queryRawUnsafe("SELECT 1");\n', expect: { kind: "store", engine: "postgres", access: "reads" } },
  "store.prisma.sql-tagged": { code: 'import { PrismaClient } from "@prisma/client";\nconst prisma = new PrismaClient();\nawait prisma.$executeRaw`DELETE FROM t`;\n', expect: { kind: "store", engine: "postgres", access: "writes" } },
  "store.prisma.reads": { code: 'import { PrismaClient } from "@prisma/client";\nconst prisma = new PrismaClient();\nawait prisma.user.findMany();\n', expect: { kind: "store", engine: "postgres", access: "reads" } },
  "store.prisma.writes": { code: 'import { PrismaClient } from "@prisma/client";\nconst prisma = new PrismaClient();\nawait prisma.user.upsert({});\n', expect: { kind: "store", engine: "postgres", access: "writes" } },
  "store.prisma.import": { code: 'import { PrismaClient } from "@prisma/client";\nexport const P = PrismaClient;\n', expect: { kind: "store", engine: "postgres", access: "unknown" } },
  "store.sql.sql": { code: 'import knex from "knex";\nconst db = knex({});\nawait db.raw("UPDATE t SET a = 1");\n', expect: { kind: "store", engine: "sql", access: "writes" } },
  "store.sql.sql-tagged": { code: 'import { sql } from "drizzle-orm";\nconst q = sql`select 1`;\n', expect: { kind: "store", engine: "sql", access: "reads" } },
  "store.sql.reads": { code: 'import { Kysely } from "kysely";\nconst db = new Kysely({});\nawait db.selectFrom("t").execute();\n', expect: { kind: "store", engine: "sql", access: "reads" } },
  "store.sql.writes": { code: 'import { Sequelize } from "sequelize";\nconst s = new Sequelize("x");\nconst M = s.define("m", {});\nawait M.destroy({});\n', expect: { kind: "store", engine: "sql", access: "writes" } },
  "store.sql.import": { code: 'import { Kysely } from "kysely";\nexport type K = Kysely<unknown>;\nexport const k = Kysely;\n', expect: { kind: "store", engine: "sql", access: "unknown" } },
  "io.fs-call": { code: 'import { readFileSync } from "node:fs";\nreadFileSync("x");\n', expect: { kind: "hardware", name: "filesystem" } },
  "io.fs-bun": { code: 'await Bun.write("x", "y");\n', expect: { kind: "hardware", name: "filesystem" } },
  "io.fs-deno": { code: 'await Deno.readTextFile("x");\n', expect: { kind: "hardware", name: "filesystem" } },
  "io.fs-import": { code: 'import fs from "fs";\nexport const f = fs;\n', expect: { kind: "hardware", name: "filesystem" } },
  "io.proc-call": { code: 'import { spawn } from "child_process";\nspawn("ls");\n', expect: { kind: "hardware", name: "processes" } },
  "io.proc-tagged": { code: 'import { $ } from "execa";\nawait $`ls`;\n', expect: { kind: "hardware", name: "processes" } },
  "io.proc-bun": { code: 'Bun.spawn(["ls"]);\n', expect: { kind: "hardware", name: "processes" } },
  "io.proc-deno": { code: 'const c = new Deno.Command("ls");\n', expect: { kind: "hardware", name: "processes" } },
  "io.proc-import": { code: 'import cp from "node:child_process";\nexport const c = cp;\n', expect: { kind: "hardware", name: "processes" } },
};

test("every rule row has a fixture and fires with its declared effect", () => {
  const missing = RULES.map((r) => r.id).filter((id) => !CASES[id]);
  assert.deepEqual(missing, [], "rows without a fixture");
  const unknown = Object.keys(CASES).filter((id) => !RULES.some((r) => r.id === id));
  assert.deepEqual(unknown, [], "fixtures for rows that do not exist");
  for (const [id, c] of Object.entries(CASES)) {
    const findings = run(c.code);
    const hit = findings.find((f) => f.rule === id);
    assert.ok(hit, `${id} did not fire; findings: ${JSON.stringify(findings)}`);
    for (const [k, v] of Object.entries(c.expect)) assert.equal((hit as any)[k], v, `${id}: ${k}`);
  }
});

test("no row fires on code that uses none of the libraries", () => {
  const findings = run('import { helper } from "./helper";\nexport const x = helper().map((v: number) => v + 1);\nconst local = { get: () => 1, query: () => 2 };\nlocal.get();\nlocal.query();\n');
  assert.deepEqual(findings.map((f) => f.kind), ["import"]);
});

test("a receiver's origin flows through construction, calls and member access", () => {
  const findings = run('import { MongoClient } from "mongodb";\nconst client = new MongoClient("mongodb://x");\nconst db = client.db("a");\nconst users = db.collection("users");\nexport const all = () => users.find({});\nexport const add = () => users.insertOne({});\n');
  assert.deepEqual(findings.filter((f) => f.kind === "store").map((f) => (f as any).access), ["reads", "writes"]);
});

test("the table is data: a row added at runtime fires like a built-in one", () => {
  const facts = factsOf(project, "x.ts", 'import { Queue } from "bullmq";\nconst q = new Queue("jobs");\nawait q.add("job", {});\n');
  const extra = [...RULES, { id: "store.bullmq.writes", group: "store:redis", when: { fact: "call" as const, module: ["bullmq"], callee: ["add"] }, effect: { target: "store" as const, engine: "redis", access: "writes" as const } }];
  const findings = applyRules(facts, extra);
  assert.ok(findings.some((f) => f.rule === "store.bullmq.writes"));
});
