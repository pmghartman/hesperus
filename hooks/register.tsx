// Hesperus beside the chat: a pane with the boundary map and the findings, re-drawn after every edit
// the agent makes, and a status line count. The agent reads the same facts over MCP (.mcp.json).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { HesperusFinding, HesperusReport } from '../types'

const PANE = 'hesperus'
const report = atom({ plugin: 'hesperus', key: 'report' } as const, null as HesperusReport | null, { shape: 'report-1' })
const view = atom({ plugin: 'hesperus', key: 'view' } as const, '', { shape: 'view-1' })
const busy = atom({ plugin: 'hesperus', key: 'busy' } as const, '')

/** Tools whose run may change source files. */
const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'])
const LABEL: Record<string, string> = {
  database: 'Database', network: 'Network', ai: 'AI models', cloud: 'Cloud & SaaS', messaging: 'Queues',
  filesystem: 'Filesystem', process: 'Processes', environment: 'Environment',
}
const COLOR = { error: 'red', warning: 'yellow', info: 'blue' } as const

const empty = (error: string): HesperusReport => ({ at: Date.now(), summary: { errors: 0, warnings: 0, info: 0, removed: 0 }, boundaries: {}, findings: [], removed: [], error })

let timer: { cancel: () => void } | undefined
let running = false
let again = false

const cli = ($: EngineInterface) => `${$.plugin.root}/vscode/out/cli.js`

/** Re-index and lint the session's repo, then redraw. One run at a time; a run asked for meanwhile follows. */
async function refresh($: EngineInterface): Promise<void> {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    await update($, busy, () => 'indexing')
    $.ui.status('hesperus: indexing…')
    const cwd = await $.session.cwd()
    const r = await $.process.run(['node', cli($), 'check', '.', '--index', '--json', '--svg'], { cwd, timeoutMs: 600000 })
    let next: HesperusReport
    if (r.exitCode === 2 || !r.stdout.trim()) next = empty(r.stderr.trim().split('\n').pop() ?? 'hesperus check failed')
    else next = { at: Date.now(), ...(JSON.parse(r.stdout) as Omit<HesperusReport, 'at'>) }
    await update($, report, () => next)
    const svg = await $.fs.read('.hesperus/view.svg').catch(() => '')
    await update($, view, () => svg)
    const { errors, warnings } = next.summary
    $.ui.status(next.error ? 'hesperus: not built' : errors || warnings ? `hesperus: ${errors} errors, ${warnings} new` : 'hesperus: clean')
  } catch (e) {
    await update($, report, () => empty(e instanceof Error ? e.message : String(e)))
    $.ui.status('hesperus: failed')
  } finally {
    running = false
    await update($, busy, () => '')
    if (again) {
      again = false
      void refresh($)
    }
  }
}

/** Edits come in bursts; index once the burst has settled. */
function schedule($: EngineInterface, ms: number): void {
  timer?.cancel()
  timer = $.clock.after(ms, () => void refresh($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hesperus',
      description: 'Open the boundary map; `accept` marks every current crossing as reviewed',
      argumentHint: '[accept]',
    })
    void $.ui.open({ id: PANE, title: 'Hesperus' })
    schedule($, 100)
    return next(e)
  })

  on('command.run', { command: 'hesperus' }, async ($, e) => {
    if (e.args.trim() === 'accept') {
      const cwd = await $.session.cwd()
      const r = await $.process.run(['node', cli($), 'check', '.', '--accept'], { cwd, timeoutMs: 600000 })
      schedule($, 100)
      return { text: r.exitCode === 0 ? r.stdout.trim() : `hesperus: ${r.stderr.trim()}` }
    }
    await $.ui.open({ id: PANE, title: 'Hesperus' })
    schedule($, 100)
    return { text: 'Hesperus pane opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (EDITS.has(String(e.tool)) && ran.deny === undefined) schedule($, e.tool === 'Bash' ? 3000 : 1500)
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, report)
    const b = await read($, busy)
    const findings = r?.findings ?? []
    const rows = Math.max(3, (e.viewport?.rows ?? 30) - 6)
    const head = r === null
      ? <Text dimColor>{b ? 'Indexing…' : 'No report yet. /hesperus runs one.'}</Text>
      : r.error
        ? <Text color="red">{r.error}</Text>
        : <Text>
            {Object.entries(r.boundaries).map(([k, n]) => `${LABEL[k] ?? k} ${n.out + n.in}`).join(' · ') || 'No boundary crossings.'}
            {b ? '  (indexing…)' : ''}
            {r.stale ? '  stale' : ''}
          </Text>
    const line = (f: HesperusFinding) => (
      <Text color={COLOR[f.severity]}>
        {f.path ? `${f.path}:${f.line ?? 1} ` : ''}{f.message}
      </Text>
    )
    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          {head}
          {findings.slice(0, rows).map(line)}
          {findings.length > rows && <Text dimColor>{`… ${findings.length - rows} more`}</Text>}
        </Box>
      )
    }
    const { Svg } = $.ui.resolve(e)
    const svg = await read($, view)
    return (
      <Box flexDirection="column">
        {head}
        {svg !== '' && <Svg source={svg} alt="The repo's folders and files on the left, each boundary it reaches as a box on the right; red marks a denied call, amber a call not yet reviewed." isInteractive />}
        {findings.slice(0, rows).map(line)}
        {findings.length > rows && <Text dimColor>{`… ${findings.length - rows} more`}</Text>}
      </Box>
    )
  })
}
