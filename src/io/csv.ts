import { percent, type CoverageCounts, type CoverageReport, type SourceRows } from '../engine/index'
import type { LinkView } from '../engine/link-view'
import type { ResultRow } from '../engine/rows'
import type { Segment } from '../engine/types'

// CSV for the coverage report. Pure functions returning strings; the UI does the download.
// RFC 4180: CRLF line ends, fields with commas, quotes or line breaks are quoted.

/**
 * One CSV field. Text starting with = + - @ gets a leading ' so a spreadsheet
 * doesn't run it as a formula: router ids come from files people share.
 */
export function csvField(value: string | number | undefined): string {
  if (value === undefined) return ''
  if (typeof value === 'number') return String(value)
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

const toCsv = (rows: (string | number | undefined)[][]): string =>
  rows.map((row) => row.map(csvField).join(',') + '\r\n').join('')

const countCells = (c: CoverageCounts) => [
  c.pairs,
  c.ecmp,
  c.lfa,
  percent(c.lfa, c.pairs),
  c.rlfa,
  percent(c.rlfa, c.pairs),
  c.tilfa,
  percent(c.tilfa, c.pairs),
]

/** Per-source coverage numbers, then an "All sources" total row (docs/02-algorithms.md §5). */
export function coverageCsv(report: CoverageReport): string {
  return toCsv([
    [
      'source',
      'pairs',
      'ecmp',
      'lfa',
      'lfa_pct',
      'lfa_or_rlfa',
      'lfa_or_rlfa_pct',
      'tilfa',
      'tilfa_pct',
    ],
    ...report.sources.map((s) => [s.source, ...countCells(s.counts)]),
    ['All sources', ...countCells(report.total)],
  ])
}

/** Every (source, destination, link) that LFA alone doesn't protect, with the reason. */
export function unprotectedCsv(report: CoverageReport): string {
  const yesNo = (x: boolean) => (x ? 'yes' : 'no')
  return toCsv([
    ['source', 'destination', 'link', 'lfa', 'rlfa', 'tilfa', 'reason', 'detail'],
    ...report.unprotected.map((u) => [
      u.source,
      u.dest,
      `${u.link.from}–${u.link.to}`,
      yesNo(u.lfa),
      yesNo(u.rlfa),
      yesNo(u.tilfa),
      u.reason,
      u.text,
    ]),
  ])
}

const segmentCsv = (s: Segment) =>
  s.kind === 'prefix' ? `Prefix ${s.node}` : `Adj ${s.from}→${s.to} (${s.link})`

const yesNoOpt = (x: boolean | undefined) => (x === undefined ? undefined : x ? 'yes' : 'no')

/** Columns after `dut`, the same for every table of results rows. */
const ROW_HEADER = [
  'destination',
  'cost',
  'next_hop',
  'link',
  'protected_by',
  'ecmp',
  'lfa',
  'lfa_link',
  'lfa_node_protecting',
  'rlfa_pq',
  'rlfa_via',
  'tilfa_segments',
  'tilfa_labels',
  'tilfa_out_link',
]

const rowCells = (r: ResultRow) => [
  r.dest,
  r.cost,
  r.via,
  r.link,
  r.protectedBy ?? 'none',
  yesNoOpt(r.ecmp),
  r.lfa?.neighbor,
  r.lfa?.link,
  yesNoOpt(r.lfa?.nodeProtecting),
  r.rlfa.needed ? r.rlfa.pq : undefined,
  r.rlfa.needed ? r.rlfa.via : undefined,
  r.tilfa?.segments.map(segmentCsv).join(' · '),
  r.tilfa?.labelStack.join(' '),
  r.tilfa?.outLink,
]

/** The "All routers" results table (Phase 9.6): every DUT's rows, same columns as on screen. */
export function resultsCsv(sources: SourceRows[]): string {
  return toCsv([
    ['dut', ...ROW_HEADER],
    ...sources.flatMap(({ rows }) => rows.map((r) => [r.source, ...rowCells(r)])),
  ])
}

/**
 * The per-link view (docs/02-algorithms.md §11): one line per destination the link
 * carries, each way, with the routers whose traffic crosses it ("A B", space-separated).
 */
export function linkCsv(view: LinkView): string {
  return toCsv([
    ['repairing_router', 'traffic_from', ...ROW_HEADER],
    ...view.directions.flatMap((d) =>
      d.pairs.map((p) => [p.row.source, p.sources.join(' '), ...rowCells(p.row)]),
    ),
  ])
}
