// Hesperus sidebar: status, what to review, where the program starts. State lives in the extension host.
(() => {
  const vs = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  for (const id of ["flow", "map", "reindex", "accept", "policy"]) $(id).onclick = () => vs.postMessage({ type: id });
  $("watch").onchange = () => vs.postMessage({ type: "watch" });
  const RULE = { "boundary-denied": "denied", "new-crossing": "new", "new-dependency": "new dependency" };
  $("find").onsubmit = (e) => {
    e.preventDefault();
    vs.postMessage({ type: "find", query: $("q").value });
  };
  const sentence = (doc, max = 110) => {
    if (!doc) return "";
    const m = /^(.*?[.!?])(\s|$)/.exec(doc);
    const s = (m ? m[1] : doc).trim();
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
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
    $("reindex").disabled = busy;
    $("flow").classList.toggle("current", m.mode === "flow");
    $("map").classList.toggle("current", m.mode === "map");
    $("watch").checked = m.watch;

    // A language whose editor extension is missing is the one thing worth a note here.
    const miss = $("missing");
    miss.replaceChildren();
    for (const l of (m.languages ?? []).filter((l) => !l.installed)) {
      const row = document.createElement("li");
      row.textContent = `${l.files.toLocaleString()} ${l.id} files need the ${l.editor.name} extension. `;
      const b = document.createElement("button");
      b.className = "link";
      b.textContent = "Install";
      b.onclick = () => vs.postMessage({ type: "install", id: l.editor.id });
      row.append(b);
      miss.append(row);
    }
    miss.hidden = !miss.children.length;

    // Review: what changed since a person last accepted, and what the policy forbids. A click opens the
    // call site and shows it on the map.
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
      b.title = `${c.doc} Click to show what reaches it on the map.`;
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
    if (m.found !== undefined) $("found").textContent = m.found;

    // Where the program starts: the entries that drive the most code first. A click charts one.
    const el = $("entries");
    el.replaceChildren();
    for (const e of m.entries ?? []) {
      const row = document.createElement("li"), b = document.createElement("button"), d = document.createElement("span"), at = document.createElement("span");
      row.className = e.id === m.entry ? "current" : "";
      b.className = "link name";
      b.textContent = e.name;
      b.title = "Chart what this does";
      b.onclick = () => vs.postMessage({ type: "entry", id: e.id });
      d.className = "doc";
      d.textContent = sentence(e.doc);
      at.className = "at";
      at.textContent = `${e.path}:${e.line}`;
      row.append(b, at);
      if (d.textContent) row.append(d);
      el.append(row);
    }
    if (!(m.entries ?? []).length) {
      const row = document.createElement("li");
      row.className = "none";
      row.textContent = ready ? "No entry point found: nothing in the repo is called from outside it, or nothing is indexed yet." : "—";
      el.append(row);
    }
    $("more").hidden = !(m.moreEntries > 0);
    $("more").textContent = m.moreEntries > 0 ? `${m.moreEntries} more; find one by name above.` : "";
  });
  vs.postMessage({ type: "ready" });
})();
