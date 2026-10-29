// Hesperus sidebar: status, which view is up, the entry points, the boundaries crossed. State lives in
// the extension host; the webview keeps only which sections are folded and whether the entry list is
// unfolded.
(() => {
  const vs = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const kept = vs.getState() ?? {};
  const remember = (patch) => vs.setState(Object.assign(kept, patch));

  for (const id of ["flow", "map", "reindex"]) $(id).onclick = () => vs.postMessage({ type: id });
  $("watch").onchange = () => vs.postMessage({ type: "watch" });
  $("tests").onchange = () => vs.postMessage({ type: "tests" });
  $("find").onsubmit = (e) => {
    e.preventDefault();
    vs.postMessage({ type: "find", query: $("q").value });
  };

  // Sections fold like the editor's own panes, and stay as left.
  for (const head of document.querySelectorAll(".head")) {
    const key = head.parentElement.id;
    const set = (open) => head.setAttribute("aria-expanded", String(open));
    set(kept.folded?.[key] !== true);
    head.onclick = () => {
      const open = head.getAttribute("aria-expanded") !== "true";
      set(open);
      remember({ folded: { ...kept.folded, [key]: !open } });
    };
  }

  // Entry points shown before the list folds; the first few have the largest reach.
  const FOLD = 8;
  let unfolded = kept.unfolded === true, last;
  $("unfold").onclick = () => {
    unfolded = !unfolded;
    remember({ unfolded });
    if (last) entries(last);
  };

  const sentence = (doc, max = 140) => {
    if (!doc) return "";
    const m = /^(.*?[.!?])(\s|$)/.exec(doc);
    const s = (m ? m[1] : doc).trim();
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  };
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const row = (cls, title, onclick) => {
    const li = el("li", cls);
    if (title) li.title = title;
    li.onclick = onclick;
    return li;
  };
  const none = (text) => el("li", "none", text);

  addEventListener("message", ({ data: m }) => {
    if (m.type !== "state") return;
    const s = m.status, busy = ["checking", "installing", "indexing"].includes(s.state), ready = s.state === "ready";
    $("repo").textContent = m.repo ?? "No folder open";
    const st = $("state");
    st.className = "state " + s.state;
    st.replaceChildren();
    if (busy) st.append(el("span", "spin"));
    else if (ready) st.append(el("span", "dot"));
    st.append(ready ? `${s.nodes.toLocaleString()} nodes · ${s.edges.toLocaleString()} edges` : s.label);
    // The note is a few words; the whole message is its tooltip.
    const note = $("detail");
    note.hidden = !s.brief;
    note.textContent = s.brief ?? "";
    note.title = s.detail ?? "";
    note.className = "note" + (s.state === "error" ? " err" : "");
    $("reindex").disabled = busy;
    $("flow").setAttribute("aria-pressed", String(m.mode === "flow"));
    $("map").setAttribute("aria-pressed", String(m.mode === "map"));
    $("watch").checked = m.watch;
    $("tests").checked = m.hideTests;
    $("test-count").textContent = m.tests ? String(m.tests) : "";
    $("tests").parentElement.hidden = !m.tests && !m.hideTests;

    // A language whose editor extension is missing is the one thing worth a line here.
    const miss = $("missing");
    miss.replaceChildren();
    for (const l of (m.languages ?? []).filter((l) => !l.installed)) {
      const li = el("li", "", `${l.id}: no extension `);
      li.title = `${l.files.toLocaleString()} ${l.id} files need ${l.editor.name} (${l.editor.id}) to be indexed.`;
      const b = el("button", "link", "Install");
      b.onclick = () => vs.postMessage({ type: "install", id: l.editor.id });
      li.append(b);
      miss.append(li);
    }
    miss.hidden = !miss.children.length;

    $("found").hidden = !m.found;
    if (m.found !== undefined) ($("found").textContent = m.found), ($("found").title = m.found);

    entries(m);
    boundaries(m, ready);
  });

  // Entry points, largest reach first. A click traces from one. The first few are shown; the rest
  // unfold on request, and the chosen one is always among them.
  function entries(m) {
    last = m;
    const s = m.status, ready = s.state === "ready";
    const all = m.entries ?? [];
    const total = all.length + (m.moreEntries ?? 0);
    const chosen = all.findIndex((e) => e.id === m.entry);
    const shown = unfolded ? all : all.slice(0, Math.max(FOLD, chosen + 1));
    $("entry-count").textContent = total ? String(total) : "";
    const list = $("entries");
    list.replaceChildren();
    for (const e of shown) {
      const doc = sentence(e.doc);
      const li = row(e.id === m.entry ? "current" : "", `${e.kind} · reach ${e.reach}${doc ? "\n" + doc : ""}\nClick: trace control flow from here`, () => vs.postMessage({ type: "entry", id: e.id }));
      li.append(el("span", "name", e.name), el("span", "desc", `\u200E${e.path}:${e.line}\u200E`), el("span", "count", String(e.reach)));
      list.append(li);
    }
    if (!all.length) list.append(none(ready ? "No entry point: nothing is reached from outside the repo." : s.state === "idle" ? "Not indexed." : "—"));
    const folded = all.length - shown.length;
    $("more").hidden = !folded && !unfolded && !(m.moreEntries > 0);
    $("unfold").hidden = !folded && !unfolded;
    $("unfold").textContent = folded ? `${folded} more` : "Fewer";
    $("more-note").textContent = m.moreEntries > 0 ? `${m.moreEntries} more; search by name.` : "";
  }

  // Every boundary the repo crosses, with call counts; a click shows it on the boundary graph.
  function boundaries(m, ready) {
    const cs = m.crossings ?? [];
    $("reach-count").textContent = cs.length ? String(cs.length) : "";
    const list = $("crossings");
    list.replaceChildren();
    for (const c of cs) {
      const li = row("", `${c.doc}\nClick: show on the boundary graph`, () => vs.postMessage({ type: "boundary", id: c.id }));
      li.append(el("span", "swatch b-" + c.id), el("span", "name", c.label), el("span", "desc", ""), el("span", "count", c.in ? `${c.out} out · ${c.in} in` : String(c.out)));
      list.append(li);
    }
    if (!cs.length) list.append(none(ready ? "No boundary crossings." : "—"));
  }

  vs.postMessage({ type: "ready" });
})();
