// The rule engine: facts × table → findings. Language-neutral.

import { Fact, FileFacts } from "./facts.js";
import { Effect, Rule, RULES } from "./rules.js";

export type Finding =
  | { kind: "import"; spec: string; line: number; rule: null }
  | { kind: "ingress"; protocol: "http" | "ws"; line: number; detail: string; rule: string }
  | { kind: "by-url"; edge: "http" | "ws"; url: string | null; line: number; rule: string }
  | { kind: "store"; engine: string; access: "reads" | "writes" | "unknown"; line: number; rule: string }
  | { kind: "hardware"; name: string; label: string; line: number; rule: string };

export function sqlAccess(sql: string): "reads" | "writes" | "unknown" {
  const verb = sql.trim().replace(/^\(+/, "").split(/\s+/)[0]?.toLowerCase() ?? "";
  if (["select", "with", "show", "explain", "describe", "pragma", "values"].includes(verb)) return "reads";
  if (["insert", "update", "delete", "replace", "merge", "upsert", "create", "alter", "drop", "truncate", "begin", "commit", "vacuum", "copy", "grant"].includes(verb)) return "writes";
  return "unknown";
}

/** Host of an absolute http(s)/ws(s) URL, or relative for root paths and loopback hosts, or neither. */
export function classifyUrl(url: string | null): { host: string | null; relative: boolean } {
  if (url === null) return { host: null, relative: false };
  if (url.startsWith("/") && !url.startsWith("//")) return { host: null, relative: true };
  const m = /^(?:https?|wss?):\/\/(\[[0-9a-f:]+\]|[^/:?#\s`'"]+)/i.exec(url);
  if (m) {
    const host = m[1].toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]" || host.endsWith(".localhost")) return { host: null, relative: true };
    if (/^[a-z0-9.-]+$/.test(host) && !host.includes("..")) return { host, relative: false };
  }
  return { host: null, relative: false };
}

function listHas(list: string[] | undefined, v: string): boolean {
  return !list || list.includes(v);
}

function matches(rule: Rule, f: Fact): boolean {
  const w = rule.when;
  if (f.kind === "import") return w.fact === "import" && !f.typeOnly && w.module !== "<any>" && w.module.includes(f.spec);
  if (f.kind === "compare") {
    if (w.fact !== "compare") return false;
    if (w.receiver && !new RegExp(w.receiver).test(f.subject)) return false;
    return w.arg0 !== "route" || f.literal.startsWith("/");
  }
  if (f.kind === "property") {
    if (w.fact !== "property") return false;
    if (!listHas(w.callee, f.name)) return false;
    return !w.inCall || (f.inCall !== null && new RegExp(w.inCall, "i").test(f.inCall));
  }
  if (w.fact !== f.kind) return false;
  if (w.module !== "<any>" && !w.module.includes(f.origin.module)) return false;
  if (!listHas(w.symbol, f.origin.symbol)) return false;
  if (w.callee && !w.callee.includes(f.name) && !w.callee.includes(`${f.receiver}.${f.name}`)) return false;
  if (w.calleeMatch && !new RegExp(w.calleeMatch).test(f.name)) return false;
  if (w.receiver === "<none>") {
    if (f.receiver !== null) return false;
  } else if (w.receiver && !(f.receiver !== null && new RegExp(w.receiver).test(f.receiver))) return false;
  const a0 = f.args[0];
  switch (w.arg0) {
    case "route":
      return !!a0?.text && a0.text.startsWith("/");
    case "object":
      return !!a0?.isObject && (!w.key || a0.keys.includes(w.key));
    case "url":
    case "sql":
    case undefined:
      return true;
  }
  return true;
}

function apply(rule: Rule, effect: Effect, f: Fact): Finding {
  const line = f.line;
  switch (effect.target) {
    case "ingress": {
      let detail = rule.id;
      if (f.kind === "compare") detail = `MATCH ${f.literal}`;
      else if (f.kind === "call" || f.kind === "new") {
        const a0 = f.args[0]?.text;
        detail = a0 && a0.startsWith("/") ? `${f.name.toUpperCase()} ${a0}` : f.receiver ? `${f.receiver}.${f.name}` : f.name;
      }
      return { kind: "ingress", protocol: effect.protocol, line, detail, rule: rule.id };
    }
    case "by-url": {
      const url = f.kind === "call" || f.kind === "new" ? (f.args[0]?.text ?? null) : null;
      return { kind: "by-url", edge: effect.edge, url, line, rule: rule.id };
    }
    case "store": {
      let access: "reads" | "writes" | "unknown" = effect.access === "sql" ? "unknown" : effect.access;
      if (effect.access === "sql") {
        const sql = f.kind === "tagged" ? f.head : f.kind === "call" ? f.args[0]?.text ?? null : null;
        access = sql ? sqlAccess(sql) : "unknown";
      }
      return { kind: "store", engine: effect.engine, access, line, rule: rule.id };
    }
    case "hardware":
      return { kind: "hardware", name: effect.name, label: effect.label, line, rule: rule.id };
  }
}

/** Apply the table to one file's facts. */
export function applyRules(file: FileFacts, rules: Rule[] = RULES): Finding[] {
  const out: Finding[] = [];
  const firedGroups = new Set<string>();
  for (const f of file.facts) {
    if (f.kind === "import") {
      if (!f.typeOnly) out.push({ kind: "import", spec: f.spec, line: f.line, rule: null });
      continue;
    }
    const seenGroups = new Set<string>();
    for (const r of rules) {
      if (r.fallback || seenGroups.has(r.group) || !matches(r, f)) continue;
      out.push(apply(r, r.effect, f));
      firedGroups.add(r.group);
      seenGroups.add(r.group);
    }
  }
  for (const r of rules) {
    if (!r.fallback || firedGroups.has(r.group) || r.when.module === "<any>") continue;
    for (const m of r.when.module) {
      const line = file.modules.get(m);
      if (line !== undefined && file.facts.some((f) => f.kind === "import" && f.spec === m && !f.typeOnly)) {
        out.push(apply(r, r.effect, { kind: "import", spec: m, typeOnly: false, line }));
        firedGroups.add(r.group);
        break;
      }
    }
  }
  return out;
}
