// Hesperus beside the chat: a pane with the boundary map, an explorer of its boxes and the findings,
// re-drawn after every edit the agent makes, and a status line count. The map is drawn in cells where
// the surface runs a Client (the terminal, the desktop app): its boxes drag, open and close, and go to
// source; elsewhere (the editor, the phone) it is a picture. The flow runs top to bottom, so it fits a
// tall narrow pane. The facts come from the plugin's own MCP server, the one the agent asks: it keeps the
// graph loaded between calls, and the pane starts no program of its own.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { HesperusAsk, HesperusBox, HesperusExplorerProps, HesperusFinding, HesperusMapPost, HesperusMapProps, HesperusMoves, HesperusPeek, HesperusReport, HesperusRow, HesperusView } from '../types'

const PANE = 'hesperus'
const report = atom({ plugin: 'hesperus', key: 'report' } as const, null as HesperusReport | null, { shape: 'report-1' })
const view = atom({ plugin: 'hesperus', key: 'view' } as const, '', { shape: 'view-1' })
const busy = atom({ plugin: 'hesperus', key: 'busy' } as const, '')
const boxes = atom({ plugin: 'hesperus', key: 'boxes' } as const, null as HesperusView | null, { shape: 'boxes-1' })
const ask = atom({ plugin: 'hesperus', key: 'ask' } as const, {} as HesperusAsk, { shape: 'ask-1' })
const peek = atom({ plugin: 'hesperus', key: 'peek' } as const, null as HesperusPeek | null, { shape: 'peek-1' })
const moves = atom({ plugin: 'hesperus', key: 'moves' } as const, {} as HesperusMoves, { shape: 'moves-1' })

/** Tools whose run may change source files. */
const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'])
const LABEL: Record<string, string> = {
  database: 'Database', network: 'Network', ai: 'AI models', cloud: 'Cloud & SaaS', messaging: 'Queues',
  filesystem: 'Filesystem', process: 'Processes', environment: 'Environment',
}
const COLOR = { error: 'red', warning: 'yellow', info: 'blue' } as const
/** Lines of source shown above and below a selected box's definition. */
const PEEK_BEFORE = 2, PEEK_AFTER = 12

const empty = (error: string): HesperusReport => ({ at: Date.now(), summary: { errors: 0, warnings: 0, info: 0, removed: 0 }, boundaries: {}, findings: [], removed: [], error })

let timer: { cancel: () => void } | undefined
let running = false
/** A run asked for while one ran: `index` wins over `draw`, since indexing draws too. */
let again: 'index' | 'draw' | undefined

/** The MCP server's key in plugin.json. */
const SERVER = 'hesperus'
/** The plugin's name in plugin.json, as `next.origin` names it. */
const PLUGIN = 'hesperus'
/** The server's tools as the model names them, under whichever name the session runs the server. */
const OWN_TOOL = /^mcp__.+__hesperus_[a-z]+$/
/** The person's latest press on the pane or its command, in their own words, which the permission path
 *  reads as the request behind the pane's next calls; empty when the pane runs by itself, after an edit,
 *  since nobody pressed anything then. */
let press = ''

/** Calls one of the MCP server's tools on the session's repo, as a tool call of the session's own, so the
 *  permission path decides it and the plugin's `tool.check` hook can allow the pane's own calls. (A call
 *  straight to the server, `$.mcp.call`, is judged by the host's auto-mode classifier alone, which
 *  refuses a call no request raised.) Its text, or an error saying why not. */
async function call($: EngineInterface, tool: string, args: Record<string, unknown> = {}): Promise<string> {
  const c = await $.mcp.connect(SERVER)
  if (!c.isConnected) throw new Error(c.message)
  const name = `mcp__${c.server.replace(/[^A-Za-z0-9_]/g, '_')}__${tool}`
  // The tool's name is only known at run time, under whichever name the session runs the server.
  const input = { tool: name, ...(press ? { consent: press } : {}), dir: await $.session.cwd(), ...args } as unknown as Parameters<EngineInterface['tool']['call']>[0]
  const r = await $.tool.call(input)
  if (r.deny !== undefined) throw new Error(r.deny)
  const text = r.text ?? textOf(r.result)
  if (r.isError) throw new Error(text.replace(/^hesperus: /, '') || `${tool} failed`)
  return text
}

