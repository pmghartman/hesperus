// Hesperus sidebar: status, actions, and view options. State lives in the extension host.
(() => {
  const vs = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const LANG = { go: "Go", javascript: "JavaScript / TypeScript" };
  for (const id of ["open", "reindex", "collapse", "fit"]) $(id).onclick = () => vs.postMessage({ type: id });
  for (const c of document.querySelectorAll("input[data-kind]"))
    c.onchange = () => vs.postMessage({ type: "kind", kind: c.dataset.kind });
  $("external").onchange = () => vs.postMessage({ type: "external" });
  $("files").onchange = () => vs.postMessage({ type: "files" });
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
    st.append(s.state === "ready" ? `${s.nodes.toLocaleString()} nodes · ${s.edges.toLocaleString()} edges` : s.label);
    const detail = s.state === "error" ? s.detail : s.reason ?? "";
    $("detail").hidden = !detail;
    $("detail").textContent = detail;
    $("detail").className = s.state === "error" ? "err" : "";
    for (const id of ["reindex", "collapse"]) $(id).disabled = busy;
    for (const c of document.querySelectorAll("input[data-kind]")) c.checked = !m.hidden.includes(c.dataset.kind);
    $("external").checked = m.external;
    $("files").checked = m.files;
    if (m.found !== undefined) $("found").textContent = m.found;

    // Fields and variables with states: a click expands one in place and centres on it.
    const ms = $("machines");
    ms.replaceChildren();
    for (const x of m.machines) {
      const row = document.createElement("li"), b = document.createElement("button"), c = document.createElement("span");
      b.className = "link name";
      b.textContent = x.name;
      b.title = "Show its states";
      b.onclick = () => vs.postMessage({ type: "machine", id: x.id });
      c.className = "count";
      c.textContent = `${x.states} states · ${x.transitions}`;
      row.append(b, c);
      ms.append(row);
    }
    if (!m.machines.length) {
      const row = document.createElement("li");
      row.className = "none";
      row.textContent = s.state === "ready" ? "None found. A state machine is a field tested for equality and assigned two or more constants." : "—";
      ms.append(row);
    }

    const ul = $("langs");
    ul.replaceChildren();
    const li = (name, count, tool, missing) => {
      const row = document.createElement("li");
      const n = document.createElement("span"), c = document.createElement("span");
      n.className = "name";
      n.textContent = name;
      c.className = "count";
      c.textContent = count;
      row.append(n, c);
      ul.append(row);
      if (tool) {
        const t = document.createElement("li");
        t.className = "tool" + (missing ? " missing" : "");
        t.textContent = tool;
        ul.append(t);
      }
    };
    if (!m.tools) li("—", "");
    else {
      for (const l of m.tools.languages) {
        const t = m.tools.tools.find((x) => x.name === l.tool);
        li(LANG[l.id] ?? l.id, `${l.files.toLocaleString()} files`, t && `${t.name} ${t.version}${t.bin ? "" : " · downloads on first index"}`, t && !t.bin);
      }
      if (!m.tools.languages.length) li("No supported language found", "");
      if (m.tools.other_files) li("Other, not analyzed", `${m.tools.other_files.toLocaleString()} files`);
    }
  });
  vs.postMessage({ type: "ready" });
})();
