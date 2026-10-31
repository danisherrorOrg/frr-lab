import { useEffect, useMemo } from 'react'
import { protectionPaths } from './engine/paths'
import { readShareHash } from './io/share-url'
import { useStore, type Tool } from './state/store'
import type { Highlight } from './ui/canvas'
import { CoverageReport } from './ui/CoverageReport'
import { DetailPanel } from './ui/DetailPanel'
import { FailurePanel } from './ui/FailurePanel'
import { drawnFlow, pickBackup } from './ui/format'
import { GraphCanvas } from './ui/GraphCanvas'
import { Legend } from './ui/Legend'
import { NoticeBox } from './ui/NoticeBox'
import { ResultsTable } from './ui/ResultsTable'
import { Sidebar } from './ui/Sidebar'
import { Toolbar } from './ui/Toolbar'
import { useResults } from './ui/useResults'
import { useSimulation } from './ui/useSimulation'

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  r: 'add-router',
  l: 'add-link',
  f: 'fail-link',
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
      } else if (key === 'c' && s.failedLink !== null) {
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

export function App() {
  useShortcuts()
  useShareLink()
  const topology = useStore((s) => s.topology)
  const source = useStore((s) => s.source)
  const extended = useStore((s) => s.settings.extended)
  const row = useStore((s) => s.row)
  const backup = useStore((s) => s.backup)
  const selectRow = useStore((s) => s.selectRow)
  const toggleRow = useStore((s) => s.toggleRow)
  const setBackup = useStore((s) => s.setBackup)
  const failedLink = useStore((s) => s.failedLink)
  const simMode = useStore((s) => s.simMode)
  const converged = useStore((s) => s.converged)
  const simDest = useStore((s) => s.simDest)
  const setSimDest = useStore((s) => s.setSimDest)
  const { results, loading, error } = useResults(topology, source, extended)
  const sim = useSimulation(topology, source, failedLink, simMode, extended)

  const selected = useMemo(() => {
    if (!results || !row || source === null) return null
    const result = results.find((r) => r.dest === row.dest)
    const protection = result?.protections.find((p) => p.protectedLink.to === row.via)
    if (!result || !protection) return null
    const paths = protectionPaths(topology, source, result.dest, protection)
    return { result, protection, paths, drawn: pickBackup(paths, backup) }
  }, [results, row, source, topology, backup])

  const highlight = useMemo<Highlight>(() => {
    // A failed link: draw the simulated traffic instead of the selected row (F5).
    if (failedLink !== null) {
      const flow = sim.simulation && drawnFlow(sim.simulation, simDest)
      if (!flow) return { source }
      if (converged) return { source, dest: flow.dest, ...(flow.after && { final: flow.after }) }
      return {
        source,
        dest: flow.dest,
        primary: flow.before,
        ...(flow.repair && { backup: flow.repair, flowing: true }),
      }
    }
    if (!selected) return { source }
    const { rlfa } = selected.protection
    return {
      source,
      dest: selected.result.dest,
      primary: selected.paths.primary,
      ...(selected.drawn && { backup: selected.drawn.path }),
      pSpace: rlfa.extended ? rlfa.extPSpace : rlfa.pSpace,
      qSpace: rlfa.qSpace,
      ...(rlfa.needed && rlfa.best !== undefined && { pq: rlfa.best }),
    }
  }, [selected, source, failedLink, sim.simulation, simDest, converged])

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <Toolbar />
      <NoticeBox />
      {/* Phone: canvas, then tools, then results. Wider: tools on the left. */}
      <div className="flex flex-1 flex-col md:grid md:grid-cols-[16rem_minmax(0,1fr)] md:grid-rows-[auto_1fr]">
        <div className="order-1 md:col-start-2 md:row-start-1">
          <div className="h-[50vh] min-h-72 border-b border-slate-200 bg-slate-50 md:h-[55vh] dark:border-slate-700 dark:bg-slate-800">
            <GraphCanvas highlight={highlight} />
          </div>
          <Legend />
        </div>
        <Sidebar className="order-2 md:col-start-1 md:row-span-2 md:row-start-1" />
        <main className="order-3 flex min-w-0 flex-col gap-4 p-3 md:col-start-2 md:row-start-2">
          {failedLink !== null && source !== null && (
            <FailurePanel source={source} simulation={sim.simulation} error={sim.error} />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <ResultsTable
              source={source}
              results={results}
              loading={loading}
              error={error}
              row={row}
              onSelect={(r) => {
                toggleRow(r)
                if (failedLink !== null) setSimDest(r.dest)
              }}
            />
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
                />
              ) : (
                <p className="text-sm text-slate-500">
                  Pick a row in the results table to see its LFA candidates, P and Q spaces, segment
                  list and the numbers behind each check.
                </p>
              )}
            </div>
          </div>
          <CoverageReport source={source} />
        </main>
      </div>
    </div>
  )
}
