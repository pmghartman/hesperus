// The flow laid out as a chart: steps top to bottom, a decision's yes side indented under it and its
// no side under that (an else-if ladder stays level with its first decision, read down the left), a
// loop's body indented with a line back up, an opened call's steps indented in a frame. Plain
// arithmetic, no layout library: the shape is a tree, and reading order is source order. A long flow
// is broken into columns that read left to right, as many as make the chart fit the pane best; with a
// narrative, the top-level steps sit in titled phase bands.
import { Boundary } from "./core/boundary";
import { Entry, firstSentence, Flow, Step } from "./core/flow";
import { Severity } from "./core/lint";
import { Narrative } from "./core/narrate";

export type FlowKind = "entry" | "call" | "boundary" | "if" | "loop" | "switch" | "case" | "catch" | "end" | "frame" | "phase" | "jump";
export interface FlowBox {
  id: string;
  kind: FlowKind;
  x: number; y: number; w: number; h: number;
  text: string;
  /** Lines under the name: the first sentence of a doc comment, wrapped. */
  sub?: string[];
  /** A decision or loop: the keyword drawn small before the condition, and the condition wrapped. */
  keyword?: string;
  lines?: string[];
  /** The graph node a call opens to, or a boundary's external node. */
  target?: string;
  /** The file and line the step is written at. */
  path?: string;
  line?: number;
  boundary?: Boundary;
  may?: boolean;
  flag?: Severity;
  notes?: string[];
  count?: number;
  /** A call: closed (openable), open, leaf (nothing inside to show), cut (too deep) or empty (opened, nothing). */
  state?: "closed" | "open" | "leaf" | "cut" | "empty";
  doc?: string;
  /** A phase band: how far down it reaches (its title row is `h`), and whether it continues a band
   *  from the column before. */
  span?: number;
  cont?: boolean;
}
export interface FlowLink { from: string; to: string; points: { x: number; y: number }[]; label?: string; back?: boolean }
export interface FlowLayout { width: number; height: number; boxes: FlowBox[]; links: FlowLink[]; entry: Entry; flagged: number; summary?: string; columns: number }
export interface FlowLayoutOptions {
  narrative?: Narrative;
  /** The pane the chart is drawn in, in pixels: the chart takes as many columns as fit it best. */
  viewport?: { width: number; height: number };
}

// Sizes in character cells, so the chart never depends on fonts. Must match media/graph.js.
export const CHAR = 6.6;
const PAD = 44, MIN_W = 150, MAX_W = 330, H1 = 30, LINE = 14, GAP = 18, IND = 32, FRAME = 12, SIDE = 14;
const COND_H = 36, COND_LINE = 14, TAG_H = 22, END = 14, PHASE_H = 24, PHASE_PAD = 8, JUMP = 16, COLGAP = 56;
const MAX_COLUMNS = 6;
/** Code is drawn in a monospace font a touch wider than the body text. */
const CODE = CHAR * 1.05;

const width = (text: string, sub?: string[], extra = 0) => Math.max(MIN_W, Math.min(MAX_W, Math.max(text.length * CHAR, ...(sub ?? []).map((l) => l.length * CHAR * 0.9)) + PAD + extra));
/** Text in up to `maxLines` lines of at most `chars` characters, cut at spaces when it can be. */
function wrapTo(text: string, chars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let rest = text.trim();
  while (rest && lines.length < maxLines) {
    if (rest.length <= chars || lines.length === maxLines - 1) {
      lines.push(rest.length > chars ? rest.slice(0, chars - 1) + "…" : rest);
      break;
    }
    const cut = rest.lastIndexOf(" ", chars);
    lines.push(rest.slice(0, cut > chars / 2 ? cut : chars));
    rest = rest.slice(cut > chars / 2 ? cut + 1 : chars).trim();
  }
  return lines;
}
/** A sentence in up to two lines that fit the widest box. */
const wrap = (sub: string | undefined, maxLines = 2): string[] | undefined => (sub ? wrapTo(sub, Math.floor((MAX_W - 20) / (CHAR * 0.9)), maxLines) : undefined);
/** A condition as written, in up to two lines of code. */
const condLines = (text: string) => wrapTo(text.replace(/\s+/g, " "), Math.floor((MAX_W - 70) / CODE), 2);
const condWidth = (keyword: string, lines: string[]) => Math.max(MIN_W, Math.min(MAX_W, Math.max(...lines.map((l) => l.length * CODE)) + keyword.length * CHAR + PAD + 30));

