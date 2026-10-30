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
  var NODE_W = 208;
  var NODE_H = 60;
  var GAP_X = 84;
  var GAP_Y = 28;
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
  var KIND_ICON = {
    system: '<circle cx="8" cy="8" r="6.25"/><circle cx="8" cy="8" r="2.25" class="fill"/>',
    subsystem: '<rect x="1.75" y="4.75" width="9.5" height="9.5" rx="1.5"/><path d="M5 4.75V3.25A1.5 1.5 0 0 1 6.5 1.75h6.25a1.5 1.5 0 0 1 1.5 1.5v6.25a1.5 1.5 0 0 1-1.5 1.5H11.25"/>',
    component: '<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.75"/>',
    ingress: '<path d="M9.5 1.75h3.25a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5H9.5"/><path d="M1.75 8h8.5M7.25 5l3 3-3 3"/>',
    egress: '<path d="M6.5 1.75H3.25a1.5 1.5 0 0 0-1.5 1.5v9.5a1.5 1.5 0 0 0 1.5 1.5H6.5"/><path d="M5.75 8h8.5M11.25 5l3 3-3 3"/>',
    store: '<ellipse cx="8" cy="3.75" rx="5.75" ry="2.25"/><path d="M2.25 3.75v8.5c0 1.25 2.6 2.25 5.75 2.25s5.75-1 5.75-2.25v-8.5M2.25 8c0 1.25 2.6 2.25 5.75 2.25S13.75 9.25 13.75 8"/>',
    external: '<path d="M4.75 13.25h7a3 3 0 0 0 .5-5.96A4.25 4.25 0 0 0 4 6.5a3.4 3.4 0 0 0 .75 6.75z"/>',
    network: '<circle cx="8" cy="8" r="6.25"/><path d="M1.75 8h12.5M8 1.75c2.2 2.2 2.2 10.3 0 12.5M8 1.75c-2.2 2.2-2.2 10.3 0 12.5"/>',
    hardware: '<rect x="3.75" y="3.75" width="8.5" height="8.5" rx="1.25"/><rect x="6.25" y="6.25" width="3.5" height="3.5" class="fill"/><path d="M6 1.5v2.25M10 1.5v2.25M6 12.25v2.25M10 12.25v2.25M1.5 6h2.25M1.5 10h2.25M12.25 6h2.25M12.25 10h2.25"/>'
  };
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function statusClass(s) {
    return s ? `status-${s}` : "status-none";
  }
  function kindIcon(kind, cls = "icon") {
    return `<svg class="${cls} kind-${kind}" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${KIND_ICON[kind] ?? KIND_ICON.component}</svg>`;
  }
  function renderSvg(l, opts) {
    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" class="hesperus-graph mode-${opts.mode}" viewBox="0 0 ${l.width} ${l.height}" width="${l.width}" height="${l.height}" data-mode="${opts.mode}" data-focus="${esc(opts.title)}">`);
    parts.push(`<defs>${["none", "match", "intent-only", "actual-only", "conflict"].map((s) => `<marker id="arrow-${s}" class="status-${s}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker>`).join("")}</defs>`);
    parts.push(`<g class="edges">`);
    for (const { edge, points } of l.edges) {
      const cls = `edge kind-${edge.kind} ${statusClass(edge.status)}${edge.resolved ? "" : " unresolved"}${opts.selected && (edge.from === opts.selected || edge.to === opts.selected) ? " connected" : ""}`;
      const d = roundedPath(points);
      const mid = points[Math.floor(points.length / 2) - 1];
      const mid2 = points[Math.floor(points.length / 2)];
      const lx = (mid[0] + mid2[0]) / 2;
      const ly = (mid[1] + mid2[1]) / 2;
      const label = edge.count > 1 ? `${edge.kind} \xD7${edge.count}` : edge.kind;
      const w = label.length * 6.2 + 12;
      parts.push(
        `<g class="${cls}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" data-kind="${edge.kind}" data-count="${edge.count}"><path class="hit" d="${d}"/><path class="line" d="${d}" marker-end="url(#arrow-${edge.status ?? "none"})"/><g class="edge-label" transform="translate(${lx},${ly})"><rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="9"/><text text-anchor="middle" dominant-baseline="central">${esc(label)}</text></g></g>`
      );
    }
    parts.push(`</g><g class="nodes">`);
    for (const p of l.nodes) {
      const n = p.node;
      const container = isContainer(opts.graph, n.id);
      const cls = `node kind-${n.kind} ${statusClass(n.status)}${container ? " container" : ""}${p.outside ? " outside" : ""}${opts.selected === n.id ? " selected" : ""}`;
      const childCount = container ? [...opts.graph.nodes.values()].filter((c) => c.parent === n.id).length : 0;
      parts.push(`<g class="${cls}" data-id="${esc(n.id)}" data-kind="${n.kind}" data-container="${container}" transform="translate(${p.x},${p.y})" tabindex="0" role="button">`);
      parts.push(`<title>${esc(n.id)}${n.status ? ` \xB7 ${n.status}` : ""}${n.conflicts.map((c) => `
${c.property}: intent ${c.intent}, actual ${c.actual}`).join("")}</title>`);
      if (container) parts.push(`<rect class="stack" x="4" y="-4" width="${p.w - 8}" height="${p.h}" rx="6"/>`);
      parts.push(`<rect class="card" width="${p.w}" height="${p.h}" rx="6"/>`);
      parts.push(`<rect class="accent" x="0" y="0" width="3" height="${p.h}" rx="1.5"/>`);
      parts.push(`<g transform="translate(14,${p.h / 2 - 8})">${kindIcon(n.kind, "glyph")}</g>`);
      parts.push(`<text class="name" x="40" y="${p.h / 2 - 3}">${esc(truncate(n.name, 20))}</text>`);
      parts.push(`<text class="sub" x="40" y="${p.h / 2 + 13}">${esc(truncate(n.label ?? n.kind, 26))}</text>`);
      if (childCount) parts.push(`<g class="badge count" transform="translate(${p.w - 12},14)"><rect x="-18" y="-8" width="24" height="16" rx="8"/><text x="-6" text-anchor="middle" dominant-baseline="central">${childCount}</text></g>`);
      if (n.status) parts.push(`<circle class="status-dot" cx="${p.w - 12}" cy="${p.h - 12}" r="3.5"/>`);
      if (n.status === "conflict") parts.push(`<text class="badge conflict" x="${p.w - 26}" y="${p.h - 8}" text-anchor="end">!</text>`);
      parts.push(`</g>`);
    }
    parts.push(`</g></svg>`);
    return parts.join("");
  }
  function roundedPath(points) {
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
      const ax = cx - (cx - px) / d1 * r1;
      const ay = cy - (cy - py) / d1 * r1;
      const bx = cx + (nx - cx) / d2 * r2;
      const by = cy + (ny - cy) / d2 * r2;
      d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last[0]} ${last[1]}`;
    return d;
  }
  function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
  }
  function renderLegend(mode2) {
    const items = mode2 === "unified" ? [
      ["match", "match"],
      ["intent-only", "intent-only \xB7 not built"],
      ["actual-only", "actual-only \xB7 drift"],
      ["conflict", "conflict"]
    ] : mode2 === "intent" ? [["none", "intent: what the system should be"]] : [["none", "actual: what the code is"]];
    return `<ul class="legend" data-mode="${mode2}">${items.map(([s, t]) => `<li class="chip status-${s}"><span class="swatch"></span>${esc(t)}</li>`).join("")}<li class="chip unresolved-key"><span class="swatch dashed"></span>unresolved target</li></ul>`;
  }
  function renderBreadcrumb(graph, focus2) {
    const parts = focus2.split(".");
    return `<nav class="crumbs" aria-label="Focus">${parts.map((_, i) => {
      const id = parts.slice(0, i + 1).join(".");
      const n = graph.nodes.get(id);
      const last = i === parts.length - 1;
      return `<a href="#" class="crumb${last ? " current" : ""}" data-focus="${esc(id)}">${n ? kindIcon(n.kind, "crumb-icon") : ""}<span>${esc(n?.name ?? id)}</span></a>`;
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
  var inspector = true;
  var zoom = 1;
  var pan = { x: 24, y: 24 };
  var fitOnNextRender = true;
  var root = document.getElementById("app");
  function graphFor(m) {
    if (!data) return null;
    if (m === "intent") return data.intent ? graphFromIr(data.intent) : null;
    if (m === "actual") return data.actual ? graphFromIr(data.actual) : null;
    return data.unified ? graphFromUnified(data.unified) : data.intent ? graphFromIr(data.intent) : null;
  }
  function toolbar(g) {
    const modes = ["intent", "actual", "unified"];
    const seg = modes.map((m) => {
      const available = m === "intent" ? !!data?.intent : m === "actual" ? !!data?.actual : !!(data?.unified || data?.intent);
      return `<button class="${m === mode ? "active" : ""}" data-mode="${m}" ${available ? "" : "disabled"} title="${available ? `Show the ${m} graph` : "Run hesp emit to produce actual files"}">${m[0].toUpperCase()}${m.slice(1)}</button>`;
    }).join("");
    const s = data?.unified?.summary;
    const summary = g && mode === "unified" && s ? `<div class="summary"><span class="chip status-match"><span class="swatch"></span><b>${s.match}</b> match</span><span class="chip status-intent-only"><span class="swatch"></span><b>${s.intent_only}</b> intent-only</span><span class="chip status-actual-only"><span class="swatch"></span><b>${s.actual_only}</b> actual-only</span><span class="chip status-conflict"><span class="swatch"></span><b>${s.conflict}</b> conflict</span>${s.violations ? `<span class="chip violations"><b>${s.violations}</b> violation${s.violations === 1 ? "" : "s"}</span>` : ""}</div>` : "";
    return `<header class="toolbar"><div class="segmented" role="tablist">${seg}</div>${g && focus ? renderBreadcrumb(g, focus) : ""}<span class="spacer"></span>${summary}<div class="toolgroup"><button class="tool" data-action="up" title="Up one level (Backspace)">\u2191</button><button class="tool" data-action="zoom-out" title="Zoom out (\u2212)">\u2212</button><button class="tool" data-action="fit" title="Fit (0)">\u2922</button><button class="tool" data-action="zoom-in" title="Zoom in (+)">+</button><button class="tool ${inspector ? "active" : ""}" data-action="inspector" title="Toggle inspector (I)">\u25A5</button></div></header>`;
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
    root.innerHTML = `${toolbar(g)}${errorBox}<div class="canvas" tabindex="0"><div class="stage">${svg}</div></div>${inspector ? `<aside class="inspector">${renderInspector(g)}</aside>` : ""}<footer class="statusbar">${renderLegend(mode)}<span class="hint">click: select \xB7 double-click: drill down \xB7 <kbd>\u2318</kbd>/<kbd>ctrl</kbd> click: open .hesp \xB7 drag: pan \xB7 <kbd>\u2318</kbd> wheel: zoom</span></footer>`;
    const canvas = root.querySelector(".canvas");
    if (fitOnNextRender) {
      fit(canvas, l.width, l.height);
      fitOnNextRender = false;
    }
    applyTransform();
    bind(g);
    vscode.setState({ mode, focus, inspector });
  }
  function fit(canvas, w, h) {
    const cw = canvas.clientWidth || 800;
    const ch = canvas.clientHeight || 600;
    zoom = Math.min(1.25, Math.max(0.25, Math.min((cw - 48) / w, (ch - 48) / h)));
    pan = { x: Math.max(24, (cw - w * zoom) / 2), y: Math.max(24, (ch - h * zoom) / 2) };
  }
  function applyTransform() {
    const stage = root.querySelector(".stage");
    if (stage) stage.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  }
  function renderInspector(g) {
    const constraints = mode === "unified" && g.constraints.length ? `<div class="section"><h2>Constraints</h2><ul>${g.constraints.map((c) => `<li class="constraint ${c.satisfied ? "ok" : "violated"}"><span>${c.satisfied ? "\u2713" : "\u2715"}</span><span><code>${c.rule}</code> ${esc(c.from)} \u2192 ${esc(c.to)}${c.kind ? `: ${c.kind}` : ""}${!c.satisfied && c.witnesses.length ? `<br><span class="muted">${esc(c.witnesses.join(", "))}</span>` : ""}</span></li>`).join("")}</ul></div>` : "";
    if (!selected || !g.nodes.get(selected)) {
      return `<div class="section"><h2>Inspector</h2><p class="muted">Select a node to see its properties, edges and evidence.</p></div>${constraints}`;
    }
    const n = g.nodes.get(selected);
    const out = g.edges.filter((e) => e.from === selected);
    const inc = g.edges.filter((e) => e.to === selected);
    const def = data?.locations?.[n.id];
    const kv = [];
    for (const d of n.detail) {
      const i = d.indexOf(": ");
      if (i > 0) kv.push([d.slice(0, i), d.slice(i + 2)]);
    }
    const prose = n.detail.filter((d) => !/^(protocol|host|engine|src): /.test(d));
    const edgeItem = (e, dir) => `<li class="${e.status ? `status-${e.status}` : ""}"><span class="arrow">${dir === "out" ? "\u2192" : "\u2190"}</span><span><a href="#" data-select="${esc(dir === "out" ? e.to : e.from)}">${esc(dir === "out" ? e.to : e.from)}</a> <span class="kind">${e.kind}${e.count > 1 ? ` \xD7${e.count}` : ""}${e.resolved ? "" : " \xB7 unresolved"}</span>${e.at.length ? `<ul class="evidence">${e.at.slice(0, 20).map((a) => `<li><a href="#" data-src="${esc(a)}">${esc(a)}</a></li>`).join("")}</ul>` : ""}</span></li>`;
    return `<div class="section"><div class="title">${kindIcon(n.kind)}<span>${esc(n.label ?? n.name)}</span>${n.status ? `<span class="pill status-${n.status}">${n.status}</span>` : ""}</div><div class="id">${esc(n.id)}</div>${prose.map((d) => `<p>${esc(d)}</p>`).join("")}${n.conflicts.map((c) => `<p class="constraint violated">${esc(c.property)}: intent <code>${esc(c.intent)}</code>, actual <code>${esc(c.actual)}</code></p>`).join("")}${kv.length ? `<dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}<div class="actions">${def ? `<a href="#" data-def="${esc(n.id)}" title="${esc(def)}">Open declaration</a>` : ""}${isContainer(g, n.id) && n.parent === focus ? `<a href="#" data-focus="${esc(n.id)}">Drill down</a>` : ""}</div></div>${n.at.length ? `<div class="section"><h2>Evidence</h2><ul class="evidence">${n.at.map((a) => `<li><a href="#" data-src="${esc(a)}">${esc(a)}</a></li>`).join("")}</ul></div>` : ""}<div class="section"><h2>Outgoing (${out.length})</h2><ul>${out.map((e) => edgeItem(e, "out")).join("") || `<li class="muted">none</li>`}</ul></div><div class="section"><h2>Incoming (${inc.length})</h2><ul>${inc.map((e) => edgeItem(e, "in")).join("") || `<li class="muted">none</li>`}</ul></div>${constraints}`;
  }
  function splitEvidence(s) {
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
  function bind(g) {
    root.querySelectorAll(".segmented button").forEach(
      (b) => b.addEventListener("click", () => {
        mode = b.dataset.mode;
        fitOnNextRender = true;
        render();
      })
    );
    root.querySelectorAll(".tool").forEach(
      (b) => b.addEventListener("click", () => {
        const canvas2 = root.querySelector(".canvas");
        switch (b.dataset.action) {
          case "up":
            goUp();
            return;
          case "zoom-in":
            zoomAt(1.2, canvas2);
            return;
          case "zoom-out":
            zoomAt(1 / 1.2, canvas2);
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
      })
    );
    root.querySelectorAll("a[data-focus]").forEach(
      (a) => a.addEventListener("click", (ev) => {
        ev.preventDefault();
        focus = a.dataset.focus;
        selected = null;
        fitOnNextRender = true;
        render();
      })
    );
    root.querySelectorAll("a[data-select]").forEach(
      (a) => a.addEventListener("click", (ev) => {
        ev.preventDefault();
        selected = a.dataset.select;
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
    if (!g) return;
    root.querySelectorAll("g.node").forEach((el) => {
      const id = el.dataset.id;
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
    const canvas = root.querySelector(".canvas");
    let drag = null;
    canvas.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest("g.node, g.edge")) return;
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
      { passive: false }
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
  function zoomAt(factor, canvas, cx, cy) {
    const rect = canvas?.getBoundingClientRect();
    const x = cx !== void 0 && rect ? cx - rect.left : (rect?.width ?? 0) / 2;
    const y = cy !== void 0 && rect ? cy - rect.top : (rect?.height ?? 0) / 2;
    const next = Math.min(4, Math.max(0.2, zoom * factor));
    pan = { x: x - (x - pan.x) * (next / zoom), y: y - (y - pan.y) * (next / zoom) };
    zoom = next;
    applyTransform();
  }
  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (msg.type === "data") {
      const first = data === null;
      data = msg;
      const st = vscode.getState();
      if (first && st?.mode) mode = st.mode;
      if (first && st?.focus) focus = st.focus;
      if (first && typeof st?.inspector === "boolean") inspector = st.inspector;
      if (!data.unified && !data.actual) mode = "intent";
      render();
    }
  });
  vscode.postMessage({ type: "ready" });
})();
//# sourceMappingURL=viewer.js.map
