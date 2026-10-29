// An agent's reading of a control flow, checked against the chart. The chart stays what the index found;
// the agent only labels it: a sentence or two on what the entry does, and the top-level steps grouped
// into phases with a title each. Every phase names steps by number, and a phase that names a step the
// flow does not have, or breaks source order, is dropped: nothing an agent says can add a step, remove
// one, or move one. Narratives arrive through the MCP server (`hesperus_narrate`) and are kept under
// `.hesperus/`, keyed by the flow's top-level shape, so the editor draws them whenever that flow is up.
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
  /** Who wrote it (an agent or model name). */
  via?: string;
}

/** The tag a top-level step carries in the flow text handed to an agent. */
export const tag = (i: number) => `[S${i + 1}]`;

/** The flow as the `explain` prompt hands it over: every top-level step tagged, so the answer can
 *  name phases by step number. */
export function taggedFlow(f: Flow): string {
  return flowText(f, tag).trimEnd();
}

/** A phase as an agent states it: a title over an inclusive 1-based range of top-level steps. */
export interface PhaseAsk { title: string; from: number; to: number }

/** A narrative from an agent's summary and phases, checked against the flow: a phase out of order,
 *  past the end or untitled is dropped; one overlapping the last is trimmed to start after it.
 *  Undefined when nothing usable is left. */
export function checkNarrative(summary: unknown, phasesIn: unknown, f: Flow, via?: string): Narrative | undefined {
  const text = typeof summary === "string" ? summary.replace(/\s+/g, " ").trim().slice(0, 600) : "";
  const n = f.steps.length;
  const phases: Phase[] = [];
  let next = 0;
  for (const p of Array.isArray(phasesIn) ? phasesIn : []) {
    if (!p || typeof p !== "object") continue;
    const q = p as Partial<PhaseAsk>;
    const title = typeof q.title === "string" ? q.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const from = Number(q.from), to = Number(q.to);
    if (!title || !Number.isInteger(from) || !Number.isInteger(to) || to < from || to > n) continue;
    const a = Math.max(from - 1, next);
    if (a > to - 1) continue;
    phases.push({ title, steps: f.steps.slice(a, to).map((s) => s.id) });
    next = to;
  }
  if (!text && !phases.length) return undefined;
  return { summary: text, phases, ...(via ? { via } : {}) };
}

/** A narrative from a model's free-form answer holding JSON `{"summary", "phases": [{"title", "from", "to"}]}`. */
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
  return checkNarrative(o.summary, o.phases, f, via);
}

/** Narratives on disk, by the entry and its top-level steps: opening a step changes nothing at the top
 *  level, so the narrative holds while the entry's own code does. A few dozen are kept per repo. */
const FILE = "narratives.json";
export const NARRATIVES_FILE = `${CACHE_DIR}/${FILE}`;
const KEEP = 60;
export const narrativeKey = (f: Flow) => sha256Hex([f.entry.id, ...f.steps.map((s) => s.id)].join("\n")).slice(0, 24);

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
