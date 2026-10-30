// Bindings from the intent IR: which node owns a file, and which intent boundary
// node a detected boundary adopts.

import { compileGlob, Glob, globMatch } from "./glob.js";
import { Ir, IrNode, NodeKind, Protocol } from "./ir.js";

export interface Binding {
  nodeId: string;
  glob: Glob;
}

export class Bindings {
  readonly root: string;
  readonly files: { path: string; root: string }[];
  readonly nodes: Map<string, IrNode>;
  private readonly bindings: Binding[] = [];

  constructor(intent: Ir | null, fallbackRoot: string) {
    this.root = intent?.root ?? fallbackRoot;
    this.files = intent?.files ?? [{ path: `${this.root}.hesp`, root: this.root }];
    this.nodes = new Map((intent?.nodes ?? []).map((n) => [n.id, n]));
    for (const n of intent?.nodes ?? []) {
      for (const g of n.src) this.bindings.push({ nodeId: n.id, glob: compileGlob(g) });
    }
  }

  /** The most specific bound node for a repository-relative file path, or null. */
  bindFile(path: string): string | null {
    let best: Binding | null = null;
    for (const b of this.bindings) {
      if (!globMatch(b.glob, path)) continue;
      if (best === null || specificity(b) > specificity(best) || (specificity(b) === specificity(best) && b.nodeId < best.nodeId)) best = b;
    }
    return best?.nodeId ?? null;
  }

  /** An intent boundary node this detection adopts, by its binding key. */
  adopt(kind: NodeKind, key: { host?: string; engine?: string; protocol?: Protocol; name?: string }): IrNode | null {
    const candidates = [...this.nodes.values()]
      .filter((n) => n.kind === kind)
      .filter((n) => {
        switch (kind) {
          case "external":
            return n.host !== null && n.host === key.host;
          case "store":
            return n.engine !== null && n.engine === key.engine;
          case "ingress":
          case "egress":
            return n.protocol !== null && n.protocol === key.protocol;
          case "network":
          case "hardware":
            return n.name === key.name;
          default:
            return false;
        }
      })
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    return candidates[0] ?? null;
  }
}

function depth(id: string): number {
  return id.split(".").length;
}

/** Longer literal prefix, then deeper node, then longer pattern; ties go to the smaller id. */
function specificity(b: Binding): number {
  return b.glob.literalPrefix.length * 1_000_000 + depth(b.nodeId) * 10_000 + b.glob.source.length;
}