/** Where the flow leaves a box: its bottom (the default), or its left side for a loop's exit and a
 *  decision's untaken side, so those lines never cross the branch beneath. `via`: lanes the line takes
 *  on its way, outermost last: a yes side's exits pass right of the no side drawn beneath them. */
interface Exit { box: FlowBox; side?: boolean; label?: string; via?: { x: number; y: number }[] }
interface Placed { bottom: number; right: number; exits: Exit[] }

interface Built { layout: FlowLayout; /** Height of each top-level step's block, gap included. */ heights: number[]; /** Width of the one column. */ colWidth: number }

/** The chart for a flow, with its narrative's phases when there is one. */
export function flowLayout(f: Flow, opts: FlowLayoutOptions = {}): FlowLayout {
  // First in one column, to measure each top-level step; then in the columns that fit the pane best.
  const one = build(f, opts.narrative, new Set());
  const breaks = columns(one, opts.viewport);
  return breaks.size ? build(f, opts.narrative, breaks).layout : one.layout;
}

/** Which top-level steps open a new column: none, or a packing into the number of columns that needs
 *  the least shrinking to fit the pane. A pane of unknown size is taken as landscape. */
function columns(one: Built, viewport?: { width: number; height: number }): Set<number> {
  const W = viewport?.width ?? 1200, H = viewport?.height ?? 800;
  const hs = one.heights, total = hs.reduce((a, b) => a + b, 0);
  if (hs.length < 2) return new Set();
  const head = one.layout.height - total; // the entry box and the end mark
  let best = { n: 1, scale: Math.max(one.colWidth / W, one.layout.height / H), breaks: new Set<number>() };
  for (let n = 2; n <= Math.min(MAX_COLUMNS, hs.length); n++) {
    // Greedy: each column takes steps until it would run past its share by more than a little.
    const budget = total / n;
    const breaks = new Set<number>();
    let acc = 0, tallest = 0;
    for (let i = 0; i < hs.length; i++) {
      if (acc > 0 && acc + hs[i] > budget * 1.15) {
        breaks.add(i);
        tallest = Math.max(tallest, acc);
        acc = 0;
      }
      acc += hs[i];
    }
    tallest = Math.max(tallest, acc);
    if (breaks.size + 1 < n) continue; // the steps are too few or too tall to fill this many
    if (tallest > budget * 1.5) continue; // one step dwarfs the rest: a column for the leftovers is only width
    const scale = Math.max(((one.colWidth + COLGAP) * n) / W, (tallest + head) / H);
    // Fewer columns on a near tie: a chart reads better down than across.
    if (scale < best.scale * 0.97) best = { n, scale, breaks };
  }
  return best.breaks;
}

