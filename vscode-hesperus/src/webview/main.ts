// The viewer webview: modes, drill-down, pan and zoom, the inspector, click-through.
// All graph logic is in ../viewer; this file is the shell around it.

import { layout } from "../viewer/layout.js";
import { Graph, graphFromIr, graphFromUnified, isContainer, Mode, VNode } from "../viewer/model.js";
import { viewAt } from "../viewer/model.js";
import { esc, kindIcon, renderBreadcrumb, renderLegend, renderSvg } from "../viewer/render.js";

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void; getState(): any; setState(s: any): void };
const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : { postMessage: () => {}, getState: () => null, setState: () => {} };

interface Data {
  error?: string;
  intent: any | null;
  actual: any | null;
  unified: any | null;
  intentPath: string;
  locations: Record<string, string>;
}

let data: Data | null = null;
let mode: Mode = "unified";
let focus: string | null = null;
let selected: string | null = null;
let inspector = true;
let zoom = 1;
let pan = { x: 24, y: 24 };
let fitOnNextRender = true;

const root = document.getElementById("app")!;

function graphFor(m: Mode): Graph | null {
  if (!data) return null;
  if (m === "intent") return data.intent ? graphFromIr(data.intent) : null;
  if (m === "actual") return data.actual ? graphFromIr(data.actual) : null;
  return data.unified ? graphFromUnified(data.unified) : data.intent ? graphFromIr(data.intent) : null;
}

function toolbar(g: Graph | null): string {
  const modes: Mode[] = ["intent", "actual", "unified"];
  const seg = modes
    .map((m) => {
      const available = m === "intent" ? !!data?.intent : m === "actual" ? !!data?.actual : !!(data?.unified || data?.intent);
      return `<button class="${m === mode ? "active" : ""}" data-mode="${m}" ${available ? "" : "disabled"} title="${available ? `Show the ${m} graph` : "Run hesp emit to produce actual files"}">${m[0].toUpperCase()}${m.slice(1)}</button>`;
    })
    .join("");
  const s = data?.unified?.summary;
  const summary =
    g && mode === "unified" && s
      ? `<div class="summary"><span class="chip status-match"><span class="swatch"></span><b>${s.match}</b> match</span><span class="chip status-intent-only"><span class="swatch"></span><b>${s.intent_only}</b> intent-only</span><span class="chip status-actual-only"><span class="swatch"></span><b>${s.actual_only}</b> actual-only</span><span class="chip status-conflict"><span class="swatch"></span><b>${s.conflict}</b> conflict</span>${s.violations ? `<span class="chip violations"><b>${s.violations}</b> violation${s.violations === 1 ? "" : "s"}</span>` : ""}</div>`
      : "";
  return `<header class="toolbar"><div class="segmented" role="tablist">${seg}</div>${g && focus ? renderBreadcrumb(g, focus) : ""}<span class="spacer"></span>${summary}<div class="toolgroup"><button class="tool" data-action="up" title="Up one level (Backspace)">↑</button><button class="tool" data-action="zoom-out" title="Zoom out (−)">−</button><button class="tool" data-action="fit" title="Fit (0)">⤢</button><button class="tool" data-action="zoom-in" title="Zoom in (+)">+</button><button class="tool ${inspector ? "active" : ""}" data-action="inspector" title="Toggle inspector (I)">▥</button></div></header>`;
}

