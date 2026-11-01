import { useMemo } from 'react'
import { toRows, type ResultRow } from '../engine/rows'
import type { DestinationResult, NodeId } from '../engine/types'
import { useStore, type RowKey } from '../state/store'
import {
  bundles,
  hopName,
  isBundled,
  METHOD_NAME,
  segmentsShort,
  tooDeepText,
  type Bundles,
} from './format'
import { rowKeys } from './keys'

const cell = 'px-2 py-1 align-top'

function LfaCell({ r, b }: { r: ResultRow; b: Bundles }) {
  if (!r.lfa) return <span className="text-slate-400">–</span>
  return (
    <span>
      {hopName(b, r.source, r.lfa.neighbor, r.lfa.link)}
      {r.ecmp ? (
        <span className="ml-1 text-xs text-slate-500">(ECMP)</span>
      ) : (
        r.lfa.nodeProtecting && <span className="ml-1 text-xs text-slate-500">(node-prot.)</span>
      )}
    </span>
  )
}

function RlfaCell({ r }: { r: ResultRow }) {
  if (!r.rlfa.needed) return <span className="text-xs text-slate-400">not needed</span>
  if (r.rlfa.pq === undefined) return <span className="text-slate-400">none</span>
  return (
    <span>
      ★ {r.rlfa.pq}
      {r.rlfa.via && <span className="ml-1 text-xs text-slate-500">(via {r.rlfa.via})</span>}
    </span>
  )
}

function TilfaCell({ r, b }: { r: ResultRow; b: Bundles }) {
  if (!r.tilfa) return <span className="text-slate-400">none</span>
  const { segments, labelStack, out, outLink, msd, tooDeep } = r.tilfa
  return (
    <span className={tooDeep ? 'text-slate-500' : ''}>
      {segmentsShort(segments, b)}
      {/* With a bundle, the outgoing link is part of the repair (RFC 9855 §5, D29). */}
      {isBundled(b, r.source, out) && (
        <span className="ml-1 text-xs text-slate-500">
          (out {hopName(b, r.source, out, outLink)})
        </span>
      )}
      <span className="block font-mono text-xs text-slate-500">{labelStack.join(' ')}</span>
      {/* RFC 8491 §5: the PLR can't impose more labels than its MSD (D44). */}
      {tooDeep && msd !== undefined && (
        <span className="block text-xs font-semibold text-red-700 dark:text-red-400">
          ⚠ too deep: {tooDeepText(r.source, labelStack.length, msd)}
        </span>
      )}
    </span>
  )
}

function Status({ r }: { r: ResultRow }) {
  return r.protectedBy === null ? (
    <span className="font-semibold text-red-700 dark:text-red-400">✗ none</span>
  ) : (
    <span className="font-semibold text-green-700 dark:text-green-400">
      ✓ {METHOD_NAME[r.protectedBy]}
    </span>
  )
}

const keyOf = (r: ResultRow): RowKey => ({ dest: r.dest, via: r.via, link: r.link })

/** Is `r` the open row? `row` comes from the store, for the DUT `source`. */
const isOpen = (row: RowKey | null, source: NodeId | null, r: ResultRow) =>
  row !== null &&
  source === r.source &&
  row.dest === r.dest &&
  row.via === r.via &&
  (row.link === undefined || row.link === r.link)

interface RowsProps {
  /** One DUT's rows. */
  rows: ResultRow[]
  source: NodeId
  onSelect: (row: RowKey) => void
}

/**
 * The results table for one DUT: a table on wider screens, cards on a phone
 * (docs/03-architecture.md §6). Used for one source and for each section of the
 * "All routers" view (Phase 9.6).
 */
export function RowsTable({ rows, source, onSelect }: RowsProps) {
  const topology = useStore((s) => s.topology)
  const row = useStore((s) => s.row)
  const dut = useStore((s) => s.source)
  const b = useMemo(() => bundles(topology), [topology])

  return (
    <div>
      <ul aria-label={`Results for ${source}`} className="space-y-2 sm:hidden">
        {rows.map((r) => {
          const selected = isOpen(row, dut, r)
          return (
            <li key={`${r.dest}>${r.link}`}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(keyOf(r))}
                className={`w-full rounded border p-2 text-left text-sm dark:border-slate-700 ${
                  selected
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950'
                    : 'border-slate-200'
                }`}
              >
                <span className="flex justify-between gap-2">
                  <strong>
                    {r.dest}{' '}
                    <span className="font-normal text-slate-500">
                      via {hopName(b, source, r.via, r.link)}
                    </span>
                  </strong>
                  <Status r={r} />
                </span>
                <span className="mt-1 grid grid-cols-[4rem_1fr] gap-x-2 text-xs">
                  <span className="text-slate-500">Cost</span>
                  <span>{r.cost}</span>
                  <span className="text-slate-500">LFA</span>
                  <LfaCell r={r} b={b} />
                  <span className="text-slate-500">RLFA</span>
                  <RlfaCell r={r} />
                  <span className="text-slate-500">TI-LFA</span>
                  <TilfaCell r={r} b={b} />
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
          {rows.map((r, i) => {
            const selected = isOpen(row, dut, r)
            const choose = () => onSelect(keyOf(r))
            return (
              <tr
                key={`${r.dest}>${r.link}`}
                tabIndex={0}
                aria-selected={selected}
                className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 focus:outline-2 focus:outline-indigo-500 dark:border-slate-800 dark:hover:bg-slate-800 ${
                  selected ? 'bg-indigo-50 dark:bg-indigo-950' : ''
                }`}
                onClick={choose}
                onKeyDown={(e) => rowKeys(e, choose)}
              >
                {/* A destination with several next-hop links is named once. */}
                <td className={`${cell} font-semibold`}>
                  {i === 0 || rows[i - 1]!.dest !== r.dest ? r.dest : ''}
                </td>
                <td className={cell}>{hopName(b, source, r.via, r.link)}</td>
                <td className={cell}>{r.cost}</td>
                <td className={cell}>
                  <LfaCell r={r} b={b} />
                </td>
                <td className={cell}>
                  <RlfaCell r={r} />
                </td>
                <td className={cell}>
                  <TilfaCell r={r} b={b} />
                </td>
                <td className={cell}>
                  <Status r={r} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface Props {
  source: NodeId | null
  results: DestinationResult[] | undefined
  loading: boolean
  error: string | undefined
  onSelect: (row: RowKey) => void
}

/** One row per (destination, primary next hop) for the chosen source (F4). */
export function ResultsTable({ source, results, loading, error, onSelect }: Props) {
  const rows = useMemo(
    () => (source !== null && results ? toRows(source, results) : []),
    [source, results],
  )
  if (source === null) return <p className="p-3 text-sm">Add a router to see results.</p>
  if (error) return <p className="p-3 text-sm text-red-600">The engine failed: {error}</p>
  if (!results) return <p className="p-3 text-sm text-slate-500">{loading ? 'Computing…' : ''}</p>
  if (results.length === 0)
    return <p className="p-3 text-sm">{source} has no links, so there is nothing to protect.</p>
  return (
    <div className="overflow-x-auto">
      <p className="px-2 text-xs text-slate-500">
        Click a row, or a router on the diagram, to draw it and see the details.
      </p>
      <RowsTable rows={rows} source={source} onSelect={onSelect} />
    </div>
  )
}
