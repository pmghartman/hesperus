// Assemble the actual IR of a repository from bindings and per-file findings.

import { Bindings } from "./bindings.js";
import { analyze, classifyUrl, Finding, newProject } from "./heuristics.js";
import { canonicalize, edge, edgeKey, EXTRACTOR, identify, Ir, IrEdge, IrNode, node, NodeKind, Protocol, within } from "./ir.js";
import { Workspace } from "./workspace.js";

export interface ExtractOptions {
  /** Intent IR; null means no bindings (everything is unbound). */
  intent: Ir | null;
  /** Root name when there is no intent. */
  rootName?: string;
}

export function extract(repoRoot: string, opts: ExtractOptions): Ir {
  const ws = new Workspace(repoRoot);
  const fallbackRoot = opts.rootName ?? identify(repoRoot.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "repo");
  const bindings = new Bindings(opts.intent, fallbackRoot);
  const root = bindings.root;
  const project = newProject();

  const nodes = new Map<string, IrNode>();
  const edges = new Map<string, IrEdge>();
  const ensureNode = (id: string, kind: NodeKind, extra: Partial<IrNode> = {}): IrNode => {
    let n = nodes.get(id);
    if (!n) {
      n = node(id, kind, extra);
      nodes.set(id, n);
      // every ancestor exists too
      if (n.parent) {
        const parentIntent = bindings.nodes.get(n.parent);
        ensureNode(n.parent, parentIntent?.kind ?? (n.parent === root ? "system" : "subsystem"), parentIntent ? { label: parentIntent.label } : {});
      }
    }
    return n;
  };
  const addEdge = (from: string, to: string, kind: IrEdge["kind"], at: string, resolved = true) => {
    if (from === to || within(from, to) || within(to, from)) return;
    const e = edge(from, to, kind, { resolved });
    const key = edgeKey(e);
    const existing = edges.get(key);
    if (existing) {
      existing.at.push(at);
      existing.resolved = existing.resolved && resolved;
    } else {
      e.at.push(at);
      edges.set(key, e);
    }
  };

  const rootIntent = bindings.nodes.get(root);
  ensureNode(root, "system", { label: rootIntent?.label ?? null });

  // boundary node ids, created lazily and adopted from intent when a binding matches
  const unboundId = `${root}.unbound`;
  const boundary = (kind: NodeKind, key: { host?: string; engine?: string; protocol?: Protocol; name?: string }, fallbackName: string, extra: Partial<IrNode>): string => {
    const adopted = bindings.adopt(kind, key);
    const id = adopted ? adopted.id : `${root}.${fallbackName}`;
    const n = ensureNode(id, kind, { ...extra, label: adopted?.label ?? extra.label ?? null });
    if (extra.host) n.host = extra.host;
    if (extra.engine) n.engine = extra.engine;
    if (extra.protocol) n.protocol = extra.protocol;
    return id;
  };

  // which node owns each file
  const owner = new Map<string, string>();
  for (const f of ws.files) {
    const bound = bindings.bindFile(f);
    owner.set(f, bound ?? `${unboundId}.${unboundComponent(f)}`);
  }

  // findings per file, in sorted file order
  for (const f of ws.files) {
    const from = owner.get(f)!;
    const intentNode = bindings.nodes.get(from);
    if (intentNode) {
      ensureNode(from, intentNode.kind, { label: intentNode.label });
    } else {
      const c = ensureNode(from, "component", { label: null });
      const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ".";
      const topDir = unboundDir(f);
      if (!c.src.includes(topDir)) c.src.push(topDir);
      void dir;
    }
    let findings: Finding[];
    try {
      findings = analyze(project, f, ws.read(f));
    } catch (err) {
      process.stderr.write(`hesperus-ts: skipping ${f}: ${(err as Error).message}\n`);
      continue;
    }
    for (const fd of findings) {
      const at = `${f}:${fd.line}`;
      switch (fd.kind) {
        case "import": {
          const target = ws.resolve(f, fd.spec);
          if (!target) break;
          const to = owner.get(target);
          if (!to) break;
          const toIntent = bindings.nodes.get(to);
          if (toIntent) ensureNode(to, toIntent.kind, { label: toIntent.label });
          else {
            const c = ensureNode(to, "component");
            const topDir = unboundDir(target);
            if (!c.src.includes(topDir)) c.src.push(topDir);
          }
          addEdge(from, to, "calls", at);
          break;
        }
        case "route": {
          const id = boundary("ingress", { protocol: "http" }, "http", { protocol: "http", label: "HTTP" });
          nodes.get(id)!.at.push(at);
          addEdge(id, from, "http", at);
          break;
        }
        case "ws-server": {
          const id = boundary("ingress", { protocol: "ws" }, "ws", { protocol: "ws", label: "WebSocket" });
          nodes.get(id)!.at.push(at);
          addEdge(id, from, "ws", at);
          break;
        }
        case "http":
        case "ws-client": {
          const edgeKind = fd.kind === "http" ? "http" : "ws";
          const { host, relative } = classifyUrl(fd.url);
          if (host) {
            const id = boundary("external", { host }, identify(host), { host, protocol: edgeKind, label: host });
            nodes.get(id)!.at.push(at);
            addEdge(from, id, edgeKind, at);
          } else if (relative) {
            // a call to our own server: the ingress it reaches
            const id = boundary("ingress", { protocol: edgeKind }, edgeKind, { protocol: edgeKind, label: edgeKind === "http" ? "HTTP" : "WebSocket" });
            addEdge(from, id, edgeKind, at);
          } else {
            const id = boundary("network", { name: "unresolved" }, "unresolved", { label: "Unresolved network targets" });
            addEdge(from, id, edgeKind, at, false);
          }
          break;
        }
        case "store": {
          const id = boundary("store", { engine: fd.engine }, identify(fd.engine), { engine: fd.engine, label: fd.engine });
          nodes.get(id)!.at.push(at);
          if (fd.access === "unknown") {
            addEdge(from, id, "reads", at, false);
            addEdge(from, id, "writes", at, false);
          } else {
            addEdge(from, id, fd.access, at);
          }
          break;
        }
        case "fs": {
          const id = boundary("hardware", { name: "filesystem" }, "filesystem", { label: "Filesystem" });
          addEdge(from, id, "io", at);
          break;
        }
        case "proc": {
          const id = boundary("hardware", { name: "processes" }, "processes", { label: "OS processes" });
          addEdge(from, id, "io", at);
          break;
        }
      }
    }
  }
  if (nodes.has(unboundId)) {
    const u = nodes.get(unboundId)!;
    u.label = "Code no intent node binds";
  }

  const files = bindings.files.filter((f) => nodes.has(f.root));
  const ir: Ir = {
    hesperus: "0.1",
    generated: EXTRACTOR,
    root,
    files: files.length > 0 ? files : [{ path: `${root}.hesp`, root }],
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    constraints: [],
  };
  return canonicalize(ir);
}

/** Component name for an unbound file: its first two path segments, `root` for top-level files. */
export function unboundComponent(file: string): string {
  const parts = file.split("/");
  if (parts.length === 1) return "root";
  return identify(parts.slice(0, Math.min(2, parts.length - 1)).join("_"));
}

function unboundDir(file: string): string {
  const parts = file.split("/");
  if (parts.length === 1) return "*";
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/") + "/**";
}
