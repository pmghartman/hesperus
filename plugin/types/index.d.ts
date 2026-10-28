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

/** One drawn box of `.hesperus/view.json` (the CLI's ViewBox). */
export type HesperusBox = {
  id: string
  name: string
  kind: string
  parent?: string
  /** The nearest open box it sits in. */
  under?: string
  container: boolean
  expandable: boolean
  open: boolean
  /** Where it sits in the picture, in character cells. */
  x: number
  y: number
  w: number
  h: number
  path?: string
  /** 1-based. */
  line?: number
  severity?: 'error' | 'warning' | 'info'
  notes?: string[]
}

/** One wire of the picture, its bends in cells; `may` when no call beneath it is resolved. */
export type HesperusWire = { from: string; to: string; points: { x: number; y: number }[]; may: boolean; severity?: 'error' | 'warning' | 'info' }

/** The picture last drawn: which boxes are open, which is outlined, every box and wire, and its extent in cells. */
export type HesperusView = {
  open: { id: string; name: string; kind: string; under?: string }[]
  focus?: string
  boxes: HesperusBox[]
  wires: HesperusWire[]
  width: number
  height: number
  omitted: number
}

/** Where the person dragged boxes to: cells right and down from where the layout put each, by id. */
export type HesperusMoves = Record<string, [number, number]>

/** The map Client's props. */
export type HesperusMapProps = { boxes: HesperusBox[]; wires: HesperusWire[]; width: number; height: number; moves: HesperusMoves; selected?: string }

/** What the map posts to the hooks module: the explorer's asks, and a box dragged somewhere. */
export type HesperusMapPost = HesperusExplorerPost | { type: 'move'; id: string; dx: number; dy: number }

/** What the person asked to see: the boxes open (absent, the overview's) and the one selected. */
export type HesperusAsk = { open?: string[]; focus?: string }

/** The selected box's source, a few lines around where it is defined. */
export type HesperusPeek = { id: string; path: string; line: number; source: string }

/** One row of the explorer, as the pane hands it to the Client module. */
export type HesperusRow = {
  id: string
  name: string
  kind: string
  depth: number
  expandable: boolean
  open: boolean
  severity?: 'error' | 'warning' | 'info'
  /** Where it is defined, `path:line`, when it has a source. */
  at?: string
}

/** The explorer Client's props. */
export type HesperusExplorerProps = { rows: HesperusRow[]; selected?: string }

/** What the explorer posts to the hooks module. */
export type HesperusExplorerPost = { type: 'select'; id: string } | { type: 'toggle'; id: string } | { type: 'open'; id: string };

declare module 'claude-code' {
  interface PluginState {
    hesperus: {
      report: Shaped<HesperusReport | null>
      /** The boundary overview as SVG markup, or empty before the first lint. */
      view: Shaped<string>
      /** What runs now (`indexing`, `drawing`), or empty. */
      busy: string
      /** The boxes of the picture in `view`, or null before the first draw. */
      boxes: Shaped<HesperusView | null>
      /** The view the person asked for in the explorer. */
      ask: Shaped<HesperusAsk>
      /** The selected box's source, or null. */
      peek: Shaped<HesperusPeek | null>
      /** Where the person dragged boxes to, kept across sessions in the store. */
      moves: Shaped<HesperusMoves>
    }
  }
}
