import { describe, expect, it } from 'vitest'
import { computeAllSources, computeCoverage } from '../../src/engine/index'
import { linkView } from '../../src/engine/link-view'
import { coverageCsv, csvField, linkCsv, resultsCsv, unprotectedCsv } from '../../src/io/csv'
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

// Phase 9.6: the "All routers" table as CSV.
describe('resultsCsv', () => {
  it('one line per (DUT, destination, link), with every column of the table', () => {
    const csv = resultsCsv(computeAllSources(loadFixture('04-isp-core.yaml')))
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(
      'dut,destination,cost,next_hop,link,protected_by,ecmp,lfa,lfa_link,lfa_node_protecting,rlfa_pq,rlfa_via,tilfa_segments,tilfa_labels,tilfa_out_link',
    )
    // docs/05-testing.md §2, Example 4 from PE1 to P1.
    expect(lines).toContain(
      'PE1,P1,10,P1,PE1-P1,rlfa,no,,,,PE2,P2,Adj P2→P1 (P1-P2) · Prefix P1,24000 16001,PE1-P2',
    )
    expect(lines.filter((l) => l.startsWith('PE1,'))).toHaveLength(6)
    expect(lines.at(-1)).toBe('')
  })
})

describe('linkCsv', () => {
  it('one line per destination each way, with the traffic that crosses the link', () => {
    const csv = linkCsv(linkView(loadFixture('02-ring5.yaml'), 'S-E'))
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(
      'repairing_router,traffic_from,destination,cost,next_hop,link,protected_by,ecmp,lfa,lfa_link,lfa_node_protecting,rlfa_pq,rlfa_via,tilfa_segments,tilfa_labels,tilfa_out_link',
    )
    // docs/02-algorithms.md §11: S repairs A's and its own traffic to E with Remote LFA B.
    expect(lines).toContain('S,A S,E,1,E,S-E,rlfa,no,,,,B,,Prefix B · Prefix E,16004 16002,A-S')
    expect(lines.filter((l) => l !== '')).toHaveLength(5)
  })
})
