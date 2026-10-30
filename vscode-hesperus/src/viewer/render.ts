// SVG rendering of one layout, plus the legend. Pure string output so the same code
// runs in the webview and in tests.

import { Layout } from "./layout.js";
import { Graph, isContainer, Mode, Status, VNode } from "./model.js";

export const STATUS_COLORS: Record<Status, string> = {
  match: "#4c8a3d",
  "intent-only": "#b8860b",
  "actual-only": "#c0392b",
  conflict: "#8e44ad",
};

const KIND_GLYPH: Record<string, string> = {
  system: "◎",
  subsystem: "▣",
  component: "▢",
  ingress: "⇥",
  egress: "⇤",
  store: "⛁",
  external: "☁",
  network: "⌁",
  hardware: "⚙",
};

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function statusClass(s: Status | null): string {
  return s ? `status-${s}` : "status-none";
}

export interface RenderOptions {
  mode: Mode;
  graph: Graph;
  title: string;
}

export function renderSvg(l: Layout, opts: RenderOptions): string {
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" class="hesperus-graph mode-${opts.mode}" viewBox="0 0 ${l.width} ${l.height}" width="${l.width}" height="${l.height}" data-mode="${opts.mode}" data-focus="${esc(opts.title)}">`);
  parts.push(`<defs>${["none", "match", "intent-only", "actual-only", "conflict"].map((s) => `<marker id="arrow-${s}" class="status-${s}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker>`).join("")}</defs>`);
  for (const { edge, points } of l.edges) {
    const cls = `edge kind-${edge.kind} ${statusClass(edge.status)}${edge.resolved ? "" : " unresolved"}`;
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
    const mid = points[Math.floor(points.length / 2) - 1];
    const mid2 = points[Math.floor(points.length / 2)];
    const lx = (mid[0] + mid2[0]) / 2;
    const ly = (mid[1] + mid2[1]) / 2;
    const label = edge.count > 1 ? `${edge.kind} ×${edge.count}` : edge.kind;
    parts.push(`<g class="${cls}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" data-kind="${edge.kind}" data-count="${edge.count}"><path d="${d}" marker-end="url(#arrow-${edge.status ?? "none"})"/><text class="edge-label" x="${lx}" y="${ly - 4}" text-anchor="middle">${esc(label)}</text></g>`);
  }
  for (const p of l.nodes) {
    const n = p.node;
    const container = isContainer(opts.graph, n.id);
    const cls = `node kind-${n.kind} ${statusClass(n.status)}${container ? " container" : ""}${p.outside ? " outside" : ""}`;
    const title = n.label ? `${n.name}: ${n.label}` : n.name;
    const childCount = container ? [...opts.graph.nodes.values()].filter((c) => c.parent === n.id).length : 0;
    parts.push(`<g class="${cls}" data-id="${esc(n.id)}" data-kind="${n.kind}" data-container="${container}" transform="translate(${p.x},${p.y})">`);
    parts.push(`<title>${esc(n.id)}${n.status ? ` (${n.status})` : ""}${n.conflicts.map((c) => `\n${c.property}: intent ${c.intent}, actual ${c.actual}`).join("")}</title>`);
    parts.push(`<rect width="${p.w}" height="${p.h}" rx="6"/>`);
    parts.push(`<text class="glyph" x="12" y="${p.h / 2 + 6}">${KIND_GLYPH[n.kind] ?? "?"}</text>`);
    parts.push(`<text class="name" x="34" y="24">${esc(truncate(n.name, 18))}</text>`);
    parts.push(`<text class="sub" x="34" y="42">${esc(truncate(n.label ?? n.kind, 24))}</text>`);
    if (childCount) parts.push(`<text class="badge" x="${p.w - 10}" y="18" text-anchor="end">${childCount}</text>`);
    if (n.status === "conflict") parts.push(`<text class="badge conflict" x="${p.w - 10}" y="${p.h - 10}" text-anchor="end">!</text>`);
    parts.push(`</g>`);
    void title;
  }
  parts.push(`</svg>`);
  return parts.join("");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function renderLegend(mode: Mode): string {
  const items: [string, string][] =
    mode === "unified"
      ? [
          ["match", "match: declared and built"],
          ["intent-only", "intent-only: declared, not built (work)"],
          ["actual-only", "actual-only: built, not declared (drift)"],
          ["conflict", "conflict: kind or property disagrees"],
        ]
      : mode === "intent"
        ? [["none", "intent: what the system should be"]]
        : [["none", "actual: what the code is"]];
  return `<ul class="legend" data-mode="${mode}">${items.map(([s, t]) => `<li class="status-${s}"><span class="swatch"></span>${esc(t)}</li>`).join("")}<li class="unresolved-key"><span class="swatch dashed"></span>dashed: target not resolved statically</li></ul>`;
}

export function renderBreadcrumb(graph: Graph, focus: string): string {
  const parts = focus.split(".");
  return `<nav class="crumbs">${parts
    .map((_, i) => {
      const id = parts.slice(0, i + 1).join(".");
      const n: VNode | undefined = graph.nodes.get(id);
      return `<a href="#" data-focus="${esc(id)}">${esc(n?.name ?? id)}</a>`;
    })
    .join('<span class="sep">›</span>')}</nav>`;
}
