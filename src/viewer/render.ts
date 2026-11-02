// SVG rendering of one layout, plus the legend. Pure string output so the same code runs
// in the webview and in tests. Styling lives in media/viewer.css and uses VS Code theme
// tokens; here we only emit structure, classes and data attributes.

import { Layout } from "./layout.js";
import { Graph, VNode } from "./model.js";

/** 16x16 icon paths per kind, in the spirit of codicons. */
const KIND_ICON: Record<string, string> = {
  entry: '<circle cx="8" cy="8" r="6.25"/><path d="M6.25 5.25v5.5L10.75 8z" class="fill"/>',
  function: '<path d="M4.25 2.25h7.5l-4 5.75 4 5.75h-7.5"/>',
  system: '<circle cx="8" cy="8" r="6.25"/><circle cx="8" cy="8" r="2.25" class="fill"/>',
  subsystem: '<rect x="1.75" y="4.75" width="9.5" height="9.5" rx="1.5"/><path d="M5 4.75V3.25A1.5 1.5 0 0 1 6.5 1.75h6.25a1.5 1.5 0 0 1 1.5 1.5v6.25a1.5 1.5 0 0 1-1.5 1.5H11.25"/>',
  component: '<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.75"/>',
  ingress: '<path d="M9.5 1.75h3.25a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5H9.5"/><path d="M1.75 8h8.5M7.25 5l3 3-3 3"/>',
  egress: '<path d="M6.5 1.75H3.25a1.5 1.5 0 0 0-1.5 1.5v9.5a1.5 1.5 0 0 0 1.5 1.5H6.5"/><path d="M5.75 8h8.5M11.25 5l3 3-3 3"/>',
  store: '<ellipse cx="8" cy="3.75" rx="5.75" ry="2.25"/><path d="M2.25 3.75v8.5c0 1.25 2.6 2.25 5.75 2.25s5.75-1 5.75-2.25v-8.5M2.25 8c0 1.25 2.6 2.25 5.75 2.25S13.75 9.25 13.75 8"/>',
  external: '<path d="M4.75 13.25h7a3 3 0 0 0 .5-5.96A4.25 4.25 0 0 0 4 6.5a3.4 3.4 0 0 0 .75 6.75z"/>',
  network: '<circle cx="8" cy="8" r="6.25"/><path d="M1.75 8h12.5M8 1.75c2.2 2.2 2.2 10.3 0 12.5M8 1.75c-2.2 2.2-2.2 10.3 0 12.5"/>',
  hardware: '<rect x="3.75" y="3.75" width="8.5" height="8.5" rx="1.25"/><rect x="6.25" y="6.25" width="3.5" height="3.5" class="fill"/><path d="M6 1.5v2.25M10 1.5v2.25M6 12.25v2.25M10 12.25v2.25M1.5 6h2.25M1.5 10h2.25M12.25 6h2.25M12.25 10h2.25"/>',
};

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function kindIcon(kind: string, cls = "icon"): string {
  return `<svg class="${cls} kind-${kind}" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${KIND_ICON[kind] ?? KIND_ICON.component}</svg>`;
}

/** `tint-N` for a node that carries a tint (the component owning the function). */
export function tintClass(n: VNode): string {
  return n.tint === undefined ? "" : ` tint-${n.tint}`;
}

export interface RenderOptions {
  graph: Graph;
  title: string;
  selected?: string | null;
}

export function renderSvg(l: Layout, opts: RenderOptions): string {
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" class="hesperus-graph mode-flow" viewBox="0 0 ${l.width} ${l.height}" width="${l.width}" height="${l.height}" data-mode="flow" data-focus="${esc(opts.title)}">`);
  parts.push(`<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>`);
  parts.push(`<g class="edges">`);
  for (const { edge, points } of l.edges) {
    const cls = `edge kind-${edge.kind}${edge.resolved ? "" : " unresolved"}${opts.selected && (edge.from === opts.selected || edge.to === opts.selected) ? " connected" : ""}`;
    const d = roundedPath(points);
    const mid = points[Math.floor(points.length / 2) - 1];
    const mid2 = points[Math.floor(points.length / 2)];
    const lx = (mid[0] + mid2[0]) / 2;
    const ly = (mid[1] + mid2[1]) / 2;
    const label = edge.count > 1 ? `${edge.kind} ×${edge.count}` : edge.kind;
    const w = label.length * 6.2 + 12;
    parts.push(
      `<g class="${cls}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" data-kind="${edge.kind}" data-count="${edge.count}"><path class="hit" d="${d}"/><path class="line" d="${d}" marker-end="url(#arrow)"/><g class="edge-label" transform="translate(${lx},${ly})"><rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="9"/><text text-anchor="middle" dominant-baseline="central">${esc(label)}</text></g></g>`,
    );
  }
  parts.push(`</g><g class="nodes">`);
  for (const p of l.nodes) {
    const n = p.node;
    const cls = `node kind-${n.kind}${tintClass(n)}${p.outside ? " outside" : ""}${opts.selected === n.id ? " selected" : ""}`;
    parts.push(`<g class="${cls}" data-id="${esc(n.id)}" data-kind="${n.kind}" transform="translate(${p.x},${p.y})" tabindex="0" role="button">`);
    parts.push(`<title>${esc(n.id)}${n.at[0] ? `\n${esc(n.at[0])}` : ""}</title>`);
    parts.push(`<rect class="card" width="${p.w}" height="${p.h}" rx="6"/>`);
    parts.push(`<rect class="accent" x="0" y="0" width="3" height="${p.h}" rx="1.5"/>`);
    parts.push(`<g transform="translate(14,${p.h / 2 - 8})">${kindIcon(n.kind, "glyph")}</g>`);
    parts.push(`<text class="name" x="40" y="${p.h / 2 - 3}">${esc(truncate(n.name, 20))}</text>`);
    parts.push(`<text class="sub" x="40" y="${p.h / 2 + 13}">${esc(truncate(n.label ?? n.kind, 26))}</text>`);
    parts.push(`</g>`);
  }
  parts.push(`</g></svg>`);
  return parts.join("");
}

/** An orthogonal polyline with softened corners. */
function roundedPath(points: [number, number][]): string {
  if (points.length < 3) return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const r = 8;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const d1 = Math.hypot(cx - px, cy - py);
    const d2 = Math.hypot(nx - cx, ny - cy);
    const r1 = Math.min(r, d1 / 2);
    const r2 = Math.min(r, d2 / 2);
    if (d1 === 0 || d2 === 0) {
      d += ` L ${cx} ${cy}`;
      continue;
    }
    const ax = cx - ((cx - px) / d1) * r1;
    const ay = cy - ((cy - py) / d1) * r1;
    const bx = cx + ((nx - cx) / d2) * r2;
    const by = cy + ((ny - cy) / d2) * r2;
    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function renderLegend(owners: { label: string; tint: number }[] = []): string {
  const chips = owners.map((o) => `<li class="chip tint-${o.tint}"><span class="swatch"></span>${esc(o.label)}</li>`).join("");
  return `<ul class="legend" data-mode="flow"><li class="chip flow-key">entry → calls in source order → where the path leaves the program</li>${chips}<li class="chip unresolved-key"><span class="swatch dashed"></span>unresolved target</li></ul>`;
}
