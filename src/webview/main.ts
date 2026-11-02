// The viewer webview: one entry point as a pipeline, the entry list, constraints and the
// blast radius of the open file in the inspector, pan and zoom, click-through to source.
// All graph logic is in ../viewer; this file is the shell around it.

import { componentLabel, entryGroups, FlowJson, flowView, FlowView, reaches } from "../viewer/flow.js";
import { layout } from "../viewer/layout.js";
import { VEdge } from "../viewer/model.js";
import { esc, kindIcon, renderLegend, renderSvg } from "../viewer/render.js";

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void; getState(): any; setState(s: any): void };
const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : { postMessage: () => {}, getState: () => null, setState: () => {} };

interface Data {
  error?: string;
  /** `.hesperus/actual/flow.json`, when the extractor wrote one. */
  flow: FlowJson | null;
  intentPath?: string;
  /** Where each intent node is declared (`file:line`), from `hesp ir --locations`. */
  locations: Record<string, string>;
  /** The source file open in the editor, repository-relative, for the blast radius section. */
  activeFile?: string | null;
}

let data: Data | null = null;
/** The entry shown. */
let entryId: string | null = null;
let selected: string | null = null;
let inspector = true;
let zoom = 1;
let pan = { x: 24, y: 24 };
let fitOnNextRender = true;

const root = document.getElementById("app")!;

const hasFlow = () => !!data?.flow?.entries?.length;

function currentFlow(): FlowView | null {
  if (!data?.flow || !hasFlow()) return null;
  const fv = flowView(data.flow, entryId);
  if (fv) entryId = fv.entry.id;
  return fv;
}

function toolbar(fv: FlowView | null): string {
  const violations = data?.flow?.constraints.filter((c) => !c.satisfied).length ?? 0;
  const summary = data?.flow
    ? `<div class="summary"><span class="chip"><b>${data.flow.entries.length}</b> entr${data.flow.entries.length === 1 ? "y" : "ies"}</span>${data.flow.constraints.length ? `<span class="chip ${violations ? "violations" : "ok"}"><b>${violations}</b> violation${violations === 1 ? "" : "s"}</span>` : ""}</div>`
    : "";
  const title = fv ? `<nav class="crumbs" aria-label="Entry"><span class="crumb current">${kindIcon("entry", "crumb-icon")}<span>${esc(fv.entry.label)}</span></span><span class="crumb muted">${esc(fv.entry.unit)}</span></nav>` : "";
  return `<header class="toolbar">${title}<span class="spacer"></span>${summary}<div class="toolgroup"><button class="tool" data-action="zoom-out" title="Zoom out (−)">−</button><button class="tool" data-action="fit" title="Fit (0)">⤢</button><button class="tool" data-action="zoom-in" title="Zoom in (+)">+</button><button class="tool ${inspector ? "active" : ""}" data-action="inspector" title="Toggle inspector (I)">▥</button></div></header>`;
}

function render() {
  const errorBox = data?.error ? `<p class="error">${esc(data.error)}</p>` : "";
  root.className = inspector ? "" : "no-inspector";
  const fv = currentFlow();
  if (!fv) {
    root.innerHTML = `${toolbar(null)}${errorBox}<div class="canvas"><div class="empty"><div>No flow yet. <b>Hesperus: Emit From Code</b> writes <code>.hesperus/actual/flow.json</code>: every entry point the extractor finds (route handlers, <code>main</code>, <code>bin</code> modules, command handlers) and what each one reaches.</div></div></div>${inspector ? `<aside class="inspector">${data?.flow ? renderConstraints(data.flow) : ""}</aside>` : ""}<footer class="statusbar">${renderLegend()}</footer>`;
    bind(null);
    return;
  }
  root.innerHTML = `${toolbar(fv)}${errorBox}<div class="canvas" tabindex="0"><div class="stage"></div></div>${inspector ? `<aside class="inspector">${renderInspector(fv)}</aside>` : ""}<footer class="statusbar">${renderLegend(fv.owners)}<span class="hint">click: open the source line · <kbd>⌘</kbd>/<kbd>ctrl</kbd> click: open the component's .hesp · wheel: zoom · drag or <kbd>shift</kbd> wheel: pan</span></footer>`;
  const canvas = root.querySelector<HTMLDivElement>(".canvas")!;
  const l = layout(fv.view, { viewport: { width: canvas.clientWidth || 800, height: canvas.clientHeight || 600 }, fold: false });
  root.querySelector<HTMLDivElement>(".stage")!.innerHTML = renderSvg(l, { graph: fv.graph, title: fv.entry.label, selected });
  if (fitOnNextRender) {
    fit(canvas, l.width, l.height);
    fitOnNextRender = false;
  }
  applyTransform();
  bind(fv);
  vscode.setState({ entryId, inspector });
}

