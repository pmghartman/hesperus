// A layout as a standalone SVG: fixed colors, no script, legible on a light or dark page behind it.
// Boxes carry their findings as <title> tooltips, so a sandboxed frame shows them on hover.
import { Box, Layout, Wire } from "./layout";

const KIND: Record<string, string> = {
  directory: "#b58900", package: "#6c71c4", file: "#268bd2", type: "#cb4b16", function: "#6c71c4", method: "#6c71c4",
  field: "#268bd2", variable: "#268bd2", state: "#2aa198", event: "#2aa198", boundary: "#dc322f", external_package: "#839496", external: "#839496", unresolved: "#93a1a1",
};
const SEV = { error: "#dc322f", warning: "#b58900", info: "#268bd2" } as const;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function box(b: Box): string {
  const kc = KIND[b.node.kind] ?? "#657b83";
  const flag = b.flag ? SEV[b.flag.severity] : undefined;
  const stroke = flag ?? kc, width = flag ? 2 : b.node.kind === "boundary" ? 1.5 : 1;
  const fill = b.container ? `${kc}14` : "#ffffff";
  const dash = b.node.kind === "external" || b.node.kind === "external_package" ? ' stroke-dasharray="3 2"' : "";
  const notes = [b.node.name, ...(b.flag?.notes ?? [])].join("\n");
  const name = esc(b.node.name.length > 34 ? b.node.name.slice(0, 33) + "…" : b.node.name);
  const text = b.container
    ? `<text x="${b.x + 8}" y="${b.y + 14}" font-size="11" font-weight="600" fill="${kc}">${name}</text>`
    : `<text x="${b.x + 8}" y="${b.y + b.h / 2 + 4}" font-size="11" fill="#333">${name}</text>`;
  const ext = (b.ext ?? []).slice(0, 3).map((s, i) => `<text x="${b.x + 8}" y="${b.y + b.h - 4 - i * 12}" font-size="9" fill="#888">→ ${esc(s.name)}</text>`).reverse().join("");
  return `<g><title>${esc(notes)}</title><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash}/>${text}${b.container ? "" : ext}</g>`;
}

function wire(w: Wire): string {
  const flag = w.flag ? SEV[w.flag.severity] : undefined;
  const may = w.rollups.every((r) => r.resolved === 0);
  const stroke = flag ?? (may ? "#93a1a1" : "#586e75");
  const pts = w.points.map((p) => `${p.x},${p.y}`).join(" ");
  const end = w.points[w.points.length - 1], prev = w.points[w.points.length - 2] ?? end;
  const dx = Math.sign(end.x - prev.x), dy = Math.sign(end.y - prev.y);
  const head = `${end.x},${end.y} ${end.x - 6 * dx - 3 * dy},${end.y - 6 * dy + 3 * dx} ${end.x - 6 * dx + 3 * dy},${end.y - 6 * dy - 3 * dx}`;
  const weight = Math.min(3, 1 + Math.log2(Math.max(1, w.rollups.reduce((n, r) => n + r.weight, 0))) / 2);
  const title = w.flag ? `<title>${esc(w.flag.notes.join("\n"))}</title>` : "";
  return `<g>${title}<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${flag ? weight + 1 : weight}" stroke-opacity="${flag ? 0.9 : 0.55}"${may ? ' stroke-dasharray="6 3"' : ""}/><polygon points="${head}" fill="${stroke}" fill-opacity=".9"/></g>`;
}

/** The whole layout, containers first so leaves and wires draw over them. */
export function toSvg(laid: Layout): string {
  const boxes = [...laid.boxes].sort((a, b) => Number(b.container) - Number(a.container));
  const w = Math.ceil(laid.width) + 16, h = Math.ceil(laid.height) + 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="-8 -8 ${w} ${h}" font-family="system-ui, sans-serif">` +
    `<rect x="-8" y="-8" width="${w}" height="${h}" fill="#fdfdfd"/>` +
    boxes.map(box).join("") + laid.wires.map(wire).join("") + "</svg>";
}
