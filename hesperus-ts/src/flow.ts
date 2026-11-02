// The flow of a repository: for each entry point, the functions it reaches in source
// order and where each path leaves the program. Function-level, so it needs the whole
// repository in one ts-morph project (the per-file facts of facts.ts resolve nothing across
// files). Nothing here is guessed: names come from declarations, order from source
// position, boundaries from the same rule table the actual IR uses, and a call is a step
// only when its callee resolves to a declaration in the repository.

import * as fs from "node:fs";
import * as path from "node:path";
import { Node, Project, SourceFile, ts } from "ts-morph";
import { Bindings } from "./bindings.js";
import { applyRulesIndexed, classifyUrl, Finding } from "./engine.js";
import { adoptBoundary, fileOwners } from "./extract.js";
import { Fact, factsWithNodes } from "./facts.js";
import { EXTRACTOR, identify, Ir, IrConstraint, within } from "./ir.js";
import { Workspace } from "./workspace.js";

export const FLOW_VERSION = "0.2";
/** Witness sites kept per constraint. */
export const MAX_WITNESSES = 20;
/** Calls followed from an entry before a step is cut with `cut: "depth"`. */
export const FLOW_MAX_DEPTH = 8;
/** Steps recorded per entry before the rest is cut with `cut: "steps"`. */
export const FLOW_MAX_STEPS = 400;

/** A function the flow passes through: `file#name`, with the node that owns its file. */
export interface FlowUnit {
  id: string;
  /** Declared name; `Class.method`, `<module>` for a file's top-level code, `anonymous` for an inline handler. */
  name: string;
  file: string;
  line: number;
  /** Last line of the declaration. */
  end: number;
  /** The node that owns the file (an intent binding or the unbound node). */
  owner: string;
}

/** A node that owns units or ends paths, as the intent names it. */
export interface FlowComponent {
  id: string;
  name: string;
  label: string | null;
  kind: string;
}

export interface FlowConstraint {
  rule: "require" | "forbid";
  from: string;
  to: string;
  kind: string | null;
  satisfied: boolean;
  /** Sites where code inside `from` reaches `to`, with the entries whose paths pass through each. */
  witnesses: { at: string; entries: string[] }[];
}

export interface FlowCall {
  /** Unit id of the callee. */
  call: string;
  /** Call site, `path:line`. */
  at: string;
  /** The callee's own steps; absent when cut. */
  steps?: FlowStep[];
  /** Why the callee was not expanded here: on the current path, expanded earlier in this entry, past the depth limit, or past the step budget. */
  cut?: "cycle" | "seen" | "depth" | "steps";
  /** Not a plain call: the next handler of a middleware chain, a function handed to a timer, or the handlers an event emit reaches. */
  how?: "next" | "timer" | "event";
}

export interface FlowCrossing {
  boundary: "ingress" | "store" | "external" | "network" | "hardware" | "config";
  /** Node id in the actual IR (adopted from the intent when it binds). */
  node: string;
  label: string;
  edge: "http" | "ws" | "reads" | "writes" | "unknown" | "io";
  resolved: boolean;
  at: string;
}

export type FlowStep = FlowCall | FlowCrossing;

export interface FlowEntry {
  /** `kind:unit`. */
  id: string;
  /** Route handler, `main`, a `bin`/shebang module, a CLI command handler, an exported function a host calls by name, or an event handler. */
  kind: "route" | "main" | "module" | "command" | "export" | "event";
  label: string;
  /** Further routes the same function handles (pathname comparisons inside one handler), in source order. */
  also?: string[];
  protocol: "http" | "ws" | null;
  unit: string;
  /** Where the entry is declared or registered, `path:line`. */
  at: string;
  steps: FlowStep[];
}

export interface Flow {
  flow: typeof FLOW_VERSION;
  generated: string;
  root: string;
  limits: { depth: number; steps: number };
  components: FlowComponent[];
  units: FlowUnit[];
  entries: FlowEntry[];
  constraints: FlowConstraint[];
}

export interface FlowOptions {
  intent: Ir | null;
  rootName?: string;
  depth?: number;
  steps?: number;
}

/** Modules whose `.action(fn)` / `.command(..., fn)` register CLI handlers, and `defineCommand({ run })`. */
const CLI_MODULES = ["commander", "@commander-js/extra-typings", "cac", "yargs", "yargs/yargs", "citty", "clipanion", "sade", "meow"];
/** Exported functions a host calls by name when the file imports the module. */
const HOST_EXPORTS: { module: string; names: string[] }[] = [{ module: "vscode", names: ["activate", "deactivate"] }];
/** Functions whose function argument runs later: the argument is a step marked `timer`. */
const TIMERS: { module: string[]; callee: string[] }[] = [
  { module: ["<global>"], callee: ["setTimeout", "setInterval", "setImmediate", "queueMicrotask"] },
  { module: ["<global>"], callee: ["nextTick"] },
  { module: ["node:timers", "timers", "node:timers/promises", "timers/promises"], callee: ["setTimeout", "setInterval", "setImmediate"] },
  { module: ["node-cron", "cron", "croner"], callee: ["schedule", "CronJob", "Cron"] },
];
/** `.on(name, fn)` on these registers an event handler; `.emit(name)` reaches the handlers registered under that name anywhere in the repository. */
const EVENT_MODULES = ["events", "node:events", "eventemitter3", "mitt", "nanoevents", "emittery", "ws"];
/** `process.env.X`, `Bun.env.X`, `import.meta.env.X`, `Deno.env.get("X")`: a read of configuration. */
const ENV_RECEIVERS = ["process.env", "Bun.env", "import.meta.env"];

type Fn = Node;

