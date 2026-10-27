// Boundaries: where the program leaves itself. Each call into code outside the repo is classified by a
// fixed table on (language, package, module, name): a database, the network, a model API, and so on.
// Deterministic; no model labels anything. Unmatched calls are plain libraries and cross nothing.
import { cmpStr, Graph, GraphEdge, GraphNode, Provenance, REPO_ID, Site } from "./ir";

export const BOUNDARIES = ["database", "network", "ai", "cloud", "messaging", "filesystem", "process", "environment"] as const;
export type Boundary = (typeof BOUNDARIES)[number];

export const BOUNDARY_INFO: Record<Boundary, { label: string; doc: string }> = {
  database: { label: "Database", doc: "SQL and NoSQL clients, ORMs, key-value stores, browser storage." },
  network: { label: "Network", doc: "HTTP clients and servers, sockets, fetch, WebSockets, RPC." },
  ai: { label: "AI models", doc: "LLM and model APIs." },
  cloud: { label: "Cloud & SaaS", doc: "Cloud provider SDKs and hosted APIs (payments, messaging, source hosting)." },
  messaging: { label: "Queues", doc: "Message brokers, queues, pub/sub." },
  filesystem: { label: "Filesystem", doc: "Reading and writing files and directories." },
  process: { label: "Processes", doc: "Spawning or controlling other processes and shells." },
  environment: { label: "Environment", doc: "Environment variables and secrets read at run time." },
};

/** How a call was classified: the built-in table, a guess from the package name, or the repo's policy. */
export type Basis = "table" | "name" | "policy";

/** One call across a boundary. `out`: repo code calls outside; `in`: outside code calls into the repo
 *  (a handler registered with a server or listener). */
export interface Crossing {
  boundary: Boundary;
  dir: "out" | "in";
  /** The in-repo callable (or file, for module-level code). */
  local: string;
  /** The external node. */
  external: string;
  package: string;
  provenance: Provenance;
  basis: Basis;
  site?: Site;
}

/** What the table matches: the symbol's language, its package, the module it was imported from (JS
 *  quotes it as the first name), and its name with owning types, dot-joined. */
export interface Subject { lang: string; pkg: string; module: string; name: string }

interface Rule { b: Boundary; lang?: RegExp; pkg?: RegExp; mod?: RegExp; name?: RegExp }

const JS = /^(javascript|typescript|npm)$/;
const PY = /^(python|pip)$/;
const GO = /^(go|gomod)$/;
const RS = /^(rust|cargo)$/;
const JVM = /^(java|kotlin|maven)$/;
const CS = /^(csharp|nuget)$/;

