// Hesperus sidebar: status, which picture is up, where the program starts, what to review, what it
// reaches. State lives in the extension host; the webview keeps only which sections are folded and
// whether the entry list is unfolded.
(() => {
  const vs = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const kept = vs.getState() ?? {};
  const remember = (patch) => vs.setState(Object.assign(kept, patch));

  for (const id of ["flow", "map", "reindex", "accept", "policy", "ask"]) $(id).onclick = () => vs.postMessage({ type: id });
  $("assistant").onchange = () => vs.postMessage({ type: "assistant", id: $("assistant").value });
  $("watch").onchange = () => vs.postMessage({ type: "watch" });
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

  // Entry points shown before the list folds; a big program has dozens, and the first few drive the most.
  const FOLD = 8;
  let unfolded = kept.unfolded === true, last;
  $("unfold").onclick = () => {
    unfolded = !unfolded;
    remember({ unfolded });
    if (last) entries(last);
  };

  const RULE = { "boundary-denied": "denied", "new-crossing": "new crossing", "new-dependency": "new dependency" };
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
  const SVG = "http://www.w3.org/2000/svg";
  // The editor's problem glyphs, drawn by hand: a circle with a cross, a triangle, a circle with an i.
  const PATH = {
    error: "M7 1a6 6 0 1 1 0 12A6 6 0 0 1 7 1zm0 1.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6zM4.9 4.1l2.1 2.1 2.1-2.1.8.8L7.8 7l2.1 2.1-.8.8L7 7.8 4.9 9.9l-.8-.8L6.2 7 4.1 4.9z",
    warning: "M7 1.3l6.3 11.2H.7zm0 2.4L2.8 11.3h8.4zM6.4 5.5h1.2v3.2H6.4zm0 3.9h1.2v1.2H6.4z",
    info: "M7 1a6 6 0 1 1 0 12A6 6 0 0 1 7 1zm0 1.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6zM6.4 6h1.2v4.2H6.4zm0-2.2h1.2V5H6.4z",
  };
  const icon = (sev) => {
    const s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 14 14");
    s.setAttribute("class", `icon ${sev}`);
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", PATH[sev] ?? PATH.info);
    p.setAttribute("fill", "currentColor");
    s.append(p);
    return s;
  };
  const n = (list, sev) => list.filter((f) => f.severity === sev).length;

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
    const detail = s.state === "error" ? s.detail : s.detail ?? s.reason ?? "";
    $("detail").hidden = !detail;
    $("detail").textContent = detail;
    $("detail").className = "note" + (s.state === "error" ? " err" : "");
    $("reindex").disabled = busy;
    assistants(m);
    $("flow").setAttribute("aria-pressed", String(m.mode === "flow"));
    $("map").setAttribute("aria-pressed", String(m.mode === "map"));
    $("watch").checked = m.watch;

    // A language whose editor extension is missing is the one thing worth a note here.
    const miss = $("missing");
    miss.replaceChildren();
    for (const l of (m.languages ?? []).filter((l) => !l.installed)) {
      const li = el("li", "", `${l.files.toLocaleString()} ${l.id} files need the ${l.editor.name} extension. `);
      const b = el("button", "link", "Install");
      b.onclick = () => vs.postMessage({ type: "install", id: l.editor.id });
      li.append(b);
      miss.append(li);
    }
    miss.hidden = !miss.children.length;

    $("found").hidden = !m.found;
    if (m.found !== undefined) $("found").textContent = m.found;

    entries(m);
    review(m, ready);
    reaches(m, ready);
  });

  // The AI assistants the editor has; the chosen one is kept in the user's settings.
  function assistants(m) {
    const sel = $("assistant"), list = m.assistants ?? [];
    sel.replaceChildren();
    if (!list.length) sel.append(new Option("No AI assistant installed", "", true, true));
    for (const a of list) sel.append(new Option(a.label, a.id, false, a.id === (m.assistant ?? list[0].id)));
    sel.disabled = !list.length;
    $("ask").title = list.length ? "Send what is on screen (the flow, the findings, what the repo reaches) to the assistant; the prompt is copied to the clipboard too" : "Copy a prompt about what is on screen to the clipboard";
  }

  // Where the program starts: the entries that drive the most code first. A click charts one. The
  // first few are shown; the rest unfold on request, and the chosen one is always among them.
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
      const li = row(e.id === m.entry ? "current" : "", (doc ? doc + "\n" : "") + "Chart what this does", () => vs.postMessage({ type: "entry", id: e.id }));
      li.append(el("span", "name", e.name), el("span", "desc", `${e.path}:${e.line}`));
      list.append(li);
    }
    if (!all.length) list.append(none(ready ? "No entry point found: nothing in the repo is called from outside it." : s.state === "idle" ? "Press Index to read the repo." : "—"));
    const folded = all.length - shown.length;
    $("more").hidden = !folded && !unfolded && !(m.moreEntries > 0);
    $("unfold").hidden = !folded && !unfolded;
    $("unfold").textContent = folded ? `Show ${folded} more` : "Show fewer";
    $("more-note").textContent = m.moreEntries > 0 ? `${m.moreEntries} more beyond these; find one by name.` : "";
  }

  // What changed since a person last accepted, and what the policy forbids. A click opens the call
  // site and shows it on the map.
  function review(m, ready) {
    const fs = m.findings;
    const errors = n(fs, "error"), warnings = n(fs, "warning"), info = n(fs, "info");
    const badge = $("review-count");
    badge.textContent = ready && m.totalFindings ? String(m.totalFindings) : "";
    badge.className = "badge" + (errors ? " err" : "");
    $("summary").textContent = !ready ? "—" : !m.totalFindings
      ? `Nothing new since the last accept.${m.removed ? ` ${m.removed} accepted crossings are gone.` : ""}`
      : [errors && `${errors} denied`, warnings && `${warnings} new`, info && `${info} to note`, m.removed && `${m.removed} gone`].filter(Boolean).join(" · ")
        + (m.totalFindings > fs.length ? ` (first ${fs.length})` : "");
    $("policy-error").hidden = !m.policy.error;
    $("policy-error").textContent = m.policy.error ?? "";
    $("policy").textContent = m.policy.exists ? "Policy" : "Add policy";
    $("accept").disabled = !fs.some((f) => f.rule !== "boundary-denied") && !m.removed;
    const list = $("findings");
    list.replaceChildren();
    for (const f of fs) {
      const li = row("", `${RULE[f.rule] ?? f.rule}: ${f.message}`, () => vs.postMessage({ type: "finding", index: f.i }));
      li.append(icon(f.severity), el("span", "name", f.message), el("span", "desc", f.path ? `${f.path}:${f.line}` : ""));
      list.append(li);
    }
  }

  // Every boundary the repo reaches, with how many calls. A click shows it on the map.
  function reaches(m, ready) {
    const cs = m.crossings ?? [];
    $("reach-count").textContent = cs.length ? String(cs.length) : "";
    const list = $("crossings");
    list.replaceChildren();
    for (const c of cs) {
      const li = row("", `${c.doc} Click to show what reaches it on the map.`, () => vs.postMessage({ type: "boundary", id: c.id }));
      li.append(el("span", "swatch b-" + c.id), el("span", "name", c.label), el("span", "desc", ""), el("span", "count", c.in ? `${c.out} out · ${c.in} in` : String(c.out)));
      list.append(li);
    }
    if (!cs.length) list.append(none(ready ? "No calls into databases, the network, model APIs, cloud services, queues, files, processes or the environment." : "—"));
  }

  vs.postMessage({ type: "ready" });
})();
