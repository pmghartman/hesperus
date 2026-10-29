// The pane's explorer: the boxes of the boundary picture as a tree, driven by keys and the pointer on the
// drawing thread. It keeps only where the cursor is; opening, closing, selecting and going to source are
// posted to the hooks module, which redraws the picture and hands back new rows.
import type { ClientModule } from 'claude-code'

import type { HesperusExplorerPost, HesperusExplorerProps, HesperusRow } from '../types'

type State = { sel: number; top: number; selected?: string }

const COLOR = { error: 'red', warning: 'yellow', info: 'blue' } as const

const Explorer: ClientModule<HesperusExplorerProps, State> = (props, s) => {
  const { Box, Text } = s.elements
  const rows = props.rows
  // The region as the surface reports it, else as the pane laid it out: the desktop app reports one row.
  const room = Math.max(1, s.rows > 1 ? s.rows : props.room || rows.length)
  // Follow the hooks' selection when it changes from outside (a redraw, a reset); else keep our own.
  const prior = s.state
  let sel = prior && prior.selected === props.selected ? prior.sel : Math.max(0, rows.findIndex(r => r.id === props.selected))
  sel = Math.min(sel, Math.max(0, rows.length - 1))
  let top = prior?.top ?? 0
  if (sel < top) top = sel
  if (sel >= top + room) top = sel - room + 1
  top = Math.max(0, Math.min(top, Math.max(0, rows.length - room)))

  const post = (m: HesperusExplorerPost) => s.post(m)
  const go = (i: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, i))
    const row = rows[next]
    if (!row) return
    s.setState({ sel: next, top, selected: row.id })
    post({ type: 'select', id: row.id })
  }
  const toggle = (r: HesperusRow) => r.expandable && post({ type: 'toggle', id: r.id })
  const parentOf = (i: number) => {
    const depth = rows[i]?.depth ?? 0
    for (let j = i - 1; j >= 0; j--) if ((rows[j]?.depth ?? 0) < depth) return j
    return -1
  }

  s.onKey(k => {
    const r = rows[sel]
    if (!r) return
    if (k.key === 'up' || k.key === 'k') go(sel - 1)
    else if (k.key === 'down' || k.key === 'j') go(sel + 1)
    else if (k.key === 'pageup') go(sel - room)
    else if (k.key === 'pagedown') go(sel + room)
    else if (k.key === 'home') go(0)
    else if (k.key === 'end') go(rows.length - 1)
    else if (k.key === 'right' || k.key === 'l') {
      if (r.expandable && !r.open) toggle(r)
      else if ((rows[sel + 1]?.depth ?? -1) > r.depth) go(sel + 1)
    } else if (k.key === 'left' || k.key === 'h') {
      if (r.open) toggle(r)
      else if (parentOf(sel) >= 0) go(parentOf(sel))
    } else if (k.key === ' ') toggle(r)
    else if (k.key === 'return' || k.key === 'o') {
      if (r.at) post({ type: 'open', id: r.id })
      else toggle(r)
    }
  })

  s.onPointer(e => {
    if (e.type !== 'down' || e.button !== 'left') return
    const i = top + e.y
    const r = rows[i]
    if (!r) return
    // The chevron opens and closes; a second click on the selected row goes to its source.
    if (e.x >= r.depth * 2 && e.x < r.depth * 2 + 2) toggle(r)
    else if (i === sel) r.at ? post({ type: 'open', id: r.id }) : toggle(r)
    else go(i)
  })

  if (!rows.length) return <Text dimColor>No boxes drawn.</Text>
  return (
    <Box flexDirection="column">
      {rows.slice(top, top + room).map((r, n) => {
        const here = top + n === sel
        const chev = r.expandable ? (r.open ? '▾ ' : '▸ ') : '  '
        return (
          <Text wrap="truncate-end" mono>
            {'  '.repeat(r.depth)}
            <Text inverse={here} bold={here} color={r.severity ? COLOR[r.severity] : undefined}>{chev}{r.name}</Text>
            <Text dimColor> {r.kind}{r.at ? ` ${r.at}` : ''}</Text>
          </Text>
        )
      })}
    </Box>
  )
}

export default Explorer