export function flow(repoRoot: string, opts: FlowOptions): Flow {
  const debug = process.env.HESPERUS_FLOW_DEBUG ? (m: string) => process.stderr.write(`flow: ${m}
`) : () => {};
  debug("workspace");
  const ws = new Workspace(repoRoot);
  debug(`${ws.files.length} files`);
  const fallbackRoot = opts.rootName ?? identify(repoRoot.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "repo");
  const bindings = new Bindings(opts.intent, fallbackRoot);
  const root = bindings.root;
  const maxDepth = opts.depth ?? FLOW_MAX_DEPTH;
  const maxSteps = opts.steps ?? FLOW_MAX_STEPS;
  const owner = fileOwners(ws, bindings);

  // one project with every file, so the checker resolves imports, `this`, classes and re-exports
  const { baseUrl, paths } = ws.tsPaths();
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noLib: true,
      ...(Object.keys(paths).length ? { baseUrl: "/" + baseUrl, paths } : {}),
    },
  });
  const files = new Map<string, SourceFile>();
  for (const f of ws.files) {
    debug(`add ${f}`);
    try {
      files.set(f, project.createSourceFile(f, ws.read(f), { overwrite: true }));
    } catch (err) {
      process.stderr.write(`hesperus-ts: flow skipping ${f}: ${(err as Error).message}\n`);
    }
  }
  const relOf = (sf: SourceFile) => sf.getFilePath().replace(/^\/+/, "");
  const at = (n: Node) => `${relOf(n.getSourceFile())}:${n.getStartLineNumber()}`;

  // ---- units: which function-like nodes count as a step of their own
  const entryFns = new Set<Fn>(); // inline handlers passed to a route registration are units
  const isFnLike = (n: Node) => Node.isFunctionDeclaration(n) || Node.isMethodDeclaration(n) || Node.isConstructorDeclaration(n) || Node.isGetAccessorDeclaration(n) || Node.isSetAccessorDeclaration(n) || Node.isFunctionExpression(n) || Node.isArrowFunction(n);
  const isUnit = (n: Node): boolean => {
    if (Node.isFunctionDeclaration(n)) return !n.isOverload();
    if (Node.isMethodDeclaration(n)) return !n.isOverload();
    if (Node.isConstructorDeclaration(n)) return !n.isOverload();
    if (Node.isGetAccessorDeclaration(n) || Node.isSetAccessorDeclaration(n)) return true;
    if (Node.isFunctionExpression(n) || Node.isArrowFunction(n)) {
      if (entryFns.has(n)) return true;
      const p = unwrapParent(n);
      return Node.isVariableDeclaration(p) || Node.isPropertyAssignment(p) || Node.isPropertyDeclaration(p) || Node.isExportAssignment(p);
    }
    return false;
  };
  /** The unit a node sits in, or null for a file's top-level code. Inline callbacks are transparent. */
  const enclosingUnit = (n: Node): Fn | null => {
    let cur = n.getParent();
    while (cur && !Node.isSourceFile(cur)) {
      if (isFnLike(cur) && isUnit(cur)) return cur;
      cur = cur.getParent();
    }
    return null;
  };
  const unitIds = new Map<Fn | SourceFile, string>();
  const unitById = new Map<string, FlowUnit>();
  const takenIds = new Map<string, Fn | SourceFile>();
  const unitOf = (fn: Fn | SourceFile): string => {
    const known = unitIds.get(fn);
    if (known) return known;
    const sf = fn.getSourceFile();
    const file = relOf(sf);
    const name = Node.isSourceFile(fn) ? "<module>" : unitName(fn);
    let id = `${file}#${name}`;
    const line = Node.isSourceFile(fn) ? 1 : fn.getStartLineNumber();
    const end = Node.isSourceFile(fn) ? fn.getEndLineNumber() : fn.getEndLineNumber();
    if (takenIds.has(id) && takenIds.get(id) !== fn) id = `${id}@${line}`;
    takenIds.set(id, fn);
    unitIds.set(fn, id);
    unitById.set(id, { id, name, file, line, end, owner: owner.get(file) ?? `${root}.unbound.root` });
    return id;
  };

  // ---- resolving a call to a unit in the repository
  const declToFn = (d: Node, forNew: boolean): Fn | null => {
    if (forNew) {
      if (Node.isClassDeclaration(d) || Node.isClassExpression(d)) {
        const ctor = d.getConstructors().find((c) => !c.isOverload());
        return ctor ?? null;
      }
      if (Node.isVariableDeclaration(d)) {
        const init = unwrap(d.getInitializer());
        return init && Node.isClassExpression(init) ? declToFn(init, true) : null;
      }
      return null;
    }
    if (Node.isFunctionDeclaration(d)) {
      if (!d.isOverload()) return d;
      const impl = d.getImplementation();
      return impl ?? null;
    }
    if (Node.isMethodDeclaration(d)) return d.isOverload() ? d.getImplementation() ?? null : d;
    if (Node.isVariableDeclaration(d) || Node.isPropertyAssignment(d) || Node.isPropertyDeclaration(d)) {
      const init = unwrap(d.getInitializer());
      return init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) ? init : null;
    }
    if (Node.isShorthandPropertyAssignment(d)) {
      // `{ handler }`: the variable it names, not the property itself
      let sym = d.getValueSymbol();
      if (sym && sym.getFlags() & ts.SymbolFlags.Alias) sym = sym.getAliasedSymbol() ?? sym;
      for (const dd of sym?.getDeclarations() ?? []) {
        if (dd === d || Node.isShorthandPropertyAssignment(dd)) continue;
        const fn = declToFn(dd, false);
        if (fn) return fn;
      }
      return null;
    }
    if (Node.isArrowFunction(d) || Node.isFunctionExpression(d)) return d;
    if (Node.isExportAssignment(d)) {
      const e = unwrap(d.getExpression());
      return e ? declToFn(e, false) : null;
    }
    return null;
  };
  const fromDecls = (decls: Node[] | undefined, forNew: boolean): Fn | null => {
    for (const d of decls ?? []) {
      if (!files.has(relOf(d.getSourceFile()))) continue;
      const fn = declToFn(d, forNew);
      if (fn) return fn;
    }
    return null;
  };
  const bySymbol = (n: Node, forNew: boolean): Fn | null => {
    let sym = n.getSymbol();
    if (!sym) return null;
    if (sym.getFlags() & ts.SymbolFlags.Alias) {
      try {
        sym = sym.getAliasedSymbol() ?? sym;
      } catch {
        // unresolvable alias (a package or a workspace specifier the checker cannot see)
      }
    }
    return fromDecls(sym.getDeclarations(), forNew);
  };
  /** An import binding the checker could not follow (workspace packages): resolve the specifier ourselves. */
  const byImport = (sf: SourceFile, name: string, member: string | null, forNew: boolean): Fn | null => {
    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      let exportName: string | null = null;
      if (imp.getDefaultImport()?.getText() === name) exportName = "default";
      else if (imp.getNamespaceImport()?.getText() === name) exportName = member;
      else {
        const named = imp.getNamedImports().find((ni) => (ni.getAliasNode() ?? ni.getNameNode()).getText() === name);
        if (named) exportName = named.getNameNode().getText();
      }
      if (exportName === null) continue;
      const target = ws.resolve(relOf(sf), spec);
      const tsf = target ? files.get(target) : undefined;
      if (!tsf) return null;
      let decls: Node[] | undefined;
      try {
        decls = tsf.getExportedDeclarations().get(exportName);
      } catch {
        decls = undefined;
      }
      return fromDecls(decls, forNew);
    }
    return null;
  };
  const resolveCallee = (call: Node): Fn | null => {
    const forNew = Node.isNewExpression(call);
    if (!Node.isCallExpression(call) && !Node.isNewExpression(call)) return null;
    const expr = unwrap(call.getExpression());
    if (!expr) return null;
    if (Node.isPropertyAccessExpression(expr)) {
      const hit = bySymbol(expr.getNameNode(), forNew);
      if (hit) return hit;
      const recv = unwrap(expr.getExpression());
      if (recv && Node.isIdentifier(recv)) return byImport(call.getSourceFile(), recv.getText(), expr.getName(), forNew);
      return null;
    }
    if (Node.isIdentifier(expr)) {
      const hit = bySymbol(expr, forNew);
      if (hit) return hit;
      return byImport(call.getSourceFile(), expr.getText(), null, forNew);
    }
    if (Node.isArrowFunction(expr) || Node.isFunctionExpression(expr)) return null; // an IIFE is part of its unit
    return null;
  };

  // ---- per file: calls and boundary crossings, each attributed to the unit it sits in
  type Raw = { pos: number; node: Node; call?: Fn; crossing?: FlowCrossing; how?: FlowCall["how"] };
  const rawByUnit = new Map<Fn | SourceFile, Raw[]>();
  const ingressFindings: { node: Node; finding: Extract<Finding, { kind: "ingress" }> }[] = [];
  const perFile = new Map<SourceFile, { calls: Node[]; findings: { node: Node; finding: Finding }[]; envReads: { node: Node; name: string }[] }>();
  /** The call/new/tagged fact behind a node, for its receiver origin. */
  const factOf = new Map<Node, Fact>();
  for (const sf of files.values()) {
    debug(`facts ${relOf(sf)}`);
    const calls: Node[] = [];
    const envReads: { node: Node; name: string }[] = [];
    sf.forEachDescendant((n) => {
      if (Node.isCallExpression(n) || Node.isNewExpression(n)) {
        calls.push(n);
        // Deno.env.get("X")
        const callee = n.getExpression();
        if (Node.isCallExpression(n) && Node.isPropertyAccessExpression(callee) && callee.getExpression().getText() === "Deno.env" && callee.getName() === "get") {
          const a0 = unwrap(n.getArguments()[0]);
          if (a0 && Node.isStringLiteral(a0)) envReads.push({ node: n, name: a0.getLiteralText() });
        }
      } else if (Node.isPropertyAccessExpression(n) && ENV_RECEIVERS.includes(n.getExpression().getText())) envReads.push({ node: n, name: n.getName() });
      else if (Node.isElementAccessExpression(n) && ENV_RECEIVERS.includes(n.getExpression().getText())) {
        const a = unwrap(n.getArgumentExpression());
        if (a && Node.isStringLiteral(a)) envReads.push({ node: n, name: a.getLiteralText() });
      }
    });
    let findings: { node: Node; finding: Finding }[] = [];
    try {
      const facts = factsWithNodes(sf);
      facts.facts.forEach((f, i) => {
        if (f.kind === "call" || f.kind === "new" || f.kind === "tagged") factOf.set(facts.nodes[i], f);
      });
      findings = applyRulesIndexed(facts)
        .filter(({ finding, fact }) => finding.kind !== "import" && facts.facts[fact].kind !== "import")
        .map(({ finding, fact }) => ({ node: facts.nodes[fact], finding }));
    } catch (err) {
      process.stderr.write(`hesperus-ts: flow skipping rules in ${relOf(sf)}: ${(err as Error).message}\n`);
    }
    perFile.set(sf, { calls, findings, envReads });
    for (const f of findings) if (f.finding.kind === "ingress") ingressFindings.push({ node: f.node, finding: f.finding });
  }
  const originOf = (call: Node): { module: string; symbol: string } | null => {
    const f = factOf.get(call);
    return f && f.kind !== "import" && f.kind !== "compare" && f.kind !== "property" ? f.origin : null;
  };
  /** Is the receiver of this call an event emitter: by its import origin, or by the `new EventEmitter()` its declaration holds (in any file). */
  const onEmitter = (c: Node): boolean => {
    const o = originOf(c);
    if (o && EVENT_MODULES.includes(o.module)) return true;
    if (!Node.isCallExpression(c)) return false;
    const callee = unwrap(c.getExpression());
    if (!callee || !Node.isPropertyAccessExpression(callee)) return false;
    const recv = unwrap(callee.getExpression());
    if (!recv || !(Node.isIdentifier(recv) || Node.isPropertyAccessExpression(recv))) return false;
    let sym = (Node.isPropertyAccessExpression(recv) ? recv.getNameNode() : recv).getSymbol();
    if (sym && sym.getFlags() & ts.SymbolFlags.Alias) {
      try {
        sym = sym.getAliasedSymbol() ?? sym;
      } catch {
        // unresolvable
      }
    }
    for (const d of sym?.getDeclarations() ?? []) {
      if (!Node.isVariableDeclaration(d) && !Node.isPropertyDeclaration(d) && !Node.isPropertyAssignment(d)) continue;
      const init = unwrap(d.getInitializer());
      if (!init) continue;
      const io = originOf(init);
      if (io && EVENT_MODULES.includes(io.module)) return true;
    }
    return false;
  };
  const calleeName = (c: Node): string => {
    if (!Node.isCallExpression(c) && !Node.isNewExpression(c)) return "";
    const callee = unwrap(c.getExpression());
    return callee && Node.isPropertyAccessExpression(callee) ? callee.getName() : callee && Node.isIdentifier(callee) ? callee.getText() : "";
  };

  // ---- entries
  type Entry = { kind: FlowEntry["kind"]; label: string; also?: string[]; protocol: FlowEntry["protocol"]; fn: Fn | SourceFile; at: string; chain?: Fn[] };
  const entries: Entry[] = [];
  const addEntry = (e: Entry) => {
    if (!entries.some((x) => x.fn === e.fn && x.label === e.label)) entries.push(e);
  };
  /** The function a handler argument names: an inline function, an identifier or a property (`users.list`). */
  const fnOf = (a: Node | undefined): Fn | null => {
    const n = unwrap(a);
    if (!n) return null;
    if (Node.isArrowFunction(n) || Node.isFunctionExpression(n)) return n;
    if (Node.isPropertyAccessExpression(n)) return bySymbol(n.getNameNode(), false);
    if (Node.isIdentifier(n)) return bySymbol(n, false) ?? byImport(n.getSourceFile(), n.getText(), null, false);
    return null;
  };
  /** An object literal, following an identifier to the object its declaration is initialized with. */
  const objectOf = (a: Node | undefined): Node | null => {
    const n = unwrap(a);
    if (!n) return null;
    if (Node.isObjectLiteralExpression(n)) return n;
    if (Node.isIdentifier(n) || Node.isPropertyAccessExpression(n)) {
      let sym = (Node.isPropertyAccessExpression(n) ? n.getNameNode() : n).getSymbol();
      if (sym && sym.getFlags() & ts.SymbolFlags.Alias) {
        try {
          sym = sym.getAliasedSymbol() ?? sym;
        } catch {
          // unresolvable
        }
      }
      for (const d of sym?.getDeclarations() ?? []) {
        if (Node.isVariableDeclaration(d) || Node.isPropertyAssignment(d)) {
          const init = unwrap(d.getInitializer());
          if (init && Node.isObjectLiteralExpression(init)) return init;
        }
      }
      if (Node.isIdentifier(n)) {
        // an import the checker could not follow
        for (const imp of n.getSourceFile().getImportDeclarations()) {
          const named = imp.getNamedImports().find((ni) => (ni.getAliasNode() ?? ni.getNameNode()).getText() === n.getText());
          const exportName = named ? named.getNameNode().getText() : imp.getDefaultImport()?.getText() === n.getText() ? "default" : null;
          if (!exportName) continue;
          const target = ws.resolve(relOf(n.getSourceFile()), imp.getModuleSpecifierValue());
          const tsf = target ? files.get(target) : undefined;
          for (const d of tsf?.getExportedDeclarations().get(exportName) ?? []) {
            if (Node.isVariableDeclaration(d)) {
              const init = unwrap(d.getInitializer());
              if (init && Node.isObjectLiteralExpression(init)) return init;
            }
          }
        }
      }
    }
    return null;
  };
  /** Handlers in a `Bun.serve({ routes })` / `{ "/path": fn | { GET: fn } }` object. */
  const routeObjectHandlers = (obj: Node): { fn: Fn; label: string }[] => {
    const out: { fn: Fn; label: string }[] = [];
    if (!Node.isObjectLiteralExpression(obj)) return out;
    for (const p of obj.getProperties()) {
      if (!Node.isPropertyAssignment(p) && !Node.isMethodDeclaration(p)) continue;
      const nameNode = p.getNameNode();
      const route = Node.isStringLiteral(nameNode) || Node.isNoSubstitutionTemplateLiteral(nameNode) ? nameNode.getLiteralText() : p.getName();
      if (!route.startsWith("/")) continue;
      if (Node.isMethodDeclaration(p)) {
        out.push({ fn: p, label: `ROUTE ${route}` });
        continue;
      }
      const init = unwrap(p.getInitializer());
      if (init && Node.isObjectLiteralExpression(init)) {
        for (const q of init.getProperties()) {
          if (Node.isMethodDeclaration(q)) out.push({ fn: q, label: `${q.getName().toUpperCase()} ${route}` });
          else if (Node.isPropertyAssignment(q)) {
            const fn = fnOf(q.getInitializer());
            if (fn) out.push({ fn, label: `${q.getName().toUpperCase()} ${route}` });
          } else if (Node.isShorthandPropertyAssignment(q)) {
            const fn = declToFn(q, false);
            if (fn) out.push({ fn, label: `${q.getName().toUpperCase()} ${route}` });
          }
        }
        continue;
      }
      const fn = fnOf(p.getInitializer());
      if (fn) out.push({ fn, label: `ROUTE ${route}` });
    }
    return out;
  };
  /** Handlers named by one argument of an ingress call: functions, `{ fetch, websocket: { ... }, routes: { ... } }` objects. */
  const handlerFns = (arg: Node | undefined, protocol: "http" | "ws"): { fn: Fn; label?: string }[] => {
    const a = unwrap(arg);
    if (!a) return [];
    if (Node.isObjectLiteralExpression(a)) {
      const out: { fn: Fn; label?: string }[] = [];
      const keys = protocol === "ws" ? ["websocket"] : ["fetch", "handler", "requestListener", "routes"];
      for (const p of a.getProperties()) {
        const name = Node.isPropertyAssignment(p) || Node.isMethodDeclaration(p) || Node.isShorthandPropertyAssignment(p) ? p.getName() : "";
        if (!keys.includes(name)) continue;
        if (name === "routes") {
          const obj = Node.isPropertyAssignment(p) ? objectOf(p.getInitializer()) : Node.isShorthandPropertyAssignment(p) ? objectOf(p.getNameNode()) : null;
          if (obj) out.push(...routeObjectHandlers(obj));
          continue;
        }
        if (Node.isMethodDeclaration(p)) out.push({ fn: p });
        else if (Node.isPropertyAssignment(p)) {
          const init = unwrap(p.getInitializer());
          if (init && Node.isObjectLiteralExpression(init)) {
            for (const q of init.getProperties()) {
              if (Node.isMethodDeclaration(q)) out.push({ fn: q, label: `ws ${q.getName()}` });
              else if (Node.isPropertyAssignment(q)) {
                const fn = fnOf(q.getInitializer());
                if (fn) out.push({ fn, label: `ws ${q.getName()}` });
              } else if (Node.isShorthandPropertyAssignment(q)) {
                const fn = declToFn(q, false);
                if (fn) out.push({ fn, label: `ws ${q.getName()}` });
              }
            }
          } else {
            const fn = fnOf(p.getInitializer());
            if (fn) out.push({ fn });
          }
        } else if (Node.isShorthandPropertyAssignment(p)) {
          const fn = declToFn(p, false);
          if (fn) out.push({ fn });
        }
      }
      return out;
    }
    const fn = fnOf(a);
    return fn ? [{ fn }] : [];
  };
  // router mounts: `app.use("/api", r)` / `app.route("/api", r)` give the routes registered on `r` a prefix
  const mountPrefix = new Map<Node, { prefix: string; on: Node | null }>(); // router declaration -> prefix and the parent router's declaration
  const routerDecl = (receiver: Node | undefined): Node | null => {
    const r = unwrap(receiver);
    if (!r || !Node.isIdentifier(r)) return null;
    let sym = r.getSymbol();
    if (sym && sym.getFlags() & ts.SymbolFlags.Alias) {
      try {
        sym = sym.getAliasedSymbol() ?? sym;
      } catch {
        // unresolvable
      }
    }
    return sym?.getDeclarations()?.find((d) => Node.isVariableDeclaration(d)) ?? null;
  };
  for (const { node } of ingressFindings) {
    if (!Node.isCallExpression(node)) continue;
    const name = calleeName(node);
    if (name !== "use" && name !== "route") continue;
    const args = node.getArguments();
    const a0 = unwrap(args[0]);
    if (!a0 || !Node.isStringLiteral(a0) || !a0.getLiteralText().startsWith("/")) continue;
    const callee = unwrap(node.getExpression());
    const parent = callee && Node.isPropertyAccessExpression(callee) ? routerDecl(callee.getExpression()) : null;
    for (const a of args.slice(1)) {
      const decl = routerDecl(a);
      if (decl && !fnOf(a)) mountPrefix.set(decl, { prefix: a0.getLiteralText().replace(/\/$/, ""), on: parent });
    }
  }
  const prefixOf = (call: Node): string => {
    const callee = Node.isCallExpression(call) ? unwrap(call.getExpression()) : undefined;
    let decl = callee && Node.isPropertyAccessExpression(callee) ? routerDecl(callee.getExpression()) : null;
    let prefix = "";
    for (let i = 0; i < 8 && decl; i++) {
      const m = mountPrefix.get(decl);
      if (!m) break;
      prefix = m.prefix + prefix;
      decl = m.on;
    }
    return prefix;
  };
  for (const { node, finding } of ingressFindings) {
    if (Node.isCallExpression(node) || Node.isNewExpression(node)) {
      const found: { fn: Fn; label?: string }[] = [];
      for (const arg of node.getArguments()) found.push(...handlerFns(arg, finding.protocol));
      if (!found.length) continue;
      // a route with several handlers is one entry: the first handler, then the rest as the chain
      const route = /^([A-Z]+) (\/.*)$/.exec(finding.detail);
      const label = route ? `${route[1]} ${prefixOf(node)}${route[2]}` : finding.detail;
      const plain = found.filter((h) => !h.label);
      for (const h of found) if (Node.isArrowFunction(h.fn) || Node.isFunctionExpression(h.fn)) entryFns.add(h.fn);
      if (plain.length) addEntry({ kind: "route", label, protocol: finding.protocol, fn: plain[0].fn, at: at(node), chain: plain.slice(1).map((h) => h.fn) });
      for (const h of found) if (h.label) addEntry({ kind: "route", label: h.label, protocol: finding.protocol, fn: h.fn, at: at(node) });
    } else {
      // a pathname comparison: the function it sits in handles that route; one entry per function, the other routes under `also`
      const fn = enclosingUnit(node) ?? node.getSourceFile();
      const existing = entries.find((x) => x.fn === fn && x.kind === "route" && x.label.startsWith("MATCH "));
      if (existing) {
        if (existing.label !== finding.detail && !existing.also?.includes(finding.detail)) (existing.also ??= []).push(finding.detail);
      } else addEntry({ kind: "route", label: finding.detail, protocol: finding.protocol, fn, at: at(node) });
    }
  }
  // event handlers: `.on("name", fn)` on an emitter from a known module; `.emit("name")` reaches them
  const eventHandlers = new Map<string, Fn[]>();
  for (const [sf, { calls }] of perFile) {
    for (const c of calls) {
      if (!Node.isCallExpression(c)) continue;
      const name = calleeName(c);
      // `addEventListener(name, fn)` on anything (the DOM, a worker, a socket) registers a handler too
      if (name !== "on" && name !== "once" && name !== "addListener" && name !== "addEventListener") continue;
      if (name !== "addEventListener" && !onEmitter(c)) continue;
      const a0 = unwrap(c.getArguments()[0]);
      if (!a0 || !Node.isStringLiteral(a0)) continue;
      const fn = fnOf(c.getArguments()[1]);
      if (!fn) continue;
      if (Node.isArrowFunction(fn) || Node.isFunctionExpression(fn)) entryFns.add(fn);
      const ev = a0.getLiteralText();
      if (!eventHandlers.has(ev)) eventHandlers.set(ev, []);
      eventHandlers.get(ev)!.push(fn);
      addEntry({ kind: "event", label: `on ${ev}`, protocol: null, fn, at: at(c) });
    }
    void sf;
  }
  // `bin` entries and shebang files: their top-level code runs first
  const moduleEntries = new Set<SourceFile>();
  for (const f of ws.binFiles()) {
    const sf = files.get(f);
    if (sf) moduleEntries.add(sf);
  }
  for (const sf of files.values()) if (sf.getFullText().startsWith("#!")) moduleEntries.add(sf);
  for (const sf of [...moduleEntries].sort((a, b) => cmp(relOf(a), relOf(b)))) addEntry({ kind: "module", label: path.posix.basename(relOf(sf)), protocol: null, fn: sf, at: `${relOf(sf)}:1` });
  // `main`, when exported or called from the top level of a file that is not itself an entry
  for (const sf of files.values()) {
    if (moduleEntries.has(sf)) continue;
    const decl = sf.getFunction("main") ?? sf.getVariableDeclaration("main");
    if (!decl) continue;
    const fn = declToFn(decl, false);
    if (!fn) continue;
    const exported = Node.isFunctionDeclaration(decl) ? decl.isExported() : decl.getVariableStatement()?.isExported() ?? false;
    const calledAtTop = perFile.get(sf)!.calls.some((c) => Node.isCallExpression(c) && unwrap(c.getExpression())?.getText() === "main" && enclosingUnit(c) === null);
    if (exported || calledAtTop) addEntry({ kind: "main", label: "main", protocol: null, fn, at: at(fn) });
  }
  // CLI command handlers and host-called exports
  for (const sf of files.values()) {
    const imports = new Set(sf.getImportDeclarations().map((i) => i.getModuleSpecifierValue()));
    if (CLI_MODULES.some((m) => imports.has(m))) {
      for (const c of perFile.get(sf)!.calls) {
        if (!Node.isCallExpression(c)) continue;
        const callee = unwrap(c.getExpression());
        const name = callee && Node.isPropertyAccessExpression(callee) ? callee.getName() : callee && Node.isIdentifier(callee) ? callee.getText() : "";
        if (name === "action" || name === "command") {
          const fnArg = [...c.getArguments()].reverse().map((a) => unwrap(a)).find((a) => a && (Node.isArrowFunction(a) || Node.isFunctionExpression(a) || Node.isIdentifier(a)));
          const fn = fnArg ? fnOf(fnArg) : null;
          if (!fn) continue;
          if (Node.isArrowFunction(fn) || Node.isFunctionExpression(fn)) entryFns.add(fn);
          addEntry({ kind: "command", label: commandLabel(c), protocol: null, fn, at: at(c) });
        } else if (name === "defineCommand") {
          const obj = unwrap(c.getArguments()[0]);
          if (!obj || !Node.isObjectLiteralExpression(obj)) continue;
          const run = obj.getProperty("run");
          const fn = run ? (Node.isMethodDeclaration(run) ? run : Node.isPropertyAssignment(run) ? declToFn(run, false) : null) : null;
          if (fn) addEntry({ kind: "command", label: `command ${commandLabel(c)}`.trim(), protocol: null, fn, at: at(c) });
        }
      }
    }
    for (const h of HOST_EXPORTS) {
      if (!imports.has(h.module)) continue;
      let exported: ReadonlyMap<string, Node[]>;
      try {
        exported = sf.getExportedDeclarations();
      } catch {
        continue;
      }
      for (const n of h.names) {
        const fn = fromDecls(exported.get(n), false);
        if (fn && relOf(fn.getSourceFile()) === relOf(sf)) addEntry({ kind: "export", label: n, protocol: null, fn, at: at(fn) });
      }
    }
  }

  // ---- attribute calls and crossings to units (after entries, so inline handlers are units)
  debug("entries done");
  for (const [sf, { calls, findings }] of perFile) {
    debug(`attribute ${relOf(sf)}`);
    const push = (unit: Fn | SourceFile, raw: Raw) => {
      if (!rawByUnit.has(unit)) rawByUnit.set(unit, []);
      rawByUnit.get(unit)!.push(raw);
    };
    for (const c of calls) {
      const target = resolveCallee(c);
      if (target) {
        push(enclosingUnit(c) ?? sf, { pos: c.getStart(), node: c, call: target });
        continue;
      }
      if (!Node.isCallExpression(c) && !Node.isNewExpression(c)) continue;
      const o = originOf(c);
      const name = calleeName(c);
      if (!o) continue;
      // a function handed to a timer runs later; every function argument counts
      if (o && TIMERS.some((t) => t.module.includes(o.module) && t.callee.includes(name) && (o.module !== "<global>" || name === "nextTick" ? true : o.symbol === name))) {
        for (const a of c.getArguments()) {
          const fn = fnOf(a);
          if (fn && !(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn))) push(enclosingUnit(c) ?? sf, { pos: c.getStart(), node: c, call: fn, how: "timer" });
        }
        continue;
      }
      // an emit reaches every handler registered under that name
      if (name === "emit" && onEmitter(c)) {
        const a0 = unwrap(c.getArguments()[0]);
        if (a0 && Node.isStringLiteral(a0)) for (const fn of eventHandlers.get(a0.getLiteralText()) ?? []) push(enclosingUnit(c) ?? sf, { pos: c.getStart(), node: c, call: fn, how: "event" });
      }
    }
    for (const { node, finding } of findings) {
      const crossing = crossingOf(finding, at(node));
      if (crossing) push(enclosingUnit(node) ?? sf, { pos: node.getStart(), node, crossing });
    }
    const envSeen = new Map<Fn | SourceFile, Set<string>>();
    for (const { node, name } of perFile.get(sf)!.envReads) {
      const unit = enclosingUnit(node) ?? sf;
      if (!envSeen.has(unit)) envSeen.set(unit, new Set());
      if (envSeen.get(unit)!.has(name)) continue;
      envSeen.get(unit)!.add(name);
      const b = adoptBoundary(bindings, "hardware", { name: "env" }, "env");
      push(unit, { pos: node.getStart(), node, crossing: { boundary: "config", node: b.id, label: name, edge: "reads", resolved: true, at: at(node) } });
    }
  }
  for (const raws of rawByUnit.values()) raws.sort((a, b) => a.pos - b.pos);

  function crossingOf(fd: Finding, where: string): FlowCrossing | null {
    switch (fd.kind) {
      case "ingress": {
        const b = adoptBoundary(bindings, "ingress", { protocol: fd.protocol }, fd.protocol);
        return { boundary: "ingress", node: b.id, label: fd.detail, edge: fd.protocol, resolved: true, at: where };
      }
      case "by-url": {
        const { host, relative } = classifyUrl(fd.url);
        if (host) {
          const b = adoptBoundary(bindings, "external", { host }, identify(host));
          return { boundary: "external", node: b.id, label: b.label ?? host, edge: fd.edge, resolved: true, at: where };
        }
        if (relative) {
          const b = adoptBoundary(bindings, "ingress", { protocol: fd.edge }, fd.edge);
          return { boundary: "ingress", node: b.id, label: fd.url ?? (fd.edge === "http" ? "HTTP" : "WebSocket"), edge: fd.edge, resolved: true, at: where };
        }
        const b = adoptBoundary(bindings, "network", { name: "unresolved" }, "unresolved");
        return { boundary: "network", node: b.id, label: b.label ?? "unresolved", edge: fd.edge, resolved: false, at: where };
      }
      case "store": {
        const b = adoptBoundary(bindings, "store", { engine: fd.engine }, identify(fd.engine));
        return { boundary: "store", node: b.id, label: b.label ?? fd.engine, edge: fd.access, resolved: fd.access !== "unknown", at: where };
      }
      case "hardware": {
        const b = adoptBoundary(bindings, "hardware", { name: fd.name }, fd.name);
        return { boundary: "hardware", node: b.id, label: b.label ?? fd.label, edge: "io", resolved: true, at: where };
      }
      case "import":
        return null;
    }
  }

  // ---- walk each entry, in source order, bounded; remember which entries pass each unit
  const out: FlowEntry[] = [];
  const entriesThrough = new Map<Fn | SourceFile, Set<string>>();
  for (const e of entries) {
    debug(`walk ${e.kind} ${e.label}`);
    const unit = unitOf(e.fn);
    let budget = maxSteps;
    let exhausted = false;
    const seen = new Set<Fn | SourceFile>([e.fn]);
    const passed = new Set<Fn | SourceFile>([e.fn]);
    const walk = (fn: Fn | SourceFile, depth: number, onPath: Set<Fn | SourceFile>): FlowStep[] => {
      const steps: FlowStep[] = [];
      for (const raw of rawByUnit.get(fn) ?? []) {
        if (raw.crossing) {
          if (exhausted) break;
          if (budget <= 1) {
            // the last slot holds the marker, so an entry never exceeds its budget
            exhausted = true;
            steps.push({ call: unitOf(fn), at: raw.crossing.at, cut: "steps" });
            break;
          }
          budget--;
          steps.push(raw.crossing);
          continue;
        }
        if (exhausted) break;
        const callee = raw.call!;
        const s = step(callee, at(raw.node), depth, onPath, raw.how);
        steps.push(s);
        if (exhausted) break;
      }
      return steps;
    };
    const step = (callee: Fn | SourceFile, where: string, depth: number, onPath: Set<Fn | SourceFile>, how?: FlowCall["how"]): FlowCall => {
      const id = unitOf(callee);
      const h = how ? { how } : {};
      if (budget <= 1) {
        exhausted = true;
        return { call: id, at: where, cut: "steps", ...h };
      }
      budget--;
      passed.add(callee);
      if (onPath.has(callee)) return { call: id, at: where, cut: "cycle", ...h };
      if (seen.has(callee)) return { call: id, at: where, cut: "seen", ...h };
      if (depth >= maxDepth) return { call: id, at: where, cut: "depth", ...h };
      seen.add(callee);
      onPath.add(callee);
      const inner = walk(callee, depth + 1, onPath);
      onPath.delete(callee);
      return { call: id, at: where, steps: inner, ...h };
    };
    const first = walk(e.fn, 1, new Set([e.fn]));
    // a middleware chain: the next handlers run after the first, in registration order
    for (const next of e.chain ?? []) if (!exhausted) first.push(step(next, e.at, 1, new Set([e.fn]), "next"));
    const entry: FlowEntry = { id: `${e.kind}:${unit}`, kind: e.kind, label: e.label, ...(e.also?.length ? { also: e.also } : {}), protocol: e.protocol, unit, at: e.at, steps: first };
    out.push(entry);
    for (const fn of passed) {
      if (!entriesThrough.has(fn)) entriesThrough.set(fn, new Set());
      entriesThrough.get(fn)!.add(entry.id);
    }
  }
  out.sort((a, b) => evidenceOrder(a.at, b.at) || cmp(a.label, b.label) || cmp(a.id, b.id));
  // entries with the same kind and unit but different labels (two routes, one handler) keep distinct ids
  const ids = new Map<string, number>();
  const renamed = new Map<string, string>();
  for (const e of out) {
    const n = ids.get(e.id) ?? 0;
    ids.set(e.id, n + 1);
    if (n > 0) {
      const old = e.id;
      e.id = `${e.id}@${n + 1}`;
      renamed.set(old, e.id);
    }
  }
  // (a renamed entry shares its unit with the first one, so the per-unit entry sets already name both)
  void renamed;

  // ---- constraints: `from -> to [: kind]` over every unit in the repository, reached or not
  const constraints: FlowConstraint[] = (opts.intent?.constraints ?? []).map((c: IrConstraint) => {
    const witnesses: { at: string; entries: string[] }[] = [];
    for (const [fn, raws] of rawByUnit) {
      const file = relOf(fn.getSourceFile());
      const ownerId = owner.get(file) ?? `${root}.unbound.root`;
      if (!within(ownerId, c.from)) continue;
      for (const raw of raws) {
        let hit = false;
        if (raw.crossing) hit = within(raw.crossing.node, c.to) && (c.kind === null || c.kind === raw.crossing.edge || (c.kind === "reads" && raw.crossing.edge === "unknown") || (c.kind === "writes" && raw.crossing.edge === "unknown"));
        else {
          const calleeFile = relOf(raw.call!.getSourceFile());
          const calleeOwner = owner.get(calleeFile) ?? `${root}.unbound.root`;
          hit = !within(calleeOwner, c.from) && within(calleeOwner, c.to) && (c.kind === null || c.kind === "calls");
        }
        if (!hit) continue;
        const where = at(raw.node);
        if (witnesses.some((w) => w.at === where)) continue;
        witnesses.push({ at: where, entries: [...(entriesThrough.get(fn) ?? [])].sort() });
      }
    }
    witnesses.sort((a, b) => evidenceOrder(a.at, b.at));
    return { rule: c.rule, from: c.from, to: c.to, kind: c.kind, satisfied: c.rule === "require" ? witnesses.length > 0 : witnesses.length === 0, witnesses: witnesses.slice(0, MAX_WITNESSES) };
  });
  constraints.sort((a, b) => cmp(a.rule, b.rule) || cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.kind ?? "", b.kind ?? ""));

  // ---- components: every owner and boundary the flow names, as the intent names them
  const named = new Map<string, string>(); // id -> kind when known from a crossing
  for (const u of unitById.values()) if (!named.has(u.owner)) named.set(u.owner, "");
  for (const c of constraints) for (const id of [c.from, c.to]) if (!named.has(id)) named.set(id, "");
  for (const raws of rawByUnit.values()) for (const raw of raws) if (raw.crossing) named.set(raw.crossing.node, raw.crossing.boundary);
  const components: FlowComponent[] = [...named.keys()].sort().map((id) => {
    const n = bindings.nodes.get(id);
    const name = id.slice(id.lastIndexOf(".") + 1);
    const kind = n?.kind ?? named.get(id) ?? "";
    return { id, name, label: n?.label ?? (id === `${root}.unbound` ? "Code no intent node binds" : null), kind: kind || (id === root ? "system" : id.startsWith(`${root}.unbound.`) ? (name === "unbound" ? "subsystem" : "component") : "component") };
  });

  return {
    flow: FLOW_VERSION,
    generated: EXTRACTOR,
    root,
    limits: { depth: maxDepth, steps: maxSteps },
    components,
    units: [...unitById.values()].sort((a, b) => cmp(a.id, b.id)),
    entries: out,
    constraints,
  };
}

