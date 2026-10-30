// Per-file detection. Everything framework-specific lives here and nowhere else.

import { Node, Project, SourceFile, SyntaxKind, ts } from "ts-morph";
import { EdgeKind, Protocol } from "./ir.js";

export type Finding =
  | { kind: "import"; spec: string; line: number }
  | { kind: "route"; line: number; detail: string }
  | { kind: "http"; line: number; url: string | null }
  | { kind: "store"; line: number; engine: string; access: "reads" | "writes" | "unknown" }
  | { kind: "ws-server"; line: number }
  | { kind: "ws-client"; line: number; url: string | null }
  | { kind: "fs"; line: number }
  | { kind: "proc"; line: number };

const FS_MODULES = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises", "fs-extra", "graceful-fs"]);
const PROC_MODULES = new Set(["child_process", "node:child_process", "execa", "cross-spawn"]);
const HTTP_FACTORIES = new Set(["express", "Router", "Hono", "Koa", "fastify", "Fastify", "Elysia", "polka"]);
const ROUTE_METHODS = new Set(["get", "post", "put", "delete", "patch", "options", "head", "all", "use", "route"]);
const HTTP_CLIENTS = new Set(["fetch", "got", "ky", "axios", "undici", "request", "superagent", "needle", "phin"]);
const HTTP_CLIENT_METHODS = new Set(["get", "post", "put", "delete", "patch", "head", "request", "fetch"]);

interface Engine {
  engine: string;
  reads: Set<string>;
  writes: Set<string>;
  sql: Set<string>;
}

