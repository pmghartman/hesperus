/** One finding of `hesperus check --json`. */
export type HesperusFinding = {
  rule: 'boundary-denied' | 'new-crossing' | 'new-dependency'
  severity: 'error' | 'warning' | 'info'
  message: string
  boundary: string
  path?: string
  line?: number
  local: string
  external: string
  key: string
}

/** The latest lint, as the pane and the status line show it. */
export type HesperusReport = {
  at: number
  summary: { errors: number; warnings: number; info: number; removed: number }
  boundaries: Record<string, { out: number; in: number }>
  findings: HesperusFinding[]
  removed: string[]
  stale?: string
  /** The CLI could not run or index: what it said. */
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    hesperus: {
      report: Shaped<HesperusReport | null>
      /** The boundary overview as SVG markup, or empty before the first lint. */
      view: Shaped<string>
      /** What runs now (`indexing`), or empty. */
      busy: string
    }
  }
}