function fit(canvas: HTMLElement, w: number, h: number) {
  const cw = canvas.clientWidth || 800;
  const ch = canvas.clientHeight || 600;
  zoom = Math.min(1.25, Math.max(0.25, Math.min((cw - 48) / w, (ch - 48) / h)));
  pan = { x: Math.max(24, (cw - w * zoom) / 2), y: Math.max(24, (ch - h * zoom) / 2) };
}

function applyTransform() {
  const stage = root.querySelector<HTMLDivElement>(".stage");
  if (stage) stage.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
}

function entryLink(f: FlowJson, id: string, current: string | null): string {
  const e = f.entries.find((x) => x.id === id);
  if (!e) return esc(id);
  return `<a href="#" class="${e.id === current ? "current" : ""}" data-entry="${esc(e.id)}" title="${esc(e.at)}${e.also?.length ? `\nalso: ${esc(e.also.join(", "))}` : ""}"><span>${esc(e.label)}${e.also?.length ? ` <span class="muted">+${e.also.length}</span>` : ""}</span><span class="unit">${esc(e.kind === "module" ? e.unit.slice(0, e.unit.indexOf("#")) : e.unit.slice(e.unit.indexOf("#") + 1))}</span></a>`;
}

function renderEntries(f: FlowJson, current: string | null): string {
  return `<div class="section entries"><h2>Entry points (${f.entries.length})</h2>${entryGroups(f)
    .map((g) => `<h3>${esc(g.label)}</h3><ul>${g.entries.map((e) => `<li>${entryLink(f, e.id, current)}</li>`).join("")}</ul>`)
    .join("")}</div>`;
}

/** The open file's blast radius: which entries pass through it. */
function renderActiveFile(f: FlowJson, current: string | null): string {
  const file = data?.activeFile;
  if (!file) return "";
  const hits = reaches(f, file);
  const base = file.slice(file.lastIndexOf("/") + 1);
  if (!hits.length) return `<div class="section"><h2>${esc(base)}</h2><p class="muted">No entry point reaches this file.</p></div>`;
  return `<div class="section entries"><h2>${esc(base)} · reached by ${hits.length}</h2><ul>${hits.map((h) => `<li>${entryLink(f, h.entry.id, current)}<span class="muted via">via ${esc(h.units.map((u) => u.name).join(", "))}</span></li>`).join("")}</ul></div>`;
}

function renderConstraints(f: FlowJson): string {
  if (!f.constraints.length) return "";
  return `<div class="section"><h2>Constraints</h2><ul>${f.constraints
    .map(
      (c) =>
        `<li class="constraint ${c.satisfied ? "ok" : "violated"}"><span>${c.satisfied ? "✓" : "✕"}</span><span><code>${c.rule}</code> ${esc(componentLabel(f, c.from))} → ${esc(componentLabel(f, c.to))}${c.kind ? `: ${c.kind}` : ""}${c.witnesses.length ? `<ul class="evidence">${c.witnesses.map((w) => `<li><a href="#" data-src="${esc(w.at)}">${esc(w.at)}</a>${w.entries.length ? ` <span class="muted">${w.entries.map((id) => `<a href="#" data-entry="${esc(id)}">${esc(f.entries.find((e) => e.id === id)?.label ?? id)}</a>`).join(", ")}</span>` : ""}</li>`).join("")}</ul>` : ""}</span></li>`,
    )
    .join("")}</ul></div>`;
}

