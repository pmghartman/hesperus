// The viewer webview: modes, drill-down, legend, click-through. Talks to the extension
// with postMessage; all graph logic is in ../viewer.

import { layout } from "../viewer/layout.js";
import { Graph, graphFromIr, graphFromUnified, isContainer, Mode, VNode } from "../viewer/model.js";
import { viewAt } from "../viewer/model.js";
import { renderBreadcrumb, renderLegend, renderSvg } from "../viewer/render.js";

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

const root = document.getElementById("app")!;

function graphFor(m: Mode): Graph | null {
  if (!data) return null;
  if (m === "intent") return data.intent ? graphFromIr(data.intent) : null;
  if (m === "actual") return data.actual ? graphFromIr(data.actual) : null;
  return data.unified ? graphFromUnified(data.unified) : data.intent ? graphFromIr(data.intent) : null;
}

function render() {
  const g = graphFor(mode);
  const modes: Mode[] = ["intent", "actual", "unified"];
  const tabs = modes
    .map((m) => {
      const available = m === "intent" ? !!data?.intent : m === "actual" ? !!data?.actual : !!(data?.unified || data?.intent);
      return `<button class="tab${m === mode ? " active" : ""}" data-mode="${m}" ${available ? "" : "disabled"} title="${available ? "" : "run hesp emit to produce actual files"}">${m[0].toUpperCase()}${m.slice(1)}</button>`;
    })
    .join("");
  const errorBox = data?.error ? `<p class="error">${esc(data.error)}</p>` : "";
  if (!g) {
    root.innerHTML = `<header>${tabs}</header>${errorBox}<p class="empty">Nothing to show for this mode.${mode !== "intent" ? " Run <code>hesp emit --lang ts &lt;repo&gt; --intent &lt;master&gt;</code> to produce the actual description." : ""}</p>`;
    bindTabs();
    return;
  }
  if (!focus || !g.nodes.has(focus)) focus = g.root;
  const view = viewAt(g, focus);
  const l = layout(view);
  const svg = renderSvg(l, { mode, graph: g, title: focus });
  const summary = data?.unified?.summary && mode === "unified" ? `<span class="summary">${data.unified.summary.match} match · ${data.unified.summary.intent_only} intent-only · ${data.unified.summary.actual_only} actual-only · ${data.unified.summary.conflict} conflict · ${data.unified.summary.violations} violations</span>` : "";
  const constraints = mode === "unified" && g.constraints.length ? `<ul class="constraints">${g.constraints.map((c) => `<li class="${c.satisfied ? "ok" : "violated"}">${c.satisfied ? "ok" : "x"} ${c.rule} ${c.from} → ${c.to}${c.kind ? `: ${c.kind}` : ""}${c.witnesses.length && !c.satisfied ? ` — ${c.witnesses.join(", ")}` : ""}</li>`).join("")}</ul>` : "";
  root.innerHTML = `<header>${tabs}${renderBreadcrumb(g, focus)}${summary}</header>${errorBox}<div class="canvas">${svg}</div><aside id="side">${renderSide(g)}</aside><footer>${renderLegend(mode)}<span class="hint">click a container to drill down · ctrl/cmd-click opens its .hesp · evidence links open source</span></footer>${constraints}`;
  bindTabs();
  root.querySelectorAll<SVGGElement>("g.node").forEach((el) => {
    el.addEventListener("click", (ev) => {
      const id = el.dataset.id!;
      if (ev.ctrlKey || ev.metaKey) {
        vscode.postMessage({ type: "openDefinition", id });
        return;
      }
      if (el.dataset.container === "true" && g.nodes.get(id)?.parent === focus) {
        focus = id;
        selected = null;
      } else {
        selected = id;
      }
      render();
    });
  });
  root.querySelectorAll<HTMLAnchorElement>("a[data-focus]").forEach((a) =>
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      focus = a.dataset.focus!;
      selected = null;
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
  enablePanZoom();
  vscode.setState({ mode, focus });
}

function renderSide(g: Graph): string {
  if (!selected) return `<p class="muted">Select a node to see its properties and evidence.</p>`;
  const n: VNode | undefined = g.nodes.get(selected);
  if (!n) return "";
  const edges = g.edges.filter((e) => e.from === selected || e.to === selected);
  const def = data?.locations?.[n.id];
  return `<h2>${n.kind} <code>${n.id}</code></h2>${n.label ? `<p>${esc(n.label)}</p>` : ""}${n.status ? `<p class="status-${n.status}">${n.status}</p>` : ""}${n.conflicts.map((c) => `<p class="status-conflict">${c.property}: intent <code>${esc(c.intent)}</code>, actual <code>${esc(c.actual)}</code></p>`).join("")}${n.detail.map((d) => `<p class="detail">${esc(d)}</p>`).join("")}${def ? `<p><a href="#" data-def="${esc(n.id)}">declared in ${esc(def)}</a></p>` : ""}${isContainer(g, n.id) && n.parent === focus ? `<p><a href="#" data-focus="${esc(n.id)}">drill down</a></p>` : ""}${n.at.length ? `<h3>evidence</h3><ul class="evidence">${n.at.map((a) => `<li><a href="#" data-src="${esc(a)}">${esc(a)}</a></li>`).join("")}</ul>` : ""}<h3>edges (${edges.length})</h3><ul class="edges">${edges.map((e) => `<li class="status-${e.status ?? "none"}">${esc(e.from)} → ${esc(e.to)}: ${e.kind}${e.resolved ? "" : " (unresolved)"}${e.at.length ? `<ul class="evidence">${e.at.slice(0, 20).map((a) => `<li><a href="#" data-src="${esc(a)}">${esc(a)}</a></li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function splitEvidence(s: string): [string, number] {
  const i = s.lastIndexOf(":");
  return i < 0 ? [s, 1] : [s.slice(0, i), Number(s.slice(i + 1)) || 1];
}

function bindTabs() {
  root.querySelectorAll<HTMLButtonElement>("button.tab").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode as Mode;
      render();
    }),
  );
}

function enablePanZoom() {
  const svg = root.querySelector<SVGSVGElement>("svg");
  const canvas = root.querySelector<HTMLDivElement>(".canvas");
  if (!svg || !canvas) return;
  let scale = 1;
  canvas.addEventListener(
    "wheel",
    (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      scale = Math.min(4, Math.max(0.2, scale * (ev.deltaY < 0 ? 1.1 : 0.9)));
      svg.style.transform = `scale(${scale})`;
      svg.style.transformOrigin = "0 0";
    },
    { passive: false },
  );
}

window.addEventListener("message", (ev) => {
  const msg = ev.data;
  if (msg.type === "data") {
    data = msg as Data;
    const st = vscode.getState();
    if (st?.mode) mode = st.mode;
    if (st?.focus) focus = st.focus;
    if (!data.unified && !data.actual) mode = "intent";
    render();
  }
});
vscode.postMessage({ type: "ready" });