/** The text of an MCP result a hook answered with (`{ content }`), where core set no `text`. */
function textOf(v: unknown): string {
  const content = (v as { content?: { type: string; text?: string }[] } | null)?.content
  if (Array.isArray(content)) return content.map(b => (b.type === 'text' ? b.text ?? '' : '')).join('')
  return typeof v === 'string' ? v : ''
}

/** The pane's width in cells as last drawn, for the layout; and the width the picture was laid out at. */
let paneColumns = 60, drawnColumns = 0
/** Whether a surface with no Client has shown the picture: only the picture outlines the selected box
 *  itself, so only then does selecting draw again. The map Client outlines it from its props. */
let pictured = false

/** What draws the view the person asked for, laid out for a tall pane this wide; no boxes named for the
 *  overview. */
const drawArgs = (a: HesperusAsk) => {
  drawnColumns = paneColumns
  return { columns: paneColumns, ...(a.open ? { open: a.open } : {}), ...(a.focus ? { focus: a.focus } : {}) }
}

/** The store key of the boxes the person dragged, per repo. */
const movesKey = (cwd: string) => `moves:${cwd}`

/** Reads the picture and its boxes the server just drew. */
async function loadPicture($: EngineInterface): Promise<void> {
  const cwd = await $.session.cwd()
  const svg = await $.fs.read(`${cwd}/.hesperus/view.svg`).catch(() => '')
  await update($, view, () => svg)
  const json = await $.fs.read(`${cwd}/.hesperus/view.json`).catch(() => '')
  let v: Partial<HesperusView> | null = null
  try {
    v = JSON.parse(json) as Partial<HesperusView>
  } catch {}
  // A view.json an older CLI wrote has no wires or extent.
  if (v && Array.isArray(v.boxes)) await update($, boxes, () => ({ wires: [], width: 0, height: 0, open: [], omitted: 0, ...v } as HesperusView))
}

/** Keeps where a box was dragged to, for this session and the next; back on the layout's spot, forgets it. */
async function move($: EngineInterface, id: string, dx: number, dy: number): Promise<void> {
  const next = await update($, moves, m => {
    const { [id]: _, ...rest } = m
    return dx || dy ? { ...rest, [id]: [dx, dy] as [number, number] } : rest
  })
  await $.store.set(movesKey(await $.session.cwd()), next).catch(() => undefined)
}

/** Re-index and lint the session's repo (`index`) or only draw the asked-for view again (`draw`), then
 *  redraw the pane. One run at a time; a run asked for meanwhile follows. */
async function refresh($: EngineInterface, mode: 'index' | 'draw' = 'index'): Promise<void> {
  if (running) {
    again = again === 'index' || mode === 'index' ? 'index' : 'draw'
    return
  }
  running = true
  try {
    if (mode === 'index') {
      await update($, busy, () => 'indexing')
      $.ui.status('hesperus: indexing…')
      const next: HesperusReport = { at: Date.now(), ...(JSON.parse(await call($, 'hesperus_check', { index: true })) as Omit<HesperusReport, 'at'>) }
      await update($, report, () => next)
      const { errors, warnings } = next.summary
      $.ui.status(errors || warnings ? `hesperus: ${errors} errors, ${warnings} new` : 'hesperus: clean')
    }
    await update($, busy, () => 'drawing')
    try {
      await call($, 'hesperus_svg', drawArgs(await read($, ask)))
      await loadPicture($)
    } catch (e) {
      // Too many boxes, most likely: say so and go back to what is drawn.
      $.ui.toast(`hesperus: ${e instanceof Error ? e.message : String(e)}`)
      const drawn = await read($, boxes)
      if (mode === 'draw' && drawn) await update($, ask, a => ({ ...a, open: drawn.open.map(o => o.id) }))
    }
  } catch (e) {
    await update($, report, () => empty(e instanceof Error ? e.message : String(e)))
    $.ui.status('hesperus: failed')
  } finally {
    running = false
    await update($, busy, () => '')
    const next = again
    again = undefined
    if (next) void refresh($, next)
  }
}

