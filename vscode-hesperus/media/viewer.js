"use strict";
(() => {
  // src/viewer/model.ts
  function graphFromIr(ir) {
    const nodes = /* @__PURE__ */ new Map();
    for (const n of ir.nodes) {
      nodes.set(n.id, {
        id: n.id,
        kind: n.kind,
        name: n.name,
        parent: n.parent ?? null,
        label: n.label ?? null,
        status: null,
        conflicts: [],
        at: n.at ?? [],
        detail: nodeDetail(n)
      });
    }
    const edges = ir.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, status: null, resolved: e.resolved ?? true, count: 1, at: e.at ?? [] }));
    const constraints = (ir.constraints ?? []).map((c) => ({ rule: c.rule, from: c.from, to: c.to, kind: c.kind ?? null, satisfied: true, witnesses: [] }));
    return { root: ir.root, nodes, edges, constraints };
  }
  function graphFromUnified(u) {
    const nodes = /* @__PURE__ */ new Map();
    for (const n of u.nodes) {
      const side = n.intent ?? n.actual;
      nodes.set(n.id, {
        id: n.id,
        kind: n.kind,
        name: n.name,
        parent: n.parent ?? null,
        label: side?.label ?? n.actual?.label ?? null,
        status: n.status,
        conflicts: n.conflicts ?? [],
        at: n.actual?.at ?? [],
        detail: [...nodeDetail(n.intent ?? {}), ...n.actual && n.intent ? [] : nodeDetail(n.actual ?? {})]
      });
    }
    const edges = u.edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      status: e.status,
      resolved: e.actual?.resolved ?? true,
      count: e.count ?? 1,
      at: e.actual?.at ?? []
    }));
    const constraints = u.constraints.map((c) => ({ rule: c.rule, from: c.from, to: c.to, kind: c.kind ?? null, satisfied: c.satisfied, witnesses: c.witnesses ?? [] }));
    return { root: u.root, nodes, edges, constraints };
  }
  function nodeDetail(n) {
    const out = [];
    if (n.desc) out.push(n.desc);
    if (n.protocol) out.push(`protocol: ${n.protocol}`);
    if (n.host) out.push(`host: ${n.host}`);
    if (n.engine) out.push(`engine: ${n.engine}`);
    if (n.src?.length) out.push(`src: ${n.src.join(", ")}`);
    return out;
  }
  function within(id, ancestor) {
    return id === ancestor || id.startsWith(ancestor + ".");
  }
  function depth(id) {
    return id.split(".").length - 1;
  }
  function ancestorAt(id, d) {
    return id.split(".").slice(0, d + 1).join(".");
  }
  var RANK = { match: 0, "intent-only": 1, "actual-only": 2, conflict: 3 };
  function worst(a, b) {
    if (a === null) return b;
    if (b === null) return a;
    return RANK[a] >= RANK[b] ? a : b;
  }
  function isContainer(g, id) {
    for (const n of g.nodes.values()) if (n.parent === id) return true;
    return false;
  }
  function viewAt(g, focus2) {
    const children = [...g.nodes.values()].filter((n) => n.parent === focus2).sort(byKindThenName);
    const childIds = new Set(children.map((c) => c.id));
    const fold = (id) => {
      if (within(id, focus2)) {
        if (id === focus2) return null;
        return ancestorAt(id, depth(focus2) + 1);
      }
      return ancestorAt(id, Math.min(depth(id), depth(focus2)));
    };
    const folded = /* @__PURE__ */ new Map();
    const outside = /* @__PURE__ */ new Map();
    for (const e of g.edges) {
      const from = fold(e.from);
      const to = fold(e.to);
      if (from === null || to === null || from === to) continue;
      if (!childIds.has(from) && !childIds.has(to)) continue;
      for (const id of [from, to]) {
        if (!childIds.has(id) && !outside.has(id)) {
          const n = g.nodes.get(id);
          if (n) outside.set(id, n);
        }
      }
      const key = `${from}\0${to}\0${e.kind}`;
      const cur = folded.get(key);
      if (cur) {
        cur.count += e.count;
        cur.status = worst(cur.status, e.status);
        cur.resolved = cur.resolved && e.resolved;
        cur.at = [...cur.at, ...e.at];
      } else {
        folded.set(key, { ...e, from, to, at: [...e.at] });
      }
    }
    const edges = [...folded.values()].sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.kind, b.kind));
    return { focus: focus2, nodes: children, outside: [...outside.values()].sort(byKindThenName), edges };
  }
  var KIND_RANK = ["system", "subsystem", "component", "ingress", "egress", "store", "external", "network", "hardware"];
  function byKindThenName(a, b) {
    return KIND_RANK.indexOf(a.kind) - KIND_RANK.indexOf(b.kind) || cmp(a.name, b.name);
  }
  function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // src/viewer/layout.ts
  var NODE_W = 184;
  var NODE_H = 56;
  var GAP_X = 72;
  var GAP_Y = 24;
  var PAD = 24;
  function layout(view) {
    const ids = view.nodes.map((n) => n.id);
    const idSet = new Set(ids);
    const succ = /* @__PURE__ */ new Map();
    for (const id of ids) succ.set(id, []);
    const inner = view.edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));
    for (const e of inner.sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to))) succ.get(e.from).push(e.to);
    const state = /* @__PURE__ */ new Map();
    const back = /* @__PURE__ */ new Set();
    const visit = (u) => {
      state.set(u, 1);
      for (const v of succ.get(u)) {
        const s = state.get(v);
        if (s === 1) back.add(`${u}\0${v}`);
        else if (!s) visit(v);
      }
      state.set(u, 2);
    };
    for (const id of ids) if (!state.get(id)) visit(id);
    const rank = /* @__PURE__ */ new Map();
    const indeg = new Map(ids.map((i) => [i, 0]));
    for (const u of ids) for (const v of succ.get(u)) if (!back.has(`${u}\0${v}`)) indeg.set(v, indeg.get(v) + 1);
    const queue = ids.filter((i) => indeg.get(i) === 0);
    for (const id of ids) rank.set(id, 0);
    while (queue.length) {
      const u = queue.shift();
      for (const v of succ.get(u)) {
        if (back.has(`${u}\0${v}`)) continue;
        rank.set(v, Math.max(rank.get(v), rank.get(u) + 1));
        indeg.set(v, indeg.get(v) - 1);
        if (indeg.get(v) === 0) queue.push(v);
      }
    }
    const columns = /* @__PURE__ */ new Map();
    for (const n of view.nodes) {
      const r = rank.get(n.id);
      if (!columns.has(r)) columns.set(r, []);
      columns.get(r).push(n);
    }
    const placed = [];
    const pos = /* @__PURE__ */ new Map();
    const ranks = [...columns.keys()].sort((a, b) => a - b);
    let maxRows = 0;
    for (const r of ranks) {
      const col = columns.get(r);
      maxRows = Math.max(maxRows, col.length);
      col.forEach((n, i) => {
        const p = { node: n, x: PAD + r * (NODE_W + GAP_X), y: PAD + i * (NODE_H + GAP_Y), w: NODE_W, h: NODE_H, outside: false };
        placed.push(p);
        pos.set(n.id, p);
      });
    }
    const outsideX = PAD + ranks.length * (NODE_W + GAP_X) + (view.outside.length ? GAP_X : 0);
    view.outside.forEach((n, i) => {
      const p = { node: n, x: outsideX, y: PAD + i * (NODE_H + GAP_Y), w: NODE_W, h: NODE_H, outside: true };
      placed.push(p);
      pos.set(n.id, p);
    });
    maxRows = Math.max(maxRows, view.outside.length);
    const width = (view.outside.length ? outsideX + NODE_W : PAD + ranks.length * (NODE_W + GAP_X) - GAP_X) + PAD;
    const height = PAD + Math.max(maxRows, 1) * (NODE_H + GAP_Y) - GAP_Y + PAD;
    const visible = view.edges.filter((e) => pos.has(e.from) && pos.has(e.to));
    const pairKey = (e) => [e.from, e.to].sort().join("\0");
    const groups = /* @__PURE__ */ new Map();
    for (const e of visible) groups.set(pairKey(e), (groups.get(pairKey(e)) ?? 0) + 1);
    const seen = /* @__PURE__ */ new Map();
    const edges = visible.map((e) => {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      const k = pairKey(e);
      const n = groups.get(k);
      const i = seen.get(k) ?? 0;
      seen.set(k, i + 1);
      const dy = (i - (n - 1) / 2) * 14;
      const forward = a.x < b.x;
      const sameCol = a.x === b.x;
      const ay = a.y + a.h / 2 + dy;
      const by = b.y + b.h / 2 + dy;
      const start = sameCol ? [a.x + a.w, ay] : forward ? [a.x + a.w, ay] : [a.x, ay];
      const end = sameCol ? [b.x + b.w, by] : forward ? [b.x, by] : [b.x + b.w, by];
      if (sameCol) {
        const bulge = GAP_X / 2 + 8 + i * 8;
        return { edge: e, points: [start, [start[0] + bulge, start[1]], [end[0] + bulge, end[1]], end] };
      }
      const midX = (start[0] + end[0]) / 2 + (i - (n - 1) / 2) * 12;
      return { edge: e, points: [start, [midX, start[1]], [midX, end[1]], end] };
    });
    return { width, height, nodes: placed, edges };
  }

  // src/viewer/render.ts
  var KIND_GLYPH = {
    system: "\u25CE",
    subsystem: "\u25A3",
    component: "\u25A2",
    ingress: "\u21E5",
    egress: "\u21E4",
    store: "\u26C1",
    external: "\u2601",
    network: "\u2301",
    hardware: "\u2699"
  };
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function statusClass(s) {
    return s ? `status-${s}` : "status-none";
  }
  function renderSvg(l, opts) {
    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" class="hesperus-graph mode-${opts.mode}" viewBox="0 0 ${l.width} ${l.height}" width="${l.width}" height="${l.height}" data-mode="${opts.mode}" data-focus="${esc(opts.title)}">`);
    parts.push(`<defs>${["none", "match", "intent-only", "actual-only", "conflict"].map((s) => `<marker id="arrow-${s}" class="status-${s}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker>`).join("")}</defs>`);
    for (const { edge, points } of l.edges) {
      const cls = `edge kind-${edge.kind} ${statusClass(edge.status)}${edge.resolved ? "" : " unresolved"}`;
      const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
      const mid = points[Math.floor(points.length / 2) - 1];
      const mid2 = points[Math.floor(points.length / 2)];
      const lx = (mid[0] + mid2[0]) / 2;
      const ly = (mid[1] + mid2[1]) / 2;
      const label = edge.count > 1 ? `${edge.kind} \xD7${edge.count}` : edge.kind;
      parts.push(`<g class="${cls}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" data-kind="${edge.kind}" data-count="${edge.count}"><path d="${d}" marker-end="url(#arrow-${edge.status ?? "none"})"/><text class="edge-label" x="${lx}" y="${ly - 4}" text-anchor="middle">${esc(label)}</text></g>`);
    }
    for (const p of l.nodes) {
      const n = p.node;
      const container = isContainer(opts.graph, n.id);
      const cls = `node kind-${n.kind} ${statusClass(n.status)}${container ? " container" : ""}${p.outside ? " outside" : ""}`;
      const title = n.label ? `${n.name}: ${n.label}` : n.name;
      const childCount = container ? [...opts.graph.nodes.values()].filter((c) => c.parent === n.id).length : 0;
      parts.push(`<g class="${cls}" data-id="${esc(n.id)}" data-kind="${n.kind}" data-container="${container}" transform="translate(${p.x},${p.y})">`);
      parts.push(`<title>${esc(n.id)}${n.status ? ` (${n.status})` : ""}${n.conflicts.map((c) => `
${c.property}: intent ${c.intent}, actual ${c.actual}`).join("")}</title>`);
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
  function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
  }
  function renderLegend(mode2) {
    const items = mode2 === "unified" ? [
      ["match", "match: declared and built"],
      ["intent-only", "intent-only: declared, not built (work)"],
      ["actual-only", "actual-only: built, not declared (drift)"],
      ["conflict", "conflict: kind or property disagrees"]
    ] : mode2 === "intent" ? [["none", "intent: what the system should be"]] : [["none", "actual: what the code is"]];
    return `<ul class="legend" data-mode="${mode2}">${items.map(([s, t]) => `<li class="status-${s}"><span class="swatch"></span>${esc(t)}</li>`).join("")}<li class="unresolved-key"><span class="swatch dashed"></span>dashed: target not resolved statically</li></ul>`;
  }
  function renderBreadcrumb(graph, focus2) {
    const parts = focus2.split(".");
    return `<nav class="crumbs">${parts.map((_, i) => {
      const id = parts.slice(0, i + 1).join(".");
      const n = graph.nodes.get(id);
      return `<a href="#" data-focus="${esc(id)}">${esc(n?.name ?? id)}</a>`;
    }).join('<span class="sep">\u203A</span>')}</nav>`;
  }

  // src/webview/main.ts
  var vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : { postMessage: () => {
  }, getState: () => null, setState: () => {
  } };
  var data = null;
  var mode = "unified";
  var focus = null;
  var selected = null;
  var root = document.getElementById("app");
  function graphFor(m) {
    if (!data) return null;
    if (m === "intent") return data.intent ? graphFromIr(data.intent) : null;
    if (m === "actual") return data.actual ? graphFromIr(data.actual) : null;
    return data.unified ? graphFromUnified(data.unified) : data.intent ? graphFromIr(data.intent) : null;
  }
  function render() {
    const g = graphFor(mode);
    const modes = ["intent", "actual", "unified"];
    const tabs = modes.map((m) => {
      const available = m === "intent" ? !!data?.intent : m === "actual" ? !!data?.actual : !!(data?.unified || data?.intent);
      return `<button class="tab${m === mode ? " active" : ""}" data-mode="${m}" ${available ? "" : "disabled"} title="${available ? "" : "run hesp emit to produce actual files"}">${m[0].toUpperCase()}${m.slice(1)}</button>`;
    }).join("");
    const errorBox = data?.error ? `<p class="error">${esc2(data.error)}</p>` : "";
    if (!g) {
      root.innerHTML = `<header>${tabs}</header>${errorBox}<p class="empty">Nothing to show for this mode.${mode !== "intent" ? " Run <code>hesp emit --lang ts &lt;repo&gt; --intent &lt;master&gt;</code> to produce the actual description." : ""}</p>`;
      bindTabs();
      return;
    }
    if (!focus || !g.nodes.has(focus)) focus = g.root;
    const view = viewAt(g, focus);
    const l = layout(view);
    const svg = renderSvg(l, { mode, graph: g, title: focus });
    const summary = data?.unified?.summary && mode === "unified" ? `<span class="summary">${data.unified.summary.match} match \xB7 ${data.unified.summary.intent_only} intent-only \xB7 ${data.unified.summary.actual_only} actual-only \xB7 ${data.unified.summary.conflict} conflict \xB7 ${data.unified.summary.violations} violations</span>` : "";
    const constraints = mode === "unified" && g.constraints.length ? `<ul class="constraints">${g.constraints.map((c) => `<li class="${c.satisfied ? "ok" : "violated"}">${c.satisfied ? "ok" : "x"} ${c.rule} ${c.from} \u2192 ${c.to}${c.kind ? `: ${c.kind}` : ""}${c.witnesses.length && !c.satisfied ? ` \u2014 ${c.witnesses.join(", ")}` : ""}</li>`).join("")}</ul>` : "";
    root.innerHTML = `<header>${tabs}${renderBreadcrumb(g, focus)}${summary}</header>${errorBox}<div class="canvas">${svg}</div><aside id="side">${renderSide(g)}</aside><footer>${renderLegend(mode)}<span class="hint">click a container to drill down \xB7 ctrl/cmd-click opens its .hesp \xB7 evidence links open source</span></footer>${constraints}`;
    bindTabs();
    root.querySelectorAll("g.node").forEach((el) => {
      el.addEventListener("click", (ev) => {
        const id = el.dataset.id;
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
    root.querySelectorAll("a[data-focus]").forEach(
      (a) => a.addEventListener("click", (ev) => {
        ev.preventDefault();
        focus = a.dataset.focus;
        selected = null;
        render();
      })
    );
    root.querySelectorAll("a[data-src]").forEach(
      (a) => a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const [path, line] = splitEvidence(a.dataset.src);
        vscode.postMessage({ type: "openSource", path, line });
      })
    );
    root.querySelectorAll("a[data-def]").forEach(
      (a) => a.addEventListener("click", (ev) => {
        ev.preventDefault();
        vscode.postMessage({ type: "openDefinition", id: a.dataset.def });
      })
    );
    enablePanZoom();
    vscode.setState({ mode, focus });
  }
  function renderSide(g) {
    if (!selected) return `<p class="muted">Select a node to see its properties and evidence.</p>`;
    const n = g.nodes.get(selected);
    if (!n) return "";
    const edges = g.edges.filter((e) => e.from === selected || e.to === selected);
    const def = data?.locations?.[n.id];
    return `<h2>${n.kind} <code>${n.id}</code></h2>${n.label ? `<p>${esc2(n.label)}</p>` : ""}${n.status ? `<p class="status-${n.status}">${n.status}</p>` : ""}${n.conflicts.map((c) => `<p class="status-conflict">${c.property}: intent <code>${esc2(c.intent)}</code>, actual <code>${esc2(c.actual)}</code></p>`).join("")}${n.detail.map((d) => `<p class="detail">${esc2(d)}</p>`).join("")}${def ? `<p><a href="#" data-def="${esc2(n.id)}">declared in ${esc2(def)}</a></p>` : ""}${isContainer(g, n.id) && n.parent === focus ? `<p><a href="#" data-focus="${esc2(n.id)}">drill down</a></p>` : ""}${n.at.length ? `<h3>evidence</h3><ul class="evidence">${n.at.map((a) => `<li><a href="#" data-src="${esc2(a)}">${esc2(a)}</a></li>`).join("")}</ul>` : ""}<h3>edges (${edges.length})</h3><ul class="edges">${edges.map((e) => `<li class="status-${e.status ?? "none"}">${esc2(e.from)} \u2192 ${esc2(e.to)}: ${e.kind}${e.resolved ? "" : " (unresolved)"}${e.at.length ? `<ul class="evidence">${e.at.slice(0, 20).map((a) => `<li><a href="#" data-src="${esc2(a)}">${esc2(a)}</a></li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>`;
  }
  function esc2(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function splitEvidence(s) {
    const i = s.lastIndexOf(":");
    return i < 0 ? [s, 1] : [s.slice(0, i), Number(s.slice(i + 1)) || 1];
  }
  function bindTabs() {
    root.querySelectorAll("button.tab").forEach(
      (b) => b.addEventListener("click", () => {
        mode = b.dataset.mode;
        render();
      })
    );
  }
  function enablePanZoom() {
    const svg = root.querySelector("svg");
    const canvas = root.querySelector(".canvas");
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
      { passive: false }
    );
  }
  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (msg.type === "data") {
      data = msg;
      const st = vscode.getState();
      if (st?.mode) mode = st.mode;
      if (st?.focus) focus = st.focus;
      if (!data.unified && !data.actual) mode = "intent";
      render();
    }
  });
  vscode.postMessage({ type: "ready" });
})();
//# sourceMappingURL=viewer.js.map