export function toFlowJson(f: Flow): string {
  return JSON.stringify(f, null, 2) + "\n";
}

/** Write `flow.json`, creating its directory. */
export function writeFlow(f: Flow, file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, toFlowJson(f));
}

/** `Class.method`, `obj.key`, a declared name, or `anonymous` for an inline function. */
function unitName(fn: Node): string {
  if (Node.isFunctionDeclaration(fn)) return fn.getName() ?? "default";
  if (Node.isMethodDeclaration(fn) || Node.isGetAccessorDeclaration(fn) || Node.isSetAccessorDeclaration(fn) || Node.isConstructorDeclaration(fn)) {
    const own = Node.isConstructorDeclaration(fn) ? "constructor" : Node.isMethodDeclaration(fn) ? keyName(fn) : fn.getName();
    return `${containerName(fn.getParent())}.${own}`;
  }
  const p = unwrapParent(fn);
  if (Node.isVariableDeclaration(p)) return p.getName();
  if (Node.isPropertyDeclaration(p)) return `${containerName(p.getParent())}.${p.getName()}`;
  if (Node.isPropertyAssignment(p)) return `${containerName(p.getParent())}.${keyName(p)}`;
  if (Node.isExportAssignment(p)) return "default";
  return "anonymous";
}

/** A property's key as written, without quotes. */
function keyName(p: Node): string {
  if (!Node.isPropertyAssignment(p) && !Node.isMethodDeclaration(p)) return "";
  const n = p.getNameNode();
  return Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n) ? n.getLiteralText() : p.getName();
}

