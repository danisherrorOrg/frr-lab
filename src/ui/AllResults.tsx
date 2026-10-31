import { useMemo, useState } from 'react'
import type { ResultRow, SourceRows } from '../engine/rows'
import type { NodeId } from '../engine/types'
import { resultsCsv } from '../io/csv'
import { useStore, type RowKey } from '../state/store'
import { downloadText } from './download'
import { fileName } from './format'
import { RowsTable } from './ResultsTable'
import { useEngineTask } from './useEngineTask'
import { engine } from './engine'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'
const control =
  'rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800'

/** Sections per page: a 200-router network stays quick to draw. */
const PAGE = 20
/** Rows drawn per section until "Show all" is pressed. */
const ROW_LIMIT = 100
/** Up to this many routers, every section starts open. */
const OPEN_ALL = 8

type Show = 'all' | 'no-lfa' | 'none'

const SHOW: { value: Show; label: string }[] = [
  { value: 'all', label: 'All rows' },
  { value: 'no-lfa', label: 'Not protected by ECMP or LFA' },
  { value: 'none', label: 'Unprotected (✗)' },
]

const keep = (show: Show) => (r: ResultRow) =>
  show === 'all'
    ? true
    : show === 'none'
      ? r.protectedBy === null
      : r.protectedBy !== 'ecmp' && r.protectedBy !== 'lfa'

/** "6 rows · LFA 2 · ✗ 0": counts for a section header, over all its rows. */
function sectionCounts(rows: ResultRow[]): string {
  const lfa = rows.filter((r) => r.protectedBy === 'ecmp' || r.protectedBy === 'lfa').length
  const none = rows.filter((r) => r.protectedBy === null).length
  return `${rows.length} row${rows.length === 1 ? '' : 's'} · ECMP/LFA ${lfa} · ✗ ${none}`
}

