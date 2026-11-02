// Which `.hesp` file is the intent master. No vscode import, so tests run under plain node.

import * as fs from "node:fs";
import * as path from "node:path";

/** Hand-written `.hesp` files under `root`; dot directories (so `.hesperus/actual`), node_modules and target are skipped. */
export function intentFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "target") continue;
        walk(path.join(dir, e.name), depth + 1);
      } else if (e.name.endsWith(".hesp")) {
        const f = path.join(dir, e.name);
        if (!/^\s*generated\s+"/m.test(fs.readFileSync(f, "utf8"))) files.push(f);
      }
    }
  };
  walk(root, 0);
  return files.sort();
}

/**
 * The intent master: the configured file; else the file that (transitively) imports the
 * active one; else, with no active `.hesp` file, the shallowest file nothing imports.
 */
export function findMaster(root: string, active: string | undefined, configured: string): string | undefined {
  if (configured) return path.resolve(root, configured);
  const files = intentFiles(root);
  const importers = new Map<string, string>();
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(/^\s*import\s+"([^"]+)"/gm)) importers.set(path.resolve(path.dirname(f), m[1]), f);
  }
  if (!active) {
    const depth = (f: string) => path.relative(root, f).split(path.sep).length;
    return files.filter((f) => !importers.has(f)).sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : 1))[0];
  }
  let cur = path.resolve(active);
  const seen = new Set<string>();
  while (importers.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = importers.get(cur)!;
  }
  return cur;
}
