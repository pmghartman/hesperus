// The boundary picture as the editor's graph tab draws it by default, laid out for a file or a pane:
// the repo's overview with each boundary as a box on the right, findings flagged on the wires and the
// boxes they touch. Shared by `hesperus svg`, the MCP server and the Claude Code plugin.
import * as aggregate from "./core/aggregate";
import { boundaryGraph, libraryNodes } from "./core/boundary";
import { Graph } from "./core/ir";
import { Policy, Report } from "./core/lint";
import { Flag, layout, Layout } from "./layout";

function merge(into: Flag | undefined, f: Flag): Flag {
  const worse = (a: Flag["severity"], b: Flag["severity"]) => ["error", "warning", "info"].indexOf(a) <= ["error", "warning", "info"].indexOf(b);
  if (!into) return { severity: f.severity, notes: [...f.notes] };
  return { severity: worse(into.severity, f.severity) ? into.severity : f.severity, notes: [...new Set([...into.notes, ...f.notes])] };
}

/** Past this many boxes ELK takes seconds and the picture is unreadable; the editor holds the same line. */
export const MAX_BOXES = 500;

/** The picture and the boxes open in it. `open` gives them (ids the graph no longer has are dropped);
 *  absent, the overview opens as many levels as fit `budget`. */
export async function boundaryPicture(g: Graph, policy: Policy, report?: Report, budget = aggregate.OVERVIEW_NODES, open?: Iterable<string>): Promise<Layout & { open: string[]; graph: Graph }> {
  const shown = boundaryGraph(g, policy.boundaries);
  const opts = { flow: true };
  const ids = new Set(shown.nodes.map((n) => n.id));
  const expanded = open ? new Set([...open].filter((id) => ids.has(id) || aggregate.isGroup(id))) : aggregate.overview(shown, budget, opts);
  const all = aggregate.view(shown, expanded, opts);
  if (all.nodes.length > MAX_BOXES) throw new Error(`that view would draw ${all.nodes.length} boxes; the limit is ${MAX_BOXES}`);
  const v = aggregate.withoutUnindexed(shown, aggregate.withoutNodes(all, libraryNodes(shown)));
  const flags = new Map<string, Flag>();
  for (const f of report?.findings ?? []) {
    const [from, to] = f.key.startsWith("in ") ? [f.external, f.local] : [f.local, f.external];
    const k = `${from}\0${to}`;
    flags.set(k, merge(flags.get(k), { severity: f.severity, notes: [f.message] }));
  }
  const flagsOf = (r: aggregate.Rollup) => (r.kind === "call" ? r.edges.map((i) => flags.get(`${shown.edges[i].from}\0${shown.edges[i].to}`)).filter((f): f is Flag => !!f) : []);
  const laid = await layout(shown, v, { flow: true, keep: (r) => flagsOf(r).length > 0 });
  const boxes = new Map(laid.boxes.map((b) => [b.id, b]));
  for (const w of laid.wires)
    for (const r of w.rollups)
      for (const f of flagsOf(r)) {
        w.flag = merge(w.flag, f);
        for (const id of [w.from, w.to]) {
          const b = boxes.get(id);
          if (b) b.flag = merge(b.flag, f);
        }
      }
  return { ...laid, open: [...expanded].sort(), graph: shown };
}