/** Every router's results at once, one section per DUT (Phase 9.6). */
export function AllResults({ onSelect }: { onSelect: (source: NodeId, row: RowKey) => void }) {
  const topology = useStore((s) => s.topology)
  const extended = useStore((s) => s.settings.extended)
  const dut = useStore((s) => s.source)
  const { value, error, progress } = useEngineTask<SourceRows[]>(
    [topology, extended],
    true,
    (onProgress) => engine().computeAllSources(topology, { extended }, onProgress),
  )
  const [only, setOnly] = useState<NodeId | ''>('')
  const [show, setShow] = useState<Show>('all')
  const [page, setPage] = useState(0)
  // Sections the user opened or closed; the rest follow the default.
  const [toggled, setToggled] = useState<Record<NodeId, boolean>>({})
  const [full, setFull] = useState<Record<NodeId, boolean>>({})

  const sections = useMemo(
    () =>
      (value ?? [])
        .filter((x) => only === '' || x.source === only)
        .map((x) => ({ ...x, shown: x.rows.filter(keep(show)) }))
        .filter((x) => show === 'all' || x.shown.length > 0),
    [value, only, show],
  )
  const pages = Math.max(1, Math.ceil(sections.length / PAGE))
  const at = Math.min(page, pages - 1)
  const isOpen = (s: NodeId) =>
    toggled[s] ?? ((value?.length ?? 0) <= OPEN_ALL || s === dut || only === s)

  // When the DUT changes (canvas click, right-click "Set as DUT") or new results
  // arrive, go to the DUT's page and open its section. Done while rendering, not
  // in an effect (React: "adjusting state when a prop changes").
  const [revealed, setRevealed] = useState<[NodeId | null, SourceRows[] | undefined]>([
    null,
    undefined,
  ])
  if (value && (revealed[0] !== dut || revealed[1] !== value)) {
    setRevealed([dut, value])
    const i = sections.findIndex((x) => x.source === dut)
    if (i >= 0) setPage(Math.floor(i / PAGE))
    if (dut !== null) setToggled((t) => ({ ...t, [dut]: true }))
  }

  const ids = topology.nodes.map((n) => n.id).sort()
  const base = fileName(topology.name).replace(/\.yaml$/, '')

  return (
    <section aria-label="Results for every router" className="min-w-0 text-sm">
      <h2 className="px-2 text-base font-semibold">Results for every router as the DUT</h2>
      <p className="px-2 text-xs text-slate-500">
        Each section is one router protecting its own traffic. Click a row to make that router the
        DUT, draw the row and see its details.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2 px-2">
        <label className="text-xs">
          DUT
          <select
            className={`${control} block`}
            value={only}
            onChange={(e) => {
              setOnly(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Every router ({ids.length})</option>
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Show
          <select
            className={`${control} block`}
            value={show}
            onChange={(e) => {
              setShow(e.target.value as Show)
              setPage(0)
            }}
          >
            {SHOW.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={button}
          disabled={!value}
          onClick={() =>
            value && downloadText(`${base}-all-routers.csv`, resultsCsv(value), 'text/csv')
          }
        >
          ⬇ All rows (CSV)
        </button>
      </div>

      {error && <p className="mt-2 px-2 text-red-600">The engine failed: {error}</p>}
      {!value && !error && (
        <div className="mt-2 flex items-center gap-2 px-2">
          <progress
            className="w-48"
            aria-label="Results progress"
            max={progress?.total ?? 1}
            value={progress?.done ?? 0}
          />
          <span className="text-xs text-slate-500">
            {progress ? `${progress.done} of ${progress.total} routers` : 'Starting…'}
          </span>
        </div>
      )}

      {value && sections.length === 0 && (
        <p className="mt-2 px-2 text-green-700 dark:text-green-400">
          ✓ No row matches: every router protects every destination this way.
        </p>
      )}

      <div className="mt-2 space-y-2">
        {sections.slice(at * PAGE, (at + 1) * PAGE).map(({ source, rows, shown }) => {
          const open = isOpen(source)
          const all = full[source] || shown.length <= ROW_LIMIT
          return (
            <div
              key={source}
              data-dut={source}
              className={`rounded border dark:border-slate-700 ${
                source === dut ? 'border-indigo-400' : 'border-slate-200'
              }`}
            >
              <h3>
                <button
                  type="button"
                  aria-expanded={open}
                  className="flex w-full items-baseline gap-2 px-2 py-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => setToggled((t) => ({ ...t, [source]: !open }))}
                >
                  <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                  <span className="font-semibold">DUT {source}</span>
                  {source === dut && <span className="text-xs text-indigo-600">(drawn)</span>}
                  <span className="ml-auto text-xs text-slate-500">{sectionCounts(rows)}</span>
                </button>
              </h3>
              {open && (
                <div className="overflow-x-auto px-1 pb-1">
                  {rows.length === 0 ? (
                    <p className="px-2 py-1 text-xs">
                      {source} has no links, so there is nothing to protect.
                    </p>
                  ) : (
                    <RowsTable
                      rows={all ? shown : shown.slice(0, ROW_LIMIT)}
                      source={source}
                      onSelect={(row) => onSelect(source, row)}
                    />
                  )}
                  {!all && (
                    <button
                      type="button"
                      className={`${button} m-1`}
                      onClick={() => setFull((f) => ({ ...f, [source]: true }))}
                    >
                      Show all {shown.length} rows
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {pages > 1 && (
        <nav aria-label="Pages of routers" className="mt-2 flex items-center gap-2 px-2">
          <button
            type="button"
            className={button}
            disabled={at === 0}
            onClick={() => setPage(at - 1)}
          >
            ‹ Previous
          </button>
          <span className="text-xs">
            Routers {at * PAGE + 1}–{Math.min(sections.length, (at + 1) * PAGE)} of{' '}
            {sections.length}
          </span>
          <button
            type="button"
            className={button}
            disabled={at >= pages - 1}
            onClick={() => setPage(at + 1)}
          >
            Next ›
          </button>
        </nav>
      )}
    </section>
  )
}