function render() {
  const g = graphFor(mode);
  const errorBox = data?.error ? `<p class="error">${esc(data.error)}</p>` : "";
  root.className = inspector ? "" : "no-inspector";
  if (!g) {
    root.innerHTML = `${toolbar(null)}${errorBox}<div class="canvas"><div class="empty"><div>Nothing to show for this mode.${mode !== "intent" ? "<br><code>hesp emit --lang ts &lt;repo&gt; --intent &lt;master&gt;</code>" : ""}</div></div></div>${inspector ? `<aside class="inspector"></aside>` : ""}<footer class="statusbar">${renderLegend(mode)}</footer>`;
    bind(null);
    return;
  }
  if (!focus || !g.nodes.has(focus)) focus = g.root;
  const view = viewAt(g, focus);
  const l = layout(view);
  const svg = renderSvg(l, { mode, graph: g, title: focus, selected });
  root.innerHTML = `${toolbar(g)}${errorBox}<div class="canvas" tabindex="0"><div class="stage">${svg}</div></div>${inspector ? `<aside class="inspector">${renderInspector(g)}</aside>` : ""}<footer class="statusbar">${renderLegend(mode)}<span class="hint">click: select · double-click: drill down · <kbd>⌘</kbd>/<kbd>ctrl</kbd> click: open .hesp · drag: pan · <kbd>⌘</kbd> wheel: zoom</span></footer>`;
  const canvas = root.querySelector<HTMLDivElement>(".canvas")!;
  if (fitOnNextRender) {
    fit(canvas, l.width, l.height);
    fitOnNextRender = false;
  }
  applyTransform();
  bind(g);
  vscode.setState({ mode, focus, inspector });
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

function renderInspector(g: Graph): string {
  const constraints = mode === "unified" && g.constraints.length ? `<div class="section"><h2>Constraints</h2><ul>${g.constraints.map((c) => `<li class="constraint ${c.satisfied ? "ok" : "violated"}"><span>${c.satisfied ? "✓" : "✕"}</span><span><code>${c.rule}</code> ${esc(c.from)} → ${esc(c.to)}${c.kind ? `: ${c.kind}` : ""}${!c.satisfied && c.witnesses.length ? `<br><span class="muted">${esc(c.witnesses.join(", "))}</span>` : ""}</span></li>`).join("")}</ul></div>` : "";
  if (!selected || !g.nodes.get(selected)) {
    return `<div class="section"><h2>Inspector</h2><p class="muted">Select a node to see its properties, edges and evidence.</p></div>${constraints}`;
  }
  const n: VNode = g.nodes.get(selected)!;
  const out = g.edges.filter((e) => e.from === selected);
  const inc = g.edges.filter((e) => e.to === selected);
  const def = data?.locations?.[n.id];
  const kv: [string, string][] = [];
  for (const d of n.detail) {
    const i = d.indexOf(": ");
    if (i > 0) kv.push([d.slice(0, i), d.slice(i + 2)]);
  }
  const prose = n.detail.filter((d) => !/^(protocol|host|engine|src): /.test(d));
  const edgeItem = (e: (typeof out)[number], dir: "out" | "in") =>
    `<li class="${e.status ? `status-${e.status}` : ""}"><span class="arrow">${dir === "out" ? "→" : "←"}</span><span><a href="#" data-select="${esc(dir === "out" ? e.to : e.from)}">${esc(dir === "out" ? e.to : e.from)}</a> <span class="kind">${e.kind}${e.count > 1 ? ` ×${e.count}` : ""}${e.resolved ? "" : " · unresolved"}</span>${e.at.length ? `<ul class="evidence">${e.at.slice(0, 20).map((a) => `<li><a href="#" data-src="${esc(a)}">${esc(a)}</a></li>`).join("")}</ul>` : ""}</span></li>`;
  return `<div class="section"><div class="title">${kindIcon(n.kind)}<span>${esc(n.label ?? n.name)}</span>${n.status ? `<span class="pill status-${n.status}">${n.status}</span>` : ""}</div><div class="id">${esc(n.id)}</div>${prose.map((d) => `<p>${esc(d)}</p>`).join("")}${n.conflicts.map((c) => `<p class="constraint violated">${esc(c.property)}: intent <code>${esc(c.intent)}</code>, actual <code>${esc(c.actual)}</code></p>`).join("")}${kv.length ? `<dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}<div class="actions">${def ? `<a href="#" data-def="${esc(n.id)}" title="${esc(def)}">Open declaration</a>` : ""}${isContainer(g, n.id) && n.parent === focus ? `<a href="#" data-focus="${esc(n.id)}">Drill down</a>` : ""}</div></div>${n.at.length ? `<div class="section"><h2>Evidence</h2><ul class="evidence">${n.at.map((a) => `<li><a href="#" data-src="${esc(a)}">${esc(a)}</a></li>`).join("")}</ul></div>` : ""}<div class="section"><h2>Outgoing (${out.length})</h2><ul>${out.map((e) => edgeItem(e, "out")).join("") || `<li class="muted">none</li>`}</ul></div><div class="section"><h2>Incoming (${inc.length})</h2><ul>${inc.map((e) => edgeItem(e, "in")).join("") || `<li class="muted">none</li>`}</ul></div>${constraints}`;
}

function splitEvidence(s: string): [string, number] {
  const i = s.lastIndexOf(":");
  return i < 0 ? [s, 1] : [s.slice(0, i), Number(s.slice(i + 1)) || 1];
}

function goUp() {
  if (!focus || !focus.includes(".")) return;
  selected = focus;
  focus = focus.slice(0, focus.lastIndexOf("."));
  fitOnNextRender = true;
  render();
}

function bind(g: Graph | null) {
  root.querySelectorAll<HTMLButtonElement>(".segmented button").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode as Mode;
      fitOnNextRender = true;
      render();
    }),
  );
  root.querySelectorAll<HTMLButtonElement>(".tool").forEach((b) =>
    b.addEventListener("click", () => {
      const canvas = root.querySelector<HTMLDivElement>(".canvas");
      switch (b.dataset.action) {
        case "up":
          goUp();
          return;
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
          render();
          return;
      }
    }),
  );
  root.querySelectorAll<HTMLAnchorElement>("a[data-focus]").forEach((a) =>
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      focus = a.dataset.focus!;
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
      const [path, line] = splitEvidence(a.dataset.src!);
      vscode.postMessage({ type: "openSource", path, line });
    }),
  );
  root.querySelectorAll<HTMLAnchorElement>("a[data-def]").forEach((a) =>
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      vscode.postMessage({ type: "openDefinition", id: a.dataset.def! });
    }),
  );
  if (!g) return;
  root.querySelectorAll<SVGGElement>("g.node").forEach((el) => {
    const id = el.dataset.id!;
    el.addEventListener("click", (ev) => {
      if (ev.ctrlKey || ev.metaKey) {
        vscode.postMessage({ type: "openDefinition", id });
        return;
      }
      selected = id;
      render();
    });
    el.addEventListener("dblclick", () => {
      if (el.dataset.container === "true" && g.nodes.get(id)?.parent === focus) {
        focus = id;
        selected = null;
        fitOnNextRender = true;
        render();
      }
    });
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") el.dispatchEvent(new MouseEvent("dblclick"));
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
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) {
        zoomAt(ev.deltaY < 0 ? 1.1 : 1 / 1.1, canvas, ev.clientX, ev.clientY);
      } else {
        pan = { x: pan.x - ev.deltaX, y: pan.y - ev.deltaY };
        applyTransform();
      }
    },
    { passive: false },
  );
  canvas.addEventListener("keydown", (ev) => {
    if (ev.key === "Backspace" || ev.key === "Escape") goUp();
    else if (ev.key === "+" || ev.key === "=") zoomAt(1.2, canvas);
    else if (ev.key === "-") zoomAt(1 / 1.2, canvas);
    else if (ev.key === "0") {
      fitOnNextRender = true;
      render();
    } else if (ev.key.toLowerCase() === "i") {
      inspector = !inspector;
      render();
    }
  });
}

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
    if (first && st?.mode) mode = st.mode;
    if (first && st?.focus) focus = st.focus;
    if (first && typeof st?.inspector === "boolean") inspector = st.inspector;
    if (!data.unified && !data.actual) mode = "intent";
    render();
  }
});
vscode.postMessage({ type: "ready" });
