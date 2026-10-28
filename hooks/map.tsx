// The pane's map: the boundary picture drawn in character cells on the drawing thread, with the pointer
// on it. Drag a box to move it (the wires follow), drag the empty space or press the arrows to pan,
// click a box to select it, click it again to open or close it (or go to its source when it has
// nothing inside). Positions the person chose are posted to the hooks module, which keeps them.
import type { ClientModule, ClientPointerEvent } from 'claude-code'

import type { HesperusBox, HesperusMapPost, HesperusMapProps, HesperusMoves, HesperusWire } from '../types'

type Drag = { x: number; y: number; id?: string; from: [number, number]; moved: boolean }
type State = { pan: [number, number]; moves: HesperusMoves; drag?: Drag; followed?: string; /** The hooks' moves our own were laid over. */ seen?: string }

type Cell = { ch: string; color?: string; dim?: boolean; bold?: boolean; inverse?: boolean }
type Rect = { x: number; y: number; w: number; h: number }

const KIND: Record<string, string> = {
  directory: 'yellow', package: 'magenta', file: 'blue', type: 'red', function: 'magenta', method: 'magenta',
  field: 'blue', variable: 'blue', state: 'cyan', event: 'cyan', boundary: 'red', external_package: 'gray', external: 'gray', unresolved: 'gray', tier: 'gray',
}
const SEV = { error: 'red', warning: 'yellow', info: 'blue' } as const
const FOCUS = 'magenta'
/** The kinds whose boxes are dashed in the picture: packages outside the repo. */
const OUTSIDE = new Set(['external', 'external_package'])

const add = (a: [number, number], b: [number, number]): [number, number] => [a[0] + b[0], a[1] + b[1]]

/** Which sides a wire glyph joins (up, down, left, right as bits), so two wires through one cell merge. */
const U = 1, D = 2, L = 4, R = 8
const BITS: Record<string, number> = { '─': L | R, '╌': L | R, '│': U | D, '┆': U | D, '╭': D | R, '╮': D | L, '╰': U | R, '╯': U | L, '├': U | D | R, '┤': U | D | L, '┬': L | R | D, '┴': L | R | U, '┼': U | D | L | R }
const GLYPH: Record<number, string> = { [L | R]: '─', [U | D]: '│', [D | R]: '╭', [D | L]: '╮', [U | R]: '╰', [U | L]: '╯', [U | D | R]: '├', [U | D | L]: '┤', [L | R | D]: '┬', [L | R | U]: '┴', [U | D | L | R]: '┼', [U]: '│', [D]: '│', [L]: '─', [R]: '─' }

/** A box where the layout put it plus where the person dragged it. */
const place = (b: HesperusBox, moves: HesperusMoves): Rect => {
  const [dx, dy] = moves[b.id] ?? [0, 0]
  return { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }
}

/** An orthogonal path from box `a` to box `b`, each end on its own column of the box (`ai` of `an` wires
 *  leave `a`, `bi` of `bn` arrive at `b`): down from `a` (or up, when `b` is above), across in the gap row
 *  before `b`, and on to the cell beside `b`'s edge, where the head is drawn. Side by side, across. */
function route(a: Rect, b: Rect, ai: number, an: number, bi: number, bn: number): { x: number; y: number }[] {
  const slot = (r: Rect, i: number, n: number) => r.x + Math.min(r.w - 1, 1 + Math.floor(((i + 1) * (r.w - 1)) / (n + 1)))
  const ax = slot(a, ai, an), bx = slot(b, bi, bn)
  const pts: { x: number; y: number }[] = []
  if (b.y >= a.y + a.h + 2) pts.push({ x: ax, y: a.y + a.h }, { x: ax, y: b.y - 2 }, { x: bx, y: b.y - 2 }, { x: bx, y: b.y - 1 })
  else if (a.y >= b.y + b.h + 2) pts.push({ x: ax, y: a.y - 1 }, { x: ax, y: b.y + b.h + 1 }, { x: bx, y: b.y + b.h + 1 }, { x: bx, y: b.y + b.h })
  else {
    const ay = a.y + Math.floor(a.h / 2), by = b.y + Math.floor(b.h / 2)
    if (b.x >= a.x + a.w) {
      const mid = Math.floor((a.x + a.w + b.x) / 2)
      pts.push({ x: a.x + a.w, y: ay }, { x: mid, y: ay }, { x: mid, y: by }, { x: b.x - 1, y: by })
    } else if (a.x >= b.x + b.w) {
      const mid = Math.floor((b.x + b.w + a.x) / 2)
      pts.push({ x: a.x - 1, y: ay }, { x: mid, y: ay }, { x: mid, y: by }, { x: b.x + b.w, y: by })
    } else pts.push({ x: ax, y: a.y + a.h }, { x: ax, y: b.y - 1 })
  }
  // A bend on the point before it is no bend.
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y)
}

