// App state (docs/03-architecture.md §1): topology + undo history, chosen source,
// selection, failed links and routers, and settings. Results are not stored here; the UI asks
// the engine worker for them whenever the topology or source changes.
import { create } from 'zustand'
import type { RepairMode } from '../engine/simulate'
import type { NodeId, Topology } from '../engine/types'
import * as edit from './edit'
import { EXAMPLES, exampleTopology } from './examples'
import { autoLayout } from './layout'

export type Tool = 'select' | 'add-router' | 'add-link' | 'fail-link' | 'fail-router'

export type Selection = { kind: 'node'; id: NodeId } | { kind: 'link'; id: string } | null

/** One results-table row: destination D, protecting link S–E. */
export interface RowKey {
  dest: NodeId
  via: NodeId
  /** The protected link's id: a bundle gives one row per link (D29). Absent = the first. */
  link?: string
}

/** Is this the row of protection `p` for `dest`? */
export const isRow = (
  row: RowKey | null,
  dest: NodeId,
  p: { protectedLink: { to: NodeId; id: string } },
) =>
  row !== null &&
  row.dest === dest &&
  row.via === p.protectedLink.to &&
  (row.link === undefined || row.link === p.protectedLink.id)

/** Which backup path to draw for the selected row. 'auto' = the first that exists. */
export type BackupKind = 'auto' | 'lfa' | 'rlfa' | 'tilfa'

export interface Notice {
  kind: 'error' | 'warning' | 'info'
  title: string
  lines: string[]
  /** A "back up" notice: the routers it says are back, so failing one again can update it. */
  backUp?: NodeId[]
  /** Offer a link to the YAML format guide (bad imports). */
  yamlHelp?: boolean
}

const HISTORY_LIMIT = 100

export interface AppState {
  topology: Topology
  past: Topology[]
  future: Topology[]
  /** Bumped when a whole new topology is loaded or laid out again, so the canvas re-fits. */
  loadCount: number
  /** The DUT (device under test): the router whose results, details and failure view are shown. */
  source: NodeId | null
  /** Results for every router as the DUT at once (Phase 9.6); `source` is still the one drawn. */
  allSources: boolean
  selection: Selection
  row: RowKey | null
  backup: BackupKind
  /**
   * Links failed by the fail-link tool, in the order they were failed. FRR plans for
   * one failure; with more, the simulation shows which repairs break (D23).
   */
  failedLinks: string[]
  /**
   * Routers failed by the fail-router tool or the right-click menu (Phase 9.3): all
   * their links go down at once, and neighbors use link-protecting backups (D27).
   */
  failedNodes: NodeId[]
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
  /** Guided tour step (TODO backlog), or null when the tour is closed. */
  tour: number | null
  /** The "YAML format" guide is open. */
  yamlGuide: boolean
  /** The per-link view (TODO backlog): null = closed, else the link picked (null = none yet). */
  linkView: { link: string | null } | null
  /**
   * Coverage heat map on the canvas (TODO backlog): colour routers and links by the
   * share of their repairs protected in this repair mode; null = off.
   */
  heatMap: RepairMode | null
  /**
   * What-if diff (TODO backlog): null = closed, else the link whose metric is tried
   * (null = none picked yet). The try is not an edit until "Apply".
   */
  whatIf: { link: string | null } | null

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
  /** Delete this router or link (right-click menu); the selection is kept unless it was it. */
  remove: (s: Exclude<Selection, null>) => void
  /** Lay the routers out again (Phase 9.5), as one undo step. */
  autoLayout: () => void
  undo: () => void
  redo: () => void
  setSource: (id: NodeId) => void
  setAllSources: (on: boolean) => void
  /** Make `source` the DUT and open its row, in one step ("All routers" view). */
  pickRow: (source: NodeId, row: RowKey) => void
  select: (s: Selection) => void
  selectRow: (row: RowKey | null) => void
  /** Pick a row; picking the open row again closes it. */
  toggleRow: (row: RowKey) => void
  /** A click on empty canvas: add a router, or clear the selection and close the open row. */
  tapBackground: (pos: edit.Pos) => void
  setBackup: (b: BackupKind) => void
  setTool: (t: Tool) => void
  /** Fail this link, or restore it if it is already failed. */
  toggleFailedLink: (linkId: string) => void
  /** Fail this router, or bring it back up if it is already down. */
  toggleFailedNode: (id: NodeId) => void
  /** Bring every failed link and router back up. */
  restoreAll: () => void
  setSimMode: (m: RepairMode) => void
  setConverged: (on: boolean) => void
  setSimDest: (d: NodeId | null) => void
  setExtended: (on: boolean) => void
  setNotice: (n: Notice | null) => void
  setTour: (step: number | null) => void
  setYamlGuide: (open: boolean) => void
  /** Open the per-link view on this link (null = open with none picked) and select it. */
  openLinkView: (link: string | null) => void
  closeLinkView: () => void
  setHeatMap: (mode: RepairMode | null) => void
  /** Open the what-if diff on this link (null = open with none picked) and select it. */
  openWhatIf: (link: string | null) => void
  closeWhatIf: () => void
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
    failedLinks: s.failedLinks.filter((id) => links.has(id)),
    failedNodes: s.failedNodes.filter((id) => nodes.has(id)),
    simDest: s.simDest !== null && nodes.has(s.simDest) ? s.simDest : null,
    linkStart: s.linkStart !== null && nodes.has(s.linkStart) ? s.linkStart : null,
    linkView: s.linkView?.link != null && !links.has(s.linkView.link) ? { link: null } : s.linkView,
    whatIf: s.whatIf?.link != null && !links.has(s.whatIf.link) ? { link: null } : s.whatIf,
  }
}

