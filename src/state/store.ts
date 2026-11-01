// App state (docs/03-architecture.md §1): topology + undo history, chosen source,
// selection, failed links and routers, and settings. Results are not stored here; the UI asks
// the engine worker for them whenever the topology or source changes.
import { create } from 'zustand'
import type { RepairMode } from '../engine/simulate'
import { flexTopology } from '../engine/flex-algo'
import { levelTopology, mergeLevel, type LevelKey } from '../engine/levels'
import type { NodeId, Topology } from '../engine/types'
import type { TryIt } from '../learn/links'
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

/** What the what-if diff tries: a link's metric, or a router's overload bit (D47). */
export type WhatIfTarget =
  { kind: 'metric'; link: string | null } | { kind: 'overload'; node: NodeId | null }

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
  /** The Learn guide (D60): open or not, and the chapter it shows (kept when closed). */
  learn: { open: boolean; slug: string }
  /** The random topology generator dialog is open (D50). */
  generator: boolean
  /** The FRR `show isis database detail` import dialog is open (D52). */
  frrImport: boolean
  /**
   * Multi-level IS-IS (D56): while one level is shown, `topology` is that level and
   * `full` the whole network; edits are merged back when the view changes.
   */
  level: { key: LevelKey; full: Topology } | null
  /**
   * Flex-Algo (D58): while one algorithm is shown, `topology` is its topology (its
   * routers, links and metric) and `full` the network. Read-only: edits are refused.
   */
  algo: { algo: number; full: Topology } | null
  /** The per-link view (TODO backlog): null = closed, else the link picked (null = none yet). */
  linkView: { link: string | null } | null
  /**
   * Coverage heat map on the canvas (TODO backlog): colour routers and links by the
   * share of their repairs protected in this repair mode; null = off.
   */
  heatMap: RepairMode | null
  /**
   * What-if diff (TODO backlog): null = closed, else what is tried: a new metric on a
   * link, or flipping a router's overload bit (D47). The link or router is null when
   * none is picked yet. The try is not an edit until "Apply".
   */
  whatIf: WhatIfTarget | null

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
  /** Make exactly these links and routers the ones down (weakest spots: "Fail it"). */
  failOnly: (failed: { links?: string[]; nodes?: NodeId[] }) => void
  setSimMode: (m: RepairMode) => void
  setConverged: (on: boolean) => void
  setSimDest: (d: NodeId | null) => void
  setExtended: (on: boolean) => void
  setNotice: (n: Notice | null) => void
  setTour: (step: number | null) => void
  setYamlGuide: (open: boolean) => void
  /** Open or close the Learn guide, optionally at a chapter. */
  setLearn: (open: boolean, slug?: string) => void
  /** A "Try it" link in the guide: load the example, pick the row, fail things (D60). */
  tryIt: (t: TryIt) => void
  setGenerator: (open: boolean) => void
  setFrrImport: (open: boolean) => void
  /** Show one IS-IS level (D56), or the whole network (null). Clears undo and failures. */
  setLevel: (key: LevelKey | null) => void
  /** Show one Flex-Algo's topology (D58), or algorithm 0 (null). */
  setAlgo: (algo: number | null) => void
  /** Fail every link of router `node` on this LAN (its interface goes down), or restore them (D55). */
  toggleLanInterface: (lan: string, node: NodeId) => void
  /** Open the per-link view on this link (null = open with none picked) and select it. */
  openLinkView: (link: string | null) => void
  closeLinkView: () => void
  setHeatMap: (mode: RepairMode | null) => void
  /** Open the what-if diff on this link (null = open with none picked) and select it. */
  openWhatIf: (link: string | null) => void
  /** Open the what-if diff on this router's overload bit (null = none picked) and select it. */
  openOverloadWhatIf: (node: NodeId | null) => void
  closeWhatIf: () => void
}

/** Keep the chosen source if it still exists, else 'S', else the first router. */
/** The whole network: the level view's edits merged back when one is shown (D56). */
export function fullTopology(s: Pick<AppState, 'topology' | 'level' | 'algo'>): Topology {
  if (s.algo !== null) return s.algo.full
  return s.level === null ? s.topology : mergeLevel(s.level.full, s.level.key, s.topology)
}

const ALGO_READ_ONLY =
  'This is a Flex-Algo view: its metrics come from the links’ TE metric or delay. Pick “Algorithm 0” in the sidebar to edit the network.'

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
    whatIf:
      s.whatIf?.kind === 'metric' && s.whatIf.link !== null && !links.has(s.whatIf.link)
        ? { kind: 'metric', link: null }
        : s.whatIf?.kind === 'overload' && s.whatIf.node !== null && !nodes.has(s.whatIf.node)
          ? { kind: 'overload', node: null }
          : s.whatIf,
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
      "A router that has just rebooted may set the IS-IS overload bit (ISO 10589, RFC 3787) so others keep transit traffic away from it until it is ready. LFA Lab does not model that wait; to see its effect, tick the router's overload bit in its properties.",
    ],
  }
}

const first = EXAMPLES[1]!

