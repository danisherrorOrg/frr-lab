import type { DestinationResult, NodeId, Protection } from '../engine/types'
import type { RowKey } from '../state/store'
import { METHOD_NAME, protectedBy, segmentsShort } from './format'
import { rowKeys } from './keys'

interface Props {
  source: NodeId | null
  results: DestinationResult[] | undefined
  loading: boolean
  error: string | undefined
  row: RowKey | null
  onSelect: (row: RowKey) => void
}

const cell = 'px-2 py-1 align-top'

function LfaCell({ p }: { p: Protection }) {
  if (p.lfa.best === undefined) return <span className="text-slate-400">–</span>
  const c = p.lfa.candidates.find((x) => x.neighbor === p.lfa.best)
  return (
    <span>
      {p.lfa.best}
      {p.ecmpProtected ? (
        <span className="ml-1 text-xs text-slate-500">(ECMP)</span>
      ) : (
        c?.nodeProtecting && <span className="ml-1 text-xs text-slate-500">(node-prot.)</span>
      )}
    </span>
  )
}

function RlfaCell({ p }: { p: Protection }) {
  if (!p.rlfa.needed) return <span className="text-xs text-slate-400">not needed</span>
  if (p.rlfa.best === undefined) return <span className="text-slate-400">none</span>
  const via = p.rlfa.exitVia[p.rlfa.best]
  return (
    <span>
      ★ {p.rlfa.best}
      {via && <span className="ml-1 text-xs text-slate-500">(via {via})</span>}
    </span>
  )
}

function TilfaCell({ p }: { p: Protection }) {
  if (!p.tilfa.segments) return <span className="text-slate-400">none</span>
  return (
    <span>
      {segmentsShort(p.tilfa.segments)}
      <span className="block font-mono text-xs text-slate-500">
        {p.tilfa.labelStack?.join(' ')}
      </span>
    </span>
  )
}

function Status({ p }: { p: Protection }) {
  const m = protectedBy(p)
  return m === null ? (
    <span className="font-semibold text-red-700 dark:text-red-400">✗ none</span>
  ) : (
    <span className="font-semibold text-green-700 dark:text-green-400">✓ {METHOD_NAME[m]}</span>
  )
}

/** One row per (destination, primary next hop) for the chosen source (F4). */
export function ResultsTable({ source, results, loading, error, row, onSelect }: Props) {
  if (source === null) return <p className="p-3 text-sm">Add a router to see results.</p>
  if (error) return <p className="p-3 text-sm text-red-600">The engine failed: {error}</p>
  if (!results) return <p className="p-3 text-sm text-slate-500">{loading ? 'Computing…' : ''}</p>
  if (results.length === 0)
    return <p className="p-3 text-sm">{source} has no links, so there is nothing to protect.</p>

  const pairs = results.flatMap((r) => r.protections.map((p, i) => ({ r, p, i })))
  return (
    <div className="overflow-x-auto">
      <p className="px-2 text-xs text-slate-500">Click a row to draw it and see the details.</p>

      {/* Phone width: one card per row (docs/03-architecture.md §6). */}
      <ul aria-label={`Results for ${source}`} className="space-y-2 sm:hidden">
        {pairs.map(({ r, p }) => {
          const via = p.protectedLink.to
          const selected = row?.dest === r.dest && row.via === via
          return (
            <li key={`${r.dest}>${via}`}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect({ dest: r.dest, via })}
                className={`w-full rounded border p-2 text-left text-sm dark:border-slate-700 ${
                  selected
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950'
                    : 'border-slate-200'
                }`}
              >
                <span className="flex justify-between gap-2">
                  <strong>
                    {r.dest} <span className="font-normal text-slate-500">via {via}</span>
                  </strong>
                  <Status p={p} />
                </span>
                <span className="mt-1 grid grid-cols-[4rem_1fr] gap-x-2 text-xs">
                  <span className="text-slate-500">Cost</span>
                  <span>{r.cost}</span>
                  <span className="text-slate-500">LFA</span>
                  <LfaCell p={p} />
                  <span className="text-slate-500">RLFA</span>
                  <RlfaCell p={p} />
                  <span className="text-slate-500">TI-LFA</span>
                  <TilfaCell p={p} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <table className="hidden w-full text-left text-sm sm:table">
        <caption className="px-2 py-1 text-left font-semibold">Results for {source}</caption>
        <thead className="border-b border-slate-300 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
          <tr>
            <th className={cell}>Dest</th>
            <th className={cell}>NH</th>
            <th className={cell}>Cost</th>
            <th className={cell}>LFA</th>
            <th className={cell}>RLFA</th>
            <th className={cell}>TI-LFA</th>
            <th className={cell}>✓/✗</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map(({ r, p, i }) => {
            const via = p.protectedLink.to
            const selected = row?.dest === r.dest && row.via === via
            const choose = () => onSelect({ dest: r.dest, via })
            return (
              <tr
                key={`${r.dest}>${via}`}
                tabIndex={0}
                aria-selected={selected}
                className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 focus:outline-2 focus:outline-indigo-500 dark:border-slate-800 dark:hover:bg-slate-800 ${
                  selected ? 'bg-indigo-50 dark:bg-indigo-950' : ''
                }`}
                onClick={choose}
                onKeyDown={(e) => rowKeys(e, choose)}
              >
                <td className={`${cell} font-semibold`}>{i === 0 ? r.dest : ''}</td>
                <td className={cell}>{via}</td>
                <td className={cell}>{r.cost}</td>
                <td className={cell}>
                  <LfaCell p={p} />
                </td>
                <td className={cell}>
                  <RlfaCell p={p} />
                </td>
                <td className={cell}>
                  <TilfaCell p={p} />
                </td>
                <td className={cell}>
                  <Status p={p} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