/**
 * Shown when a failed router comes back. The overload bit is only described, not
 * modelled: we show the state before and after, not the timing (Phase 9.3 non-goal).
 */
function backUpNotice(ids: NodeId[]): Notice {
  const many = ids.length > 1
  return {
    kind: 'info',
    backUp: ids,
    title: `${many ? 'Routers' : 'Router'} ${ids.join(', ')} ${many ? 'are' : 'is'} back up`,
    lines: [
      `${many ? 'Their' : 'Its'} links are up again, so traffic goes back to the normal paths in the results table.`,
      'A router that has just rebooted may set the IS-IS overload bit (ISO 10589, RFC 3787) so others keep transit traffic away from it until it is ready. LFA Lab does not model that wait.',
    ],
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
    allSources: false,
    selection: null,
    row: null,
    backup: 'auto',
    failedLinks: [],
    failedNodes: [],
    simMode: 'tilfa',
    converged: false,
    simDest: null,
    settings: { extended: true },
    tool: 'select',
    linkStart: null,
    notice: null,
    tour: null,
    yamlGuide: false,
    linkView: null,
    heatMap: null,
    whatIf: null,

    loadTopology: (t, source, warnings = []) => {
      const placed = edit.withPositions(t)
      commit(placed, {
        source: pickSource(placed, source),
        selection: null,
        row: null,
        failedLinks: [],
        failedNodes: [],
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
        // The new link is last; a parallel link's id has a number (D29).
        selection: { kind: 'link', id: r.topology.links.at(-1)!.id },
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
      const { selection } = get()
      if (selection !== null) get().remove(selection)
    },

    remove: (sel) => {
      const { selection, topology } = get()
      const was = selection?.kind === sel.kind && selection.id === sel.id
      commit(
        sel.kind === 'node'
          ? edit.deleteRouter(topology, sel.id)
          : edit.deleteLink(topology, sel.id),
        was ? { selection: null } : {},
      )
    },

    autoLayout: () => commit(autoLayout(get().topology), { loadCount: get().loadCount + 1 }),

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
    setAllSources: (allSources) => set({ allSources, row: null, backup: 'auto' }),
    pickRow: (source, row) => set({ source, row, backup: 'auto' }),
    // A link clicked on the canvas while the per-link view or the what-if diff is
    // open becomes its link.
    select: (selection) =>
      set({
        selection,
        ...(selection?.kind === 'link' &&
          get().linkView !== null && {
            linkView: { link: selection.id },
          }),
        ...(selection?.kind === 'link' &&
          get().whatIf !== null && {
            whatIf: { link: selection.id },
          }),
      }),
    selectRow: (row) => set({ row, backup: 'auto' }),
    toggleRow: (row) => {
      const open = get().row
      const same =
        open?.dest === row.dest && open.via === row.via && (open.link ?? '') === (row.link ?? '')
      get().selectRow(same ? null : row)
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
    toggleFailedLink: (id) => {
      const down = get().failedLinks
      set({
        failedLinks: down.includes(id) ? down.filter((x) => x !== id) : [...down, id],
        converged: false,
        simDest: null,
      })
    },
    toggleFailedNode: (id) => {
      const { failedNodes: down, notice } = get()
      const back = down.includes(id)
      // Failed again: the "back up" notice must stop saying so.
      const stillUp = notice?.backUp?.filter((x) => x !== id)
      set({
        failedNodes: back ? down.filter((x) => x !== id) : [...down, id],
        converged: false,
        simDest: null,
        ...(back
          ? { notice: backUpNotice([id]) }
          : stillUp !== undefined &&
            stillUp.length < notice!.backUp!.length && {
              notice: stillUp.length > 0 ? backUpNotice(stillUp) : null,
            }),
      })
    },
    restoreAll: () => {
      const routers = get().failedNodes
      set({
        failedLinks: [],
        failedNodes: [],
        converged: false,
        simDest: null,
        ...(routers.length > 0 && { notice: backUpNotice(routers) }),
      })
    },
    setSimMode: (simMode) => set({ simMode, converged: false }),
    setConverged: (converged) => set({ converged }),
    setSimDest: (simDest) => set({ simDest }),
    setExtended: (extended) => set({ settings: { ...get().settings, extended } }),
    setNotice: (notice) => set({ notice }),
    setTour: (tour) => set({ tour }),
    setYamlGuide: (yamlGuide) => set({ yamlGuide }),
    openLinkView: (link) =>
      set({ linkView: { link }, ...(link !== null && { selection: { kind: 'link', id: link } }) }),
    closeLinkView: () => set({ linkView: null }),
    setHeatMap: (heatMap) => set({ heatMap }),
    openWhatIf: (link) =>
      set({ whatIf: { link }, ...(link !== null && { selection: { kind: 'link', id: link } }) }),
    closeWhatIf: () => set({ whatIf: null }),
  }
})

/** Initial state, for tests to reset between cases. */
export const initialState = useStore.getState()
