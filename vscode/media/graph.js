// Graph tab: draws a precomputed layout and handles pan/zoom. All graph logic stays in the host.
(() => {
  const vs = acquireVsCodeApi();
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const svg = $("view"), scene = $("scene"), msg = $("msg"), tip = $("tip");
  // Must match src/layout.ts.
  const CHAR = 6.6, PAD = 40, HEAD = 26, LEAF_H = 26;
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  };

  let L = null, hidden = [], boxes = new Map();
  let t = { x: 0, y: 0, k: 1 }, userMoved = false;
  // Semantic zoom: zooming in opens boxes that fill the screen, zooming out closes containers
  // that have shrunk. The host owns the expansion state; this only asks.
  const saved = vs.getState() ?? {};
  let auto = saved.auto ?? true, pending = null, seq = 0, net = 0, settle = 0, moving = false, quiet = 0, pinned = null;
  const cursor = { x: 0, y: 0 };
  // The box under the cursor opens once it is this tall on screen (a leaf box is 26 units).
  // QUIET_MS after a relayout swallows trackpad momentum, so one gesture opens one level.
  const OPEN_PX = 56, CLOSE_FRAC = 0.2, SETTLE_MS = 220, MORPH_MS = 320, QUIET_MS = 450;

  // ---- view transform ----
  // Bumped by every user camera move, so a running relayout animation stops steering the camera.
  let cam = 0;
  const apply = () => {
    scene.setAttribute("transform", `translate(${t.x},${t.y}) scale(${t.k})`);
    // Wires thin out as the view zooms out, so a whole repo reads as structure, not a solid mass.
    svg.style.setProperty("--z", String(Math.min(1, Math.max(0.3, t.k))));
    $("zoom").textContent = Math.round(t.k * 100) + "%";
  };
  const fitted = () => {
    const W = svg.clientWidth, H = svg.clientHeight, m = 32;
    const k = Math.min((W - 2 * m) / Math.max(L.width, 1), (H - 2 * m) / Math.max(L.height, 1), 1.5);
    return { k, x: (W - L.width * k) / 2, y: Math.max(m, (H - L.height * k) / 2) };
  };
  const fit = () => {
    if (!L) return;
    t = fitted();
    cam++;
    userMoved = false;
    apply();
  };
  const zoomAt = (px, py, f) => {
    const k = Math.min(4, Math.max(0.03, t.k * f));
    t.x = px - ((px - t.x) * k) / t.k;
    t.y = py - ((py - t.y) * k) / t.k;
    t.k = k;
    cam++;
    userMoved = true;
    apply();
  };
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    const r = svg.getBoundingClientRect();
    cursor.x = e.clientX - r.left;
    cursor.y = e.clientY - r.top;
    zoomAt(cursor.x, cursor.y, f);
    if (performance.now() < quiet) return;
    net += Math.log(f);
    clearTimeout(settle);
    settle = setTimeout(semantic, SETTLE_MS);
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
    cam++;
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
  const step = (f) => {
    cursor.x = svg.clientWidth / 2;
    cursor.y = svg.clientHeight / 2;
    zoomAt(cursor.x, cursor.y, f);
    net += Math.log(f);
    semantic();
  };
  $("in").onclick = () => step(1.25);
  $("out").onclick = () => step(0.8);
  const showAuto = () => $("auto").setAttribute("aria-pressed", String(auto));
  $("auto").onclick = () => {
    auto = !auto;
    vs.setState({ ...(vs.getState() ?? {}), auto });
    showAuto();
  };
  showAuto();

  // ---- semantic zoom ----
  const onScreen = (b) => ({ x: t.x + b.x * t.k, y: t.y + b.y * t.k, w: b.w * t.k, h: b.h * t.k });
  const dist = (s) => Math.hypot(s.x + s.w / 2 - cursor.x, s.y + s.h / 2 - cursor.y);
  const byDist = (a, b) => dist(a.s) - dist(b.s) || (a.b.id < b.b.id ? -1 : 1);
  const under = (s) => cursor.x >= s.x && cursor.x <= s.x + s.w && cursor.y >= s.y && cursor.y <= s.y + s.h;
  // Only the gesture's direction acts (zoom in opens, zoom out closes), so a relayout can never undo itself.
  function semantic() {
    const dir = net;
    net = 0;
    // A reply that never comes (host error) must not wedge zooming.
    if (pending && performance.now() - pending.at > 5000) pending = null;
    if (!auto || !L || pending || moving || Math.abs(dir) < 1e-3) return;
    const W = svg.clientWidth, H = svg.clientHeight;
    const all = L.boxes.map((b) => ({ b, s: onScreen(b) }));
    let open = [], close = [];
    // Opens only what the user zooms toward; leaf boxes never overlap, so this is one box at most.
    if (dir > 0)
      open = all.filter(({ b, s }) => b.expandable && !b.container && under(s) && (s.h >= OPEN_PX || s.w >= W * 0.45));
    else {
      const small = all.filter(({ b, s }) => b.container && s.w < W * CLOSE_FRAC && s.h < H * CLOSE_FRAC);
      const ids = new Set(small.map((x) => x.b.id));
      // Outermost only: closing a container closes everything in it.
      const inner = (b) => { for (let p = b.parent; p; p = boxes.get(p)?.parent) if (ids.has(p)) return true; return false; };
      close = small.filter(({ b }) => !inner(b)).sort(byDist);
    }
    if (!open.length && !close.length) return;
    const anchor = (open[0] ?? close[0]).b.id;
    pending = { seq: ++seq, open: open.map((x) => x.b.id), anchor, at: performance.now() };
    vs.postMessage({ type: "zoom", open: pending.open, close: close.map((x) => x.b.id), anchor, seq: pending.seq });
  }

  // ---- drawing ----
  const short = (s, w) => {
    const n = Math.max(4, Math.floor((w - PAD) / CHAR));
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  };
  const prov = (rs) => {
    const sum = (k) => rs.reduce((a, r) => a + r[k], 0);
    return sum("resolved") ? "" : sum("may") ? "may" : "unresolved";
  };
  // Orthogonal polyline with rounded bends; a bend never eats more than half a segment.
  const R = 6, f1 = (v) => Math.round(v * 10) / 10;
  const pathOf = (p) => {
    let d = `M${f1(p[0].x)},${f1(p[0].y)}`;
    for (let i = 1; i < p.length - 1; i++) {
      const a = p[i - 1], b = p[i], c = p[i + 1];
      const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
      const r = Math.min(R, l1 / 2, l2 / 2);
      if (r < 0.5) { d += `L${f1(b.x)},${f1(b.y)}`; continue; }
      d += `L${f1(b.x + ((a.x - b.x) * r) / l1)},${f1(b.y + ((a.y - b.y) * r) / l1)}`;
      d += `Q${f1(b.x)},${f1(b.y)} ${f1(b.x + ((c.x - b.x) * r) / l2)},${f1(b.y + ((c.y - b.y) * r) / l2)}`;
    }
    const z = p[p.length - 1];
    return d + `L${f1(z.x)},${f1(z.y)}`;
  };

  // Kind marks in the style of VS Code's symbol icons: outlines for structure, letters for symbols.
  const ICON = {
    directory: "M-6,-4h4l1.5,1.5h6.5v7.5h-12z",
    package: "M-5.5,-5.5h11v11h-11zM-5.5,-1.5h11",
    external_package: "M-5.5,-5.5h11v11h-11zM-5.5,-1.5h11",
    file: "M-4.5,-6h6l3,3v9h-9zM1.5,-6v3h3",
    tier: "M-6,-4.5h12M-6,0h12M-6,4.5h12",
    state: "M0,-5L5,0L0,5L-5,0z",
  };
  const LETTER = { type: "T", function: "ƒ", method: "m", field: "•", variable: "v", external: "↗", unresolved: "?" };
  function glyph(g, kind, x, cy) {
    if (ICON[kind]) return el("path", { class: "glyph", d: ICON[kind], transform: `translate(${x + 6},${cy})` }, g);
    el("text", { class: "letter", x: x + 6, y: cy + 4, "text-anchor": "middle" }, g).textContent = LETTER[kind] ?? "·";
  }

  // Where the camera ends up after a relayout: keeps the user's place, or frames what just opened.
  function target(prev, m, zoom) {
    const W = svg.clientWidth, H = svg.clientHeight, gap = 32;
    const keep = (id) => {
      const a = prev.get(id), b = boxes.get(id);
      return a && b ? { k: t.k, x: t.x + (a.x - b.x) * t.k, y: t.y + (a.y - b.y) * t.k } : null;
    };
    if (zoom?.open.length) {
      const got = zoom.open.map((id) => boxes.get(id)).filter(Boolean);
      const x0 = Math.min(...got.map((b) => b.x)), y0 = Math.min(...got.map((b) => b.y));
      const x1 = Math.max(...got.map((b) => b.x + b.w)), y1 = Math.max(...got.map((b) => b.y + b.h));
      const k = Math.max(0.03, Math.min(t.k, (W - 2 * gap) / (x1 - x0 || 1), (H - 2 * gap) / (y1 - y0 || 1)));
      // Hold the anchor's centre on screen, then slide so everything that opened is in view.
      const a = prev.get(zoom.anchor), b = boxes.get(zoom.anchor);
      const cx = a ? t.x + (a.x + a.w / 2) * t.k : W / 2, cy = a ? t.y + (a.y + a.h / 2) * t.k : H / 2;
      let x = b ? cx - (b.x + b.w / 2) * k : W / 2 - ((x0 + x1) / 2) * k, y = b ? cy - (b.y + b.h / 2) * k : H / 2 - ((y0 + y1) / 2) * k;
      x = Math.min(Math.max(x, W - gap - x1 * k), gap - x0 * k);
      y = Math.min(Math.max(y, H - gap - y1 * k), gap - y0 * k);
      return { k, x, y };
    }
    const anchor = zoom?.anchor ?? m.anchor;
    if (anchor) return keep(anchor) ?? { ...t };
    if (m.focus && boxes.get(m.focus)) {
      const b = boxes.get(m.focus), k = Math.max(t.k, 0.9);
      return { k, x: W / 2 - (b.x + b.w / 2) * k, y: H / 2 - (b.y + b.h / 2) * k };
    }
    return userMoved ? { ...t } : fitted();
  }

  function draw(m, zoom) {
    const prev = boxes, from = { ...t };
    scene.replaceChildren();
    boxes = new Map(L.boxes.map((b) => [b.id, b]));
    const defs = el("defs", {}, scene);
    for (const k of ["call", "flow", "override", "transition", "unresolved"]) {
      const m = el("marker", { id: "arrow-" + k, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
      // CSP forbids style attributes; colours come from the stylesheet.
      el("path", { d: "M0,1L9,5L0,9z", class: "arrow " + k }, m);
      const back = el("marker", { id: "back-" + k, viewBox: "0 0 10 10", refX: "1", refY: "5", markerWidth: "7", markerHeight: "7", markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
      el("path", { d: "M10,1L1,5L10,9z", class: "arrow " + k }, back);
    }
    // Containers first so their children paint on top.
    const order = [...L.boxes].sort((a, b) => (b.container - a.container) || a.id.localeCompare(b.id));
    const nodeLayer = el("g", {}, scene), wireLayer = el("g", { class: "wires" }, scene);
    const nodeEls = new Map();
    for (const b of order) {
      const g = el("g", { class: `node k-${b.node.kind}` + (b.container ? " container" : ""), "data-id": b.id }, nodeLayer);
      el("rect", { class: "body", x: b.x, y: b.y, width: b.w, height: b.h, rx: b.container ? 6 : 4 }, g);
      el("rect", { class: "bar", x: b.x, y: b.y + 1, width: 3, height: (b.container ? HEAD : b.h) - 2, rx: 1.5 }, g);
      const cy = b.y + (b.container ? HEAD : LEAF_H) / 2;
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
      if (b.ext) {
        // Calls leaving the repo: named here instead of wired to a distant box.
        const names = "↗ " + b.ext.map((x) => x.name).join(", "), n = Math.floor((b.w - 16) / 6);
        el("text", { class: "ext", x: b.x + 9, y: b.y + LEAF_H + 6 }, g).textContent = names.length > n ? names.slice(0, n - 1) + "…" : names;
      }
      if (b.container) el("line", { class: "rule", x1: b.x, x2: b.x + b.w, y1: b.y + HEAD, y2: b.y + HEAD }, g);
      nodeEls.set(b.id, g);
      g.addEventListener("click", (e) => {
        if (drag?.moved) return;
        e.stopPropagation();
        if (e.shiftKey) return pin({ node: b.id });
        const open = e.metaKey || e.ctrlKey || !b.expandable;
        vs.postMessage(open ? { type: "open", id: b.id } : { type: "toggle", id: b.id });
      });
      g.addEventListener("dblclick", (e) => (e.stopPropagation(), vs.postMessage({ type: "open", id: b.id })));
      g.addEventListener("mouseenter", (e) => focus(b.id, e, nodeTip(b)));
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
      hit.addEventListener("click", (e) => (e.stopPropagation(), pin({ from: w.from, to: w.to })));
      wireEls.push({ w, kinds, path, hit });
    }
    scene._wires = wireEls;
    // Many overlapping wires add up; fade each one so the sum stays readable.
    svg.style.setProperty("--wo", String(Math.min(0.7, Math.max(0.3, 6 / Math.sqrt(L.wires.length || 1)))));
    scene._nodes = nodeEls;
    applyHidden();
    if (pinned) pin(pinned);
    const to = target(prev, m, zoom);
    if (m.focus || zoom || m.anchor) userMoved = true;
    if (!prev.size) {
      t = to;
      apply();
    } else morph(prev, from, to, nodeEls);
    if (m.focus) flash(m.focus);
  }

  // Boxes slide and resize from where they were; new ones and the wires fade in once they land.
  function morph(prev, from, to, nodeEls) {
    const moves = [];
    for (const [id, g] of nodeEls) {
      const a = prev.get(id), b = boxes.get(id);
      if (!a) { g.classList.add("enter"); continue; }
      if (a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h) continue;
      moves.push({ g, a, b, body: g.querySelector("rect.body"), rule: g.querySelector("line.rule") });
    }
    moving = true;
    scene.classList.add("moving");
    const start = performance.now(), mine = ++cam;
    const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    const frame = (now) => {
      const u = Math.min(1, (now - start) / MORPH_MS), e = ease(u), lerp = (p, q) => p + (q - p) * e;
      // Zoom interpolates geometrically so the scale change feels even.
      if (cam === mine) {
        t = { k: from.k * Math.pow(to.k / from.k, e), x: lerp(from.x, to.x), y: lerp(from.y, to.y) };
        apply();
      }
      for (const { g, a, b, body, rule } of moves) {
        g.setAttribute("transform", `translate(${(a.x - b.x) * (1 - e)},${(a.y - b.y) * (1 - e)})`);
        body.setAttribute("width", lerp(a.w, b.w));
        body.setAttribute("height", lerp(a.h, b.h));
        rule?.setAttribute("x2", b.x + lerp(a.w, b.w));
      }
      if (u < 1) return requestAnimationFrame(frame);
      for (const { g } of moves) g.removeAttribute("transform");
      for (const g of scene.querySelectorAll(".node.enter")) g.classList.remove("enter");
      scene.classList.remove("moving");
      moving = false;
      quiet = performance.now() + QUIET_MS;
      net = 0;
    };
    requestAnimationFrame(frame);
  }

  function applyHidden() {
    for (const x of scene._wires ?? []) {
      const off = x.kinds.every((k) => hidden.includes(k));
      x.path.classList.toggle("off", off);
      x.hit.style.display = off ? "none" : "";
    }
  }

  // ---- hover focus and tooltips ----
  const nodeTip = (b) => {
    const n = b.node;
    const lines = [`<b>${esc(n.name)}</b>  ${n.kind === "tier" ? "group" : n.kind.replace("_", " ")}`];
    if (n.signature) lines.push(esc(n.signature));
    if (n.doc) lines.push(esc(n.doc.length > 300 ? n.doc.slice(0, 300) + "…" : n.doc));
    if (n.path) lines.push(esc(n.path));
    for (const x of b.ext ?? []) {
      const rs = x.rollups.map((r) => `${r.from === b.id ? "→" : "←"} ${r.kind} ×${r.weight}`).join(", ");
      lines.push(`<span class="dim">↗ ${esc(x.name)}  ${rs}</span>`);
    }
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
  // Hover lights a node or wire and its ends; a pin (click a wire, shift-click a node) holds it.
  function light(id) {
    scene.classList.add("focus");
    scene._nodes.get(id)?.classList.add("hl");
    for (const x of scene._wires) {
      if (x.w.from !== id && x.w.to !== id) continue;
      x.path.classList.add("hl");
      scene._nodes.get(x.w.from)?.classList.add("hl");
      scene._nodes.get(x.w.to)?.classList.add("hl");
    }
    // An outside node lights the boxes that name it.
    for (const b of L.boxes) if (b.ext?.some((x) => x.id === id)) scene._nodes.get(b.id)?.classList.add("hl");
    // Ancestors stay visible so the focused node keeps its context.
    for (const x of [id, ...(boxes.get(id)?.ext ?? []).map((x) => x.id)])
      for (let p = boxes.get(x)?.parent; p; p = boxes.get(p)?.parent) scene._nodes.get(p)?.classList.add("hl");
    for (const x of boxes.get(id)?.ext ?? []) scene._nodes.get(x.id)?.classList.add("hl");
  }
  function lightWire(w) {
    scene.classList.add("focus");
    for (const x of scene._wires) if (x.w === w) x.path.classList.add("hl");
    for (const id of [w.from, w.to]) {
      scene._nodes.get(id)?.classList.add("hl");
      for (let p = boxes.get(id)?.parent; p; p = boxes.get(p)?.parent) scene._nodes.get(p)?.classList.add("hl");
    }
  }
  function focus(id, e, html) {
    if (drag?.moved || moving) return;
    light(id);
    showTip(e, html);
  }
  function focusWire(w, path, e) {
    if (moving) return;
    lightWire(w);
    const name = (id) => esc(boxes.get(id)?.node.name ?? id);
    const two = w.rollups.some((r) => r.from === w.to);
    const rows = w.rollups.map((r) => {
      const certainty = [["resolved", r.resolved], ["may", r.may], ["unresolved", r.unresolved]].filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ");
      return `${two ? (r.from === w.from ? "→ " : "← ") : ""}${r.kind} ×${r.weight}  <span class="dim">${certainty}</span>`;
    });
    const by = w.labels?.length ? `\n<span class="dim">by ${w.labels.map(esc).join(", ")}</span>` : "";
    showTip(e, `<b>${name(w.from)}</b> ${two ? "↔" : "→"} <b>${name(w.to)}</b>\n${rows.join("\n")}${by}`);
  }
  function unfocus() {
    scene.classList.remove("focus");
    for (const n of scene.querySelectorAll(".hl")) n.classList.remove("hl");
    tip.hidden = true;
    if (pinned) pin(pinned);
  }
  function pin(p) {
    const w = p.node ? null : L.wires.find((x) => x.from === p.from && x.to === p.to);
    if (!(p.node ? boxes.has(p.node) : w)) return unpin();
    pinned = p;
    p.node ? light(p.node) : lightWire(w);
  }
  function unpin() {
    pinned = null;
    unfocus();
  }
  svg.addEventListener("click", () => !drag?.moved && pinned && unpin());
  addEventListener("keydown", (e) => e.key === "Escape" && pinned && unpin());

  function flash(id) {
    const g = scene._nodes.get(id);
    g?.classList.add("flash");
    setTimeout(() => g?.classList.remove("flash"), 1600);
  }
  function centerOn(id) {
    const b = boxes.get(id);
    if (!b) return;
    const k = Math.max(t.k, 0.9);
    t = { k, x: svg.clientWidth / 2 - (b.x + b.w / 2) * k, y: svg.clientHeight / 2 - (b.y + b.h / 2) * k };
    cam++;
    userMoved = true;
    apply();
    flash(id);
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
      pending = null;
      return;
    }
    if (m.type === "focus") return centerOn(m.id);
    if (m.type === "fit") return fit();
    if (m.type === "layout") {
      msg.hidden = true;
      hidden = m.hidden;
      const zoom = pending && m.seq === pending.seq ? pending : null;
      if (zoom) pending = null;
      L = m.layout;
      draw(m, zoom);
    }
  });
  vs.postMessage({ type: "ready" });
})();