const ENGINES: Record<string, Engine> = {};
function engine(modules: string[], e: Engine) {
  for (const m of modules) ENGINES[m] = e;
}
const sqlMethods = new Set(["query", "execute", "prepare", "run", "exec", "get", "all", "unsafe", "sql"]);
engine(["pg", "postgres", "pg-promise", "@vercel/postgres", "@neondatabase/serverless"], { engine: "postgres", reads: new Set(), writes: new Set(), sql: sqlMethods });
engine(["mysql", "mysql2", "mysql2/promise", "@planetscale/database"], { engine: "mysql", reads: new Set(), writes: new Set(), sql: sqlMethods });
engine(["better-sqlite3", "bun:sqlite", "sqlite3", "sqlite", "node:sqlite", "@libsql/client"], { engine: "sqlite", reads: new Set(), writes: new Set(), sql: sqlMethods });
engine(["mongodb", "mongoose"], {
  engine: "mongodb",
  reads: new Set(["find", "findOne", "findById", "aggregate", "countDocuments", "count", "distinct", "estimatedDocumentCount", "exists"]),
  writes: new Set(["insertOne", "insertMany", "updateOne", "updateMany", "deleteOne", "deleteMany", "replaceOne", "bulkWrite", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace", "create", "save", "deleteById", "findByIdAndUpdate", "findByIdAndDelete", "insert"]),
  sql: new Set(),
});
engine(["redis", "ioredis", "@upstash/redis", "@redis/client"], {
  engine: "redis",
  reads: new Set(["get", "mget", "hget", "hgetall", "hmget", "exists", "keys", "scan", "smembers", "sismember", "lrange", "llen", "zrange", "zscore", "ttl", "type", "subscribe"]),
  writes: new Set(["set", "setex", "del", "hset", "hdel", "incr", "decr", "incrby", "expire", "lpush", "rpush", "lpop", "rpop", "sadd", "srem", "zadd", "zrem", "publish", "flushall", "flushdb", "mset", "setnx"]),
  sql: new Set(),
});
engine(["@prisma/client"], {
  engine: "postgres",
  reads: new Set(["findMany", "findUnique", "findFirst", "findUniqueOrThrow", "findFirstOrThrow", "count", "aggregate", "groupBy"]),
  writes: new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany", "executeRaw", "$executeRaw"]),
  sql: new Set(["$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"]),
});
engine(["knex", "kysely", "drizzle-orm", "typeorm", "sequelize"], { engine: "sql", reads: new Set(["select", "selectFrom", "find", "findOne", "findAll", "findMany", "count"]), writes: new Set(["insert", "insertInto", "update", "updateTable", "delete", "deleteFrom", "save", "create", "destroy", "upsert"]), sql: new Set(["raw", "query", "execute", "run"]) });

const WS_SERVER_MODULES = new Set(["ws", "socket.io", "uWebSockets.js", "@fastify/websocket", "hono/ws", "graphql-ws"]);

export function sqlAccess(sql: string): "reads" | "writes" | "unknown" {
  const verb = sql.trim().replace(/^\(+/, "").split(/\s+/)[0]?.toLowerCase() ?? "";
  if (["select", "with", "show", "explain", "describe", "pragma", "values"].includes(verb)) return "reads";
  if (["insert", "update", "delete", "replace", "merge", "upsert", "create", "alter", "drop", "truncate", "begin", "commit", "vacuum", "copy", "grant"].includes(verb)) return "writes";
  return "unknown";
}

/** Host of an absolute http(s)/ws(s) URL, or "/" for a root-relative path, or null. */
export function classifyUrl(url: string | null): { host: string | null; relative: boolean } {
  if (url === null) return { host: null, relative: false };
  if (url.startsWith("/") && !url.startsWith("//")) return { host: null, relative: true };
  const m = /^(?:https?|wss?):\/\/(\[[0-9a-f:]+\]|[^/:?#\s`'"]+)/i.exec(url);
  if (m) {
    const host = m[1].toLowerCase();
    // the repository's own server, reached over loopback
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]" || host.endsWith(".localhost")) return { host: null, relative: true };
    if (/^[a-z0-9.-]+$/.test(host) && !host.includes("..")) return { host, relative: false };
  }
  return { host: null, relative: false };
}

/** The static text of a string literal or the static head of a template, else null. */
function staticText(n: Node | undefined): string | null {
  if (!n) return null;
  if (Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n)) return n.getLiteralText();
  if (Node.isTemplateExpression(n)) {
    const head = n.getHead().getLiteralText();
    if (head.length > 0) return head;
    // `${base}/path` where base is a const literal in this file
    const first = n.getTemplateSpans()[0]?.getExpression();
    const t = staticText(first);
    return t ? t + (n.getTemplateSpans()[0]?.getLiteral().getLiteralText() ?? "") : null;
  }
  if (Node.isNewExpression(n) && n.getExpression().getText() === "URL") return staticText(n.getArguments()[0]);
  if (Node.isBinaryExpression(n) && n.getOperatorToken().getKind() === SyntaxKind.PlusToken) return staticText(n.getLeft());
  if (Node.isParenthesizedExpression(n)) return staticText(n.getExpression());
  if (Node.isAsExpression(n)) return staticText(n.getExpression());
  if (Node.isIdentifier(n)) {
    // a `const` initialized with a literal in the same file
    const defs = n.getDefinitionNodes?.() ?? [];
    for (const d of defs) {
      if (Node.isVariableDeclaration(d)) {
        const init = d.getInitializer();
        if (init && init !== n) return staticText(init);
      }
    }
  }
  return null;
}

export function analyze(project: Project, relPath: string, text: string): Finding[] {
  const sf = project.createSourceFile(relPath, text, { overwrite: true });
  try {
    return analyzeFile(sf);
  } finally {
    project.removeSourceFile(sf);
  }
}

function analyzeFile(sf: SourceFile): Finding[] {
  const out: Finding[] = [];
  const imported = new Map<string, string>(); // local name -> module specifier
  const modules = new Set<string>();
  const line = (n: Node) => n.getStartLineNumber();

  // imports and re-exports
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    modules.add(spec);
    const typeOnly = imp.isTypeOnly() || (imp.getNamedImports().length > 0 && imp.getNamedImports().every((n) => n.isTypeOnly()) && !imp.getDefaultImport() && !imp.getNamespaceImport());
    if (!typeOnly) out.push({ kind: "import", spec, line: line(imp) });
    const def = imp.getDefaultImport();
    if (def) imported.set(def.getText(), spec);
    const ns = imp.getNamespaceImport();
    if (ns) imported.set(ns.getText(), spec);
    for (const n of imp.getNamedImports()) imported.set((n.getAliasNode() ?? n.getNameNode()).getText(), spec);
  }
  for (const exp of sf.getExportDeclarations()) {
    const spec = exp.getModuleSpecifierValue();
    if (spec && !exp.isTypeOnly()) {
      modules.add(spec);
      out.push({ kind: "import", spec, line: line(exp) });
    }
  }

  const httpFactoryVars = new Set<string>(["app", "router", "server"]);
  const storeVars = new Map<string, Engine>();
  const usesFs = [...modules].some((m) => FS_MODULES.has(m));
  const usesProc = [...modules].some((m) => PROC_MODULES.has(m));
  const engineModules = [...modules].filter((m) => ENGINES[m]);
  for (const [local, spec] of imported) {
    if (ENGINES[spec]) storeVars.set(local, ENGINES[spec]);
  }
  let storeCallSeen = new Set<string>();

  sf.forEachDescendant((n) => {
    // dynamic imports and require
    if (Node.isCallExpression(n)) {
      const callee = n.getExpression();
      const calleeText = callee.getText();
      const args = n.getArguments();
      if (callee.getKind() === SyntaxKind.ImportKeyword || calleeText === "require") {
        const spec = staticText(args[0]);
        if (spec) {
          modules.add(spec);
          out.push({ kind: "import", spec, line: line(n) });
        }
        return;
      }
      // http servers
      if (/^(Bun|Deno)\.serve$/.test(calleeText) || /^(https?|http2)\.createS(ecure)?Server$/.test(calleeText) || calleeText === "createServer" || calleeText === "serve" && imported.has("serve")) {
        out.push({ kind: "route", line: line(n), detail: calleeText });
        const opts = args.find((a) => Node.isObjectLiteralExpression(a));
        if (opts && Node.isObjectLiteralExpression(opts) && opts.getProperty("websocket")) out.push({ kind: "ws-server", line: line(n) });
        return;
      }
      // framework factories: const app = express()
      if (Node.isIdentifier(callee) && HTTP_FACTORIES.has(calleeText)) {
        const parent = n.getParent();
        if (Node.isVariableDeclaration(parent)) httpFactoryVars.add(parent.getName());
        out.push({ kind: "route", line: line(n), detail: calleeText });
        return;
      }
      if (Node.isPropertyAccessExpression(callee)) {
        const obj = callee.getExpression();
        const objText = obj.getText();
        const method = callee.getName();
        // routes: app.get("/x", ...)
        if (ROUTE_METHODS.has(method) && httpFactoryVars.has(objText.split(".")[0])) {
          const p = staticText(args[0]);
          if (p && p.startsWith("/")) {
            out.push({ kind: "route", line: line(n), detail: `${method.toUpperCase()} ${p}` });
            return;
          }
        }
        // websocket upgrade
        if (method === "upgrade" && args.length >= 1) {
          out.push({ kind: "ws-server", line: line(n) });
          return;
        }
        // outbound http clients
        const rootObj = objText.split(".")[0];
        if ((HTTP_CLIENTS.has(rootObj) || imported.get(rootObj) === "axios" || imported.get(rootObj) === "got" || imported.get(rootObj) === "ky" || imported.get(rootObj) === "undici") && HTTP_CLIENT_METHODS.has(method)) {
          out.push({ kind: "http", line: line(n), url: staticText(args[0]) });
          return;
        }
        if ((objText === "http" || objText === "https" || imported.get(rootObj) === "http" || imported.get(rootObj) === "https" || imported.get(rootObj) === "node:http" || imported.get(rootObj) === "node:https") && (method === "request" || method === "get")) {
          out.push({ kind: "http", line: line(n), url: staticText(args[0]) });
          return;
        }
        if (/^(pathname|path|url)$/.test(callee.getName()) === false && method === "startsWith" && /pathname$/.test(objText)) {
          const p = staticText(args[0]);
          if (p && p.startsWith("/")) out.push({ kind: "route", line: line(n), detail: `PREFIX ${p}` });
          return;
        }
        // fs / child_process through a namespace or default import: fsp.writeFile, cp.spawn
        if (FS_MODULES.has(imported.get(rootObj) ?? "")) {
          out.push({ kind: "fs", line: line(n) });
          return;
        }
        if (PROC_MODULES.has(imported.get(rootObj) ?? "")) {
          out.push({ kind: "proc", line: line(n) });
          return;
        }
        // Bun / Deno runtime io
        if (/^Bun\.(file|write)$/.test(calleeText) || /^Deno\.(readTextFile|readFile|writeTextFile|writeFile|open|stat|readDir|remove|mkdir)$/.test(calleeText)) {
          out.push({ kind: "fs", line: line(n) });
          return;
        }
        if (/^Bun\.(spawn|spawnSync)$/.test(calleeText) || /^Deno\.Command$/.test(calleeText)) {
          out.push({ kind: "proc", line: line(n) });
          return;
        }
        // stores: a call on an engine-bound variable, or any method an engine knows
        const eng = storeVars.get(rootObj) ?? (engineModules.length === 1 ? ENGINES[engineModules[0]] : undefined);
        if (eng) {
          if (eng.sql.has(method)) {
            const sql = staticText(args[0]);
            out.push({ kind: "store", line: line(n), engine: eng.engine, access: sql ? sqlAccess(sql) : "unknown" });
            storeCallSeen.add(eng.engine);
            return;
          }
          if (eng.reads.has(method)) {
            out.push({ kind: "store", line: line(n), engine: eng.engine, access: "reads" });
            storeCallSeen.add(eng.engine);
            return;
          }
          if (eng.writes.has(method)) {
            out.push({ kind: "store", line: line(n), engine: eng.engine, access: "writes" });
            storeCallSeen.add(eng.engine);
            return;
          }
        }
        // tagged template sql`...` on a store var
        return;
      }
      if (Node.isIdentifier(callee)) {
        if (calleeText === "fetch" && !imported.has("fetch")) {
          out.push({ kind: "http", line: line(n), url: staticText(args[0]) });
          return;
        }
        if ((calleeText === "got" || calleeText === "ky" || calleeText === "axios" || calleeText === "request") && imported.has(calleeText)) {
          out.push({ kind: "http", line: line(n), url: staticText(args[0]) });
          return;
        }
        if (usesProc && ["spawn", "exec", "execFile", "fork", "spawnSync", "execSync", "execFileSync", "execa", "$"].includes(calleeText)) {
          out.push({ kind: "proc", line: line(n) });
          return;
        }
        if (usesFs && /^(read|write|append|open|stat|mkdir|rm|unlink|readdir|exists|copy|rename|access|create)/.test(calleeText)) {
          out.push({ kind: "fs", line: line(n) });
          return;
        }
        if (calleeText === "io" && imported.get("io") === "socket.io") {
          out.push({ kind: "ws-server", line: line(n) });
          return;
        }
      }
      return;
    }
    if (Node.isTaggedTemplateExpression(n)) {
      const tag = n.getTag().getText().split(".")[0];
      const eng = storeVars.get(tag);
      if (eng || tag === "sql") {
        const t = n.getTemplate();
        const sql = Node.isNoSubstitutionTemplateLiteral(t) ? t.getLiteralText() : Node.isTemplateExpression(t) ? t.getHead().getLiteralText() : "";
        out.push({ kind: "store", line: line(n), engine: eng?.engine ?? (engineModules[0] ? ENGINES[engineModules[0]].engine : "sql"), access: sqlAccess(sql) });
        storeCallSeen.add(eng?.engine ?? "sql");
      }
      return;
    }
    if (Node.isNewExpression(n)) {
      const name = n.getExpression().getText();
      const args = n.getArguments();
      if (name === "WebSocketServer" || name === "WebSocket.Server" || (name === "Server" && imported.get("Server") === "socket.io") || name === "SocketServer") {
        out.push({ kind: "ws-server", line: line(n) });
        return;
      }
      if (name === "WebSocket" && !WS_SERVER_MODULES.has(imported.get("WebSocket") ?? "") || (name === "WebSocket" && imported.get("WebSocket") === "ws" && args.length > 0)) {
        out.push({ kind: "ws-client", line: line(n), url: staticText(args[0]) });
        return;
      }
      for (const [local, eng] of storeVars) {
        if (name === local || name.startsWith(local + ".")) {
          const parent = n.getParent();
          if (Node.isVariableDeclaration(parent)) storeVars.set(parent.getName(), eng);
          return;
        }
      }
      // new Pool() / new Client() / new PrismaClient() / new Redis() / new Database() / new MongoClient()
      if (engineModules.length > 0 && /^(Pool|Client|PrismaClient|Redis|Database|MongoClient|Connection|Knex|Kysely)$/.test(name)) {
        const parent = n.getParent();
        const eng = imported.has(name) ? ENGINES[imported.get(name)!] : ENGINES[engineModules[0]];
        if (eng && Node.isVariableDeclaration(parent)) storeVars.set(parent.getName(), eng);
      }
      return;
    }
    // route evidence from pathname comparisons
    if (Node.isBinaryExpression(n)) {
      const op = n.getOperatorToken().getKind();
      if (op === SyntaxKind.EqualsEqualsEqualsToken || op === SyntaxKind.EqualsEqualsToken) {
        const l = n.getLeft();
        const r = n.getRight();
        const [pathSide, lit] = Node.isStringLiteral(r) ? [l, r] : Node.isStringLiteral(l) ? [r, l] : [null, null];
        if (pathSide && lit && /pathname$|^path$|^route$|\.url$/.test(pathSide.getText()) && lit.getLiteralText().startsWith("/")) {
          out.push({ kind: "route", line: line(n), detail: `MATCH ${lit.getLiteralText()}` });
        }
      }
      return;
    }
    if (Node.isCaseClause(n)) {
      const sw = n.getParentOrThrow().getParentOrThrow();
      if (Node.isSwitchStatement(sw) && /pathname$|^path$|^route$/.test(sw.getExpression().getText())) {
        const e = n.getExpression();
        if (Node.isStringLiteral(e) && e.getLiteralText().startsWith("/")) out.push({ kind: "route", line: line(n), detail: `MATCH ${e.getLiteralText()}` });
      }
      return;
    }
    if (Node.isPropertyAssignment(n) && n.getName() === "websocket") {
      // `websocket` handler object handed to Bun.serve in another file
      const init = n.getInitializer();
      if (init && (Node.isObjectLiteralExpression(init) || Node.isIdentifier(init))) {
        const grand = n.getParent()?.getParent();
        if (grand && Node.isCallExpression(grand) && /serve/i.test(grand.getExpression().getText())) out.push({ kind: "ws-server", line: line(n) });
      }
    }
  });

  // modules imported but with no call we understood: still a fact worth an unresolved edge
  if (usesFs && !out.some((f) => f.kind === "fs")) out.push({ kind: "fs", line: firstImportLine(sf, FS_MODULES) });
  if (usesProc && !out.some((f) => f.kind === "proc")) out.push({ kind: "proc", line: firstImportLine(sf, PROC_MODULES) });
  for (const m of engineModules) {
    const e = ENGINES[m];
    if (!storeCallSeen.has(e.engine)) out.push({ kind: "store", line: firstImportLine(sf, new Set([m])), engine: e.engine, access: "unknown" });
  }
  if ([...modules].some((m) => WS_SERVER_MODULES.has(m)) && !out.some((f) => f.kind === "ws-server" || f.kind === "ws-client")) {
    out.push({ kind: "ws-server", line: firstImportLine(sf, WS_SERVER_MODULES) });
  }
  return out;
}

function firstImportLine(sf: SourceFile, modules: Set<string>): number {
  for (const imp of sf.getImportDeclarations()) if (modules.has(imp.getModuleSpecifierValue())) return imp.getStartLineNumber();
  return 1;
}

export const ENGINE_PROTOCOL: Protocol = "http";
export type { EdgeKind };
export function newProject(): Project {
  return new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true, compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2022 } });
}
