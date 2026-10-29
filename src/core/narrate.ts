// A plain-language reading of a flow, written by a model and checked against the chart. The chart stays
// what the index found; the model only names it: a sentence or two on what the entry does, and the
// top-level steps grouped into phases with a title each. Every phase names steps by tag, and a phase
// that names a step the flow does not have, or breaks source order, is dropped: nothing a model says
// can add a step, remove one, or move one.
import * as fs from "node:fs";
import * as path from "node:path";
import { CACHE_DIR } from "./cache";
import { Flow, flowText } from "./flow";
import { sha256Hex } from "./hash";

export interface Phase {
  title: string;
  /** Top-level step ids, contiguous and in order. */
  steps: string[];
}
export interface Narrative {
  /** What the entry does, in one or two sentences. */
  summary: string;
  phases: Phase[];
  /** Where the words came from (a model name, or "chat"). */
  via?: string;
}

/** The tag a top-level step carries in the prompt and in the model's answer. */
export const tag = (i: number) => `[S${i + 1}]`;

/** The question put to the model: the flow with its top-level steps tagged, and the shape of the answer. */
export function narrativePrompt(f: Flow, repoName: string): string {
  const n = f.steps.length;
  return [
    `Hesperus charted what the program in the repository "${repoName}" does from the entry point ${f.entry.name} (${f.entry.path}:${f.entry.line}), by static analysis. Each line below is a step the code takes, in the order it runs them: ▭ a call into the repo (with the comment above the callee), ⬚ a call that leaves the repo (with its boundary), ◇ a decision with its condition as written, ↻ a loop, ⚠ a catch. Indented lines are the steps inside the one above. The top-level steps are tagged ${tag(0)} to ${tag(n - 1)}.`,
    "",
    flowText(f, tag).trimEnd(),
    "",
    "Write the reading a person would want before the chart: what this entry point does, and the top-level steps grouped into phases a reader can follow. Answer with JSON only, no prose around it, in exactly this shape:",
    '{"summary": "one or two plain sentences on what this entry does and what it reaches outside the repo", "phases": [{"title": "two to six words, plain language, no code", "from": 1, "to": 3}, ...]}',
    `Rules: every phase covers a contiguous run of top-level steps, "from" and "to" are step numbers from 1 to ${n} inclusive, phases come in order and do not overlap, and together they cover every step. Use between 2 and 7 phases (one phase when there is only one step). Do not invent steps the chart does not show, and say nothing the steps do not support.`,
  ].join("\n");
}

/** The model's answer, checked against the flow. Undefined when nothing usable came back. */
export function parseNarrative(answer: string, f: Flow, via?: string): Narrative | undefined {
  const start = answer.indexOf("{"), end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as { summary?: unknown; phases?: unknown };
  const summary = typeof o.summary === "string" ? o.summary.replace(/\s+/g, " ").trim().slice(0, 600) : "";
  const n = f.steps.length;
  const phases: Phase[] = [];
  let next = 0;
  for (const p of Array.isArray(o.phases) ? o.phases : []) {
    if (!p || typeof p !== "object") continue;
    const q = p as { title?: unknown; from?: unknown; to?: unknown };
    const title = typeof q.title === "string" ? q.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const from = Number(q.from), to = Number(q.to);
    // Ranges are 1-based and inclusive in the answer; a phase out of order or past the end is dropped,
    // one overlapping the last is trimmed to start after it.
    if (!title || !Number.isInteger(from) || !Number.isInteger(to) || to < from || to > n) continue;
    const a = Math.max(from - 1, next);
    if (a > to - 1) continue;
    phases.push({ title, steps: f.steps.slice(a, to).map((s) => s.id) });
    next = to;
  }
  if (!summary && !phases.length) return undefined;
  return { summary, phases, ...(via ? { via } : {}) };
}

/** Narratives already written, by the hash of the prompt that asked for them, so the same flow is not
 *  asked twice. A few dozen are kept per repo. */
const FILE = "narratives.json";
const KEEP = 60;
export const narrativeKey = (prompt: string) => sha256Hex(prompt).slice(0, 24);

export function readNarrative(repo: string, key: string): Narrative | undefined {
  try {
    const all = JSON.parse(fs.readFileSync(path.join(repo, CACHE_DIR, FILE), "utf8")) as Record<string, Narrative & { at?: string }>;
    const n = all[key];
    return n && typeof n.summary === "string" && Array.isArray(n.phases) ? n : undefined;
  } catch {
    return undefined;
  }
}

export function writeNarrative(repo: string, key: string, n: Narrative): void {
  const file = path.join(repo, CACHE_DIR, FILE);
  let all: Record<string, Narrative & { at?: string }> = {};
  try {
    all = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  all[key] = { ...n, at: new Date().toISOString() };
  const keys = Object.keys(all).sort((a, b) => (all[b].at ?? "").localeCompare(all[a].at ?? ""));
  for (const k of keys.slice(KEEP)) delete all[k];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 1));
}
