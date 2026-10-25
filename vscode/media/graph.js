// Graph tab: draws a precomputed layout and handles pan/zoom. All graph logic stays in the host.
(() => {
  const vs = acquireVsCodeApi();
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const svg = $("view"), scene = $("scene"), msg = $("msg"), tip = $("tip");
  // Must match src/layout.ts.
  const CHAR = 6.6, PAD = 40, HEAD = 26;
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  };

  let L = null, hidden = [], boxes = new Map();
  let t = { x: 0, y: 0, k: 1 }, userMoved = false;

  // ---- view transform ----
  const apply = () => {
    scene.setAttribute("transform", `translate(${t.x},${t.y}) scale(${t.k})`);
    // Wires thin out as the view zooms out, so a whole repo reads as structure, not a solid mass.
    svg.style.setProperty("--z", String(Math.min(1, Math.max(0.3, t.k))));
    $("zoom").textContent = Math.round(t.k * 100) + "%";
  };
  const fit = () => {
    if (!L) return;
    const W = svg.clientWidth, H = svg.clientHeight, m = 32;
    const k = Math.min((W - 2 * m) / Math.max(L.width, 1), (H - 2 * m) / Math.max(L.height, 1), 1.5);
    t = { k, x: (W - L.width * k) / 2, y: Math.max(m, (H - L.height * k) / 2) };
    userMoved = false;
    apply();
  };
  const zoomAt = (px, py, f) => {
    const k = Math.min(4, Math.max(0.03, t.k * f));
    t.x = px - ((px - t.x) * k) / t.k;
    t.y = py - ((py - t.y) * k) / t.k;
    t.k = k;
    userMoved = true;
    apply();
  };
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    const r = svg.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, f);
  }, { passive: false });
  let drag = null;
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y, moved: false };
  });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) svg.setPointerCapture?.(e.pointerId);
    drag.moved = true;
    svg.classList.add("panning");
    t.x = drag.tx + dx;
    t.y = drag.ty + dy;
    userMoved = true;
    apply();
  });
  addEventListener("pointerup", () => {
    svg.classList.remove("panning");
    // Let the click handler see whether this was a pan.
    setTimeout(() => (drag = null), 0);
  });
  new ResizeObserver(() => (userMoved ? apply() : fit())).observe(svg);
  $("fit").onclick = fit;
  $("in").onclick = () => zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 1.25);
  $("out").onclick = () => zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 0.8);

  // ---- drawing ----
  const short = (s, w) => {
    const n = Math.max(4, Math.floor((w - PAD) / CHAR));
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  };
  const prov = (rs) => {
    const sum = (k) => rs.reduce((a, r) => a + r[k], 0);
    return sum("resolved") ? "" : sum("may") ? "may" : "unresolved";
  };
  // ELK splines: start, then (control, control, anchor) triples ending at the end point.
  const pathOf = (p) => {
    let d = `M${p[0].x},${p[0].y}`;
    const rest = p.slice(1);
    if (rest.length >= 3 && rest.length % 3 === 0)
      for (let i = 0; i < rest.length; i += 3) d += `C${rest[i].x},${rest[i].y} ${rest[i + 1].x},${rest[i + 1].y} ${rest[i + 2].x},${rest[i + 2].y}`;
    else if (rest.length > 1) {
      // Not Bézier triples: smooth through midpoints so control points never show as corners.
      for (let i = 0; i < rest.length - 1; i++) {
        const a = rest[i], b = rest[i + 1];
        d += `Q${a.x},${a.y} ${(a.x + b.x) / 2},${(a.y + b.y) / 2}`;
      }
      d += `L${rest[rest.length - 1].x},${rest[rest.length - 1].y}`;
    } else for (const q of rest) d += `L${q.x},${q.y}`;
    return d;
  };

  // Kind marks in the style of VS Code's symbol icons: outlines for structure, letters for symbols.
  const ICON = {
    directory: "M-6,-4h4l1.5,1.5h6.5v7.5h-12z",
    package: "M-5.5,-5.5h11v11h-11zM-5.5,-1.5h11",
    external_package: "M-5.5,-5.5h11v11h-11zM-5.5,-1.5h11",
    file: "M-4.5,-6h6l3,3v9h-9zM1.5,-6v3h3",
    tier: "M-6,-4.5h12M-6,0h12M-6,4.5h12",
  };
  const LETTER = { type: "T", function: "ƒ", method: "m", field: "•", variable: "v", external: "↗", unresolved: "?" };
  function glyph(g, kind, x, cy) {
    if (ICON[kind]) return el("path", { class: "glyph", d: ICON[kind], transform: `translate(${x + 6},${cy})` }, g);
    el("text", { class: "letter", x: x + 6, y: cy + 4, "text-anchor": "middle" }, g).textContent = LETTER[kind] ?? "·";
  }

  function draw(anchor) {
    const before = anchor && boxes.get(anchor);
    const screenBefore = before && { x: t.x + before.x * t.k, y: t.y + before.y * t.k };
    scene.replaceChildren();
    boxes = new Map(L.boxes.map((b) => [b.id, b]));
    const defs = el("defs", {}, scene);
    for (const k of ["call", "flow", "override", "unresolved"]) {
      const m = el("marker", { id: "arrow-" + k, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
      // CSP forbids style attributes; colours come from the stylesheet.
      el("path", { d: "M0,1L9,5L0,9z", class: "arrow " + k }, m);
      const back = el("marker", { id: "back-" + k, viewBox: "0 0 10 10", refX: "1", refY: "5", markerWidth: "7", markerHeight: "7", markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
      el("path", { d: "M10,1L1,5L10,9z", class: "arrow " + k }, back);
    }
    // Containers first so their children paint on top.
    const order = [...L.boxes].sort((a, b) => (b.container - a.container) || a.id.localeCompare(b.id));
    const nodeLayer = el("g", {}, scene), wireLayer = el("g", {}, scene);
    const nodeEls = new Map();
    for (const b of order) {
      const g = el("g", { class: `node k-${b.node.kind}` + (b.container ? " container" : ""), "data-id": b.id }, nodeLayer);
      el("rect", { class: "body", x: b.x, y: b.y, width: b.w, height: b.h, rx: b.container ? 6 : 4 }, g);
      el("rect", { class: "bar", x: b.x, y: b.y + 1, width: 3, height: (b.container ? HEAD : b.h) - 2, rx: 1.5 }, g);
      const cy = b.y + (b.container ? HEAD : b.h) / 2;
      let x = b.x + 8;
      if (b.expandable) {
        // Chevron: right when collapsed, down when expanded.
        el("path", { class: "chev", d: b.container ? `M${x},${cy - 2}l4,4l4,-4` : `M${x + 2},${cy - 4}l4,4l-4,4` }, g);
        x += 14;
      }
      glyph(g, b.node.kind, x, cy);
      x += 18;
      const kind = b.node.kind === "tier" ? "group" : b.node.kind.replace("_", " ");
      el("text", { class: "name", x, y: cy + 4 }, g).textContent = short(b.node.name, b.w - (x - b.x) + PAD - 12);
      // Containers name their kind at the right of the header when it fits.
      if (b.container && (x - b.x) + (b.node.name.length + kind.length + 3) * CHAR + 12 <= b.w)
        el("text", { class: "kind", x: b.x + b.w - 10, y: cy + 4, "text-anchor": "end" }, g).textContent = kind;
      if (b.container) el("line", { class: "rule", x1: b.x, x2: b.x + b.w, y1: b.y + HEAD, y2: b.y + HEAD }, g);
      nodeEls.set(b.id, g);
      g.addEventListener("click", (e) => {
        if (drag?.moved) return;
        e.stopPropagation();
        const open = e.metaKey || e.ctrlKey || !b.expandable;
        vs.postMessage(open ? { type: "open", id: b.id } : { type: "toggle", id: b.id });
      });
      g.addEventListener("dblclick", (e) => (e.stopPropagation(), vs.postMessage({ type: "open", id: b.id })));
      g.addEventListener("mouseenter", (e) => focus(b.id, e, nodeTip(b.node)));
      g.addEventListener("mouseleave", unfocus);
    }
    const wireEls = [];
    for (const w of L.wires) {
      const kinds = w.rollups.map((r) => r.kind);
      const main = kinds.includes("call") ? "call" : kinds[0];
      const p = prov(w.rollups);
      const weight = w.rollups.reduce((a, r) => a + r.weight, 0);
      const d = pathOf(w.points);
      const head = `url(#arrow-${p === "unresolved" ? "unresolved" : main})`;
      const path = el("path", { class: `wire ${main} ${p}`, d, "marker-end": head }, wireLayer);
      if (w.rollups.some((r) => r.from === w.to)) path.setAttribute("marker-start", head.replace("arrow-", "back-"));
      path.style.setProperty("--w", String(Math.min(0.9 + Math.log2(weight) * 0.5, 3)));
      const hit = el("path", { class: "hit", d }, wireLayer);
      hit.addEventListener("mouseenter", (e) => focusWire(w, path, e));
      hit.addEventListener("mouseleave", unfocus);
      wireEls.push({ w, kinds, path, hit });
    }
    scene._wires = wireEls;
    // Many overlapping wires add up; fade each one so the sum stays readable.
    svg.style.setProperty("--wo", String(Math.min(0.55, Math.max(0.18, 4 / Math.sqrt(L.wires.length || 1)))));
    scene._nodes = nodeEls;
    applyHidden();
    if (screenBefore && boxes.get(anchor)) {
      // Keep the clicked node where it was on screen so expanding does not jump.
      const b = boxes.get(anchor);
      t.x = screenBefore.x - b.x * t.k;
      t.y = screenBefore.y - b.y * t.k;
      apply();
    } else if (!userMoved) fit();
    else apply();
  }

  function applyHidden() {
    for (const x of scene._wires ?? []) {
      const off = x.kinds.every((k) => hidden.includes(k));
      x.path.classList.toggle("off", off);
      x.hit.style.display = off ? "none" : "";
    }
  }

  // ---- hover focus and tooltips ----
  const nodeTip = (n) => {
    const lines = [`<b>${esc(n.name)}</b>  ${n.kind === "tier" ? "group" : n.kind.replace("_", " ")}`];
    if (n.signature) lines.push(esc(n.signature));
    if (n.doc) lines.push(esc(n.doc.length > 300 ? n.doc.slice(0, 300) + "…" : n.doc));
    if (n.path) lines.push(esc(n.path));
    return lines.join("\n");
  };
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const showTip = (e, html) => {
    tip.innerHTML = html;
    tip.hidden = false;
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  };
  function focus(id, e, html) {
    if (drag?.moved) return;
    scene.classList.add("focus");
    scene._nodes.get(id)?.classList.add("hl");
    for (const x of scene._wires) {
      if (x.w.from !== id && x.w.to !== id) continue;
      x.path.classList.add("hl");
      scene._nodes.get(x.w.from)?.classList.add("hl");
      scene._nodes.get(x.w.to)?.classList.add("hl");
    }
    // Ancestors stay visible so the focused node keeps its context.
    for (const b of L.boxes) if (b.container) {
      const inside = (n) => n && n.x >= b.x && n.y >= b.y && n.x + n.w <= b.x + b.w && n.y + n.h <= b.y + b.h;
      if (inside(boxes.get(id))) scene._nodes.get(b.id)?.classList.add("hl");
    }
    showTip(e, html);
  }
  function focusWire(w, path, e) {
    scene.classList.add("focus");
    path.classList.add("hl");
    scene._nodes.get(w.from)?.classList.add("hl");
    scene._nodes.get(w.to)?.classList.add("hl");
    const name = (id) => esc(boxes.get(id)?.node.name ?? id);
    const two = w.rollups.some((r) => r.from === w.to);
    const rows = w.rollups.map((r) => {
      const certainty = [["resolved", r.resolved], ["may", r.may], ["unresolved", r.unresolved]].filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ");
      return `${two ? (r.from === w.from ? "→ " : "← ") : ""}${r.kind} ×${r.weight}  <span class="dim">${certainty}</span>`;
    });
    showTip(e, `<b>${name(w.from)}</b> ${two ? "↔" : "→"} <b>${name(w.to)}</b>\n${rows.join("\n")}`);
  }
  function unfocus() {
    scene.classList.remove("focus");
    for (const n of scene.querySelectorAll(".hl")) n.classList.remove("hl");
    tip.hidden = true;
  }

  function centerOn(id) {
    const b = boxes.get(id);
    if (!b) return;
    const k = Math.max(t.k, 0.9);
    t = { k, x: svg.clientWidth / 2 - (b.x + b.w / 2) * k, y: svg.clientHeight / 2 - (b.y + b.h / 2) * k };
    userMoved = true;
    apply();
    const g = scene._nodes.get(id);
    g?.classList.add("flash");
    setTimeout(() => g?.classList.remove("flash"), 1600);
  }

  addEventListener("message", ({ data: m }) => {
    if (m.type === "hidden") {
      hidden = m.hidden;
      return applyHidden();
    }
    if (m.type === "status") {
      const s = m.status;
      msg.hidden = false;
      msg.className = (s.state === "error" ? "err" : "") + (L ? " over" : "");
      msg.textContent = s.state === "error" ? s.detail : s.state === "ready" ? "" : (s.label || "Loading…") + "\nProgress is in the Hesperus sidebar.";
      if (s.state === "error" || !L) scene.replaceChildren();
      return;
    }
    if (m.type === "focus") return centerOn(m.id);
    if (m.type === "fit") return fit();
    if (m.type === "layout") {
      msg.hidden = true;
      hidden = m.hidden;
      const first = !L;
      L = m.layout;
      if (first) userMoved = false;
      draw(m.anchor);
      if (m.focus) centerOn(m.focus);
    }
  });
  vs.postMessage({ type: "ready" });
})();