/** Edits come in bursts; index once the burst has settled. */
function schedule($: EngineInterface, ms: number): void {
  timer?.cancel()
  timer = $.clock.after(ms, () => void refresh($))
}

/** The explorer's rows: open boxes and drawn boxes as one tree, each under the open box it sits in. */
function rowsOf(v: HesperusView): HesperusRow[] {
  const drawn = new Map(v.boxes.map(b => [b.id, b]))
  const opened = new Set(v.open.map(o => o.id))
  const at = (b?: HesperusBox) => (b?.path ? { at: `${b.path}:${b.line ?? 1}` } : {})
  const sev = (b?: HesperusBox) => (b?.severity ? { severity: b.severity } : {})
  type Item = Omit<HesperusRow, 'depth'> & { under?: string }
  const items: Item[] = [
    ...v.open.map(o => ({ id: o.id, name: o.name, kind: o.kind, under: o.under, expandable: true, open: true, ...sev(drawn.get(o.id)), ...at(drawn.get(o.id)) })),
    ...v.boxes.filter(b => !opened.has(b.id)).map(b => ({ id: b.id, name: b.name, kind: b.kind, under: b.under, expandable: b.expandable, open: false, ...sev(b), ...at(b) })),
  ]
  const kids = new Map<string | undefined, Item[]>()
  for (const it of items) {
    const p = it.under !== undefined && opened.has(it.under) ? it.under : undefined
    ;(kids.get(p) ?? kids.set(p, []).get(p)!).push(it)
  }
  const out: HesperusRow[] = []
  const seen = new Set<string>()
  const walk = (p: string | undefined, depth: number) => {
    for (const { under: _, ...it } of kids.get(p) ?? []) {
      if (seen.has(it.id)) continue
      seen.add(it.id)
      out.push({ ...it, depth })
      if (it.open) walk(it.id, depth + 1)
    }
  }
  walk(undefined, 0)
  return out
}

/** Opens or closes a box; closing forgets what was open inside it, so reopening shows one level. */
async function toggle($: EngineInterface, id: string): Promise<void> {
  const v = await read($, boxes)
  if (!v) return
  const open = new Set((await read($, ask)).open ?? v.open.map(o => o.id))
  if (open.has(id)) {
    open.delete(id)
    const under = new Map(v.open.map(o => [o.id, o.under]))
    for (const x of [...open]) for (let p = under.get(x); p !== undefined; p = under.get(p)) if (p === id) open.delete(x)
  } else open.add(id)
  await update($, ask, a => ({ ...a, open: [...open].sort(), focus: id }))
  void refresh($, 'draw')
}

/** Selects a box: outlined on the map, its source shown under it. */
async function select($: EngineInterface, id: string): Promise<void> {
  if ((await read($, ask)).focus === id) return
  await update($, ask, a => ({ ...a, focus: id }))
  const b = (await read($, boxes))?.boxes.find(x => x.id === id)
  let next: HesperusPeek | null = null
  if (b?.path) {
    const text = await $.fs.read(`${await $.session.cwd()}/${b.path}`).catch(() => undefined)
    if (text !== undefined) {
      const line = b.line ?? 1
      const first = Math.max(1, line - PEEK_BEFORE)
      next = { id, path: b.path, line: first, source: text.split('\n').slice(first - 1, line + PEEK_AFTER).join('\n') }
    }
  }
  await update($, peek, () => next)
  if (pictured) void refresh($, 'draw')
}

