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
  on('process.run', () => ({ value: { exitCode: 1, stdout: REPORT, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.read', () => ({ value: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>Network</title></svg>' }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: 'src/y.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(5000)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Network 2/ }))?.text).toContain('Network 2')
    expect((await ui.find({ type: 'Text', text: /src\/x\.ts:3/ }))?.text).toContain('core may not reach the network')
    if (surface !== 'terminal') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  }
})
