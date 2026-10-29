// The flow laid out as a chart: steps top to bottom, a decision's branches in columns indented under
// it, a loop's body indented with a line back up, an opened call's steps indented in a frame. Plain
// arithmetic, no layout library: the shape is a tree, and reading order is source order.
import { Boundary } from "./core/boundary";
import { Entry, firstSentence, Flow, Step } from "./core/flow";
import { Severity } from "./core/lint";

export type FlowKind = "entry" | "call" | "boundary" | "if" | "loop" | "switch" | "case" | "catch" | "end" | "frame";
export interface FlowBox {
  id: string;
  kind: FlowKind;
  x: number; y: number; w: number; h: number;
  text: string;
  /** Lines under the name: the first sentence of a doc comment, wrapped. */
  sub?: string[];
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
  /** A call: closed (openable), open, cut (too deep) or empty (nothing to show inside). */
  state?: "closed" | "open" | "cut" | "empty";
  doc?: string;
}
export interface FlowLink { from: string; to: string; points: { x: number; y: number }[]; label?: string; back?: boolean }
export interface FlowLayout { width: number; height: number; boxes: FlowBox[]; links: FlowLink[]; entry: Entry; flagged: number }

// Sizes in character cells, so the chart never depends on fonts. Must match media/graph.js.
export const CHAR = 6.6;
const PAD = 44, MIN_W = 150, MAX_W = 330, H1 = 30, LINE = 14, GAP = 18, IND = 32, COL = 28, FRAME = 12, SIDE = 12;
const DIAMOND_H = 44, TAG_H = 22, END = 14;