/** The name of a class or object literal: its declared name, the variable it initializes, else `<class>`/`<object>`. */
function containerName(c: Node | undefined): string {
  if (!c) return "<object>";
  if (Node.isClassDeclaration(c) || Node.isClassExpression(c)) {
    const n = c.getName();
    if (n) return n;
    const p = unwrapParent(c);
    return Node.isVariableDeclaration(p) ? p.getName() : "<class>";
  }
  if (Node.isObjectLiteralExpression(c)) {
    const p = unwrapParent(c);
    if (Node.isVariableDeclaration(p)) return p.getName();
    if (Node.isPropertyAssignment(p)) return `${containerName(p.getParent())}.${p.getName()}`;
    if (Node.isCallExpression(p) || Node.isNewExpression(p)) {
      const callee = p.getExpression();
      return Node.isPropertyAccessExpression(callee) ? callee.getName() : callee.getText();
    }
    return "<object>";
  }
  return "<object>";
}

/** `commander`-style chains: the first string of `.command("name ...")` in the receiver chain, else the call name. */
function commandLabel(call: Node): string {
  let cur: Node | undefined = call;
  for (let i = 0; i < 32 && cur; i++) {
    if (Node.isCallExpression(cur)) {
      const callee = cur.getExpression();
      const name = Node.isPropertyAccessExpression(callee) ? callee.getName() : callee.getText();
      const a0 = cur.getArguments()[0];
      if ((name === "command" || name === "defineCommand") && a0 && (Node.isStringLiteral(a0) || Node.isNoSubstitutionTemplateLiteral(a0))) return `command ${a0.getLiteralText().split(/\s+/)[0]}`;
      if (name === "defineCommand" && a0 && Node.isObjectLiteralExpression(a0)) {
        const meta = a0.getProperty("meta");
        const init = meta && Node.isPropertyAssignment(meta) ? unwrap(meta.getInitializer()) : undefined;
        const nm = init && Node.isObjectLiteralExpression(init) ? init.getProperty("name") : undefined;
        const v = nm && Node.isPropertyAssignment(nm) ? unwrap(nm.getInitializer()) : undefined;
        if (v && Node.isStringLiteral(v)) return `command ${v.getLiteralText()}`;
        return "defineCommand";
      }
      cur = Node.isPropertyAccessExpression(callee) ? callee.getExpression() : undefined;
    } else if (Node.isPropertyAccessExpression(cur)) cur = cur.getExpression();
    else break;
  }
  const callee = Node.isCallExpression(call) ? call.getExpression() : call;
  return Node.isPropertyAccessExpression(callee) ? callee.getName() : callee.getText();
}

