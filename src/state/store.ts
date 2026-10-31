// App state (docs/03-architecture.md §1): topology + undo history, chosen source,
// selection, failed links and settings. Results are not stored here; the UI asks
// the engine worker for them whenever the topology or source changes.
import { create } from 'zustand'
import type { RepairMode } from '../engine/simulate'
import type { NodeId, Topology } from '../engine/types'
import * as edit from './edit'
import { EXAMPLES, exampleTopology } from './examples'

export type Tool = 'select' | 'add-router' | 'add-link' | 'fail-link'

export type Selection = { kind: 'node'; id: NodeId } | { kind: 'link'; id: string } | null

/** One results-table row: destination D, protecting link S–E. */
export interface RowKey {
  dest: NodeId
  via: NodeId
}

/** Which backup path to draw for the selected row. 'auto' = the first that exists. */
export type BackupKind = 'auto' | 'lfa' | 'rlfa' | 'tilfa'

export interface Notice {
  kind: 'error' | 'warning' | 'info'
  title: string
  lines: string[]
}

const HISTORY_LIMIT = 100

export interface AppState {
  topology: Topology
  past: Topology[]
  future: Topology[]
  /** Bumped when a whole new topology is loaded, so the canvas re-fits. */
  loadCount: number
  source: NodeId | null
  selection: Selection
  row: RowKey | null
  backup: BackupKind
  /**
   * The link failed by the fail-link tool. One at a time: FRR protects against a
   * single failure (D4), so a second click moves the failure (D22).
   */
  failedLink: string | null
  /** Which FRR methods the routers run in the simulation. */
  simMode: RepairMode
  /** False = traffic on the repair path; true = after the network reconverges. */
  converged: boolean
  /** The simulated destination drawn on the canvas; null = the first affected one. */
  simDest: NodeId | null
  settings: { extended: boolean }
  tool: Tool
  /** First router clicked with the add-link tool. */
  linkStart: NodeId | null
  notice: Notice | null

  loadTopology: (t: Topology, source?: NodeId, warnings?: string[]) => void
  loadExample: (key: string) => void
  addRouter: (pos: edit.Pos) => void
  moveRouter: (id: NodeId, pos: edit.Pos) => void
  linkClick: (id: NodeId) => void
  /** Add a link from a to b (keyboard path of the add-link tool). Returns an error or null. */
  addLinkBetween: (a: NodeId, b: NodeId) => string | null
  updateRouter: (id: NodeId, patch: edit.RouterPatch) => string | null
  updateLink: (id: string, patch: edit.LinkPatch) => string | null
  updateTopology: (patch: edit.TopologyPatch) => string | null
  deleteSelection: () => void
  undo: () => void
  redo: () => void
  setSource: (id: NodeId) => void
  select: (s: Selection) => void
  selectRow: (row: RowKey | null) => void
  /** Pick a row; picking the open row again closes it. */
  toggleRow: (row: RowKey) => void
  /** A click on empty canvas: add a router, or clear the selection and close the open row. */
  tapBackground: (pos: edit.Pos) => void
  setBackup: (b: BackupKind) => void
  setTool: (t: Tool) => void
  /** Fail this link (restoring any other); the failed link again, or null, restores it. */
  failLink: (linkId: string | null) => void
  setSimMode: (m: RepairMode) => void
  setConverged: (on: boolean) => void
  setSimDest: (d: NodeId | null) => void
  setExtended: (on: boolean) => void
  setNotice: (n: Notice | null) => void
}

/** Keep the chosen source if it still exists, else 'S', else the first router. */
function pickSource(t: Topology, wanted: NodeId | null | undefined): NodeId | null {
  const ids = t.nodes.map((n) => n.id)
  if (wanted && ids.includes(wanted)) return wanted
  if (ids.includes('S')) return 'S'
  return ids[0] ?? null
}

/** Drop selection, row and failed links that point at routers or links that are gone. */
function tidy(s: AppState, t: Topology): Partial<AppState> {
  const nodes = new Set(t.nodes.map((n) => n.id))
  const links = new Set(t.links.map((l) => l.id))
  const sel = s.selection
  const selOk = sel === null || (sel.kind === 'node' ? nodes.has(sel.id) : links.has(sel.id))
  const source = pickSource(t, s.source)
  const rowOk = s.row !== null && s.source === source && nodes.has(s.row.dest)
  return {
    source,
    selection: selOk ? sel : null,
    row: rowOk ? s.row : null,
    failedLink: s.failedLink !== null && links.has(s.failedLink) ? s.failedLink : null,
    simDest: s.simDest !== null && nodes.has(s.simDest) ? s.simDest : null,
    linkStart: s.linkStart !== null && nodes.has(s.linkStart) ? s.linkStart : null,
  }
}

const first = EXAMPLES[1]!

