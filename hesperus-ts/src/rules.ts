// THE TABLE. Every piece of framework and library knowledge the extractor has is a row
// here. Adding a framework is adding rows; adding a language is a new frontend that
// emits the same facts (see facts.ts) plus rows for that ecosystem's libraries.
//
// A row matches one fact (a call, a construction, a tagged template, a string
// comparison, an object property, or an import) by where its receiver came from
// (`module` and `symbol` of the import binding, `<global>` for undeclared identifiers,
// `<any>` for anything) and by the name at the call site, then classifies argument 0 if
// asked, and produces one effect. Per fact, the first matching row of each `group` fires
// (so one `Bun.serve({ websocket })` call is both an http and a ws ingress). `fallback` rows fire
// only when the file imports one of their modules and no other row of the same
// `group` fired in that file.



export type FactKind = "call" | "new" | "tagged" | "compare" | "property" | "import";

export interface Match {
  fact: FactKind;
  /** Origin module(s) of the receiver; `<global>`, `<local>`, `<any>`. For `import` facts: the specifier. */
  module: string[] | "<any>";
  /** Origin symbol(s): `default`, `*`, an export name, or a global's name. Absent: any. */
  symbol?: string[];
  /** Name at the call site (method, function, constructor, tag). Absent: any. */
  callee?: string[];
  /** Regular expression the receiver text (or compare subject) must match; `.+` means "has a receiver", `<none>` means a bare call. */
  receiver?: string;
  /** What argument 0 (or the compare literal / tagged head) must be: a route (`/...`), a url, sql, or an object literal holding `key`. */
  arg0?: "route" | "url" | "sql" | "object";
  key?: string;
  /** For `property` facts: the name of the call the object literal is passed to must match. */
  inCall?: string;
}

export type Effect =
  /** Traffic enters the component: `ingress` → component. */
  | { target: "ingress"; protocol: "http" | "ws" }
  /** The component reaches out by url: `external` by host, the own ingress for relative or loopback urls, else `network unresolved`. */
  | { target: "by-url"; edge: "http" | "ws" }
  /** A store: `reads`/`writes` from a SQL verb, a fixed access, or unknown (both, unresolved). */
  | { target: "store"; engine: string; access: "sql" | "reads" | "writes" | "unknown" }
  /** A hardware resource by name, `io` edge. */
  | { target: "hardware"; name: string; label: string };

export interface Rule {
  /** Stable id, named in fixtures and in `hesperus-ts explain`. */
  id: string;
  when: Match;
  effect: Effect;
  /** Fallback rows fire on an import alone when nothing else in the group did. */
  fallback?: boolean;
  group: string;
}

const ROUTE_METHODS = ["get", "post", "put", "delete", "patch", "options", "head", "all", "use", "route"];
const HTTP_FRAMEWORKS = ["express", "koa", "@koa/router", "koa-router", "hono", "fastify", "elysia", "polka", "restify", "itty-router", "@hapi/hapi", "h3", "oak"];
const NODE_HTTP = ["http", "node:http", "https", "node:https", "http2", "node:http2"];
const FS = ["fs", "node:fs", "fs/promises", "node:fs/promises", "fs-extra", "graceful-fs"];
const PROC = ["child_process", "node:child_process", "execa", "cross-spawn", "zx"];
const SQL_METHODS = ["query", "execute", "prepare", "run", "exec", "get", "all", "unsafe", "sql", "raw"];

const POSTGRES = ["pg", "postgres", "pg-promise", "@vercel/postgres", "@neondatabase/serverless"];
const MYSQL = ["mysql", "mysql2", "mysql2/promise", "@planetscale/database"];
const SQLITE = ["better-sqlite3", "bun:sqlite", "sqlite3", "sqlite", "node:sqlite", "@libsql/client"];
const MONGO = ["mongodb", "mongoose"];
const REDIS = ["redis", "ioredis", "@upstash/redis", "@redis/client"];
const PRISMA = ["@prisma/client"];
const QUERY_BUILDERS = ["knex", "kysely", "drizzle-orm", "typeorm", "sequelize"];
const WS_SERVER = ["ws", "socket.io", "uWebSockets.js", "@fastify/websocket", "hono/ws", "graphql-ws"];

