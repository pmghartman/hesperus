import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'hesperus',
  component: 'Pane',
  requestId: 'hesperus',
  props: { title: 'Hesperus', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const REPORT = JSON.stringify({
  summary: { errors: 1, warnings: 1, info: 0, removed: 0 },
  boundaries: { network: { out: 2, in: 0 } },
  findings: [
    { rule: 'boundary-denied', severity: 'error', message: 'core may not reach the network', boundary: 'network', path: 'src/x.ts', line: 3, local: 'f', external: 'get', key: 'out f -> get' },
    { rule: 'new-crossing', severity: 'warning', message: 'New call into the network: axios.get', boundary: 'network', path: 'src/y.ts', line: 9, local: 'g', external: 'get', key: 'out g -> get' },
  ],
  removed: [],
})

test('after an edit the pane shows the lint, on every surface', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'hesperus' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('mcp.connect', () => ({ value: { isConnected: true, server: 'plugin:hesperus:hesperus' } }))
  on('fs.read', () => ({ value: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>Network</title></svg>' }))
  // The pane's calls into its server are tool calls; the one edit the test makes is answered too.
  on('tool.call', (_, e) => {
    if (!e.tool.startsWith('mcp__')) return { result: {} }
    return { result: { content: [{ type: 'text', text: e.tool.endsWith('__hesperus_check') ? REPORT : '/repo/.hesperus/view.svg' }] } }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: 'src/y.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(5000)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Network 2/ }))?.text).toContain('Network 2')
    expect((await ui.find({ type: 'Text', text: /src\/x\.ts:3/ }))?.text).toContain('core may not reach the network')
    // The map is drawn in cells where a Client runs, and as a picture elsewhere.
    if (surface === 'terminal' || surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    else expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  }
})

const VIEW = JSON.stringify({
  open: [{ id: 'dir:src', name: 'src', kind: 'directory' }],
  boxes: [
    { id: 'fn:a', name: 'a.ts', kind: 'file', under: 'dir:src', container: false, expandable: false, open: false, x: 0, y: 0, w: 8, h: 1, path: 'src/a.ts', line: 3 },
    { id: 'dir:lib', name: 'lib', kind: 'directory', container: false, expandable: true, open: false, x: 12, y: 0, w: 7, h: 1 },
    { id: 'boundary:network', name: 'Network', kind: 'boundary', container: false, expandable: true, open: false, x: 0, y: 4, w: 12, h: 2, severity: 'error', notes: ['core may not reach the network'] },
  ],
  wires: [{ from: 'fn:a', to: 'boundary:network', points: [], may: false, severity: 'error' }],
  width: 20,
  height: 6,
  omitted: 0,
})

test('the explorer selects, opens boxes and goes to source', async ($, on) => {
  const clock = mock.clock(on)
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  on('command.register', () => ({ value: { command: 'hesperus' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('mcp.connect', () => ({ value: { isConnected: true, server: 'plugin:hesperus:hesperus' } }))
  on('tool.call', (_, e, next) => {
    if (!e.tool.startsWith('mcp__')) return next(e)
    const { tool, tool_use_id: _id, ...args } = e as { tool: string; tool_use_id?: string } & Record<string, unknown>
    const name = tool.replace(/^mcp__.*__/, '')
    calls.push({ tool: name, args })
    return { result: { content: [{ type: 'text', text: name === 'hesperus_check' ? REPORT : 'done' }] } }
  })
  on('fs.read', (_, e) => ({ value: e.path.endsWith('view.json') ? VIEW : e.path === '/repo/src/a.ts' ? 'one\ntwo\nexport const a = 1\nfour\n' : '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }))

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await clock.advance(1000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.resize({ columns: 60, rows: 4, in: 'explorer' })
    expect((await ui.find({ type: 'Text', text: /a\.ts/, in: 'explorer' }))?.text).toContain('src/a.ts:3')

    // Rows: src, a.ts (under src), lib, Network. Down selects a.ts: the map outlines it from its props,
    // with nothing drawn again, and its source is shown.
    const before = calls.length
    await ui.key({ key: 'down', in: 'explorer' })
    expect(calls.slice(before).some(c => c.tool === 'hesperus_svg')).toBe(false)
    expect(await ui.find({ type: 'Code' })).toBeDefined()

    await ui.key({ key: 'return', in: 'explorer' })
    expect(calls.some(c => c.tool === 'hesperus_open' && c.args.id === 'fn:a' && c.args.dir === '/repo')).toBe(true)

    // Down to lib, right opens it: the map is drawn again with lib open beside src.
    await ui.key({ key: 'down', in: 'explorer' })
    await ui.key({ key: 'right', in: 'explorer' })
    expect(calls.filter(c => c.tool === 'hesperus_svg').at(-1)?.args.open).toEqual(['dir:lib', 'dir:src'])

    await ui.press({ key: 'reset' })
    const last = calls.filter(c => c.tool === 'hesperus_svg').at(-1)?.args ?? {}
    expect(last.open).toBeUndefined()
    // Laid out for a tall pane as wide as this one.
    expect(last.columns).toBe(60)
    await ui.unmount()
  }
})

test('the map draws the boxes and their wires, selects on a click, and keeps a dragged box where it was dropped', async ($, on) => {
  const clock = mock.clock(on)
  const kept: unknown[] = []
  on('store.get', () => ({ value: undefined }))
  on('store.set', (_, e) => {
    kept.push(e.value)
    return { value: undefined }
  })
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  on('command.register', () => ({ value: { command: 'hesperus' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('mcp.connect', () => ({ value: { isConnected: true, server: 'plugin:hesperus:hesperus' } }))
  on('tool.call', (_, e, next) => {
    if (!e.tool.startsWith('mcp__')) return next(e)
    const { tool, tool_use_id: _id, ...args } = e as { tool: string; tool_use_id?: string } & Record<string, unknown>
    const name = tool.replace(/^mcp__.*__/, '')
    calls.push({ tool: name, args })
    return { result: { content: [{ type: 'text', text: name === 'hesperus_check' ? REPORT : 'done' }] } }
  })
  on('fs.read', (_, e) => ({ value: e.path.endsWith('view.json') ? VIEW : e.path === '/repo/src/a.ts' ? 'one\ntwo\nexport const a = 1\nfour\n' : '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }))

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await clock.advance(1000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.resize({ columns: 30, rows: 8, in: 'map' })
  // Row 0 holds a.ts and lib; the wire from a.ts ends in a head on the row above Network.
  expect((await ui.find({ type: 'Text', text: /a\.ts.*lib/, in: 'map' }))?.text).toContain('▸ lib')
  expect((await ui.find({ type: 'Text', text: /▼/, in: 'map' }))?.text).toContain('▼')
  expect(await ui.find({ type: 'Text', text: /● Network/, in: 'map' })).toBeDefined()
  // Its note, cut to the box's width.
  expect(await ui.find({ type: 'Text', text: /core may n…/, in: 'map' })).toBeDefined()

  // A click on a.ts selects it: outlined in the cells with nothing drawn again, its source shown.
  const before = calls.length
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'map' })
  await ui.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: 'map' })
  await clock.advance(0)
  expect(calls.slice(before).some(c => c.tool === 'hesperus_svg')).toBe(false)
  expect(await ui.find({ type: 'Code' })).toBeDefined()

  // Dragging lib three cells right and one down keeps it there, in this session and the store.
  await ui.pointer({ type: 'down', x: 13, y: 0, button: 'left', in: 'map' })
  await ui.pointer({ type: 'move', x: 16, y: 1, button: 'left', in: 'map' })
  await ui.pointer({ type: 'up', x: 16, y: 1, button: 'left', in: 'map' })
  await clock.advance(0)
  expect(kept.at(-1)).toEqual({ 'dir:lib': [3, 1] })
  expect((await ui.find({ type: 'Text', text: /▸ lib/, in: 'map' }))?.text).not.toContain('a.ts')

  // The overview puts every box back.
  await ui.press({ key: 'reset' })
  await clock.advance(0)
  expect(kept.at(-1)).toEqual({})
  await ui.unmount()
})

test('where the map is a picture, selecting a row draws it again with the box outlined', async ($, on) => {
  const clock = mock.clock(on)
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  on('command.register', () => ({ value: { command: 'hesperus' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('mcp.connect', () => ({ value: { isConnected: true, server: 'plugin:hesperus:hesperus' } }))
  on('tool.call', (_, e, next) => {
    if (!e.tool.startsWith('mcp__')) return next(e)
    const { tool, tool_use_id: _id, ...args } = e as { tool: string; tool_use_id?: string } & Record<string, unknown>
    const name = tool.replace(/^mcp__.*__/, '')
    calls.push({ tool: name, args })
    return { result: { content: [{ type: 'text', text: name === 'hesperus_check' ? REPORT : 'done' }] } }
  })
  on('fs.read', (_, e) => ({ value: e.path.endsWith('view.json') ? VIEW : e.path === '/repo/src/a.ts' ? 'one\ntwo\nexport const a = 1\nfour\n' : '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }))

  await $.session.start({ cwd: '/repo', surface: 'vscode', isInteractive: true })
  await clock.advance(1000)

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'row:fn:a' })
  await clock.advance(0)
  expect(calls.filter(c => c.tool === 'hesperus_svg').at(-1)?.args.focus).toBe('fn:a')
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  await ui.unmount()
})