export const useStore = create<AppState>()((set, get) => {
  /** Apply an edit: the old topology goes on the undo stack. */
  const commit = (t: Topology, extra: Partial<AppState> = {}) => {
    const s = get()
    if (t === s.topology) return
    // A Flex-Algo view is read-only (D58).
    if (s.algo !== null) {
      set({ notice: { kind: 'error', title: 'Read-only view', lines: [ALGO_READ_ONLY] } })
      return
    }
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
    if (get().algo !== null) return ALGO_READ_ONLY
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
    learn: { open: false, slug: '00-start-here' },
    generator: false,
    frrImport: false,
    level: null,
    algo: null,
    linkView: null,
    heatMap: null,
    whatIf: null,

    loadTopology: (t, source, warnings = []) => {
      const placed = edit.withPositions(t)
      // Leaving a level view: undo should bring back the whole network, not the view.
      const st = get()
      if (st.level !== null || st.algo !== null)
        set({ topology: fullTopology(st), level: null, algo: null })
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
      const algo = get().algo
      if (algo !== null) {
        // Moving a router changes no metric, so it is allowed in a Flex-Algo view (D58).
        set({
          topology: edit.moveRouter(get().topology, id, pos),
          algo: { ...algo, full: edit.moveRouter(algo.full, id, pos) },
        })
        return
      }
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
    // open becomes its link; a router clicked while the overload what-if is open
    // becomes its router.
    select: (selection) =>
      set({
        selection,
        ...(selection?.kind === 'link' &&
          get().linkView !== null && {
            linkView: { link: selection.id },
          }),
        ...(selection?.kind === 'link' &&
          get().whatIf?.kind === 'metric' && {
            whatIf: { kind: 'metric', link: selection.id },
          }),
        ...(selection?.kind === 'node' &&
          get().whatIf?.kind === 'overload' && {
            whatIf: { kind: 'overload', node: selection.id },
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
    failOnly: ({ links = [], nodes = [] }) =>
      set({ failedLinks: links, failedNodes: nodes, converged: false, simDest: null }),
    setSimMode: (simMode) => set({ simMode, converged: false }),
    setConverged: (converged) => set({ converged }),
    setSimDest: (simDest) => set({ simDest }),
    setExtended: (extended) => set({ settings: { ...get().settings, extended } }),
    setNotice: (notice) => set({ notice }),
    setTour: (tour) => set({ tour }),
    setYamlGuide: (yamlGuide) => set({ yamlGuide }),
    setLearn: (open, slug) => set({ learn: { open, slug: slug ?? get().learn.slug } }),
    tryIt: (t) => {
      const ex = EXAMPLES.find((e) => e.file === t.file)
      if (!ex) return
      get().loadExample(ex.key)
      const st = get()
      if (t.source !== undefined && st.topology.nodes.some((n) => n.id === t.source))
        st.setSource(t.source)
      if (t.row) get().selectRow(t.row)
      if (t.failLinks.length > 0 || t.failNodes.length > 0) {
        get().failOnly({ links: t.failLinks, nodes: t.failNodes })
        // The failure view draws the row's destination (as a row click does then).
        if (t.row) get().setSimDest(t.row.dest)
      }
      if (t.mode) get().setSimMode(t.mode)
    },
    setGenerator: (generator) => set({ generator }),
    setFrrImport: (frrImport) => set({ frrImport }),
    setAlgo: (algo) => {
      const st = get()
      if (algo === (st.algo?.algo ?? null)) return
      const full = fullTopology(st)
      const t = algo === null ? full : flexTopology(full, algo)
      set({
        topology: t,
        algo: algo === null ? null : { algo, full },
        level: null,
        past: algo === null ? st.past : [],
        future: algo === null ? st.future : [],
        failedLinks: [],
        failedNodes: [],
        converged: false,
        simDest: null,
        selection: null,
        row: null,
        source: pickSource(t, st.source),
        loadCount: st.loadCount + 1,
      })
    },
    setLevel: (key) => {
      const st = get()
      if (st.algo !== null) get().setAlgo(null)
      const full = fullTopology(get())
      if (key === st.level?.key || (key === null && st.level === null)) return
      const t = key === null ? full : levelTopology(full, key)
      set({
        topology: t,
        level: key === null ? null : { key, full },
        // A view is not an edit: start its undo history afresh.
        past: [],
        future: [],
        failedLinks: [],
        failedNodes: [],
        converged: false,
        simDest: null,
        selection: null,
        row: null,
        source: pickSource(t, st.source),
        loadCount: st.loadCount + 1,
      })
    },
    toggleLanInterface: (lan, node) => {
      const st = get()
      const ids = st.topology.links
        .filter((l) => l.lan === lan && (l.a === node || l.b === node))
        .map((l) => l.id)
      const allDown = ids.every((id) => st.failedLinks.includes(id))
      set({
        failedLinks: allDown
          ? st.failedLinks.filter((id) => !ids.includes(id))
          : [...st.failedLinks, ...ids.filter((id) => !st.failedLinks.includes(id))],
        converged: false,
        simDest: null,
      })
    },
    openLinkView: (link) =>
      set({ linkView: { link }, ...(link !== null && { selection: { kind: 'link', id: link } }) }),
    closeLinkView: () => set({ linkView: null }),
    setHeatMap: (heatMap) => set({ heatMap }),
    openWhatIf: (link) =>
      set({
        whatIf: { kind: 'metric', link },
        ...(link !== null && { selection: { kind: 'link', id: link } }),
      }),
    openOverloadWhatIf: (node) =>
      set({
        whatIf: { kind: 'overload', node },
        ...(node !== null && { selection: { kind: 'node', id: node } }),
      }),
    closeWhatIf: () => set({ whatIf: null }),
  }
})

/** Initial state, for tests to reset between cases. */
export const initialState = useStore.getState()
