// Hesperus sidebar: status, actions, and view options. State lives in the extension host.
(() => {
  const vs = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const LANG = { go: "Go", javascript: "JavaScript / TypeScript" };
  for (const id of ["open", "reindex", "collapse", "fit"]) $(id).onclick = () => vs.postMessage({ type: id });
  for (const c of document.querySelectorAll("input[data-kind]"))
    c.onchange = () => vs.postMessage({ type: "kind", kind: c.dataset.kind });
  $("find").onsubmit = (e) => {
    e.preventDefault();
    vs.postMessage({ type: "find", query: $("q").value });
  };

  addEventListener("message", ({ data: m }) => {
    if (m.type !== "state") return;
    const s = m.status, busy = ["checking", "installing", "indexing"].includes(s.state);
    $("repo").textContent = m.repo ?? "No folder open";
    const st = $("state");
    st.className = "state " + s.state;
    st.replaceChildren();
    const icon = document.createElement("span");
    icon.className = busy ? "spin" : s.state === "ready" ? "dot" : "";
    if (icon.className) st.append(icon);
    st.append(s.state === "ready" ? `Ready · ${s.nodes.toLocaleString()} nodes · ${s.edges.toLocaleString()} edges` : s.label);
    const detail = s.state === "error" ? s.detail : s.reason ?? "";
    $("detail").hidden = !detail;
    $("detail").textContent = detail;
    $("detail").className = s.state === "error" ? "err" : "";
    for (const id of ["reindex", "collapse"]) $(id).disabled = busy;
    for (const c of document.querySelectorAll("input[data-kind]")) c.checked = !m.hidden.includes(c.dataset.kind);
    if (m.found !== undefined) $("found").textContent = m.found;

    const ul = $("langs");
    ul.replaceChildren();
    const row = (a, b) => {
      const li = document.createElement("li");
      const l = document.createElement("span"), r = document.createElement("span");
      l.textContent = a;
      r.textContent = b;
      r.className = "tool";
      li.append(l, r);
      ul.append(li);
    };
    if (!m.tools) row("—", "");
    else {
      for (const l of m.tools.languages) {
        const t = m.tools.tools.find((x) => x.name === l.tool);
        row(`${LANG[l.id] ?? l.id} · ${l.files} files`, t ? `${t.name} ${t.version}${t.bin ? "" : " (not downloaded)"}` : "");
      }
      if (!m.tools.languages.length) row("No supported language found", "");
      if (m.tools.other_files) row(`Other files · ${m.tools.other_files}`, "not analyzed");
    }
  });
  vs.postMessage({ type: "ready" });
})();