export const useStore = create<AppState>()((set, get) => {
  /** Apply an edit: the old topology goes on the undo stack. */
  const commit = (t: Topology, extra: Partial<AppState> = {}) => {
    const s = get()
    if (t === s.topology) return
    set({
      ...tidy(s, t),
      topology: t,
      past: [...s.past, s.topology].slice(-HISTORY_LIMIT),
      future: [],
      ...extra,
    })
  }
  const result = (r: edit.EditResult): string | null => {
    if (!r.ok) return r.error
    commit(r.topology)
    return null
  }

  return {
    topology: edit.withPositions(exampleTopology(first)),
    past: [],
    future: [],
    loadCount: 0,
    source: first.source,
    selection: null,
    row: null,
    backup: 'auto',
    failedLink: null,
    simMode: 'tilfa',
    converged: false,
    simDest: null,
    settings: { extended: true },
    tool: 'select',
    linkStart: null,
    notice: null,

    loadTopology: (t, source, warnings = []) => {
      const placed = edit.withPositions(t)
      commit(placed, {
        source: pickSource(placed, source),
        selection: null,
        row: null,
        failedLink: null,
        converged: false,
        simDest: null,
        linkStart: null,
        loadCount: get().loadCount + 1,
        notice:
          warnings.length > 0
            ? { kind: 'warning', title: 'Loaded with warnings', lines: warnings }
            : null,
      })
    },

    loadExample: (key) => {
      const ex = EXAMPLES.find((e) => e.key === key)
      if (ex) get().loadTopology(exampleTopology(ex), ex.source)
    },

    addRouter: (pos) => {
      const { topology, id } = edit.addRouter(get().topology, pos)
      commit(topology, { selection: { kind: 'node', id } })
    },

    moveRouter: (id, pos) => {
      const node = get().topology.nodes.find((n) => n.id === id)
      if (node?.pos && Math.round(pos.x) === node.pos.x && Math.round(pos.y) === node.pos.y) return
      commit(edit.moveRouter(get().topology, id, pos))
    },

    linkClick: (id) => {
      const start = get().linkStart
      if (start === null || start === id) {
        set({ linkStart: start === id ? null : id })
        return
      }
      const error = get().addLinkBetween(start, id)
      if (error !== null) {
        set({ linkStart: null, notice: { kind: 'error', title: "Can't add link", lines: [error] } })
      }
    },

    addLinkBetween: (a, b) => {
      const r = edit.addLink(get().topology, a, b)
      if (!r.ok) return r.error
      commit(r.topology, {
        linkStart: null,
        selection: { kind: 'link', id: edit.linkId(a, b) },
        notice: null,
      })
      return null
    },

    updateRouter: (id, patch) => {
      const r = edit.updateRouter(get().topology, id, patch)
      if (!r.ok) return r.error
      const s = get()
      const newId = patch.id?.trim()
      const renamed = newId !== undefined && newId !== id
      commit(r.topology, {
        // Follow the rename, so the panel and source stay on this router.
        ...(renamed && s.selection?.kind === 'node' && s.selection.id === id
          ? { selection: { kind: 'node', id: newId } }
          : {}),
        ...(renamed && s.source === id ? { source: newId, row: null } : {}),
      })
      return null
    },

    updateLink: (id, patch) => result(edit.updateLink(get().topology, id, patch)),
    updateTopology: (patch) => result(edit.updateTopology(get().topology, patch)),

    deleteSelection: () => {
      const { selection, topology } = get()
      if (selection === null) return
      commit(
        selection.kind === 'node'
          ? edit.deleteRouter(topology, selection.id)
          : edit.deleteLink(topology, selection.id),
        { selection: null },
      )
    },

    undo: () => {
      const s = get()
      const prev = s.past.at(-1)
      if (prev === undefined) return
      set({
        ...tidy(s, prev),
        topology: prev,
        past: s.past.slice(0, -1),
        future: [s.topology, ...s.future],
      })
    },

    redo: () => {
      const s = get()
      const next = s.future[0]
      if (next === undefined) return
      set({
        ...tidy(s, next),
        topology: next,
        past: [...s.past, s.topology],
        future: s.future.slice(1),
      })
    },

    setSource: (id) => set({ source: id, row: null, backup: 'auto' }),
    select: (selection) => set({ selection }),
    selectRow: (row) => set({ row, backup: 'auto' }),
    toggleRow: (row) => {
      const open = get().row
      get().selectRow(open?.dest === row.dest && open.via === row.via ? null : row)
    },
    tapBackground: (pos) => {
      const s = get()
      if (s.tool === 'add-router') s.addRouter(pos)
      else set({ selection: null, row: null, backup: 'auto' })
      // An unfinished add-link click is dropped too.
      if (s.linkStart !== null) s.setTool(s.tool)
    },
    setBackup: (backup) => set({ backup }),
    setTool: (tool) => set({ tool, linkStart: null }),
    failLink: (id) =>
      set({
        failedLink: id === get().failedLink ? null : id,
        converged: false,
        simDest: null,
      }),
    setSimMode: (simMode) => set({ simMode, converged: false }),
    setConverged: (converged) => set({ converged }),
    setSimDest: (simDest) => set({ simDest }),
    setExtended: (extended) => set({ settings: { ...get().settings, extended } }),
    setNotice: (notice) => set({ notice }),
  }
})

/** Initial state, for tests to reset between cases. */
export const initialState = useStore.getState()