// First match wins: name-specific rules come before package-wide ones.
const RULES: readonly Rule[] = [
  // JavaScript / TypeScript: npm packages, node built-ins (module in quotes), and the platform's globals.
  { b: "network", lang: JS, mod: /^(node:)?(http|https|http2|net|dgram|dns|tls)(\/.*)?$/ },
  { b: "filesystem", lang: JS, mod: /^(node:)?fs(\/promises)?$/ },
  { b: "process", lang: JS, mod: /^(node:)?(child_process|cluster|worker_threads)$/ },
  { b: "network", lang: JS, pkg: /^builtins$/, name: /^(fetch|XMLHttpRequest|WebSocket|EventSource|Navigator\.sendBeacon)\b/ },
  { b: "database", lang: JS, pkg: /^builtins$/, name: /^(IDBFactory|IDBDatabase|IDBObjectStore|IDBIndex|Storage)\b/ },
  { b: "messaging", lang: JS, pkg: /^(kafkajs|amqplib|amqp-connection-manager|nats|bullmq|bull|bee-queue|@google-cloud\/pubsub|mqtt|zeromq|rhea|@azure\/service-bus)$/ },
  { b: "database", lang: JS, pkg: /^(pg|pg-promise|postgres|mysql2?|mariadb|sqlite3?|better-sqlite3|@libsql\/.*|mongodb|mongoose|redis|ioredis|@redis\/.*|@upstash\/redis|knex|sequelize|typeorm|@prisma\/client|prisma|drizzle-orm|@neondatabase\/.*|@planetscale\/.*|@supabase\/.*|kysely|dynamoose|cassandra-driver|neo4j-driver|@elastic\/elasticsearch|level|lmdb|idb|dexie|@google-cloud\/firestore|@aws-sdk\/client-dynamodb|@aws-sdk\/lib-dynamodb)$/ },
  { b: "ai", lang: JS, pkg: /^(openai|@anthropic-ai\/.*|@google\/generative-ai|@google\/genai|cohere-ai|@mistralai\/.*|groq-sdk|replicate|ollama|langchain|@langchain\/.*|ai|@ai-sdk\/.*|@huggingface\/.*|together-ai|@pinecone-database\/.*)$/ },
  { b: "cloud", lang: JS, pkg: /^(aws-sdk|@aws-sdk\/.*|@google-cloud\/.*|firebase|firebase-admin|@firebase\/.*|@azure\/.*|stripe|twilio|@sendgrid\/.*|resend|@slack\/.*|@octokit\/.*|octokit|@vercel\/.*|cloudinary|algoliasearch|@sentry\/.*)$/ },
  { b: "network", lang: JS, pkg: /^(axios|node-fetch|cross-fetch|isomorphic-fetch|got|ky|undici|superagent|request|needle|ws|socket\.io|socket\.io-client|express|fastify|koa|@koa\/.*|@hapi\/.*|hono|@grpc\/.*|graphql-request|@apollo\/.*|apollo-server.*|@trpc\/.*|nodemailer)$/ },
  { b: "filesystem", lang: JS, pkg: /^(fs-extra|graceful-fs|glob|fast-glob|chokidar|rimraf|mkdirp|tmp)$/ },
  { b: "process", lang: JS, pkg: /^(execa|cross-spawn|shelljs|zx|node-pty)$/ },
  { b: "environment", lang: JS, pkg: /^(dotenv|@dotenvx\/.*|env-var)$/ },

  // Python: the top-level package from site-packages, or the stdlib module.
  { b: "environment", lang: PY, pkg: /^os$/, name: /^(getenv|putenv|unsetenv|environ)\b/ },
  { b: "process", lang: PY, pkg: /^os$/, name: /^(system|popen|exec\w*|spawn\w*|fork|kill|_exit)$/ },
  { b: "filesystem", lang: PY, pkg: /^os$/, name: /^(open|remove|unlink|rename|replace|mkdir|makedirs|rmdir|removedirs|listdir|scandir|walk|stat|chmod|chown|symlink|link|truncate)$/ },
  { b: "filesystem", lang: PY, pkg: /^builtins$/, name: /^open$/ },
  { b: "messaging", lang: PY, pkg: /^(kafka|confluent_kafka|aiokafka|pika|aio_pika|celery|kombu|nats|paho|zmq|pulsar|dramatiq|rq)$/ },
  { b: "database", lang: PY, pkg: /^(sqlite3|dbm|shelve|psycopg|psycopg2|psycopg_pool|asyncpg|pymysql|MySQLdb|mysql|aiomysql|sqlalchemy|pymongo|motor|redis|aioredis|peewee|tortoise|elasticsearch|cassandra|neo4j|duckdb|supabase|databases|sqlmodel|pony|clickhouse_connect|chromadb|pinecone|qdrant_client|weaviate)$/ },
  { b: "ai", lang: PY, pkg: /^(openai|anthropic|cohere|mistralai|groq|langchain|langchain_\w+|langgraph|llama_index|transformers|huggingface_hub|ollama|litellm|replicate|together|vertexai)$/ },
  { b: "cloud", lang: PY, pkg: /^(boto3|botocore|aiobotocore|s3fs|azure|firebase_admin|stripe|twilio|sendgrid|slack_sdk|github|sentry_sdk)$/ },
  { b: "network", lang: PY, pkg: /^(requests|httpx|aiohttp|urllib3|urllib|http|socket|ssl|ftplib|smtplib|imaplib|poplib|xmlrpc|websocket|websockets|grpc|httplib2|fastapi|flask|starlette|tornado|sanic|paramiko|pycurl|django)$/ },
  { b: "process", lang: PY, pkg: /^(subprocess|multiprocessing|pexpect|sh|plumbum)$/ },
  { b: "filesystem", lang: PY, pkg: /^(shutil|pathlib|tempfile|glob|aiofiles|fsspec|watchdog)$/ },
  { b: "environment", lang: PY, pkg: /^(dotenv|decouple|environs)$/ },

  // Go: the stdlib package's folder, or the module path.
  { b: "environment", lang: GO, pkg: /^os$/, name: /^(Getenv|LookupEnv|Setenv|Unsetenv|Clearenv|Environ|ExpandEnv)$/ },
  { b: "process", lang: GO, pkg: /^os$/, name: /^(StartProcess|FindProcess|Exit|Process\b.*)/ },
  { b: "filesystem", lang: GO, pkg: /^(os|ioutil|fs)$/ },
  { b: "process", lang: GO, pkg: /^(exec|syscall)$/ },
  { b: "database", lang: GO, pkg: /^(sql|database\/sql|github\.com\/lib\/pq|github\.com\/jackc\/pgx.*|github\.com\/go-sql-driver\/mysql|github\.com\/mattn\/go-sqlite3|modernc\.org\/sqlite|gorm\.io\/.*|github\.com\/jmoiron\/sqlx|go\.mongodb\.org\/mongo-driver.*|github\.com\/redis\/go-redis.*|github\.com\/go-redis\/redis.*|go\.etcd\.io\/bbolt|github\.com\/dgraph-io\/badger.*|entgo\.io\/ent|github\.com\/uptrace\/bun.*)$/ },
  { b: "messaging", lang: GO, pkg: /^(github\.com\/segmentio\/kafka-go|github\.com\/confluentinc\/.*|github\.com\/IBM\/sarama|github\.com\/Shopify\/sarama|github\.com\/rabbitmq\/amqp091-go|github\.com\/streadway\/amqp|github\.com\/nats-io\/.*)$/ },
  { b: "ai", lang: GO, pkg: /^(github\.com\/sashabaranov\/go-openai|github\.com\/openai\/openai-go.*|github\.com\/anthropics\/anthropic-sdk-go.*|github\.com\/tmc\/langchaingo.*|google\.golang\.org\/genai|github\.com\/ollama\/ollama.*)$/ },
  { b: "cloud", lang: GO, pkg: /^(github\.com\/aws\/.*|cloud\.google\.com\/go.*|github\.com\/Azure\/.*|github\.com\/stripe\/.*|firebase\.google\.com\/.*)$/ },
  { b: "network", lang: GO, pkg: /^(http|net|httputil|httptest|rpc|smtp|websocket|google\.golang\.org\/grpc.*|github\.com\/gorilla\/.*|github\.com\/gin-gonic\/gin|github\.com\/labstack\/echo.*|github\.com\/gofiber\/fiber.*|github\.com\/go-chi\/chi.*|nhooyr\.io\/websocket|github\.com\/coder\/websocket|github\.com\/valyala\/fasthttp|github\.com\/go-resty\/resty.*)$/ },

  // Rust: the crate.
  { b: "network", lang: RS, pkg: /^std$/, name: /^(TcpStream|TcpListener|UdpSocket)\b/ },
  { b: "filesystem", lang: RS, pkg: /^std$/, name: /^(File|OpenOptions|DirEntry|ReadDir|read_to_string|read_dir|create_dir\w*|remove_\w+|rename|copy|metadata)\b/ },
  { b: "process", lang: RS, pkg: /^std$/, name: /^(Command|Child|exit)\b/ },
  { b: "environment", lang: RS, pkg: /^std$/, name: /^(var|var_os|vars|set_var|remove_var)$/ },
  { b: "database", lang: RS, pkg: /^(sqlx|diesel|rusqlite|tokio-postgres|postgres|mysql|mysql_async|mongodb|redis|sea-orm|sled|rocksdb|deadpool-postgres|bb8|surrealdb)$/ },
  { b: "messaging", lang: RS, pkg: /^(rdkafka|lapin|async-nats|nats|zmq)$/ },
  { b: "ai", lang: RS, pkg: /^(async-openai|ollama-rs|anthropic-sdk|genai)$/ },
  { b: "cloud", lang: RS, pkg: /^(aws-sdk-.*|aws-config|rusoto_.*|google-cloud-.*|azure_.*|async-stripe)$/ },
  { b: "network", lang: RS, pkg: /^(reqwest|hyper|ureq|surf|isahc|tokio-tungstenite|tungstenite|axum|actix-web|warp|rocket|tonic|tower-http|lettre)$/ },
  { b: "process", lang: RS, pkg: /^(duct|subprocess)$/ },
  { b: "environment", lang: RS, pkg: /^(dotenvy|dotenv|envy)$/ },

  // JVM, .NET, PHP, Ruby, Dart, C/C++: packages are less telling here, so owning types and functions decide.
  { b: "network", lang: JVM, name: /^(HttpClient|HttpRequest|HttpURLConnection|URLConnection|URL\.openConnection|Socket|ServerSocket|DatagramSocket|OkHttpClient|Call|RestTemplate|WebClient|Retrofit|Feign)\b/ },
  { b: "database", lang: JVM, name: /^(DriverManager|Connection|PreparedStatement|Statement|ResultSet|DataSource|EntityManager|JdbcTemplate|NamedParameterJdbcTemplate|MongoClient|MongoCollection|Jedis|RedisTemplate|Session\.(createQuery|save|get))\b/ },
  { b: "filesystem", lang: JVM, name: /^(Files|FileInputStream|FileOutputStream|FileReader|FileWriter|RandomAccessFile|File\.(delete|mkdirs?|createNewFile|listFiles))\b/ },
  { b: "process", lang: JVM, name: /^(ProcessBuilder|Runtime\.exec)\b/ },
  { b: "environment", lang: JVM, name: /^System\.getenv\b/ },
  { b: "network", lang: CS, name: /^(HttpClient|WebClient|HttpWebRequest|Socket|TcpClient|TcpListener|UdpClient|WebSocket|ClientWebSocket)\b/ },
  { b: "database", lang: CS, name: /^(SqlConnection|SqlCommand|NpgsqlConnection|NpgsqlCommand|MySqlConnection|SqliteConnection|DbConnection|DbCommand|DbContext|DbSet|MongoClient|IMongoCollection|ConnectionMultiplexer|IDatabase)\b/ },
  { b: "filesystem", lang: CS, name: /^(File|Directory|FileStream|FileInfo|DirectoryInfo|StreamReader|StreamWriter)\b/ },
  { b: "process", lang: CS, name: /^Process\b/ },
  { b: "environment", lang: CS, name: /^Environment\.(GetEnvironmentVariable|SetEnvironmentVariable)/ },
  { b: "database", lang: /^php$/, name: /^(PDO|PDOStatement|mysqli|mysqli_\w+|pg_\w+|Redis|MongoDB)\b/ },
  { b: "network", lang: /^php$/, name: /^(curl_\w+|fsockopen|stream_socket_client|GuzzleHttp\b.*|Http\.(get|post|put|delete))/ },
  { b: "process", lang: /^php$/, name: /^(exec|shell_exec|system|passthru|proc_open|popen)$/ },
  { b: "environment", lang: /^php$/, name: /^(getenv|putenv|env)$/ },
  { b: "filesystem", lang: /^php$/, name: /^(fopen|fwrite|fread|file_put_contents|file_get_contents|unlink|mkdir|rmdir|rename|copy|scandir)$/ },
  { b: "network", lang: /^ruby$/, name: /^(Net\.HTTP|HTTParty|Faraday|RestClient|TCPSocket|Socket)\b/ },
  { b: "database", lang: /^ruby$/, name: /^(ActiveRecord|PG|Mysql2|SQLite3|Redis|Mongo|Sequel)\b/ },
  { b: "filesystem", lang: /^ruby$/, name: /^(File|Dir|FileUtils)\b/ },
  { b: "process", lang: /^ruby$/, name: /^(Open3|Process|Kernel\.(system|spawn|exec))\b/ },
  { b: "network", lang: /^dart$/, pkg: /^(http|dio|web_socket_channel|grpc)$/ },
  { b: "database", lang: /^dart$/, pkg: /^(sqflite|drift|hive|hive_flutter|isar|shared_preferences|cloud_firestore|postgres|mongo_dart|objectbox)$/ },
  { b: "cloud", lang: /^dart$/, pkg: /^(firebase_\w+|supabase_flutter|supabase)$/ },
  { b: "network", lang: /^dart$/, name: /^(HttpClient|WebSocket|Socket|ServerSocket|HttpServer)\b/ },
  { b: "filesystem", lang: /^dart$/, name: /^(File|Directory)\b/ },
  { b: "process", lang: /^dart$/, name: /^Process\b/ },
  { b: "environment", lang: /^dart$/, name: /^Platform\.environment\b/ },
  { b: "network", lang: /^cpp$/, name: /^(socket|connect|bind|listen|accept|send|recv|sendto|recvfrom|getaddrinfo|curl_\w+)$/ },
  { b: "database", lang: /^cpp$/, name: /^(sqlite3_\w+|PQ\w+|mysql_\w+)$/ },
  { b: "filesystem", lang: /^cpp$/, name: /^(fopen|fread|fwrite|fclose|unlink|mkdir|rmdir|remove|rename|ifstream|ofstream|fstream)\b/ },
  { b: "process", lang: /^cpp$/, name: /^(system|popen|fork|execv\w*|execl\w*|posix_spawn\w*|CreateProcess\w*)$/ },
  { b: "environment", lang: /^cpp$/, name: /^(getenv|setenv|putenv|secure_getenv)$/ },
];