function build(f: Flow, narrative: Narrative | undefined, breaks: ReadonlySet<number>): Built {
  const boxes: FlowBox[] = [], links: FlowLink[] = [];
  let right = 0, colRight = 0;
  const add = (b: FlowBox) => {
    boxes.push(b);
    right = Math.max(right, b.x + b.w);
    colRight = Math.max(colRight, b.x + b.w);
    return b;
  };
  const cx = (b: FlowBox) => b.x + b.w / 2;
  let left = 0;
  // The line out of an exit as far as the lane just above its target: from a bottom, straight down;
  // from a side, out to the left and down; then along each `via` lane, down to it and across.
  const route = (e: Exit, laneY: number) => {
    const b = e.box;
    const pts = e.side ? [{ x: b.x, y: b.y + b.h / 2 }, { x: b.x - SIDE, y: b.y + b.h / 2 }] : [{ x: cx(b), y: b.y + b.h }];
    if (e.side) left = Math.min(left, b.x - SIDE);
    for (const v of e.via ?? []) pts.push({ x: pts[pts.length - 1].x, y: v.y }, { x: v.x, y: v.y });
    pts.push({ x: pts[pts.length - 1].x, y: laneY });
    return pts;
  };
  // Into the top of `to` from each exit, by the lane above it; a straight drop needs no lane.
  const join = (exits: Exit[], to: FlowBox, label?: string) => {
    for (const e of exits) {
      const b = e.box, x1 = cx(to), y1 = to.y, lbl = e.label ?? (e === exits[0] ? label : undefined);
      const straight = !e.side && !e.via?.length && Math.abs(cx(b) - x1) < 1;
      const pts = straight ? [{ x: x1, y: b.y + b.h }, { x: x1, y: y1 }] : [...route(e, y1 - GAP / 2), { x: x1, y: y1 - GAP / 2 }, { x: x1, y: y1 }];
      links.push({ from: b.id, to: to.id, points: pts, ...(lbl ? { label: lbl } : {}) });
    }
  };
  const bottomOf = (b: FlowBox): Exit[] => [{ box: b }];

  const place = (steps: Step[], x: number, y: number, from: Exit[], label?: string): Placed => {
    let exits = from, bottom = y, colR = x;
    let first = true;
    for (const s of steps) {
      const lbl = first ? label : undefined;
      first = false;
      if (s.kind === "call") {
        const sub = wrap(firstSentence(s.doc, 160));
        const state = s.steps ? "open" : s.leaf ? "leaf" : s.cut ? "cut" : s.empty ? "empty" : "closed";
        const b = add({ id: s.id, kind: "call", x, y: bottom, w: width(s.name, sub, s.leaf ? 16 : 30), h: H1 + (sub?.length ?? 0) * LINE, text: s.name, sub, target: s.target, path: s.in, line: s.line, may: s.may, count: s.count, state, doc: s.doc });
        join(exits, b, lbl);
        if (s.steps) {
          const inner = place(s.steps, x + IND, b.y + b.h + GAP, bottomOf(b));
          // A frame around the opened call and its steps.
          const fr: FlowBox = { id: `${s.id}#frame`, kind: "frame", x: x - FRAME, y: b.y - FRAME, w: Math.max(b.w, inner.right - x) + 2 * FRAME, h: inner.bottom - b.y + 2 * FRAME, text: "" };
          boxes.unshift(fr);
          left = Math.min(left, fr.x);
          right = Math.max(right, fr.x + fr.w);
          colRight = Math.max(colRight, fr.x + fr.w);
          colR = Math.max(colR, fr.x + fr.w);
          exits = inner.exits;
          bottom = inner.bottom + FRAME + GAP;
        } else {
          exits = bottomOf(b);
          bottom = b.y + b.h + GAP;
          colR = Math.max(colR, b.x + b.w);
        }
      } else if (s.kind === "boundary") {
        const b = add({ id: s.id, kind: "boundary", x, y: bottom, w: width(s.name, undefined, 70), h: H1, text: s.name, target: s.target, path: s.in, line: s.line, boundary: s.boundary, may: s.may, count: s.count, flag: s.flag, notes: s.notes });
        join(exits, b, lbl);
        exits = bottomOf(b);
        bottom = b.y + b.h + GAP;
        colR = Math.max(colR, b.x + b.w);
      } else if (s.kind === "if") {
        const lines = condLines(s.text);
        const d = add({ id: s.id, kind: "if", x, y: bottom, w: condWidth("if", lines), h: COND_H + (lines.length - 1) * COND_LINE, text: s.text, keyword: "if", lines, path: s.in, line: s.line });
        join(exits, d, lbl);
        const y1 = d.y + d.h + GAP;
        // Yes goes down into the indented column. No leaves the left side: it falls through, or, with
        // steps of its own, comes down the left into them beneath the yes side; an else-if ladder keeps
        // each decision level with the first. The yes side's exits pass to the right of the no side.
        const yes = place(s.yes, x + IND, y1, bottomOf(d), "yes");
        let out = yes.exits, b = yes.bottom, r = Math.max(yes.right, d.x + d.w);
        if (s.no.length) {
          const ladder = s.no.length === 1 && s.no[0].kind === "if";
          const no = place(s.no, ladder ? x : x + IND, yes.bottom + GAP / 2, [{ box: d, side: true, label: "no" }]);
          const lane = { x: Math.max(r, no.right) + SIDE, y: yes.bottom - GAP / 2 };
          out = [...yes.exits.map((e) => ({ ...e, via: [...(e.via ?? []), lane] })), ...no.exits];
          b = no.bottom;
          r = lane.x + 2;
        } else out = [...out, { box: d, side: true, label: "no" }];
        exits = out;
        bottom = Math.max(b, d.y + d.h + GAP);
        colR = Math.max(colR, r);
      } else if (s.kind === "loop") {
        const lines = condLines(s.text);
        const h = add({ id: s.id, kind: "loop", x, y: bottom, w: condWidth("loop", lines), h: H1 + (lines.length - 1) * COND_LINE, text: s.text, keyword: "loop", lines, path: s.in, line: s.line });
        join(exits, h, lbl);
        const body = place(s.body, x + IND, h.y + h.h + GAP, bottomOf(h));
        // Back from the body's end, up to the header's underside at its left.
        const xb = x + IND - 10;
        for (const e of body.exits) {
          const pts = e.side && !e.via?.length ? [{ x: e.box.x, y: e.box.y + e.box.h / 2 }] : route(e, body.bottom - GAP / 2);
          links.push({ from: e.box.id, to: h.id, back: true, points: [...pts, { x: xb, y: pts[pts.length - 1].y }, { x: xb, y: h.y + h.h }] });
        }
        exits = [{ box: h, side: true, label: "done" }];
        bottom = body.bottom + GAP / 2;
        colR = Math.max(colR, body.right, h.x + h.w);
      } else if (s.kind === "switch") {
        const lines = condLines(s.text);
        const d = add({ id: s.id, kind: "switch", x, y: bottom, w: condWidth("switch on", lines), h: COND_H + (lines.length - 1) * COND_LINE, text: s.text, keyword: "switch on", lines, path: s.in, line: s.line });
        join(exits, d, lbl);
        let y1 = d.y + d.h + GAP, out: Exit[] = [], r = d.x + d.w;
        for (const c of s.cases) {
          const tag = add({ id: `${s.id}:${c.line}`, kind: "case", x: x + IND, y: y1, w: width(c.text, undefined, -10), h: TAG_H, text: c.text, path: s.in, line: c.line });
          join(bottomOf(d), tag);
          const body = place(c.body, x + IND, tag.y + tag.h + GAP / 2, bottomOf(tag));
          out = [...out, ...body.exits];
          y1 = body.bottom;
          r = Math.max(r, body.right, tag.x + tag.w);
        }
        if (!s.cases.some((c) => c.text === "otherwise")) out.push({ box: d, side: true, label: "else" });
        exits = out.length ? out : bottomOf(d);
        bottom = y1;
        colR = Math.max(colR, r);
      } else if (s.kind === "catch") {
        const tag = add({ id: s.id, kind: "catch", x: x + IND, y: bottom, w: width(s.text, undefined, -10), h: TAG_H, text: s.text, path: s.in, line: s.line });
        join(exits, tag, lbl);
        const body = place(s.body, x + IND, tag.y + tag.h + GAP / 2, bottomOf(tag));
        // Errors rejoin the flow; the step before the handler continues too.
        exits = [...exits, ...body.exits];
        bottom = body.bottom;
        colR = Math.max(colR, body.right, tag.x + tag.w);
      }
    }
    return { bottom, right: colR, exits };
  };

  // The entry at the top of the first column; every column's steps start level with the first's.
  const e = f.entry;
  const sub = wrap(firstSentence(e.doc, 200));
  const where = `${e.path} · ${e.kind}`;
  const entry = add({ id: e.id, kind: "entry", x: 0, y: 0, w: width(e.name, [...(sub ?? []), where], 20), h: H1 + 14 + (sub?.length ?? 0) * LINE, text: e.name, sub, target: e.id, path: e.path, line: e.line, doc: e.doc });
  const top = entry.y + entry.h + GAP;
  // Phases: which top-level step opens each, by step id. A band is cut at a column's end and continues
  // in the next, so it is kept as fragments, one per column it crosses.
  const starts = new Map<string, string>();
  for (const p of narrative?.phases ?? []) if (p.steps.length) starts.set(p.steps[0], p.title);
  const fragments: { box: FlowBox; col: number }[] = [];
  let phase: string | undefined;
  const openBand = (title: string, y: number, col: number, cont: boolean) => {
    const p = add({ id: `#phase${fragments.length}`, kind: "phase", x: 0, y, w: 0, h: PHASE_H, text: title, ...(cont ? { cont } : {}) });
    fragments.push({ box: p, col });
    return y + PHASE_H + GAP / 2;
  };
  const heights: number[] = [];
  const cols: { x: number; right: number; bottom: number; jump?: FlowBox }[] = [];
  let x = 0, col = 0, bottom = top, exits: Exit[] = bottomOf(entry), colTop = top;
  colRight = entry.x + entry.w;
  f.steps.forEach((s, i) => {
    if (breaks.has(i)) {
      // Off to the next column: a connector mark at this column's foot, and in from the gutter above.
      const jump = add({ id: `#jump${col}`, kind: "jump", x: x + IND / 2, y: bottom, w: JUMP, h: JUMP, text: "" });
      join(exits, jump);
      cols.push({ x, right: colRight, bottom: jump.y + jump.h, jump });
      x = colRight + COLGAP;
      colRight = x;
      col++;
      bottom = top;
      colTop = top;
      exits = [];
    }
    const title = starts.get(s.id);
    if (title !== undefined) {
      if (bottom > colTop) bottom += PHASE_PAD;
      bottom = openBand(title, bottom, col, false);
      phase = title;
    } else if (phase !== undefined && bottom === colTop && col > 0) bottom = openBand(phase, bottom, col, true);
    const start = bottom;
    const p = place([s], x, bottom, exits);
    if (!exits.length) {
      // The first step of a later column: in from the previous column's connector, via the gutter.
      const first = boxes.find((b) => b.x === x && b.y === start && b.kind !== "frame" && b.kind !== "phase");
      const from = cols[col - 1].jump!;
      if (first) links.push({ from: from.id, to: first.id, points: [{ x: cx(from), y: from.y + from.h }, { x: cx(from), y: from.y + from.h + GAP / 2 }, { x: x - COLGAP / 2, y: from.y + from.h + GAP / 2 }, { x: x - COLGAP / 2, y: top - GAP / 2 }, { x: cx(first), y: top - GAP / 2 }, { x: cx(first), y: first.y }] });
    }
    exits = p.exits;
    heights.push(p.bottom - start);
    bottom = p.bottom;
  });
  const end = add({ id: "#end", kind: "end", x: x + IND / 2, y: bottom, w: END, h: END, text: "" });
  join(exits, end);
  cols.push({ x, right: colRight, bottom: end.y + end.h });
  // Side exits run left of the first column: shift everything right so nothing is at a negative x.
  const shift = (left < 0 ? -left : 0) + (fragments.length ? PHASE_PAD : 0);
  if (shift) {
    for (const b of boxes) b.x += shift;
    for (const l of links) for (const p of l.points) p.x += shift;
    for (const c of cols) (c.x += shift), (c.right += shift);
    right += shift;
  }
  // Each band runs from its title row to the next band in its column (or the column's foot), across
  // the column with a gutter either side so no frame or line sits on its edge.
  fragments.forEach((fr, i) => {
    const c = cols[fr.col], next = fragments[i + 1];
    fr.box.x = c.x - PHASE_PAD;
    fr.box.w = c.right - c.x + 2 * PHASE_PAD;
    fr.box.span = (next && next.col === fr.col ? next.box.y - PHASE_PAD : c.bottom + GAP / 2) - fr.box.y;
  });
  const total = right + (fragments.length ? PHASE_PAD : 0);
  const height = Math.max(...cols.map((c) => c.bottom));
  return {
    layout: { width: total, height, boxes, links, entry: e, flagged: f.flagged, columns: cols.length, ...(narrative?.summary ? { summary: narrative.summary } : {}) },
    heights,
    colWidth: total,
  };
}
