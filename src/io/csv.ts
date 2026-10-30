import { percent, type CoverageCounts, type CoverageReport } from '../engine/index'

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
