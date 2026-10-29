// Graph tab: draws a precomputed layout and handles pan/zoom. All graph logic stays in the host.
(() => {
  const vs = acquireVsCodeApi();
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const svg = $("view"), scene = $("scene"), labels = $("labels"), msg = $("msg"), tip = $("tip");
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
  // Semantic zoom: zooming in opens boxes that fill the screen. Zooming out never closes. The host owns the expansion state; this only asks.
  const saved = vs.getState() ?? {};
  let auto = saved.auto ?? true, pending = null, seq = 0, net = 0, settle = 0, moving = false, quiet = 0, pinned = null;
  const cursor = { x: 0, y: 0 };
  // The box under the cursor opens once it is this tall on screen (a leaf box is 26 units).
  // QUIET_MS after a relayout swallows trackpad momentum, so one gesture opens one level.
  const OPEN_PX = 56, SETTLE_MS = 220, MORPH_MS = 320, QUIET_MS = 450;

  // ---- view transform ----
  // Bumped by every user camera move, so a running relayout animation stops steering the camera.
  let cam = 0;
  const apply = () => {
    scene.setAttribute("transform", `translate(${t.x},${t.y}) scale(${t.k})`);
    // Wires thin out as the view zooms out, so a whole repo reads as structure, not a solid mass.
    svg.style.setProperty("--z", String(Math.min(1, Math.max(0.3, t.k))));
    $("zoom").textContent = Math.round(t.k * 100) + "%";
    relabel();
  };

  // ---- far labels ----
  // Zoomed out, box text shrinks past reading. Names are then drawn at screen size instead, biggest
  // boxes first, skipping any that would overlap one already placed.
  const FAR_K = 0.7, LABEL_PX = 11, LABEL_CHAR = 6.2, MAX_LABELS = 150;
  let labelFrame = 0;
  function relabel() {
    if (labelFrame) return;
    labelFrame = requestAnimationFrame(() => {
      labelFrame = 0;
      const far = !!L && t.k < FAR_K && !moving;
      svg.classList.toggle("far", far);
      labels.replaceChildren();
      if (!far) return;
      const W = svg.clientWidth, H = svg.clientHeight, placed = [];
      const free = (r) => placed.every((p) => r.x + r.w <= p.x || p.x + p.w <= r.x || r.y + r.h <= p.y || p.y + p.h <= r.y);
      const leaves = L.boxes.filter((b) => !b.container).map((b) => ({ b, s: onScreen(b) }));
      const order = [...L.boxes].sort((a, b) => b.w * b.h - a.w * a.h || a.id.localeCompare(b.id));
      for (const b of order) {
        if (placed.length >= MAX_LABELS) break;
        const s = onScreen(b);
        if (s.x > W || s.y > H || s.x + s.w < 0 || s.y + s.h < 0 || s.w < 28) continue;
        // Containers name their top edge; a leaf is named across its middle. The whole name may run past
        // the box when nothing is there; else it is cut to the box.
        const y = b.container ? s.y + Math.min(HEAD * t.k, 16) : s.y + s.h / 2 + 4;
        const room = Math.floor((s.w - 8) / LABEL_CHAR), full = b.node.name;
        const rect = (n) => ({ x: s.x + 4, y: y - LABEL_PX, w: n.length * LABEL_CHAR + 4, h: LABEL_PX + 4 });
        const clear = (r) => leaves.every((o) => o.b === b || r.x + r.w <= o.s.x || o.s.x + o.s.w <= r.x || r.y + r.h <= o.s.y || o.s.y + o.s.h <= r.y);
        const cut = full.length > room ? full.slice(0, Math.max(room - 1, 3)) + "…" : full;
        const name = full !== cut && free(rect(full)) && clear(rect(full)) ? full : free(rect(cut)) ? cut : undefined;
        if (name === undefined) continue;
        placed.push(rect(name));
        const g = el("text", { class: `far-label k-${b.node.kind}` + (b.container ? " container" : ""), x: s.x + 6, y }, labels);
        g.textContent = name;
      }
    });
  }
  const FLOW_MIN_K = 0.85, FLOW_MAX_K = 1.25;
  const fitted = () => {
    // The summary, when shown, is pinned along the bottom: fit above it. The map fits the pane, up to
    // 1.5× so its boxes keep a sensible size. A flow chart is never shrunk below a readable size: it
    // fits the pane's width and, when it is taller than the pane, starts at the top and scrolls.
    const W = svg.clientWidth, m = 24, below = story && !story.hidden ? story.offsetHeight + 16 : 0, H = svg.clientHeight - below;
    const kw = (W - 2 * m) / Math.max(L.width, 1), kh = (H - 2 * m) / Math.max(L.height, 1);
    const k = F ? Math.min(kw, Math.max(kh, FLOW_MIN_K), FLOW_MAX_K) : Math.min(kw, kh, 1.5);
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
  // A resize refits the view; the flow chart, laid out for the pane, is also laid out again by the
  // host (see `viewport` below) and refits when that arrives.
  new ResizeObserver(() => (userMoved && !F ? apply() : fit())).observe(svg);
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
  const under = (s) => cursor.x >= s.x && cursor.x <= s.x + s.w && cursor.y >= s.y && cursor.y <= s.y + s.h;
  // Only the gesture's direction acts (zoom in opens), so a relayout can never undo itself.
  function semantic() {
    const dir = net;
    net = 0;
    // A reply that never comes (host error) must not wedge zooming.
    if (pending && performance.now() - pending.at > 5000) pending = null;
    if (!auto || !L || F || pending || moving || Math.abs(dir) < 1e-3) return;
    const W = svg.clientWidth;
    const all = L.boxes.map((b) => ({ b, s: onScreen(b) }));
    if (dir <= 0) return;
    // Opens only what the user zooms toward; leaf boxes never overlap, so this is one box at most.
    const open = all.filter(({ b, s }) => b.expandable && !b.container && under(s) && (s.h >= OPEN_PX || s.w >= W * 0.45));
    if (!open.length) return;
    const anchor = open[0].b.id;
    pending = { seq: ++seq, open: open.map((x) => x.b.id), anchor, at: performance.now() };
    vs.postMessage({ type: "zoom", open: pending.open, close: [], anchor, seq: pending.seq });
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
    // Boundaries: what the program reaches outside itself.
    "boundary:database": "M-5,-3.5a5,2 0 1,0 10,0a5,2 0 1,0 -10,0v7a5,2 0 0,0 10,0v-7",
    "boundary:network": "M-5.5,0a5.5,5.5 0 1,0 11,0a5.5,5.5 0 1,0 -11,0M-5.5,0h11M0,-5.5c-3,3 -3,8 0,11M0,-5.5c3,3 3,8 0,11",
    "boundary:ai": "M0,-6L1.5,-1.5L6,0L1.5,1.5L0,6L-1.5,1.5L-6,0L-1.5,-1.5z",
    "boundary:cloud": "M-4,3.5h8a3,3 0 0,0 0,-6a4,4 0 0,0 -7.6,1a2.6,2.6 0 0,0 -0.4,5z",
    "boundary:messaging": "M-6,-4h12v8h-12zM-6,-4l6,4.5l6,-4.5",
    "boundary:filesystem": "M-4.5,-6h6l3,3v9h-9zM1.5,-6v3h3",
    "boundary:process": "M-6,-5h12v10h-12zM-3.5,-2l2.5,2l-2.5,2M1,2.5h3",
    "boundary:environment": "M-5.5,0a2.5,2.5 0 1,0 5,0a2.5,2.5 0 1,0 -5,0M-0.5,0h6M3.5,0v2.5",
  };
  const LETTER = { type: "T", function: "ƒ", method: "m", field: "•", variable: "v", external: "↗", unresolved: "?", event: "⚡" };
  function glyph(g, kind, x, cy) {
    if (ICON[kind]) return el("path", { class: "glyph", d: ICON[kind], transform: `translate(${x + 6},${cy})` }, g);
    el("text", { class: "letter", x: x + 6, y: cy + 4, "text-anchor": "middle" }, g).textContent = LETTER[kind] ?? "·";
  }

  // Where the camera ends up after a relayout: keeps the user's place.
  function target(prev, m, zoom) {
    const W = svg.clientWidth, H = svg.clientHeight;
    const keep = (id) => {
      const a = prev.get(id), b = boxes.get(id);
      return a && b ? { k: t.k, x: t.x + (a.x - b.x) * t.k, y: t.y + (a.y - b.y) * t.k } : null;
    };
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
    for (const k of ["call", "flow", "override", "transition", "guard", "unresolved", "flag-error", "flag-warning", "flag-info"]) {
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
      const g = el("g", { class: `node k-${b.node.kind}` + (b.container ? " container" : "") + (b.node.unindexed ? " unindexed" : "") + (b.flag ? ` flag-${b.flag.severity}` : ""), "data-id": b.id }, nodeLayer);
      el("rect", { class: "body", x: b.x, y: b.y, width: b.w, height: b.h, rx: b.container ? 6 : 4 }, g);
      el("rect", { class: "bar", x: b.x, y: b.y + 1, width: 3, height: (b.container ? HEAD : b.h) - 2, rx: 1.5 }, g);
      const cy = b.y + (b.container ? HEAD : LEAF_H) / 2;
      let x = b.x + 8;
      if (b.expandable) {
        // Chevron: right when collapsed, down when expanded.
        el("path", { class: "chev", d: b.container ? `M${x},${cy - 2}l4,4l4,-4` : `M${x + 2},${cy - 4}l4,4l-4,4` }, g);
        x += 14;
      }
      // Entry: nothing in the repo calls it, so control comes in from outside.
      if (b.role === "entry") el("path", { class: "entry-mark", d: `M${b.x - 16},${cy}h13m-4,-4l4,4l-4,4` }, g);
      glyph(g, b.node.kind === "boundary" ? b.id : b.node.kind, x, cy);
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
      const head = `url(#arrow-${w.flag ? "flag-" + w.flag.severity : p === "unresolved" ? "unresolved" : main})`;
      const path = el("path", { class: `wire ${main} ${p}` + (w.flag ? ` flag flag-${w.flag.severity}` : ""), d, "marker-end": head }, wireLayer);
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
      relabel();
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
    for (const note of b.flag?.notes ?? []) lines.push(`<span class="sev-${b.flag.severity}">● ${esc(note)}</span>`);
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
    const notes = (w.flag?.notes ?? []).map((n) => `\n<span class="sev-${w.flag.severity}">● ${esc(n)}</span>`).join("");
    showTip(e, `<b>${name(w.from)}</b> ${two ? "↔" : "→"} <b>${name(w.to)}</b>\n${rows.join("\n")}${by}${notes}`);
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

  // ---- automaton ----
  // Regions are orthogonal: each holds the states of locations that test each other. A state is a pill;
  // the initial one has an arrow in. Transitions are labelled by the inputs that take them; inputs that
  // leave a state as it is are listed under it.
  function drawAutomaton(A) {
    const first = !L;
    L = { width: A.width, height: A.height, boxes: [], wires: [] };
    boxes = new Map();
    scene._wires = [];
    scene._nodes = new Map();
    scene.replaceChildren();
    const inputs = new Map(A.inputs.map((i) => [i.id, i]));
    const defs = el("defs", {}, scene);
    for (const k of ["transition", "unresolved"]) {
      const mk = el("marker", { id: "arrow-" + k, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "8", markerHeight: "8", markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
      el("path", { d: "M0,1L9,5L0,9z", class: "arrow " + k }, mk);
    }
    const regionLayer = el("g", {}, scene), arcLayer = el("g", {}, scene), stateLayer = el("g", {}, scene);
    for (const r of A.regions) {
      const g = el("g", { class: "region" }, regionLayer);
      el("rect", { class: "body", x: r.x, y: r.y, width: r.w, height: r.h, rx: 8 }, g);
      el("text", { class: "title", x: r.x + 12, y: r.y + 19 }, g).textContent = r.title + (r.truncated ? "  (more states than drawn)" : "");
    }
    const list = (ids) => ids.map((i) => esc(inputs.get(i)?.detail ?? i)).join("\n");
    const stateEls = new Map(), arcEls = [];
    for (const s of A.states) {
      const g = el("g", { class: "astate" + (s.initial ? " initial" : "") }, stateLayer);
      const pillH = s.h - (s.loops.length || s.mayLoops.length ? 14 : 0);
      el("rect", { class: "body", x: s.x, y: s.y, width: s.w, height: pillH, rx: Math.min(pillH / 2, 15) }, g);
      s.lines.forEach((line, i) => (el("text", { class: "value", x: s.x + s.w / 2, y: s.y + 19 + i * 16, "text-anchor": "middle" }, g).textContent = line));
      const loops = [...s.loops, ...s.mayLoops];
      if (loops.length) {
        const ns = loops.map((i) => inputs.get(i)?.name ?? i);
        el("text", { class: "loops", x: s.x + s.w / 2, y: s.y + s.h - 2, "text-anchor": "middle" }, g).textContent = "↺ " + (ns.length > 3 ? `${ns.slice(0, 3).join(", ")} +${ns.length - 3}` : ns.join(", "));
      }
      if (s.initial) {
        // Drawn into the top, where no transition lands.
        const cx = s.x + Math.min(s.w / 2, 22);
        el("circle", { class: "start", cx, cy: s.y - 20, r: 3.5 }, g);
        el("path", { class: "arc", d: `M${cx},${s.y - 16}V${s.y - 1}`, "marker-end": "url(#arrow-transition)" }, g);
      }
      g.addEventListener("mouseenter", (e) => {
        lightAutomaton(s.id);
        const head = `<b>${s.lines.map(esc).join("\n")}</b>${s.initial ? "  initial" : ""}`;
        showTip(e, head + (s.loops.length ? `\n<span class="dim">Unchanged by</span>\n${list(s.loops)}` : "")
          + (s.mayLoops.length ? `\n<span class="dim">May leave it as it is</span>\n${list(s.mayLoops)}` : ""));
      });
      g.addEventListener("mouseleave", unfocus);
      stateEls.set(s.id, g);
    }
    for (const a of A.arcs) {
      const d = pathOf(a.points);
      const path = el("path", { class: "arc" + (a.may ? " may" : ""), d, "marker-end": "url(#arrow-transition)" }, arcLayer);
      const label = el("text", { class: "arc-label", x: a.label.x, y: a.label.y }, arcLayer);
      label.textContent = a.label.text;
      const hit = el("path", { class: "hit", d }, arcLayer);
      for (const t of [hit, label]) {
        t.addEventListener("mouseenter", (e) => {
          lightAutomaton(null, a);
          showTip(e, `${a.may ? '<span class="dim">may</span>\n' : ""}${list(a.inputs)}\n<span class="dim">⌘/Ctrl-click opens the handler</span>`);
        });
        t.addEventListener("mouseleave", unfocus);
        t.addEventListener("click", (e) => {
          e.stopPropagation();
          if (e.metaKey || e.ctrlKey) vs.postMessage({ type: "open", id: inputs.get(a.inputs[0])?.handler });
        });
      }
      arcEls.push({ a, path, label });
    }
    scene._automaton = { stateEls, arcEls };
    if (first || !userMoved) fit();
    else apply();
  }
  function lightAutomaton(state, arc) {
    const { stateEls, arcEls } = scene._automaton;
    scene.classList.add("focus");
    for (const x of arcEls) {
      if (arc ? x.a !== arc : x.a.from !== state && x.a.to !== state) continue;
      x.path.classList.add("hl");
      x.label.classList.add("hl");
      stateEls.get(x.a.from)?.classList.add("hl");
      stateEls.get(x.a.to)?.classList.add("hl");
    }
    if (state) stateEls.get(state)?.classList.add("hl");
  }

  // ---- control flow chart ----
  // The control flow from one entry point: calls top to bottom, branches as pointed boxes that say "if"
  // and the condition, their sides indented beneath, loops with a line back up, calls that leave the
  // repo as terminals. A click on a call expands its callees in place (a leaf opens its source);
  // ⌘/Ctrl-click or double-click opens the source. With a narrative, the top-level steps sit in titled
  // phase bands and the summary is pinned above the chart.
  const LANG = { go: "Go", javascript: "JavaScript / TypeScript", rust: "Rust", csharp: "C#", cpp: "C / C++", dart: "Dart / Flutter", python: "Python", java: "Java", kotlin: "Kotlin", php: "PHP", ruby: "Ruby" };
  const EXT = { go: "go", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", ts: "javascript", tsx: "javascript", mts: "javascript", cts: "javascript", rs: "rust", cs: "csharp", c: "cpp", cc: "cpp", cpp: "cpp", h: "cpp", hpp: "cpp", dart: "dart", py: "python", java: "java", kt: "kotlin", kts: "kotlin", php: "php", rb: "ruby" };
  const langOf = (p) => LANG[EXT[(p ?? "").slice((p ?? "").lastIndexOf(".") + 1).toLowerCase()]];
  const BOUNDARY_LABEL = { database: "Database", network: "Network", ai: "AI models", cloud: "Cloud & SaaS", messaging: "Queues", filesystem: "Filesystem", process: "Processes", environment: "Environment" };
  // Must match src/flowchart.ts: code is drawn a touch wider than body text.
  const CODE = CHAR * 1.05;
  const fitText = (s, w, cw = CHAR) => {
    const n = Math.max(3, Math.floor(w / cw));
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  };
  const story = $("story");
  let F = null;
  function drawFlow(m) {
    const prevBoxes = F ? new Map(F.boxes.map((b) => [b.id, b])) : null;
    F = m.layout;
    const first = !L;
    // Far labels (zoomed out) read the same list the map uses: a step is a leaf named across its
    // middle, a phase a container named along its top edge.
    L = { width: F.width, height: F.height, boxes: [], wires: [] };
    boxes = new Map();
    scene._wires = [];
    scene._nodes = new Map();
    scene.replaceChildren();
    labels.replaceChildren();
    story.hidden = !F.summary;
    story.textContent = F.summary ?? "";
    const defs = el("defs", {}, scene);
    for (const k of ["flow", "back", "flag-error", "flag-warning", "flag-info"]) {
      const mk = el("marker", { id: "arrow-" + k, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "8", markerHeight: "8", markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
      el("path", { d: "M0,1L9,5L0,9z", class: "arrow " + k }, mk);
    }
    const bandLayer = el("g", {}, scene), frameLayer = el("g", {}, scene), linkLayer = el("g", { class: "links" }, scene), stepLayer = el("g", {}, scene);
    for (const b of F.boxes) {
      if (b.kind === "phase") {
        const g = el("g", { class: "phase" + (b.cont ? " cont" : "") }, bandLayer);
        el("rect", { class: "band", x: b.x, y: b.y, width: b.w, height: b.span ?? b.h, rx: 6 }, g);
        el("path", { class: "rule", d: `M${b.x + 8},${b.y + b.h}H${b.x + b.w - 8}` }, g);
        el("text", { class: "title", x: b.x + 10, y: b.y + 16 }, g).textContent = b.text;
        L.boxes.push({ ...b, h: b.span ?? b.h, container: true, node: { name: b.text, kind: "phase" } });
      } else if (b.kind === "frame") el("rect", { class: "frame", x: b.x, y: b.y, width: b.w, height: b.h, rx: 8 }, frameLayer);
    }
    const stepEls = new Map(), linkEls = [];
    for (const l of F.links) {
      const d = pathOf(l.points);
      const path = el("path", { class: "link" + (l.back ? " back" : ""), d, "marker-end": "url(#arrow-" + (l.back ? "back" : "flow") + ")" }, linkLayer);
      if (l.label) {
        const p = l.points[0], q = l.points[1] ?? p;
        const horizontal = Math.abs(q.y - p.y) < 1;
        // Along a horizontal first leg (a side exit, or across to the no column) the word sits above
        // the line; on a vertical leg it hangs just right of it.
        const x = horizontal ? (q.x < p.x ? Math.min(p.x, q.x) + 2 : p.x + 8) : p.x + 6;
        const y = horizontal ? p.y - 5 : p.y + 11;
        el("text", { class: "link-label " + l.label, x, y }, linkLayer).textContent = l.label;
      }
      linkEls.push({ l, path });
    }
    for (const b of F.boxes) {
      if (b.kind === "frame" || b.kind === "phase") continue;
      const g = el("g", { class: `step s-${b.kind}` + (b.state ? ` ${b.state}` : "") + (b.may ? " may" : "") + (b.flag ? ` flag-${b.flag}` : ""), "data-id": b.id }, stepLayer);
      const mid = b.y + b.h / 2;
      if (b.kind === "if" || b.kind === "switch" || b.kind === "loop") {
        // A pointed box: the keyword small at the left, the condition as written beside it, wrapped.
        const c = 12;
        el("polygon", { class: "body", points: `${b.x + c},${b.y} ${b.x + b.w - c},${b.y} ${b.x + b.w},${mid} ${b.x + b.w - c},${b.y + b.h} ${b.x + c},${b.y + b.h} ${b.x},${mid}` }, g);
        const lines = b.lines ?? [b.text], kw = b.keyword ?? b.kind;
        const y0 = mid + 4 - (lines.length - 1) * 7;
        el("text", { class: "kw", x: b.x + 12, y: y0 }, g).textContent = kw;
        const x0 = b.x + 12 + kw.length * CHAR + 6;
        lines.forEach((line, i) => (el("text", { class: "name cond", x: x0, y: y0 + i * 14 }, g).textContent = fitText(line, b.x + b.w - 12 - x0, CODE)));
      } else if (b.kind === "end") {
        el("circle", { class: "body", cx: b.x + b.w / 2, cy: mid, r: b.w / 2 }, g);
        el("circle", { class: "dot", cx: b.x + b.w / 2, cy: mid, r: b.w / 4 }, g);
      } else if (b.kind === "jump") {
        // Off-page connector: the flow carries on at the top of the next column.
        el("circle", { class: "body", cx: b.x + b.w / 2, cy: mid, r: b.w / 2 }, g);
        el("path", { class: "chev", d: `M${b.x + b.w / 2 - 2},${mid - 4}l4,4l-4,4` }, g);
      } else if (b.kind === "case" || b.kind === "catch") {
        el("rect", { class: "body", x: b.x, y: b.y, width: b.w, height: b.h, rx: 11 }, g);
        el("text", { class: "name tag", x: b.x + 10, y: mid + 4 }, g).textContent = fitText((b.kind === "catch" ? "⚠ " : "") + b.text, b.w - 20);
      } else {
        el("rect", { class: "body", x: b.x, y: b.y, width: b.w, height: b.h, rx: b.kind === "entry" ? b.h / 2 : 5 }, g);
        let x = b.x + 10;
        const top = b.sub ? b.y + 18 : mid + 4;
        if (b.kind === "call" && (b.state === "closed" || b.state === "open" || b.state === "cut")) {
          // Chevron: right when closed, down when open, a dash when the chart stops here. A leaf has
          // nothing to open, so it carries none.
          el("path", { class: "chev", d: b.state === "open" ? `M${x},${top - 7}l4,4l4,-4` : b.state === "cut" ? `M${x + 2},${top - 5}h4` : `M${x + 2},${top - 9}l4,4l-4,4` }, g);
          x += 14;
        }
        if (b.kind === "boundary") {
          el("path", { class: "glyph", d: ICON["boundary:" + b.boundary] ?? "", transform: `translate(${x + 6},${mid})` }, g);
          x += 18;
        }
        if (b.kind === "entry") {
          el("path", { class: "entry-mark", d: `M${x},${top}h10m-3,-3l3,3l-3,3`, transform: "translate(0,-4)" }, g);
          x += 16;
        }
        const label = BOUNDARY_LABEL[b.boundary];
        const tail = b.kind === "boundary" ? label : b.count > 1 ? `×${b.count}` : "";
        const tailW = tail ? tail.length * CHAR + 10 : 0;
        el("text", { class: "name" + (b.kind === "entry" ? " title" : ""), x, y: top }, g).textContent = fitText(b.text, b.w - (x - b.x) - tailW - 8);
        if (tail) el("text", { class: b.kind === "boundary" ? "where" : "count", x: b.x + b.w - 8, y: top, "text-anchor": "end" }, g).textContent = tail;
        // Doc lines were wrapped to the box by the layout; nothing to cut.
        (b.sub ?? []).forEach((line, i) => (el("text", { class: "sub", x: b.x + 10, y: b.y + 34 + i * 14 }, g).textContent = line));
        if (b.kind === "entry") {
          const lang = langOf(b.path);
          el("text", { class: "sub where", x: b.x + 10, y: b.y + b.h - 8 }, g).textContent = fitText(b.path + (lang ? " · " + lang : ""), b.w - 20, CHAR * 0.9);
        }
      }
      stepEls.set(b.id, g);
      const name = b.keyword ? `${b.keyword} ${b.text}` : b.text;
      boxes.set(b.id, { ...b, node: { name, kind: b.kind } });
      if (b.kind !== "end" && b.kind !== "jump") L.boxes.push({ ...b, container: false, node: { name, kind: b.kind } });
      g.addEventListener("click", (e) => {
        if (drag?.moved) return;
        e.stopPropagation();
        const source = e.metaKey || e.ctrlKey;
        if (b.kind === "call" && !source && (b.state === "closed" || b.state === "open")) return vs.postMessage({ type: "flowToggle", id: b.id });
        if (b.kind === "call" || b.kind === "entry") return vs.postMessage(source || b.kind === "entry" || b.state === "leaf" ? { type: "open", id: b.target } : { type: "openAt", path: b.path, line: b.line });
        if (b.path) vs.postMessage({ type: "openAt", path: b.path, line: b.line });
      });
      g.addEventListener("dblclick", (e) => (e.stopPropagation(), vs.postMessage(b.kind === "call" || b.kind === "entry" ? { type: "open", id: b.target } : { type: "openAt", path: b.path, line: b.line })));
      g.addEventListener("mouseenter", (e) => {
        if (moving || drag?.moved) return;
        scene.classList.add("focus");
        g.classList.add("hl");
        for (const x of linkEls) if (x.l.from === b.id || x.l.to === b.id) { x.path.classList.add("hl"); stepEls.get(x.l.from)?.classList.add("hl"); stepEls.get(x.l.to)?.classList.add("hl"); }
        showTip(e, flowTip(b));
      });
      g.addEventListener("mouseleave", unfocus);
    }
    scene._flow = { stepEls, linkEls };
    const anchor = m.anchor && boxes.get(m.anchor), was = m.anchor && prevBoxes?.get(m.anchor);
    // Laid out again for a resized pane (`fit`): the whole chart is shown in it.
    if (m.focus && boxes.get(m.focus)) {
      scene._nodes = stepEls;
      centerOn(m.focus);
    } else if (first || m.fit || (!userMoved && !m.anchor)) fit();
    else if (anchor && was) {
      // Keep the clicked step where it was on screen.
      t.x += (was.x - anchor.x) * t.k;
      t.y += (was.y - anchor.y) * t.k;
      cam++;
      apply();
    } else apply();
  }
  function flowTip(b) {
    const lines = [];
    if (b.kind === "if") lines.push(`<b>if</b> ${esc(b.text)}`);
    else if (b.kind === "switch") lines.push(`<b>switch on</b> ${esc(b.text)}`);
    else if (b.kind === "loop") lines.push(`<b>loop</b> ${esc(b.text)}`);
    else if (b.kind === "end") return "Return from the entry point.";
    else if (b.kind === "jump") return "Continues in the next column.";
    else lines.push(`<b>${esc(b.text)}</b>${b.count > 1 ? `  ×${b.count}` : ""}${b.may ? '  <span class="dim">may: unresolved call target</span>' : ""}`);
    if (b.doc) lines.push(esc(b.doc));
    if (b.boundary) lines.push(`<span class="dim">Boundary crossing: ${BOUNDARY_LABEL[b.boundary]}</span>`);
    for (const n of b.notes ?? []) lines.push(`<span class="sev-${b.flag}">● ${esc(n)}</span>`);
    if (b.path) lines.push(`<span class="dim">${esc(b.path)}${b.line ? ":" + b.line : ""}</span>`);
    if (b.kind === "call") lines.push(`<span class="dim">${b.state === "open" ? "Click: collapse" : b.state === "cut" ? "Depth limit" : b.state === "leaf" ? "Leaf · click: source" : b.state === "empty" ? "No further calls" : "Click: expand callees"} · ⌘/Ctrl-click: source</span>`);
    else if (b.kind === "entry") lines.push('<span class="dim">Click: source</span>');
    else if (b.path) lines.push('<span class="dim">Click: source</span>');
    return lines.join("\n");
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
      msg.textContent = s.state === "error" ? s.detail : s.state === "ready" ? "" : s.state === "idle" ? `${s.label}.\nRun Index in the Hesperus sidebar.` : (s.label || "Loading…");
      if (s.state === "error" || !L) (scene.replaceChildren(), labels.replaceChildren());
      pending = null;
      return;
    }
    if (m.type === "focus") return centerOn(m.id);
    if (m.type === "fit") return fit();
    if (m.type === "flow") {
      msg.hidden = true;
      pending = null;
      pinned = null;
      svg.classList.add("flowing");
      $("auto").hidden = true;
      return drawFlow(m);
    }
    if (m.type === "automaton") {
      msg.hidden = true;
      F = null;
      story.hidden = true;
      pending = null;
      pinned = null;
      return drawAutomaton(m.layout);
    }
    if (m.type === "layout") {
      msg.hidden = true;
      hidden = m.hidden;
      if (F) (F = null, (L = null), (userMoved = false));
      story.hidden = true;
      svg.classList.remove("flowing");
      $("auto").hidden = false;
      const zoom = pending && m.seq === pending.seq ? pending : null;
      if (zoom) pending = null;
      L = m.layout;
      draw(m, zoom);
    }
  });
  // The host lays the flow out in as many columns as fit the pane, so it is told the pane's size, once
  // a resize has settled.
  const viewport = () => vs.postMessage({ type: "viewport", width: svg.clientWidth, height: svg.clientHeight });
  let resizeTimer = 0;
  addEventListener("resize", () => (clearTimeout(resizeTimer), (resizeTimer = setTimeout(viewport, 150))));
  viewport();
  vs.postMessage({ type: "ready" });
})();
