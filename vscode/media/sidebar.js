// Hesperus sidebar: status, actions, and view options. State lives in the extension host.
(() => {
  const vs = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const LANG = { go: "Go", javascript: "JavaScript / TypeScript", rust: "Rust", csharp: "C#", cpp: "C / C++", dart: "Dart / Flutter", python: "Python", java: "Java", kotlin: "Kotlin", php: "PHP", ruby: "Ruby" };
  for (const id of ["open", "reindex", "collapse", "fit", "accept", "policy"]) $(id).onclick = () => vs.postMessage({ type: id });
  for (const c of document.querySelectorAll("input[data-kind]"))
    c.onchange = () => vs.postMessage({ type: "kind", kind: c.dataset.kind });
  $("external").onchange = () => vs.postMessage({ type: "external" });
  $("flow").onchange = () => vs.postMessage({ type: "flow" });
  $("automaton").onchange = () => vs.postMessage({ type: "automaton" });
  $("files").onchange = () => vs.postMessage({ type: "files" });
  $("boundaries").onchange = () => vs.postMessage({ type: "boundaries" });
  $("watch").onchange = () => vs.postMessage({ type: "watch" });
  const RULE = { "boundary-denied": "denied", "new-crossing": "new", "new-dependency": "new dependency" };
  $("unindexed").onchange = () => vs.postMessage({ type: "unindexed" });
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
    $("boundaries").checked = m.boundaries;
    $("watch").checked = m.watch;

    // Review: what changed since a person last accepted, and what the policy forbids. A click opens the
    // call site and centres the graph on it.
    const fs = m.findings, n = (sev) => fs.filter((f) => f.severity === sev).length;
    const ready = s.state === "ready";
    $("summary").textContent = !ready ? "—" : !m.totalFindings
      ? `Nothing new since the last accept.${m.removed ? ` ${m.removed} accepted crossings are gone.` : ""}`
      : [n("error") && `${n("error")} denied`, n("warning") && `${n("warning")} new`, n("info") && `${n("info")} to note`, m.removed && `${m.removed} gone`].filter(Boolean).join(" · ")
        + (m.totalFindings > fs.length ? ` (first ${fs.length} of ${m.totalFindings})` : "");
    $("policy-error").hidden = !m.policy.error;
    $("policy-error").textContent = m.policy.error ?? "";
    $("policy").textContent = m.policy.exists ? "Policy" : "Add Policy";
    $("accept").disabled = !fs.some((f) => f.rule !== "boundary-denied") && !m.removed;
    const fl = $("findings");
    fl.replaceChildren();
    for (const f of fs) {
      const row = document.createElement("li"), b = document.createElement("button"), tag = document.createElement("span"), at = document.createElement("span");
      row.className = "sev-" + f.severity;
      tag.className = "tag";
      tag.textContent = RULE[f.rule] ?? f.rule;
      b.className = "link msg";
      b.textContent = f.message;
      b.title = f.message;
      b.onclick = () => vs.postMessage({ type: "finding", index: f.i });
      at.className = "at";
      at.textContent = f.path ? `${f.path}:${f.line}` : "";
      row.append(tag, b, at);
      fl.append(row);
    }

    const cl = $("crossings");
    cl.replaceChildren();
    for (const c of m.crossings) {
      const row = document.createElement("li"), b = document.createElement("button"), k = document.createElement("span");
      b.className = "link name boundary b-" + c.id;
      b.textContent = c.label;
      b.title = `${c.doc} Click to show what reaches it.`;
      b.onclick = () => vs.postMessage({ type: "boundary", id: c.id });
      k.className = "count";
      k.textContent = c.in ? `${c.out} out · ${c.in} in` : `${c.out} calls`;
      row.append(b, k);
      cl.append(row);
    }
    if (!m.crossings.length) {
      const row = document.createElement("li");
      row.className = "none";
      row.textContent = ready ? "No calls into databases, the network, model APIs, cloud services, queues, files, processes or the environment were found." : "—";
      cl.append(row);
    }
    for (const c of document.querySelectorAll("input[data-kind]")) c.checked = !m.hidden.includes(c.dataset.kind);
    $("external").checked = m.external;
    $("files").checked = m.files;
    $("flow").checked = m.flow;
    $("automaton").checked = m.automaton;
    $("isolated").hidden = !(m.flow && m.isolated);
    $("isolated").textContent = `${m.isolated} boxes with no calls to or from them are not drawn.`;
    $("unindexed").checked = m.unindexed;
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
      row.textContent = s.state === "ready" ? "None found. A state machine is a field or variable that holds two or more constants, set by statements, and is tested against them (or is a flag set both ways)." : "—";
      ms.append(row);
    }

    const add = (ul, name, count, note, bad, action) => {
      const row = document.createElement("li");
      const n = document.createElement("span"), c = document.createElement("span");
      n.className = "name";
      n.textContent = name;
      c.className = "count";
      c.textContent = count;
      row.append(n, c);
      ul.append(row);
      if (note) {
        const t = document.createElement("li");
        t.className = "tool" + (bad ? " missing" : "");
        t.textContent = note;
        if (action) {
          const b = document.createElement("button");
          b.className = "link";
          b.textContent = action.label;
          b.onclick = () => vs.postMessage({ type: "install", id: action.id });
          t.append(" ", b);
        }
        ul.append(t);
      }
    };
    const ul = $("langs");
    ul.replaceChildren();
    for (const l of m.languages)
      add(ul, LANG[l.id] ?? l.id, `${l.files.toLocaleString()} files`, `${l.editor.name} extension${l.installed ? "" : " · not installed"}`, !l.installed);
    if (!m.languages.length) add(ul, "No supported language found", "");
    for (const g of m.generic)
      add(ul, `.${g.ext} files`, `${g.files.toLocaleString()} files`, "Generic: symbols and references from the editor, calls are may");
    if (m.other) add(ul, "Other, not analyzed", `${m.other.toLocaleString()} files`);

    const miss = $("missing");
    miss.replaceChildren();
    $("missing-section").hidden = !m.missing.length;
    for (const u of m.missing)
      add(miss, LANG[u.lang] ?? u.lang, `${u.files.toLocaleString()} files`, u.reason, true,
        u.installed ? undefined : { id: u.editor.id, label: `Install ${u.editor.name}` });
  });
  vs.postMessage({ type: "ready" });
})();