function store(engine: string, modules: string[], reads: string[], writes: string[], sql: string[] = []): Rule[] {
  const rows: Rule[] = [];
  const group = `store:${engine}`;
  if (sql.length) rows.push({ id: `store.${engine}.sql`, when: { fact: "call", module: modules, callee: sql, arg0: "sql" }, effect: { target: "store", engine, access: "sql" }, group });
  if (sql.length) rows.push({ id: `store.${engine}.sql-tagged`, when: { fact: "tagged", module: modules }, effect: { target: "store", engine, access: "sql" }, group });
  if (reads.length) rows.push({ id: `store.${engine}.reads`, when: { fact: "call", module: modules, callee: reads }, effect: { target: "store", engine, access: "reads" }, group });
  if (writes.length) rows.push({ id: `store.${engine}.writes`, when: { fact: "call", module: modules, callee: writes }, effect: { target: "store", engine, access: "writes" }, group });
  rows.push({ id: `store.${engine}.import`, when: { fact: "import", module: modules }, effect: { target: "store", engine, access: "unknown" }, fallback: true, group });
  return rows;
}

export const RULES: Rule[] = [
  // ---- HTTP servers and routes → ingress http
  { id: "route.framework", when: { fact: "call", module: HTTP_FRAMEWORKS, callee: ROUTE_METHODS, arg0: "route" }, effect: { target: "ingress", protocol: "http" }, group: "ingress:http" },
  { id: "route.framework-factory", when: { fact: "call", module: HTTP_FRAMEWORKS, symbol: ["default", "Router", "Hono", "Koa", "fastify", "Fastify", "Elysia", "polka", "createApp", "createRouter"], receiver: "<none>" }, effect: { target: "ingress", protocol: "http" }, group: "ingress:http" },
  { id: "route.framework-new", when: { fact: "new", module: HTTP_FRAMEWORKS }, effect: { target: "ingress", protocol: "http" }, group: "ingress:http" },
  { id: "route.bun-serve", when: { fact: "call", module: ["<global>"], symbol: ["Bun", "Deno"], callee: ["serve"] }, effect: { target: "ingress", protocol: "http" }, group: "ingress:http" },
  { id: "route.serve-adapter", when: { fact: "call", module: ["@hono/node-server", "srvx", "bun"], symbol: ["serve"] }, effect: { target: "ingress", protocol: "http" }, group: "ingress:http" },
  { id: "route.node-http", when: { fact: "call", module: NODE_HTTP, callee: ["createServer", "createSecureServer"] }, effect: { target: "ingress", protocol: "http" }, group: "ingress:http" },
  { id: "route.pathname-compare", when: { fact: "compare", module: "<any>", receiver: "pathname$|^path$|^route$|\\.url$", arg0: "route" }, effect: { target: "ingress", protocol: "http" }, group: "ingress:http" },
  { id: "route.pathname-prefix", when: { fact: "call", module: "<any>", callee: ["startsWith"], receiver: "pathname$", arg0: "route" }, effect: { target: "ingress", protocol: "http" }, group: "ingress:http" },
  // ---- WebSocket servers → ingress ws
  { id: "ws.server-new", when: { fact: "new", module: WS_SERVER, callee: ["WebSocketServer", "Server", "SocketServer", "WebSocket.Server"] }, effect: { target: "ingress", protocol: "ws" }, group: "ws" },
  { id: "ws.socketio-call", when: { fact: "call", module: ["socket.io"], symbol: ["default"] }, effect: { target: "ingress", protocol: "ws" }, group: "ws" },
  { id: "ws.upgrade", when: { fact: "call", module: "<any>", callee: ["upgrade"], receiver: ".+" }, effect: { target: "ingress", protocol: "ws" }, group: "ws" },
  { id: "ws.bun-serve-option", when: { fact: "call", module: ["<global>"], symbol: ["Bun", "Deno"], callee: ["serve"], arg0: "object", key: "websocket" }, effect: { target: "ingress", protocol: "ws" }, group: "ws" },
  { id: "ws.server-import", when: { fact: "import", module: WS_SERVER }, effect: { target: "ingress", protocol: "ws" }, fallback: true, group: "ws" },
  // ---- WebSocket clients → external by host / own ingress / unresolved
  { id: "ws.client-global", when: { fact: "new", module: ["<global>"], symbol: ["WebSocket"] }, effect: { target: "by-url", edge: "ws" }, group: "ws" },
  { id: "ws.client-ws-package", when: { fact: "new", module: ["ws", "isomorphic-ws"], callee: ["WebSocket", "default"] }, effect: { target: "by-url", edge: "ws" }, group: "ws" },
  { id: "ws.client-socketio", when: { fact: "call", module: ["socket.io-client"], symbol: ["default", "io"] }, effect: { target: "by-url", edge: "ws" }, group: "ws" },
  // ---- outbound HTTP → external by host / own ingress / unresolved
  { id: "http.fetch-global", when: { fact: "call", module: ["<global>"], symbol: ["fetch"] }, effect: { target: "by-url", edge: "http" }, group: "http" },
  { id: "http.fetch-package", when: { fact: "call", module: ["node-fetch", "cross-fetch", "isomorphic-fetch", "undici"], callee: ["fetch", "request", "default"] }, effect: { target: "by-url", edge: "http" }, group: "http" },
  { id: "http.axios", when: { fact: "call", module: ["axios"], callee: ["axios", "get", "post", "put", "patch", "delete", "head", "request"] }, effect: { target: "by-url", edge: "http" }, group: "http" },
  { id: "http.got-ky", when: { fact: "call", module: ["got", "ky", "superagent", "needle", "phin"], callee: ["got", "ky", "get", "post", "put", "patch", "delete", "head", "superagent", "needle", "phin"] }, effect: { target: "by-url", edge: "http" }, group: "http" },
  { id: "http.node-request", when: { fact: "call", module: NODE_HTTP, callee: ["request", "get"] }, effect: { target: "by-url", edge: "http" }, group: "http" },
  // ---- stores
  ...store("postgres", POSTGRES, [], [], SQL_METHODS),
  ...store("mysql", MYSQL, [], [], SQL_METHODS),
  ...store("sqlite", SQLITE, [], [], SQL_METHODS),
  ...store(
    "mongodb",
    MONGO,
    ["find", "findOne", "findById", "aggregate", "countDocuments", "count", "distinct", "estimatedDocumentCount", "exists"],
    ["insertOne", "insertMany", "updateOne", "updateMany", "deleteOne", "deleteMany", "replaceOne", "bulkWrite", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace", "create", "save", "findByIdAndUpdate", "findByIdAndDelete", "insert"],
  ),
  ...store(
    "redis",
    REDIS,
    ["get", "mget", "hget", "hgetall", "hmget", "exists", "keys", "scan", "smembers", "sismember", "lrange", "llen", "zrange", "zscore", "ttl", "type", "subscribe"],
    ["set", "setex", "del", "hset", "hdel", "incr", "decr", "incrby", "expire", "lpush", "rpush", "lpop", "rpop", "sadd", "srem", "zadd", "zrem", "publish", "flushall", "flushdb", "mset", "setnx"],
  ),
  ...store(
    "postgres",
    PRISMA,
    ["findMany", "findUnique", "findFirst", "findUniqueOrThrow", "findFirstOrThrow", "count", "aggregate", "groupBy"],
    ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"],
    ["$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"],
  ).map((r) => ({ ...r, id: r.id.replace("store.postgres", "store.prisma") })),
  ...store("sql", QUERY_BUILDERS, ["select", "selectFrom", "find", "findOne", "findAll", "findMany", "count"], ["insert", "insertInto", "update", "updateTable", "delete", "deleteFrom", "save", "create", "destroy", "upsert"], ["raw", "query", "execute", "run"]),
  // ---- filesystem and processes → hardware, io
  { id: "io.fs-call", when: { fact: "call", module: FS }, effect: { target: "hardware", name: "filesystem", label: "Filesystem" }, group: "fs" },
  { id: "io.fs-bun", when: { fact: "call", module: ["<global>"], symbol: ["Bun"], callee: ["file", "write"] }, effect: { target: "hardware", name: "filesystem", label: "Filesystem" }, group: "fs" },
  { id: "io.fs-deno", when: { fact: "call", module: ["<global>"], symbol: ["Deno"], callee: ["readTextFile", "readFile", "writeTextFile", "writeFile", "open", "stat", "readDir", "remove", "mkdir"] }, effect: { target: "hardware", name: "filesystem", label: "Filesystem" }, group: "fs" },
  { id: "io.fs-import", when: { fact: "import", module: FS }, effect: { target: "hardware", name: "filesystem", label: "Filesystem" }, fallback: true, group: "fs" },
  { id: "io.proc-call", when: { fact: "call", module: PROC }, effect: { target: "hardware", name: "processes", label: "OS processes" }, group: "proc" },
  { id: "io.proc-tagged", when: { fact: "tagged", module: PROC }, effect: { target: "hardware", name: "processes", label: "OS processes" }, group: "proc" },
  { id: "io.proc-bun", when: { fact: "call", module: ["<global>"], symbol: ["Bun"], callee: ["spawn", "spawnSync"] }, effect: { target: "hardware", name: "processes", label: "OS processes" }, group: "proc" },
  { id: "io.proc-deno", when: { fact: "new", module: ["<global>"], symbol: ["Deno"], callee: ["Command", "Deno.Command"] }, effect: { target: "hardware", name: "processes", label: "OS processes" }, group: "proc" },
  { id: "io.proc-import", when: { fact: "import", module: PROC }, effect: { target: "hardware", name: "processes", label: "OS processes" }, fallback: true, group: "proc" },
];

const ids = new Set<string>();
for (const r of RULES) {
  if (ids.has(r.id)) throw new Error(`duplicate rule id ${r.id}`);
  ids.add(r.id);
}