/** The picture as a grid of cells the size of the region, panned by `pan`. */
function raster(props: HesperusMapProps, moves: HesperusMoves, pan: [number, number], columns: number, rows: number, selected?: string): Cell[][] {
  const grid: Cell[][] = Array.from({ length: rows }, () => Array.from({ length: columns }, () => ({ ch: ' ' })))
  const put = (x: number, y: number, c: Cell) => {
    const cx = x - pan[0], cy = y - pan[1]
    const line = grid[cy]
    if (line && cx >= 0 && cx < columns) line[cx] = c
  }
  const at = (x: number, y: number): Cell | undefined => grid[y - pan[1]]?.[x - pan[0]]
  const text = (x: number, y: number, s: string, style: Omit<Cell, 'ch'>, max: number) => {
    const t = s.length > max ? s.slice(0, Math.max(0, max - 1)) + '…' : s
    let i = 0
    for (const ch of t) put(x + i++, y, { ch, ...style })
  }
  const rects: Record<string, Rect> = {}
  for (const b of props.boxes) rects[b.id] = place(b, moves)
  const byId: Record<string, HesperusBox> = {}
  for (const b of props.boxes) byId[b.id] = b

  // Containers first, outermost first, so what sits inside draws over them.
  const depth = (b: HesperusBox) => { let d = 0; for (let p = b.parent; p !== undefined; p = byId[p]?.parent) d++; return d }
  const containers = props.boxes.filter(b => b.container).sort((a, b) => depth(a) - depth(b))
  for (const b of containers) {
    const r = rects[b.id]
    if (!r) continue
    const color = b.id === selected ? FOCUS : b.severity ? SEV[b.severity] : KIND[b.kind] ?? 'gray'
    const dim = b.id !== selected && !b.severity
    const side = OUTSIDE.has(b.kind) ? '┆' : '│', top = OUTSIDE.has(b.kind) ? '┄' : '─'
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) { put(x, r.y, { ch: top, color, dim }); put(x, r.y + r.h - 1, { ch: top, color, dim }) }
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) { put(r.x, y, { ch: side, color, dim }); put(r.x + r.w - 1, y, { ch: side, color, dim }) }
    put(r.x, r.y, { ch: '╭', color, dim }); put(r.x + r.w - 1, r.y, { ch: '╮', color, dim })
    put(r.x, r.y + r.h - 1, { ch: '╰', color, dim }); put(r.x + r.w - 1, r.y + r.h - 1, { ch: '╯', color, dim })
    const mark = b.severity ? '● ' : ''
    text(r.x + 2, r.y + 1, `${b.open ? '▾ ' : ''}${mark}${b.name}`, { color, bold: true, inverse: b.id === selected }, r.w - 4)
  }

  // Wires: the layout's bends while it gave some and both ends sit where it put them, else a path
  // between the boxes, each wire on its own column of the box it leaves and the one it reaches.
  const outs: Record<string, number> = {}, ins: Record<string, number> = {}
  const slots = props.wires.map(w => {
    const o = (outs[w.from] = (outs[w.from] ?? 0) + 1), i = (ins[w.to] = (ins[w.to] ?? 0) + 1)
    return { ai: o - 1, bi: i - 1 }
  })
  const heads: ({ x: number; y: number } & Cell)[] = []
  for (const [n, w] of props.wires.entries()) {
    const a = rects[w.from], b = rects[w.to]
    if (!a || !b) continue
    const moved = moves[w.from] || moves[w.to]
    const { ai, bi } = slots[n]!
    const pts = moved || w.points.length < 2 ? route(a, b, ai, outs[w.from] ?? 1, bi, ins[w.to] ?? 1) : w.points
    const end = pts[pts.length - 1], last = pts[pts.length - 2]
    if (!end || !last) continue
    const color = w.severity ? SEV[w.severity] : undefined
    const style: Omit<Cell, 'ch'> = color ? { color } : { dim: true }
    // A cell two wires share joins both; a dashed run stays dashed only on its own.
    const join = (x: number, y: number, ch: string) => {
      const was = at(x, y)
      const bits = was ? BITS[was.ch] : undefined
      if (bits === undefined) put(x, y, { ch, ...style })
      else put(x, y, { ch: GLYPH[bits | (BITS[ch] ?? 0)] ?? ch, ...(was!.color && !color ? { color: was!.color } : style) })
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1]
      if (!p || !q) continue
      if (p.y === q.y) for (let x = Math.min(p.x, q.x) + 1; x < Math.max(p.x, q.x); x++) join(x, p.y, w.may ? '╌' : '─')
      else for (let y = Math.min(p.y, q.y) + 1; y < Math.max(p.y, q.y); y++) join(p.x, y, w.may ? '┆' : '│')
      // The bend: which two of its four sides the wire leaves by.
      const prev = pts[i - 1], next = q
      if (prev) {
        const up = prev.y < p.y || next.y < p.y, down = prev.y > p.y || next.y > p.y
        const left = prev.x < p.x || next.x < p.x, right = prev.x > p.x || next.x > p.x
        const ch = up && right ? '╰' : up && left ? '╯' : down && right ? '╭' : down && left ? '╮' : p.y === q.y ? '─' : '│'
        join(p.x, p.y, ch)
      }
    }
    heads.push({ x: end.x, y: end.y, ch: end.y > last.y ? '▼' : end.y < last.y ? '▲' : end.x > last.x ? '▶' : '◀', ...(color ? { color } : {}) })
  }
  // Heads over the runs, so a wire passing a head leaves it legible.
  for (const { x, y, ...c } of heads) put(x, y, c)

  // Leaves over the wires: a bar in the kind's colour, the name, and the packages it reaches below.
  for (const b of props.boxes) {
    if (b.container) continue
    const r = rects[b.id]
    if (!r) continue
    const color = b.id === selected ? FOCUS : b.severity ? SEV[b.severity] : KIND[b.kind] ?? 'gray'
    const bar = OUTSIDE.has(b.kind) ? '┊' : '▍'
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) put(x, y, { ch: ' ' })
    for (let y = r.y; y < r.y + r.h; y++) put(r.x, y, { ch: bar, color })
    const mark = b.severity ? '● ' : ''
    text(r.x + 1, r.y, `${b.expandable ? '▸ ' : ''}${mark}${b.name}`, { color, bold: b.id === selected, inverse: b.id === selected }, r.w - 1)
    const note = b.notes?.[0]
    if (r.h > 1 && note !== undefined) text(r.x + 1, r.y + 1, note, { color, dim: true }, r.w - 1)
  }
  return grid
}

