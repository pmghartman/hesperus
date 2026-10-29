// Lint: boundary crossings checked against the repo's policy (`.hesperus/hesperus.json`, written by people)
// and against the last state a person accepted (`.hesperus/baseline.json`). Pure: graph in, findings out.
import { Boundary, BOUNDARIES, BOUNDARY_INFO, crossings, Crossing, Extra } from "./boundary";
import { cmpStr, Graph, pretty, Range } from "./ir";

/** The policy, repo-relative: under the cache directory, so the repo's own ignore files never see it. */
export const POLICY_FILE = ".hesperus/hesperus.json";
export const BASELINE_FILE = "baseline.json";
export const REPORT_FILE = "report.json";

export type Severity = "error" | "warning" | "info";
type Level = Severity | "off";
const LEVELS: readonly Level[] = ["error", "warning", "info", "off"];

/** `paths` are globs on repo-relative paths (`**`, `*`, `?`); a bare folder means everything in it.
 *  `deny` forbids boundaries there; `allow` forbids every other one. */
export interface PolicyRule { paths: string[]; deny?: Boundary[]; allow?: Boundary[]; severity: Severity; reason?: string }

export interface Policy {
  /** Packages to file under a boundary, beyond the built-in table. */
  boundaries: Extra;
  rules: PolicyRule[];
  /** How loudly to report changes since the accepted baseline. */
  review: { crossings: Level; dependencies: Level };
}

export const defaultPolicy = (): Policy => ({ boundaries: {}, rules: [], review: { crossings: "warning", dependencies: "info" } });

const fail = (what: string): never => { throw new Error(`${POLICY_FILE}: ${what}`); };
const strs = (v: unknown, f: string) => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : fail(`${f}: expected an array of strings`));
const bounds = (v: unknown, f: string) => strs(v, f).map((b) => (BOUNDARIES.includes(b as Boundary) ? (b as Boundary) : fail(`${f}: unknown boundary ${JSON.stringify(b)}; one of ${BOUNDARIES.join(", ")}`)));
const level = (v: unknown, f: string, d: Level): Level => (v === undefined ? d : LEVELS.includes(v as Level) ? (v as Level) : fail(`${f}: one of ${LEVELS.join(", ")}`));

/** Parses the policy file's text; an absent file is the default policy. Throws with the field at fault. */
export function parsePolicy(text: string | undefined): Policy {
  const p = defaultPolicy();
  if (text === undefined) return p;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text);
  } catch (e) {
    return fail((e as Error).message);
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) fail("expected an object");
  if (o.boundaries !== undefined) {
    const b = o.boundaries as Record<string, unknown>;
    if (!b || typeof b !== "object" || Array.isArray(b)) fail("boundaries: expected an object");
    for (const [k, v] of Object.entries(b)) {
      if (!BOUNDARIES.includes(k as Boundary)) fail(`boundaries: unknown boundary ${JSON.stringify(k)}`);
      p.boundaries[k as Boundary] = strs(v, `boundaries.${k}`);
    }
  }
  if (o.rules !== undefined) {
    if (!Array.isArray(o.rules)) fail("rules: expected an array");
    (o.rules as Record<string, unknown>[]).forEach((r, i) => {
      const f = `rules[${i}]`;
      if (!r || typeof r !== "object") fail(`${f}: expected an object`);
      if (r.deny === undefined && r.allow === undefined) fail(`${f}: needs deny or allow`);
      const severity = level(r.severity, `${f}.severity`, "error");
      if (severity === "off") return;
      p.rules.push({
        paths: r.paths === undefined ? ["**"] : strs(r.paths, `${f}.paths`),
        deny: r.deny === undefined ? undefined : bounds(r.deny, `${f}.deny`),
        allow: r.allow === undefined ? undefined : bounds(r.allow, `${f}.allow`),
        severity,
        reason: typeof r.reason === "string" ? r.reason : undefined,
      });
    });
  }
  if (o.review !== undefined) {
    const r = o.review as Record<string, unknown>;
    p.review = { crossings: level(r.crossings, "review.crossings", "warning"), dependencies: level(r.dependencies, "review.dependencies", "info") };
  }
  return p;
}

/** Glob to regex: `**` crosses folders, `*` and `?` do not. A pattern with no wildcard is a folder or file. */
export function glob(pattern: string): RegExp {
  const p = pattern.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!/[*?]/.test(p)) return new RegExp(`^${esc(p)}(/.*)?$`);
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*" && p[i + 1] === "*") {
      re += p[i + 2] === "/" ? "(.*/)?" : ".*";
      i += p[i + 2] === "/" ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += esc(c);
  }
  return new RegExp(`^${re}$`);
}
const esc = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");

/** What a person last accepted: crossings by key, and packages used through a boundary. */
export interface Baseline { commit: string; crossings: string[]; packages: string[] }

export const crossingKey = (c: Pick<Crossing, "dir" | "local" | "external">) => `${c.dir} ${c.local} -> ${c.external}`;
export const packageKey = (c: Pick<Crossing, "boundary" | "package">) => `${c.boundary}:${c.package}`;

export function snapshot(g: Graph, policy: Policy, commit: string): Baseline {
  const cs = crossings(g, policy.boundaries);
  return { commit, crossings: uniq(cs.map(crossingKey)), packages: uniq(cs.map(packageKey)) };
}

