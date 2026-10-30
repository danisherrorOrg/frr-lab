import { describe, expect, it } from 'vitest'
import { computeCoverage } from '../../src/engine/index'
import { coverageCsv, csvField, unprotectedCsv } from '../../src/io/csv'
import { loadFixture } from '../helpers'

describe('coverageCsv', () => {
  it('one row per source plus an "All sources" row, with percentages', () => {
    const csv = coverageCsv(computeCoverage(loadFixture('01-square.yaml')))
    expect(csv).toBe(
      [
        'source,pairs,ecmp,lfa,lfa_pct,lfa_or_rlfa,lfa_or_rlfa_pct,tilfa,tilfa_pct',
        'D,3,0,1,33.3,3,100,3,100',
        'E,3,0,1,33.3,3,100,3,100',
        'N,3,0,3,100,3,100,3,100',
        'S,3,0,3,100,3,100,3,100',
        'All sources,12,0,8,66.7,12,100,12,100',
        '',
      ].join('\r\n'),
    )
  })

  it('leaves percentages empty when a source has nothing to protect', () => {
    const csv = coverageCsv({
      sources: [{ source: 'S', counts: { pairs: 0, ecmp: 0, lfa: 0, rlfa: 0, tilfa: 0 } }],
      total: { pairs: 0, ecmp: 0, lfa: 0, rlfa: 0, tilfa: 0 },
      unprotected: [],
    })
    expect(csv.split('\r\n')[1]).toBe('S,0,0,0,,0,,0,')
  })
})

describe('unprotectedCsv', () => {
  it('one row per pair, quoting text that has commas', () => {
    const csv = unprotectedCsv(computeCoverage(loadFixture('02-ring5.yaml'), { sources: ['S'] }))
    expect(csv).toBe(
      [
        'source,destination,link,lfa,rlfa,tilfa,reason,detail',
        'S,A,S–A,no,yes,yes,no-lfa,No LFA for A over S–A; Remote LFA tunnels to PQ node C',
        'S,E,S–E,no,yes,yes,no-lfa,No LFA for E over S–E; Remote LFA tunnels to PQ node B',
        '',
      ].join('\r\n'),
    )
  })
})

// RFC 4180 quoting, plus a guard against spreadsheet formulas in router ids.
describe('csvField', () => {
  it.each([
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['two\nlines', '"two\nlines"'],
    ['=1+1', "'=1+1"],
    ['+cmd', "'+cmd"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['-x,y', `"'-x,y"`],
  ])('%j → %j', (input, output) => {
    expect(csvField(input)).toBe(output)
  })

  it('writes numbers as they are, including negatives', () => {
    expect(csvField(-3)).toBe('-3')
    expect(csvField(66.7)).toBe('66.7')
  })
})