function renderInspector(fv: FlowView): string {
  const f = data!.flow!;
  const head = renderEntries(f, fv.entry.id) + renderActiveFile(f, fv.entry.id);
  const g = fv.graph;
  const n = selected ? g.nodes.get(selected) : undefined;
  if (!n) return `${head}<div class="section"><p class="muted">Boxes are functions in call order, tinted by the component that owns their file; dashed boxes are where the path leaves the program. Click a step to open its source line.</p></div>${renderConstraints(f)}`;
  const out = g.edges.filter((e) => e.from === n.id);
  const inc = g.edges.filter((e) => e.to === n.id);
  const kv: [string, string][] = n.detail.map((d) => {
    const i = d.indexOf(": ");
    return [d.slice(0, i), d.slice(i + 2)] as [string, string];
  });
  const ownerId = n.detail.find((d) => d.startsWith("owner: "))?.slice(7);
  const def = ownerId ? data?.locations?.[ownerId] : undefined;
  return `${head}<div class="section"><div class="title">${kindIcon(n.kind)}<span>${esc(n.name)}</span></div><div class="id">${esc(n.id)}</div><dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>${def && ownerId ? `<div class="actions"><a href="#" data-def="${esc(ownerId)}" title="${esc(def)}">Open component in .hesp</a></div>` : ""}</div>${n.at.length ? `<div class="section"><h2>${n.kind === "function" ? "Declared at" : n.kind === "entry" ? "Registered at" : "Reached at"}</h2><ul class="evidence">${n.at.map((a) => `<li><a href="#" data-src="${esc(a)}">${esc(a)}</a></li>`).join("")}</ul></div>` : ""}<div class="section"><h2>Calls (${out.length})</h2><ul>${out.map((e) => edgeItem(e, "out")).join("") || `<li class="muted">none: the path ends here</li>`}</ul></div><div class="section"><h2>Called from (${inc.length})</h2><ul>${inc.map((e) => edgeItem(e, "in")).join("") || `<li class="muted">none</li>`}</ul></div>${renderConstraints(f)}`;
}

function edgeItem(e: VEdge, dir: "out" | "in"): string {
  return `<li><span class="arrow">${dir === "out" ? "→" : "←"}</span><span><a href="#" data-select="${esc(dir === "out" ? e.to : e.from)}">${esc(dir === "out" ? e.to : e.from)}</a> <span class="kind">${e.kind}${e.count > 1 ? ` ×${e.count}` : ""}${e.resolved ? "" : " · unresolved"}</span>${e.at.length ? `<ul class="evidence">${e.at.slice(0, 20).map((a) => `<li><a href="#" data-src="${esc(a)}">${esc(a)}</a></li>`).join("")}</ul>` : ""}</span></li>`;
}

function splitEvidence(s: string): [string, number] {
  const i = s.lastIndexOf(":");
  return i < 0 ? [s, 1] : [s.slice(0, i), Number(s.slice(i + 1)) || 1];
}

function openSource(src: string) {
  const [path, line] = splitEvidence(src);
  vscode.postMessage({ type: "openSource", path, line });
}

