import { useEffect, useMemo } from 'react'
import { protectionPaths } from './engine/paths'
import { useStore } from './state/store'
import { DetailPanel } from './ui/DetailPanel'
import { pickBackup } from './ui/format'
import type { Highlight } from './ui/canvas'
import { GraphCanvas } from './ui/GraphCanvas'
import { Legend } from './ui/Legend'
import { NoticeBox } from './ui/NoticeBox'
import { ResultsTable } from './ui/ResultsTable'
import { Sidebar } from './ui/Sidebar'
import { Toolbar } from './ui/Toolbar'
import { useResults } from './ui/useResults'

/** Undo / redo / delete / escape from the keyboard, except while typing in a field. */
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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        e.preventDefault()
        s.deleteSelection()
      } else if (e.key === 'Escape') {
        s.select(null)
        s.setTool('select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function App() {
  useShortcuts()
  const topology = useStore((s) => s.topology)
  const source = useStore((s) => s.source)
  const extended = useStore((s) => s.settings.extended)
  const row = useStore((s) => s.row)
  const backup = useStore((s) => s.backup)
  const selectRow = useStore((s) => s.selectRow)
  const setBackup = useStore((s) => s.setBackup)
  const { results, loading, error } = useResults(topology, source, extended)

  const selected = useMemo(() => {
    if (!results || !row || source === null) return null
    const result = results.find((r) => r.dest === row.dest)
    const protection = result?.protections.find((p) => p.protectedLink.to === row.via)
    if (!result || !protection) return null
    const paths = protectionPaths(topology, source, result.dest, protection)
    return { result, protection, paths, drawn: pickBackup(paths, backup) }
  }, [results, row, source, topology, backup])

  const highlight = useMemo<Highlight>(() => {
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
  }, [selected, source])

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <Toolbar />
      <NoticeBox />
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="h-[55vh] min-h-72 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            <GraphCanvas highlight={highlight} />
          </div>
          <Legend />
          <div className="grid gap-4 p-3 lg:grid-cols-2">
            <ResultsTable
              source={source}
              results={results}
              loading={loading}
              error={error}
              row={row}
              onSelect={selectRow}
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
                />
              ) : (
                <p className="text-sm text-slate-500">
                  Pick a row in the results table to see its LFA candidates, P and Q spaces, segment
                  list and the numbers behind each check.
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