// Last resort for packages the table does not know: words in the package name. Marked `name`, not `table`.
const GUESSES: readonly [Boundary, RegExp][] = [
  ["ai", /(openai|anthropic|llm|genai|langchain|ollama|gpt)/i],
  ["messaging", /(kafka|amqp|rabbit|nats|mqtt|pubsub|queue)/i],
  ["database", /(sql|postgres|mongo|redis|dynamo|cassandra|couch|neo4j|clickhouse|database|prisma|(^|[-_/])db($|[-_/]))/i],
  ["cloud", /((^|[-_/@])aws|azure|google-cloud|gcloud|firebase)/i],
  ["network", /(http|fetch|grpc|websocket|graphql|rest-?client)/i],
];

/** Packages the repo's policy assigns to a boundary: exact names, or `/regex/`. */
export type Extra = Partial<Record<Boundary, string[]>>;

const matchers = (extra: Extra = {}) => BOUNDARIES.flatMap((b) => (extra[b] ?? []).map((p): [Boundary, (s: string) => boolean] => {
  const re = p.length > 2 && p.startsWith("/") && p.endsWith("/") ? new RegExp(p.slice(1, -1)) : undefined;
  return [b, re ? (s) => re.test(s) : (s) => s === p];
}));

/** The boundary a call into `s` crosses, if any, and why. */
export function classify(s: Subject, extra: Extra = {}, compiled = matchers(extra)): { boundary: Boundary; basis: Basis } | undefined {
  for (const [b, m] of compiled) if (m(s.pkg) || m(s.module)) return { boundary: b, basis: "policy" };
  for (const r of RULES) {
    if (r.lang && !r.lang.test(s.lang)) continue;
    if (r.pkg && !r.pkg.test(s.pkg)) continue;
    if (r.mod && !r.mod.test(s.module)) continue;
    if (r.name && !r.name.test(s.name)) continue;
    return { boundary: r.b, basis: "table" };
  }
  // Built-ins and the standard library are known; a miss there is a plain library call.
  if (["builtins", "std", "node", "core", "alloc", "stdlib"].includes(s.pkg)) return undefined;
  for (const [b, re] of GUESSES) if (re.test(s.pkg)) return { boundary: b, basis: "name" };
  return undefined;
}