const MapView: ClientModule<HesperusMapProps, State> = (props, s) => {
  const { Box, Text } = s.elements
  const columns = Math.max(1, s.columns || 40), rows = Math.max(1, s.rows || 12)
  const st: State = s.state ?? { pan: [0, 0], moves: {} }
  // The hooks' moves are the record; our own lie over them from a drop until the hooks hand them back
  // (no snap back meanwhile), and are forgotten once the record changes (that, or Overview).
  const seen = JSON.stringify(props.moves)
  const own = st.seen === seen ? st.moves : {}
  const moves: HesperusMoves = { ...props.moves, ...own }
  const selected = props.selected
  let pan = st.pan
  // A box selected elsewhere (the explorer, a reset) is panned into view once.
  if (selected && selected !== st.followed) {
    const b = props.boxes.find(x => x.id === selected)
    if (b) {
      const r = place(b, moves)
      if (r.x < pan[0] || r.x + Math.min(r.w, columns) > pan[0] + columns) pan = [Math.max(0, r.x - 2), pan[1]]
      if (r.y < pan[1] || r.y + Math.min(r.h, rows) > pan[1] + rows) pan = [pan[0], Math.max(0, r.y - 1)]
    }
  }
  const post = (m: HesperusMapPost) => s.post(m)
  const set = (next: Partial<State>) => s.setState({ ...st, moves: own, seen, pan, followed: selected, ...next })
  const clampPan = (p: [number, number]): [number, number] => [
    Math.max(0, Math.min(p[0], Math.max(0, props.width - columns))),
    Math.max(0, Math.min(p[1], Math.max(0, props.height - rows))),
  ]
  const hit = (x: number, y: number): HesperusBox | undefined => {
    // The smallest box under the pointer: a leaf before the container around it.
    let best: HesperusBox | undefined, area = Infinity
    for (const b of props.boxes) {
      const r = place(b, moves)
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h && r.w * r.h < area) { best = b; area = r.w * r.h }
    }
    return best
  }
  const act = (b: HesperusBox) => {
    if (b.id !== selected) post({ type: 'select', id: b.id })
    else if (b.expandable) post({ type: 'toggle', id: b.id })
    else if (b.path) post({ type: 'open', id: b.id })
  }

  s.onKey(k => {
    const step = k.shift ? 10 : 2
    if (k.key === 'left' || k.key === 'h') set({ pan: clampPan(add(pan, [-step, 0])) })
    else if (k.key === 'right' || k.key === 'l') set({ pan: clampPan(add(pan, [step, 0])) })
    else if (k.key === 'up' || k.key === 'k') set({ pan: clampPan(add(pan, [0, -1])) })
    else if (k.key === 'down' || k.key === 'j') set({ pan: clampPan(add(pan, [0, 1])) })
    else if (k.key === 'home') set({ pan: [0, 0] })
    else if (k.key === ' ' || k.key === 'o') { const b = props.boxes.find(x => x.id === selected); if (b?.expandable) post({ type: 'toggle', id: b.id }) }
    else if (k.key === 'return') { const b = props.boxes.find(x => x.id === selected); if (b?.path) post({ type: 'open', id: b.id }) }
  })

  s.onPointer((e: ClientPointerEvent) => {
    const x = e.x + pan[0], y = e.y + pan[1]
    if (e.type === 'down' && e.button === 'left') {
      const b = hit(x, y)
      set({ drag: { x: e.x, y: e.y, id: b?.id, from: b ? moves[b.id] ?? [0, 0] : pan, moved: false } })
    } else if (e.type === 'move' && st.drag && e.button === 'left') {
      const d = st.drag, dx = e.x - d.x, dy = e.y - d.y
      const moved = d.moved || dx !== 0 || dy !== 0
      if (d.id) set({ drag: { ...d, moved }, moves: { ...own, [d.id]: [d.from[0] + dx, d.from[1] + dy] } })
      else set({ drag: { ...d, moved }, pan: clampPan([d.from[0] - dx, d.from[1] - dy]) })
    } else if (e.type === 'up' && st.drag) {
      const d = st.drag
      const b = d.id ? props.boxes.find(x => x.id === d.id) : undefined
      if (b && d.moved) {
        const [mx, my] = own[b.id] ?? d.from
        post({ type: 'move', id: b.id, dx: mx, dy: my })
      } else if (b) act(b)
      set({ drag: undefined })
    }
  })

  if (!props.boxes.length) return <Text dimColor>No boxes drawn.</Text>
  const grid = raster(props, moves, pan, columns, rows, selected)
  const same = (a: Cell, b: Cell) => a.color === b.color && !!a.dim === !!b.dim && !!a.bold === !!b.bold && !!a.inverse === !!b.inverse
  return (
    <Box flexDirection="column">
      {grid.map(line => {
        // Runs of one style, each one Text; the row is one line, never wrapped.
        const runs: { cell: Cell; text: string }[] = []
        for (const c of line) {
          const last = runs[runs.length - 1]
          if (last && same(last.cell, c)) last.text += c.ch
          else runs.push({ cell: c, text: c.ch })
        }
        return (
          <Text wrap="truncate-end">
            {runs.map(r => (r.cell.color || r.cell.dim || r.cell.bold || r.cell.inverse
              ? <Text color={r.cell.color} dimColor={r.cell.dim} bold={r.cell.bold} inverse={r.cell.inverse}>{r.text}</Text>
              : r.text))}
          </Text>
        )
      })}
    </Box>
  )
}

export default MapView
