import { useEffect, useMemo, useState } from 'react'
import { compareBackups } from './engine/compare'
import { convergedWalk, flowWalk, packetWalk, primaryWalk } from './engine/packet-walk'
import { hopLinks, protectionPaths } from './engine/paths'
import { readShareHash } from './io/share-url'
import { isRow, useStore, type Tool } from './state/store'
import type { NodeId } from './engine/types'
import { AllResults } from './ui/AllResults'
import type { Highlight } from './ui/canvas'
import { CompareFailure } from './ui/CompareFailure'
import { CompareView } from './ui/CompareView'
import { CoverageReport } from './ui/CoverageReport'
import { DetailPanel } from './ui/DetailPanel'
import { FailureByDut } from './ui/FailureByDut'
import { FailurePanel } from './ui/FailurePanel'
import { bundles, drawnFlow, pickBackup, spaceMarks, walkMarks, type SpaceKind } from './ui/format'
import { GraphCanvas } from './ui/GraphCanvas'
import { Legend } from './ui/Legend'
import { LinkView } from './ui/LinkView'
import { NoticeBox } from './ui/NoticeBox'
import type { WalkPath } from './ui/PacketWalk'
import { ResultsTable } from './ui/ResultsTable'
import { Sidebar } from './ui/Sidebar'
import { Toolbar } from './ui/Toolbar'
import { Tour } from './ui/Tour'
import { WeakSpots } from './ui/WeakSpots'
import { WhatIf } from './ui/WhatIf'
import { YamlGuide } from './ui/YamlGuide'
import { isFirstVisit, markTourSeen } from './ui/tour-steps'
import { useHeatMap } from './ui/useHeatMap'
import { useResults } from './ui/useResults'
import { useAllModes, useSimulation } from './ui/useSimulation'

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  r: 'add-router',
  l: 'add-link',
  f: 'fail-link',
  d: 'fail-router',
}

/** Keyboard shortcuts, except while typing in a field. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA'))
        return
      const s = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (mod && key === 'y') {
        e.preventDefault()
        s.redo()
      } else if (mod || e.altKey) {
        return
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        e.preventDefault()
        s.deleteSelection()
      } else if (e.key === 'Escape') {
        s.select(null)
        s.selectRow(null)
        s.setTool('select')
      } else if (TOOL_KEYS[key]) {
        s.setTool(TOOL_KEYS[key])
      } else if (key === 'c' && (s.failedLinks.length > 0 || s.failedNodes.length > 0)) {
        s.setConverged(!s.converged)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Open a topology shared by URL (#t=…), on load and when the hash changes. */
function useShareLink() {
  useEffect(() => {
    const load = () => {
      const r = readShareHash(window.location.hash)
      if (r === null) return
      const { loadTopology, setNotice } = useStore.getState()
      if (!r.ok) {
        setNotice({ kind: 'error', title: "Can't open the shared link", lines: r.errors })
        return
      }
      loadTopology(r.topology, r.source, r.warnings)
      // A shared link is a fresh start, not an edit to undo.
      useStore.setState({ past: [], future: [] })
    }
    load()
    window.addEventListener('hashchange', load)
    return () => window.removeEventListener('hashchange', load)
  }, [])
}

/** Offer the guided tour once, on the first visit (TODO backlog). */
function useFirstVisitTour() {
  useEffect(() => {
    if (!isFirstVisit(window.location.hash)) return
    // Seen once it is offered, so a reload doesn't offer it again.
    markTourSeen()
    useStore.getState().setTour(0)
  }, [])
}