const width = (text: string, sub?: string[], extra = 0) => Math.max(MIN_W, Math.min(MAX_W, Math.max(text.length * CHAR, ...(sub ?? []).map((l) => l.length * CHAR * 0.9)) + PAD + extra));
/** A sentence in up to two lines that fit the widest box. */
function wrap(sub: string | undefined, maxLines = 2): string[] | undefined {
  if (!sub) return undefined;
  const chars = Math.floor((MAX_W - 20) / (CHAR * 0.9));
  const lines: string[] = [];
  let rest = sub.trim();
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

/** Where the flow leaves a box: its bottom (the default), or its left side for a loop's exit and a
 *  decision's untaken side, so those lines never cross the branch beneath. */
interface Exit { box: FlowBox; side?: boolean; label?: string }
interface Placed { bottom: number; right: number; exits: Exit[] }

/** The chart for a flow. */
export function flowLayout(f: Flow): FlowLayout {
  const boxes: FlowBox[] = [], links: FlowLink[] = [];
  let right = 0;
  const add = (b: FlowBox) => {
    boxes.push(b);
    right = Math.max(right, b.x + b.w);
    return b;
  };
  const cx = (b: FlowBox) => b.x + b.w / 2;
  let left = 0;
  // Into the top of `to` from each exit: from a bottom, straight down or down, across and down; from a
  // side, out to the left, down past whatever is beneath, then across and in.
  const join = (exits: Exit[], to: FlowBox, label?: string) => {
    for (const e of exits) {
      const b = e.box, x1 = cx(to), y1 = to.y, lbl = e.label ?? (e === exits[0] ? label : undefined);
      if (e.side) {
        const xl = b.x - SIDE, ym = b.y + b.h / 2;
        left = Math.min(left, xl);
        links.push({ from: b.id, to: to.id, points: [{ x: b.x, y: ym }, { x: xl, y: ym }, { x: xl, y: y1 - GAP / 2 }, { x: x1, y: y1 - GAP / 2 }, { x: x1, y: y1 }], ...(lbl ? { label: lbl } : {}) });
        continue;
      }
      const x0 = cx(b), y0 = b.y + b.h;
      // A branch's first step sits under its diamond's left half; bend early so the label has room.
      const pts = Math.abs(x0 - x1) < 1 ? [{ x: x0, y: y0 }, { x: x1, y: y1 }] : [{ x: x0, y: y0 }, { x: x0, y: y0 + GAP / 2 }, { x: x1, y: y0 + GAP / 2 }, { x: x1, y: y1 }];
      links.push({ from: b.id, to: to.id, points: pts, ...(lbl ? { label: lbl } : {}) });
    }
  };
  const bottomOf = (b: FlowBox): Exit[] => [{ box: b }];

  const place = (steps: Step[], x: number, y: number, from: Exit[], label?: string): Placed => {
    let exits = from, bottom = y, colRight = x;
    let first = true;
    for (const s of steps) {
      const lbl = first ? label : undefined;
      first = false;
      if (s.kind === "call") {
        const sub = wrap(firstSentence(s.doc, 160));
        const state = s.steps ? "open" : s.cut ? "cut" : s.empty ? "empty" : "closed";
        const b = add({ id: s.id, kind: "call", x, y: bottom, w: width(s.name, sub, 30), h: H1 + (sub?.length ?? 0) * LINE, text: s.name, sub, target: s.target, path: s.in, line: s.line, may: s.may, count: s.count, state, doc: s.doc });
        join(exits, b, lbl);
        if (s.steps) {
          const inner = place(s.steps, x + IND, b.y + b.h + GAP, bottomOf(b));
          // A frame around the opened call and its steps.
          const fr: FlowBox = { id: `${s.id}#frame`, kind: "frame", x: x - FRAME, y: b.y - FRAME, w: Math.max(b.w, inner.right - x) + 2 * FRAME, h: inner.bottom - b.y + 2 * FRAME, text: "" };
          boxes.unshift(fr);
          left = Math.min(left, fr.x);
          right = Math.max(right, fr.x + fr.w);
          colRight = Math.max(colRight, fr.x + fr.w);
          exits = inner.exits;
          bottom = inner.bottom + FRAME + GAP;
        } else {
          exits = bottomOf(b);
          bottom = b.y + b.h + GAP;
          colRight = Math.max(colRight, b.x + b.w);
        }
      } else if (s.kind === "boundary") {
        const b = add({ id: s.id, kind: "boundary", x, y: bottom, w: width(s.name, undefined, 70), h: H1, text: s.name, target: s.target, path: s.in, line: s.line, boundary: s.boundary, may: s.may, count: s.count, flag: s.flag, notes: s.notes });
        join(exits, b, lbl);
        exits = bottomOf(b);
        bottom = b.y + b.h + GAP;
        colRight = Math.max(colRight, b.x + b.w);
      } else if (s.kind === "if") {
        const d = add({ id: s.id, kind: "if", x, y: bottom, w: width(s.text, undefined, 40), h: DIAMOND_H, text: s.text, path: s.in, line: s.line });
        join(exits, d, lbl);
        const y1 = d.y + d.h + GAP;
        // Yes goes down into the indented column; no leaves the left side and falls through, or, with
        // steps of its own, goes into a second column to the right of the first.
        const yes = place(s.yes, x + IND, y1, bottomOf(d), "yes");
        let out = yes.exits, b = yes.bottom, r = Math.max(yes.right, d.x + d.w);
        if (s.no.length) {
          const noX = Math.max(yes.right, x + IND, d.x + d.w) + COL;
          // From the right vertex, across and down into the second column.
          const no = place(s.no, noX, y1, [], undefined);
          const firstNo = boxes.find((bb) => bb.x === noX && bb.y === y1 && bb.kind !== "frame");
          if (firstNo) links.push({ from: d.id, to: firstNo.id, label: "no", points: [{ x: d.x + d.w, y: d.y + d.h / 2 }, { x: cx(firstNo), y: d.y + d.h / 2 }, { x: cx(firstNo), y: firstNo.y }] });
          out = [...out, ...no.exits];
          b = Math.max(b, no.bottom);
          r = Math.max(r, no.right);
        } else out = [...out, { box: d, side: true, label: "no" }];
        exits = out;
        bottom = Math.max(b, d.y + d.h + GAP);
        colRight = Math.max(colRight, r);
      } else if (s.kind === "loop") {
        const h = add({ id: s.id, kind: "loop", x, y: bottom, w: width(s.text, undefined, 40), h: H1, text: s.text, path: s.in, line: s.line });
        join(exits, h, lbl);
        const body = place(s.body, x + IND, h.y + h.h + GAP, bottomOf(h));
        // Back from the body's end, up to the header's underside at its left.
        const xb = x + IND - 10;
        for (const e of body.exits) {
          const bx = e.box, start = e.side ? { x: bx.x, y: bx.y + bx.h / 2 } : { x: cx(bx), y: bx.y + bx.h };
          links.push({ from: bx.id, to: h.id, back: true, points: [start, ...(e.side ? [{ x: xb, y: start.y }] : [{ x: start.x, y: body.bottom - GAP / 2 }, { x: xb, y: body.bottom - GAP / 2 }]), { x: xb, y: h.y + h.h }] });
        }
        exits = [{ box: h, side: true, label: "done" }];
        bottom = body.bottom + GAP / 2;
        colRight = Math.max(colRight, body.right, h.x + h.w);
      } else if (s.kind === "switch") {
        const d = add({ id: s.id, kind: "switch", x, y: bottom, w: width(s.text, undefined, 40), h: DIAMOND_H, text: s.text, path: s.in, line: s.line });
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
        colRight = Math.max(colRight, r);
      } else if (s.kind === "catch") {
        const tag = add({ id: s.id, kind: "catch", x: x + IND, y: bottom, w: width(s.text, undefined, -10), h: TAG_H, text: s.text, path: s.in, line: s.line });
        join(exits, tag, lbl);
        const body = place(s.body, x + IND, tag.y + tag.h + GAP / 2, bottomOf(tag));
        // Errors rejoin the flow; the step before the handler continues too.
        exits = [...exits, ...body.exits];
        bottom = body.bottom;
        colRight = Math.max(colRight, body.right, tag.x + tag.w);
      }
    }
    return { bottom, right: colRight, exits };
  };

  const e = f.entry;
  const sub = wrap(firstSentence(e.doc, 200));
  const entry = add({ id: e.id, kind: "entry", x: 0, y: 0, w: width(e.name, sub, 20), h: H1 + 14 + (sub?.length ?? 0) * LINE, text: e.name, sub, target: e.id, path: e.path, line: e.line, doc: e.doc });
  const body = place(f.steps, 0, entry.y + entry.h + GAP, bottomOf(entry));
  const end = add({ id: "#end", kind: "end", x: entry.x + entry.w / 2 - END / 2, y: body.bottom, w: END, h: END, text: "" });
  join(body.exits, end);
  // Side exits run left of the first column: shift everything right so nothing is at a negative x.
  if (left < 0) {
    for (const b of boxes) b.x -= left;
    for (const l of links) for (const p of l.points) p.x -= left;
    right -= left;
  }
  return { width: right, height: end.y + end.h, boxes, links, entry: e, flagged: f.flagged };
}