/** Opens a box's source in the editor, through the server's `hesperus_open`: VS Code at the line when
 *  its `code` command is installed, else whatever the system opens the file with. */
async function reveal($: EngineInterface, id: string): Promise<void> {
  const b = (await read($, boxes))?.boxes.find(x => x.id === id)
  if (!b?.path) return
  $.ui.toast(await call($, 'hesperus_open', { id }).catch(e => `hesperus: ${e instanceof Error ? e.message : String(e)}`))
}

/** Back to the overview, every box where the layout puts it. */
async function reset($: EngineInterface): Promise<void> {
  await update($, ask, () => ({}))
  await update($, peek, () => null)
  await update($, moves, () => ({}))
  await $.store.set(movesKey(await $.session.cwd()), {}).catch(() => undefined)
  void refresh($, 'draw')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hesperus',
      description: 'Open the boundary map; `accept` marks every current crossing as reviewed',
      argumentHint: '[accept]',
    })
    void $.ui.open({ id: PANE, title: 'Hesperus' })
    const kept = await $.store.get(movesKey(e.cwd)).catch(() => undefined)
    if (kept && typeof kept === 'object') await update($, moves, () => kept as HesperusMoves)
    schedule($, 100)
    return next(e)
  })

  on('command.run', { command: 'hesperus' }, async ($, e) => {
    press = `The user ran /hesperus${e.args.trim() ? ` ${e.args.trim()}` : ''}.`
    if (e.args.trim() === 'accept') {
      const text = await call($, 'hesperus_accept').catch(e => `hesperus: ${e instanceof Error ? e.message : String(e)}`)
      schedule($, 100)
      return { text }
    }
    await $.ui.open({ id: PANE, title: 'Hesperus' })
    schedule($, 100)
    return { text: 'Hesperus pane opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (EDITS.has(String(e.tool)) && ran.deny === undefined) {
      press = ''
      schedule($, e.tool === 'Bash' ? 3000 : 1500)
    }
    return ran
  })

  // The pane's own calls into the plugin's server are the plugin's to allow: auto mode's classifier judges
  // a call by the request behind it, and the pane's has none, so it would refuse them. The model's calls
  // are decided as before.
  on('tool.check', { tool: OWN_TOOL }, async ($, e, next) => {
    if (next.origin.plugin === PLUGIN) return { decision: 'allow', reason: 'The Hesperus pane asked its own server.' }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.message', { requestId: PANE }, async ($, e) => {
    if (e.element !== 'explorer' && e.element !== 'map') return {}
    const m = e.data as HesperusMapPost
    const did = { select: 'clicked a box', toggle: 'opened or closed a box', open: 'pressed Go to source', move: 'dragged a box' }[m?.type as string]
    if (did) press = `The user ${did} in the Hesperus pane.`
    if (m?.type === 'select') await select($, m.id)
    else if (m?.type === 'toggle') await toggle($, m.id)
    else if (m?.type === 'open') await reveal($, m.id)
    else if (m?.type === 'move') await move($, m.id, m.dx, m.dy)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const r = await read($, report)
    const b = await read($, busy)
    const v = await read($, boxes)
    const a = await read($, ask)
    const p = await read($, peek)
    const mv = await read($, moves)
    const findings = r?.findings ?? []
    const rows = v ? rowsOf(v) : []
    const room = e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 30
    // A pane that changed width since the picture was laid out gets it drawn again to fit.
    if (e.props.bodyColumns > 0) paneColumns = e.props.bodyColumns
    if (v && drawnColumns > 0 && paneColumns !== drawnColumns) void refresh($, 'draw')
    const selected = rows.find(x => x.id === a.focus)
    const explorer: HesperusExplorerProps = a.focus ? { rows, selected: a.focus } : { rows }
    const head = r === null
      ? <Text dimColor>{b ? 'Indexing…' : 'No report yet. /hesperus runs one.'}</Text>
      : r.error
        ? <Text color="red">{r.error}</Text>
        : <Text>
            {Object.entries(r.boundaries).map(([k, n]) => `${LABEL[k] ?? k} ${n.out + n.in}`).join(' · ') || 'No boundary crossings.'}
            {b ? `  (${b}…)` : ''}
            {r.stale ? '  stale' : ''}
          </Text>
    const tools = (
      <Box flexDirection="row" gap={1}>
        <Button key="reset" label="Overview" hotkey="r" onPress={() => void reset($)} />
        {selected?.expandable && <Button key="toggle" label={selected.open ? 'Close' : 'Open'} hotkey="t" onPress={() => void toggle($, selected.id)} />}
        {selected?.at && <Button key="reveal" label="Go to source" hotkey="g" onPress={() => void reveal($, selected.id)} />}
      </Box>
    )
    const source = p && p.id === a.focus && <Code source={p.source} path={p.path} startLine={p.line} wrap="truncate-end" />
    const line = (f: HesperusFinding) => (
      <Text color={COLOR[f.severity]}>
        {f.path ? `${f.path}:${f.line ?? 1} ` : ''}{f.message}
      </Text>
    )
    // A tall narrow pane, top to bottom: the map takes the most room, then the explorer, the selected
    // box's source, and the findings in what is left.
    const mapRows = v?.boxes.length ? Math.max(8, Math.min(v.height, Math.floor(room * 0.45))) : 0
    const listRows = Math.max(3, Math.min(rows.length, Math.floor(room / 5)))
    const findingRows = Math.max(3, room - mapRows - listRows - (source ? PEEK_BEFORE + PEEK_AFTER + 2 : 0) - 7)
    const list = findings.slice(0, findingRows).map(line)
    const more = findings.length > findingRows && <Text dimColor>{`… ${findings.length - findingRows} more`}</Text>
    const hint = <Text dimColor>map: drag a box or the space · click selects, again opens · explorer: ↑↓ → ← ⏎</Text>

    // The map and the explorer as Client elements by their string tag, each naming its one module.
    if (e.surface === 'terminal' || e.surface === 'desktop') {
      const map: HesperusMapProps = v ? { boxes: v.boxes, wires: v.wires, width: v.width, height: v.height, moves: mv, ...(a.focus ? { selected: a.focus } : {}) } : { boxes: [], wires: [], width: 0, height: 0, moves: {} }
      const omitted = v?.omitted ? <Text dimColor>{`${v.omitted} lighter wires left out`}</Text> : undefined
      return (
        <Box flexDirection="column">
          {head}
          {rows.length > 0 && tools}
          {mapRows > 0 && h('Client', { key: 'map', module: './map.tsx', props: map, height: mapRows, width: '100%' })}
          {omitted}
          {rows.length > 0 && h('Client', { key: 'explorer', module: './explorer.tsx', props: explorer, height: listRows })}
          {rows.length > 0 && hint}
          {source}
          {list}
          {more}
        </Box>
      )
    }
    // No Client here (the editor's pane, the phone): the picture, and a row is a button that selects, and opens once selected.
    const { Svg } = $.ui.resolve(e)
    pictured = true
    const svg = await read($, view)
    const picture = svg !== '' && <Svg source={svg} alt="The repo's folders and files at the top, each boundary it reaches as a box along the bottom; red marks a denied call, amber a call not yet reviewed, pink the box selected below." isInteractive />
    return (
      <Box flexDirection="column" gap={1}>
        {head}
        {rows.length > 0 && tools}
        {picture}
        {rows.slice(0, 40).map(x => (
          <Button key={`row:${x.id}`} plain onPress={() => void (x.id === a.focus ? (x.expandable ? toggle($, x.id) : reveal($, x.id)) : select($, x.id))}>
            {'  '.repeat(x.depth)}{x.expandable ? (x.open ? '▾ ' : '▸ ') : '  '}{x.name}
            <Text dimColor> {x.kind}</Text>
          </Button>
        ))}
        {source}
        {list}
        {more}
      </Box>
    )
  })
}