/** Through parentheses, `as`, `!`, `await`, `satisfies`. */
function unwrap(n: Node | undefined): Node | undefined {
  let cur = n;
  for (let i = 0; i < 16 && cur; i++) {
    if (Node.isParenthesizedExpression(cur) || Node.isAsExpression(cur) || Node.isNonNullExpression(cur) || Node.isAwaitExpression(cur) || Node.isSatisfiesExpression(cur) || Node.isTypeAssertion(cur)) cur = cur.getExpression();
    else return cur;
  }
  return cur;
}

/** The parent of a function, skipping wrappers (`export default (() => {})`, `(x as T)`). */
function unwrapParent(n: Node): Node | undefined {
  let cur = n.getParent();
  for (let i = 0; i < 16 && cur; i++) {
    if (Node.isParenthesizedExpression(cur) || Node.isAsExpression(cur) || Node.isNonNullExpression(cur) || Node.isSatisfiesExpression(cur) || Node.isTypeAssertion(cur)) cur = cur.getParent();
    else return cur;
  }
  return cur;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `path:line` by path, then numeric line. */
function evidenceOrder(a: string, b: string): number {
  const [pa, la] = splitAt(a);
  const [pb, lb] = splitAt(b);
  return cmp(pa, pb) || la - lb;
}

function splitAt(s: string): [string, number] {
  const i = s.lastIndexOf(":");
  return i < 0 ? [s, 0] : [s.slice(0, i), Number(s.slice(i + 1)) || 0];
}