function bind(fv: FlowView | null) {
  root.querySelectorAll<HTMLButtonElement>(".tool").forEach((b) =>
    b.addEventListener("click", () => {
      const canvas = root.querySelector<HTMLDivElement>(".canvas");
      switch (b.dataset.action) {
        case "zoom-in":
          zoomAt(1.2, canvas);
          return;
        case "zoom-out":
          zoomAt(1 / 1.2, canvas);
          return;
        case "fit":
          fitOnNextRender = true;
          render();
          return;
        case "inspector":
          inspector = !inspector;
          fitOnNextRender = true;
          render();
          return;
      }
    }),
  );
  root.querySelectorAll<HTMLAnchorElement>("a[data-entry]").forEach((a) =>
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      entryId = a.dataset.entry!;
      selected = null;
      fitOnNextRender = true;
      render();
    }),
  );
  root.querySelectorAll<HTMLAnchorElement>("a[data-select]").forEach((a) =>
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      selected = a.dataset.select!;
      render();
    }),
  );
  root.querySelectorAll<HTMLAnchorElement>("a[data-src]").forEach((a) =>
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      openSource(a.dataset.src!);
    }),
  );
  root.querySelectorAll<HTMLAnchorElement>("a[data-def]").forEach((a) =>
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      vscode.postMessage({ type: "openDefinition", id: a.dataset.def! });
    }),
  );
  if (!fv) return;
  root.querySelectorAll<SVGGElement>("g.node").forEach((el) => {
    const id = el.dataset.id!;
    el.addEventListener("click", (ev) => {
      const n = fv.graph.nodes.get(id);
      if (ev.ctrlKey || ev.metaKey) {
        const ownerId = n?.detail.find((d) => d.startsWith("owner: "))?.slice(7);
        if (ownerId) vscode.postMessage({ type: "openDefinition", id: ownerId });
        return;
      }
      // a step opens its source line: the declaration of a function, the site a boundary is reached from
      selected = id;
      render();
      if (n?.at[0]) openSource(n.at[0]);
    });
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") el.dispatchEvent(new MouseEvent("click"));
    });
  });
  const canvas = root.querySelector<HTMLDivElement>(".canvas")!;
  // pan by dragging the background
  let drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
  canvas.addEventListener("pointerdown", (ev) => {
    if ((ev.target as Element).closest("g.node, g.edge")) return;
    drag = { x: ev.clientX, y: ev.clientY, px: pan.x, py: pan.y, moved: false };
    canvas.setPointerCapture(ev.pointerId);
    canvas.classList.add("panning");
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    pan = { x: drag.px + ev.clientX - drag.x, y: drag.py + ev.clientY - drag.y };
    drag.moved = drag.moved || Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 3;
    applyTransform();
  });
  canvas.addEventListener("pointerup", () => {
    if (drag && !drag.moved) {
      selected = null;
      render();
    }
    drag = null;
    canvas.classList.remove("panning");
  });
  // wheel zooms about the pointer (a trackpad pinch arrives as a ctrl-wheel); shift-wheel pans
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      if (ev.shiftKey) {
        pan = ev.deltaX ? { x: pan.x - ev.deltaX, y: pan.y - ev.deltaY } : { x: pan.x - ev.deltaY, y: pan.y };
        applyTransform();
      } else {
        const factor = Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0015));
        zoomAt(factor, canvas, ev.clientX, ev.clientY);
      }
    },
    { passive: false },
  );
  canvas.addEventListener("keydown", (ev) => {
    if (ev.key === "+" || ev.key === "=") zoomAt(1.2, canvas);
    else if (ev.key === "-") zoomAt(1 / 1.2, canvas);
    else if (ev.key === "0") {
      fitOnNextRender = true;
      render();
    } else if (ev.key.toLowerCase() === "i") {
      inspector = !inspector;
      fitOnNextRender = true;
      render();
    }
  });
}

// the layout fits the canvas, so a resized panel gets a fresh fit
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener("resize", () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    if (!data) return;
    fitOnNextRender = true;
    render();
  }, 120);
});

function zoomAt(factor: number, canvas: HTMLElement | null, cx?: number, cy?: number) {
  const rect = canvas?.getBoundingClientRect();
  const x = cx !== undefined && rect ? cx - rect.left : (rect?.width ?? 0) / 2;
  const y = cy !== undefined && rect ? cy - rect.top : (rect?.height ?? 0) / 2;
  const next = Math.min(4, Math.max(0.2, zoom * factor));
  pan = { x: x - (x - pan.x) * (next / zoom), y: y - (y - pan.y) * (next / zoom) };
  zoom = next;
  applyTransform();
}

window.addEventListener("message", (ev) => {
  const msg = ev.data;
  if (msg.type === "data") {
    const first = data === null;
    data = msg as Data;
    const st = vscode.getState();
    if (first && st?.entryId) entryId = st.entryId;
    if (first && typeof st?.inspector === "boolean") inspector = st.inspector;
    render();
  } else if (msg.type === "activeFile") {
    if (!data) return;
    data.activeFile = msg.path ?? null;
    // only the inspector changes
    const aside = root.querySelector<HTMLElement>(".inspector");
    const fv = currentFlow();
    if (aside && fv) {
      aside.innerHTML = renderInspector(fv);
      bindInspectorOnly();
    }
  }
});

function bindInspectorOnly() {
  // re-render fully is simplest and cheap: the canvas state (pan, zoom) is kept
  render();
}
vscode.postMessage({ type: "ready" });