export function App() {
  useShortcuts()
  useShareLink()
  useFirstVisitTour()
  const topology = useStore((s) => s.topology)
  const source = useStore((s) => s.source)
  const extended = useStore((s) => s.settings.extended)
  const allSources = useStore((s) => s.allSources)
  const setSource = useStore((s) => s.setSource)
  const pickRow = useStore((s) => s.pickRow)
  const row = useStore((s) => s.row)
  const backup = useStore((s) => s.backup)
  const selectRow = useStore((s) => s.selectRow)
  const toggleRow = useStore((s) => s.toggleRow)
  const setBackup = useStore((s) => s.setBackup)
  const failedLinks = useStore((s) => s.failedLinks)
  const failedNodes = useStore((s) => s.failedNodes)
  const anyFailed = failedLinks.length > 0 || failedNodes.length > 0
  const simMode = useStore((s) => s.simMode)
  const converged = useStore((s) => s.converged)
  const simDest = useStore((s) => s.simDest)
  const setSimDest = useStore((s) => s.setSimDest)
  const { results, loading, error } = useResults(topology, source, extended)
  const sim = useSimulation(topology, source, failedLinks, failedNodes, simMode, extended)
  // The compare view under a failure runs every mode side by side (§10.1).
  const allModes = useAllModes(topology, source, failedLinks, failedNodes, extended)
  const setSimMode = useStore((s) => s.setSimMode)
  const heat = useHeatMap(topology)
  const heatShown = useMemo(
    () => (heat.mode !== null && heat.map ? { map: heat.map, mode: heat.mode } : undefined),
    [heat.mode, heat.map],
  )

  /**
   * A router clicked on the canvas (Phase 9.5): with one DUT, open its row as the
   * destination; in the "All routers" view, make it the DUT (Phase 9.6).
   */
  const routerTap = (id: NodeId) => {
    if (allSources) {
      setSource(id)
      return
    }
    const p = results?.find((r) => r.dest === id)?.protections[0]
    if (!p) return
    selectRow({ dest: id, via: p.protectedLink.to, link: p.protectedLink.id })
    if (anyFailed) setSimDest(id)
  }

  const selected = useMemo(() => {
    if (!results || !row || source === null) return null
    const result = results.find((r) => r.dest === row.dest)
    const protection = result?.protections.find((p) => isRow(row, row.dest, p))
    if (!result || !protection) return null
    const paths = protectionPaths(topology, source, result.dest, protection)
    const comparison = compareBackups(topology, source, result.dest, protection.protectedLink.id, {
      extended,
    })
    return { result, protection, paths, comparison, drawn: pickBackup(paths, backup) }
  }, [results, row, source, topology, backup, extended])

  // Packet walk (TODO backlog): the step belongs to one row, so a new row starts fresh.
  const [php, setPhp] = useState(true)
  // Label stacks drawn on the diagram during the walk; the user can hide them.
  const [walkOnCanvas, setWalkOnCanvas] = useState(true)
  const [walkAt, setWalkAt] = useState<{ key: string; step: number } | null>(null)
  // Walk the primary path or the TI-LFA backup; a row with no TI-LFA path has only the primary.
  const [walkPath, setWalkPath] = useState<WalkPath>('tilfa')
  const hasTilfa = selected?.protection.tilfa.path !== undefined
  const walked: WalkPath = hasTilfa ? walkPath : 'primary'
  const keyFor = (path: WalkPath) =>
    row && source !== null ? `${source}|${row.dest}|${row.via}|${row.link ?? ''}|${path}` : ''
  const walkStep = walkAt !== null && walkAt.key === keyFor(walked) ? walkAt.step : null
  const walk = useMemo(() => {
    if (!selected || source === null) return undefined
    const { to, id } = selected.protection.protectedLink
    const d = selected.result.dest
    return walked === 'tilfa'
      ? packetWalk(topology, source, d, to, { link: id, php })
      : primaryWalk(topology, source, d, to, { link: id, php })
  }, [selected, source, topology, php, walked])
  const setWalkStep = (step: number | null, path: WalkPath = walked) => {
    setWalkAt(step === null ? null : { key: keyFor(path), step })
    // Walking the TI-LFA repair follows the TI-LFA path, so draw that one.
    if (step !== null && path === 'tilfa' && backup !== 'tilfa') setBackup('tilfa')
  }
  /** Switch between the primary and the backup walk; a walk in progress starts again at S. */
  const pickWalkPath = (path: WalkPath) => {
    setWalkPath(path)
    if (walkStep !== null) setWalkStep(0, path)
  }

  // A P / Q / PQ set picked in the detail panel belongs to one row, like the walk step.
  const rowKey = row && source !== null ? `${source}|${row.dest}|${row.via}|${row.link ?? ''}` : ''
  const [spaceAt, setSpaceAt] = useState<{ key: string; kind: SpaceKind } | null>(null)
  const space = spaceAt !== null && spaceAt.key === rowKey ? spaceAt.kind : null
  const setSpace = (kind: SpaceKind | null) =>
    setSpaceAt(kind === null ? null : { key: rowKey, kind })

  // Packet walk of the simulated traffic drawn in the failure view (§8.3). Its step
  // belongs to one flow under one failure; anything else starts fresh.
  const shownFlow = anyFailed && sim.simulation ? drawnFlow(sim.simulation, simDest) : undefined
  const flowKey = shownFlow
    ? JSON.stringify([
        source,
        shownFlow.dest,
        failedLinks,
        failedNodes,
        simMode,
        extended,
        converged,
      ])
    : ''
  // Every link that is down: the failed links plus every link of a failed router.
  const downLinks = useMemo(() => {
    const down = new Set(failedLinks)
    for (const l of topology.links)
      if (failedNodes.includes(l.a) || failedNodes.includes(l.b)) down.add(l.id)
    return down
  }, [topology, failedLinks, failedNodes])
  const [flowAt, setFlowAt] = useState<{ key: string; step: number } | null>(null)
  const flowTrace = useMemo(
    () =>
      !shownFlow
        ? undefined
        : converged
          ? convergedWalk(topology, shownFlow, downLinks, { php })
          : flowWalk(topology, shownFlow, { php }),
    [shownFlow, topology, php, converged, downLinks],
  )
  const flowStep =
    flowTrace && flowAt !== null && flowAt.key === flowKey
      ? Math.min(flowAt.step, flowTrace.hops.length - 1)
      : null
  const setFlowStep = (step: number | null) =>
    setFlowAt(step === null ? null : { key: flowKey, step })

  const highlight = useMemo<Highlight>(() => {
    // Failed links: draw the simulated traffic instead of the selected row (F5).
    // Links are named per hop so a bundle draws the link really used (D29).
    if (anyFailed) {
      const flow = sim.simulation && drawnFlow(sim.simulation, simDest)
      if (!flow) return { source }
      if (converged) {
        return {
          source,
          dest: flow.dest,
          ...(flow.after && {
            final: flow.after,
            finalLinks: hopLinks(topology, flow.after, { avoid: downLinks }),
          }),
          ...walkMarks(flowTrace, flowStep, walkOnCanvas, bundles(topology)),
        }
      }
      return {
        source,
        dest: flow.dest,
        primary: flow.before,
        primaryLinks: hopLinks(topology, flow.before),
        // A repair that drops or loops is still drawn, but nothing flows along it.
        ...(flow.repair && {
          backup: flow.repair,
          ...(flow.repairLinks && { backupLinks: flow.repairLinks }),
          flowing: flow.status === 'repaired',
        }),
        ...walkMarks(flowTrace, flowStep, walkOnCanvas, bundles(topology)),
      }
    }
    if (!selected) return { source }
    const { rlfa, protectedLink, lfa, tilfa } = selected.protection
    const drawn = selected.drawn
    const first =
      drawn?.kind === 'lfa' ? lfa.bestLink : drawn?.kind === 'tilfa' ? tilfa.outLink : undefined
    return {
      source,
      dest: selected.result.dest,
      primary: selected.paths.primary,
      primaryLinks: hopLinks(topology, selected.paths.primary, { first: protectedLink.id }),
      ...(drawn && {
        backup: drawn.path,
        backupLinks: hopLinks(topology, drawn.path, {
          ...(first !== undefined && { first }),
          avoid: [protectedLink.id],
        }),
      }),
      ...spaceMarks(rlfa, space),
      ...walkMarks(walk, walkStep, walkOnCanvas, bundles(topology)),
    }
  }, [
    walk,
    walkStep,
    space,
    flowTrace,
    flowStep,
    walkOnCanvas,
    selected,
    source,
    anyFailed,
    sim.simulation,
    simDest,
    converged,
    topology,
    downLinks,
  ])

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <Toolbar />
      <NoticeBox />
      {/* Phone: canvas, then tools, then results. Wider: tools on the left. */}
      <div className="flex flex-1 flex-col md:grid md:grid-cols-[16rem_minmax(0,1fr)] md:grid-rows-[auto_1fr]">
        <div className="order-1 md:col-start-2 md:row-start-1">
          <div className="h-[50vh] min-h-72 border-b border-slate-200 bg-slate-50 md:h-[55vh] dark:border-slate-700 dark:bg-slate-800">
            <GraphCanvas highlight={highlight} onRouterTap={routerTap} heat={heatShown} />
          </div>
          <Legend heat={heat} />
        </div>
        <Sidebar className="order-2 md:col-start-1 md:row-span-2 md:row-start-1" />
        <main className="order-3 flex min-w-0 flex-col gap-4 p-3 md:col-start-2 md:row-start-2">
          {anyFailed && allSources && <FailureByDut />}
          {anyFailed && source !== null && (
            <FailurePanel
              source={source}
              simulation={sim.simulation}
              error={sim.error}
              {...(flowTrace && { walk: flowTrace })}
              walkStep={flowStep}
              onWalkStep={setFlowStep}
              onPhp={setPhp}
              walkOnCanvas={walkOnCanvas}
              onWalkOnCanvas={setWalkOnCanvas}
            />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {allSources ? (
              <AllResults
                onSelect={(dut, r) => {
                  pickRow(dut, r)
                  if (anyFailed) setSimDest(r.dest)
                }}
              />
            ) : (
              <ResultsTable
                source={source}
                results={results}
                loading={loading}
                error={error}
                onSelect={(r) => {
                  toggleRow(r)
                  if (anyFailed) setSimDest(r.dest)
                }}
              />
            )}
            <div>
              {selected && source !== null ? (
                <DetailPanel
                  source={source}
                  result={selected.result}
                  protection={selected.protection}
                  paths={selected.paths}
                  backup={backup}
                  drawn={selected.drawn?.kind ?? null}
                  onBackup={setBackup}
                  onClose={() => selectRow(null)}
                  {...(walk && !anyFailed && { walk })}
                  walkInFailurePanel={anyFailed}
                  walkStep={walkStep}
                  onWalkStep={(step) => setWalkStep(step)}
                  {...(hasTilfa && { walkPath, onWalkPath: pickWalkPath })}
                  onPhp={setPhp}
                  walkOnCanvas={walkOnCanvas}
                  onWalkOnCanvas={setWalkOnCanvas}
                  space={space}
                  onSpace={setSpace}
                  spacesOff={anyFailed}
                />
              ) : (
                <p className="text-sm text-slate-500">
                  Pick a row in the results table to see its LFA candidates, P and Q spaces, segment
                  list and the numbers behind each check.
                </p>
              )}
            </div>
          </div>
          {anyFailed
            ? shownFlow &&
              allModes &&
              source !== null && (
                <CompareFailure
                  source={source}
                  dest={shownFlow.dest}
                  sims={allModes}
                  mode={simMode}
                  onMode={setSimMode}
                  downLinks={downLinks}
                />
              )
            : selected && (
                <CompareView
                  comparison={selected.comparison}
                  paths={selected.paths}
                  drawn={selected.drawn?.kind ?? null}
                  onBackup={setBackup}
                />
              )}
          <LinkView
            onSelect={(dut, r) => {
              pickRow(dut, r)
              if (anyFailed) setSimDest(r.dest)
            }}
          />
          <WhatIf />
          <WeakSpots />
          <CoverageReport source={source} />
        </main>
      </div>
      <Tour />
      <YamlGuide />
    </div>
  )
}