const uniq = (xs: string[]) => [...new Set(xs)].sort(cmpStr);

export const baselineToJson = (b: Baseline) => pretty({ commit: b.commit, crossings: uniq(b.crossings), packages: uniq(b.packages) });

export function parseBaseline(text: string): Baseline {
  const o = JSON.parse(text);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return { commit: typeof o?.commit === "string" ? o.commit : "unknown", crossings: list(o?.crossings), packages: list(o?.packages) };
}

export type RuleId = "boundary-denied" | "new-crossing" | "new-dependency";

export interface Finding {
  rule: RuleId;
  severity: Severity;
  message: string;
  boundary: Boundary;
  /** What accepting this finding records in the baseline; denied findings are fixed in code or policy. */
  key: string;
  local: string;
  external: string;
  path?: string;
  range?: Range;
}

export interface Report {
  findings: Finding[];
  /** Every crossing in the graph now. */
  crossings: Crossing[];
  /** Accepted crossings that are no longer in the code. */
  removed: string[];
  /** Crossings per boundary, both directions. */
  counts: Partial<Record<Boundary, { out: number; in: number }>>;
}

const SEV_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Findings for `g`. With no baseline, nothing is new: the first index is what the repo already does. */
export function lint(g: Graph, policy: Policy, baseline?: Baseline): Report {
  const cs = crossings(g, policy.boundaries);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const where = (c: Crossing) => byId.get(c.local)?.path ?? c.site?.path ?? "";
  const rules = policy.rules.map((r) => ({ r, res: r.paths.map(glob) }));
  const findings: Finding[] = [];
  const counts: Report["counts"] = {};
  const acceptedX = new Set(baseline?.crossings ?? []), acceptedP = new Set(baseline?.packages ?? []);
  const newPkgs = new Set<string>();
  for (const c of cs) {
    const n = counts[c.boundary] ?? (counts[c.boundary] = { out: 0, in: 0 });
    n[c.dir]++;
    const label = BOUNDARY_INFO[c.boundary].label;
    const at = { boundary: c.boundary, local: c.local, external: c.external, path: c.site?.path, range: c.site?.range };
    const how = c.dir === "out" ? `calls ${name(c.external)}` : `is called by ${name(c.external)}`;
    const p = where(c);
    for (const { r, res } of rules) {
      if (!res.some((re) => re.test(p))) continue;
      const denied = r.deny?.includes(c.boundary) || (r.allow !== undefined && !r.allow.includes(c.boundary));
      if (!denied) continue;
      findings.push({ ...at, rule: "boundary-denied", severity: r.severity, key: crossingKey(c),
        message: `${name(c.local)} ${how} (${label}); ${p} may not reach ${label}${r.reason ? `: ${r.reason}` : "."}` });
      break;
    }
    if (!baseline) continue;
    if (policy.review.dependencies !== "off" && !acceptedP.has(packageKey(c)) && !newPkgs.has(packageKey(c))) {
      newPkgs.add(packageKey(c));
      findings.push({ ...at, rule: "new-dependency", severity: policy.review.dependencies, key: packageKey(c),
        message: `New dependency on ${c.package} (${label}), first reached by ${name(c.local)}.` });
    }
    if (policy.review.crossings !== "off" && !acceptedX.has(crossingKey(c)))
      findings.push({ ...at, rule: "new-crossing", severity: policy.review.crossings, key: crossingKey(c),
        message: `New crossing into ${label}: ${name(c.local)} ${how}${c.provenance === "resolved" ? "" : ` (${c.provenance})`}.` });
  }
  const now = new Set(cs.map(crossingKey));
  const removed = baseline ? baseline.crossings.filter((k) => !now.has(k)) : [];
  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || cmpStr(a.path ?? "", b.path ?? "")
    || (a.range?.start_line ?? 0) - (b.range?.start_line ?? 0) || cmpStr(a.rule, b.rule) || cmpStr(a.key, b.key));
  return { findings, crossings: cs, removed, counts };
}

/** `b` with the given keys accepted: crossing keys and package keys alike. */
export function accept(b: Baseline, keys: Iterable<string>): Baseline {
  const xs = new Set(b.crossings), ps = new Set(b.packages);
  for (const k of keys) (k.startsWith("out ") || k.startsWith("in ") ? xs : ps).add(k);
  return { ...b, crossings: [...xs], packages: [...ps] };
}

/** The report agents and scripts read: findings with names a person would use. */
export function reportToJson(g: Graph, r: Report, stale?: string): string {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  return pretty({
    ...(stale ? { stale } : {}),
    summary: {
      errors: r.findings.filter((f) => f.severity === "error").length,
      warnings: r.findings.filter((f) => f.severity === "warning").length,
      info: r.findings.filter((f) => f.severity === "info").length,
      removed: r.removed.length,
    },
    boundaries: Object.fromEntries(BOUNDARIES.filter((b) => r.counts[b]).map((b) => [b, r.counts[b]])),
    findings: r.findings.map((f) => ({
      rule: f.rule, severity: f.severity, message: f.message, boundary: f.boundary,
      ...(f.path ? { path: f.path, line: (f.range?.start_line ?? 0) + 1, column: (f.range?.start_col ?? 0) + 1 } : {}),
      local: name(f.local), external: name(f.external), key: f.key,
    })),
    removed: r.removed,
  });
}
