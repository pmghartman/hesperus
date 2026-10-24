// Graph tab: draws a precomputed layout and handles pan/zoom. All graph logic stays in the host.
(() => {
  const vs = acquireVsCodeApi();
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const svg = $("view"), scene = $("scene"), msg = $("msg"), tip = $("tip");
  const CHAR = 7.4, PAD = 28;
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
    else for (const q of rest) d += `L${q.x},${q.y}`;
    return d;
  };

  function draw(anchor) {
    const before = anchor && boxes.get(anchor);
    const screenBefore = before && { x: t.x + before.x * t.k, y: t.y + before.y * t.k };
    scene.replaceChildren();
    boxes = new Map(L.boxes.map((b) => [b.id, b]));
    const defs = el("defs", {}, scene);
    for (const k of ["call", "flow", "override", "unresolved"]) {
      const m = el("marker", { id: "arrow-" + k, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "8", markerHeight: "8", markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
      // CSP forbids style attributes; colours come from the stylesheet.
      el("path", { d: "M0,1L9,5L0,9z", class: "arrow " + k }, m);
    }
    // Containers first so their children paint on top.
    const order = [...L.boxes].sort((a, b) => (b.container - a.container) || a.id.localeCompare(b.id));
    const nodeLayer = el("g", {}, scene), wireLayer = el("g", {}, scene);
    const nodeEls = new Map();
    for (const b of order) {
      const g = el("g", { class: `node k-${b.node.kind}` + (b.container ? " container" : ""), "data-id": b.id }, nodeLayer);
      el("rect", { class: "body", x: b.x, y: b.y, width: b.w, height: b.h, rx: 6 }, g);
      if (!b.container) el("rect", { class: "bar", x: b.x, y: b.y + 6, width: 3, height: b.h - 12, rx: 1.5 }, g);
      const caret = b.expandable ? (b.container ? "▾ " : "▸ ") : "";
      const kind = b.node.kind.replace("_", " ");
      // Container headers share one line: the kind shows only when the full name still fits.
      const kindW = b.container ? (kind.length + 2) * CHAR : 0;
      const fits = (b.node.name.length + caret.length) * CHAR + PAD + kindW <= b.w;
      el("text", { class: "name", x: b.x + 12, y: b.y + (b.container ? 20 : 19) }, g).textContent = caret + short(b.node.name, b.w - caret.length * CHAR);
      if (!b.container) el("text", { class: "kind", x: b.x + 12, y: b.y + 35 }, g).textContent = kind;
      else if (fits) el("text", { class: "kind", x: b.x + b.w - 10, y: b.y + 20, "text-anchor": "end" }, g).textContent = kind;
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
      const path = el("path", {
        class: `wire ${main} ${p}`, d, "stroke-width": Math.min(1 + Math.log2(weight), 6),
        "marker-end": `url(#arrow-${p === "unresolved" ? "unresolved" : main})`,
      }, wireLayer);
      const hit = el("path", { class: "hit", d }, wireLayer);
      hit.addEventListener("mouseenter", (e) => focusWire(w, path, e));
      hit.addEventListener("mouseleave", unfocus);
      wireEls.push({ w, kinds, path, hit });
    }
    scene._wires = wireEls;
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
    const lines = [`<b>${esc(n.name)}</b>  ${n.kind.replace("_", " ")}`];
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
    const rows = w.rollups.map((r) => `${r.kind} ×${r.weight}  (resolved ${r.resolved}, may ${r.may}, unresolved ${r.unresolved})`);
    showTip(e, `<b>${name(w.from)}</b> → <b>${name(w.to)}</b>\n${rows.join("\n")}`);
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