/** The subject of an external node: language from the symbol, package from its parent, module from a
 *  quoted first name (`"node:fs".readFileSync`). */
export function subject(n: GraphNode, pkg: string): Subject {
  // SCIP symbols are `scheme manager package version …`; the editor bridge puts the language as manager.
  const lang = n.id.split(" ")[1] ?? "";
  const m = /^(["'`])(.*?)\1\.?(.*)$/.exec(n.name);
  return m ? { lang, pkg, module: m[2], name: m[3] } : { lang, pkg, module: pkg, name: n.name };
}

export const boundaryId = (b: Boundary) => `boundary:${b}`;
export const isBoundaryId = (id: string) => id.startsWith("boundary:");

/** Every external node that crosses a boundary, with its boundary. */
export function classifyGraph(g: Graph, extra: Extra = {}): Map<string, { boundary: Boundary; basis: Basis; package: string; module: string }> {
  const compiled = matchers(extra);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out = new Map<string, { boundary: Boundary; basis: Basis; package: string; module: string }>();
  for (const e of g.edges) {
    if (e.kind !== "contains") continue;
    const p = byId.get(e.from), n = byId.get(e.to);
    if (p?.kind !== "external_package" || n?.kind !== "external") continue;
    const s = subject(n, p.name);
    const c = classify(s, extra, compiled);
    if (c) out.set(n.id, { ...c, package: p.name, module: s.module });
  }
  return out;
}

/** Calls (and callbacks) between repo code and classified external nodes, sorted. Overrides of outside
 *  interfaces are not crossings: implementing `Handler` is not calling the network. */
export function crossings(g: Graph, extra: Extra = {}): Crossing[] {
  const cls = classifyGraph(g, extra);
  const out: Crossing[] = [];
  const seen = new Set<string>();
  for (const e of g.edges) {
    if (e.kind !== "call") continue;
    const to = cls.get(e.to), from = cls.get(e.from);
    if (!!to === !!from) continue;
    const [dir, local, ext, c] = to ? ["out" as const, e.from, e.to, to] : ["in" as const, e.to, e.from, from!];
    // One crossing per (direction, local, external, site): dispatch guesses add parallel edges.
    const k = `${dir}\0${local}\0${ext}\0${e.site?.path ?? ""}\0${e.site ? `${e.site.range.start_line},${e.site.range.start_col}` : ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ boundary: c.boundary, dir, local, external: ext, package: c.module !== c.package ? c.module : c.package, provenance: e.provenance, basis: c.basis, site: e.site });
  }
  return out.sort((a, b) => cmpStr(a.local, b.local) || cmpStr(a.external, b.external) || cmpStr(a.dir, b.dir)
    || cmpStr(a.site?.path ?? "", b.site?.path ?? "") || (a.site?.range.start_line ?? 0) - (b.site?.range.start_line ?? 0));
}

/** The graph as the boundary view draws it: one `boundary` node per boundary crossed, holding one box per
 *  package (or module) used through it, holding the external nodes. External nodes no boundary claims stay
 *  under their package. Every base edge is kept, so rollups still trace to real call sites. Not stored. */
export function boundaryGraph(g: Graph, extra: Extra = {}): Graph {
  const cls = classifyGraph(g, extra);
  if (!cls.size) return g;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const moved = new Set(cls.keys());
  const added = new Map<string, GraphNode>();
  for (const [ext, c] of cls) {
    const bid = boundaryId(c.boundary);
    if (!added.has(bid)) {
      const info = BOUNDARY_INFO[c.boundary];
      added.set(bid, { id: bid, kind: "boundary", name: info.label, doc: info.doc });
      edges.push({ from: REPO_ID, to: bid, kind: "contains", provenance: "resolved" });
    }
    const pid = `${bid}/${c.module}`;
    if (!added.has(pid)) {
      added.set(pid, { id: pid, kind: "external_package", name: c.module, doc: c.basis === "name" ? `Filed under ${BOUNDARY_INFO[c.boundary].label} by its package name.` : undefined });
      edges.push({ from: bid, to: pid, kind: "contains", provenance: "resolved" });
    }
    edges.push({ from: pid, to: ext, kind: "contains", provenance: "resolved" });
  }
  // External packages left with nothing in them are dropped with their containment.
  const kept = new Map<string, number>();
  for (const e of g.edges) if (e.kind === "contains" && !moved.has(e.to)) kept.set(e.from, (kept.get(e.from) ?? 0) + 1);
  const gone = new Set(g.nodes.filter((n) => n.kind === "external_package" && !kept.get(n.id)).map((n) => n.id));
  for (const n of g.nodes) if (!gone.has(n.id)) nodes.push(n);
  nodes.push(...added.values());
  const base = g.edges.filter((e) => !(e.kind === "contains" && (moved.has(e.to) || gone.has(e.to))));
  return { schema_version: g.schema_version, nodes, edges: [...base, ...edges] };
}

/** Outside nodes no boundary holds: plain libraries, which the boundary view can leave out. */
export function libraryNodes(g: Graph): Set<string> {
  const under = new Set<string>();
  const kids = new Map<string, string[]>();
  for (const e of g.edges) if (e.kind === "contains") (kids.get(e.from) ?? kids.set(e.from, []).get(e.from)!).push(e.to);
  const walk = (id: string) => { for (const k of kids.get(id) ?? []) if (!under.has(k)) (under.add(k), walk(k)); };
  for (const n of g.nodes) if (n.kind === "boundary") walk(n.id);
  return new Set(g.nodes.filter((n) => (n.kind === "external" || n.kind === "external_package") && !under.has(n.id)).map((n) => n.id));
}
