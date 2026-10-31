import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeForSource } from '../../src/engine/index'
import { flowWalk } from '../../src/engine/packet-walk'
import { protectionPaths } from '../../src/engine/paths'
import { adjLabel } from '../../src/engine/labels'
import { simulateAllSources, simulateFailure, type FailureSummary } from '../../src/engine/simulate'
import {
  bundles,
  dutSummary,
  howText,
  walkMarks,
  type Bundles,
  isBundled,
  lfaTags,
  outcomeText,
  pickBackup,
  protectedBy,
  segmentsShort,
  spaceMarks,
  throughText,
  tooltipLines,
} from '../../src/ui/format'
import { toRows } from '../../src/engine/rows'
import { parseTopology } from '../../src/io/yaml'
import { connectedTopology } from '../arbitraries'
import { loadFixture } from '../helpers'

const first = (file: string, s: string, d: string) =>
  computeForSource(loadFixture(file), s).find((r) => r.dest === d)!.protections[0]!

describe('protectedBy', () => {
  it('names the simplest method that works, for each worked example', () => {
    expect(protectedBy(first('01-square.yaml', 'S', 'D'))).toBe('lfa')
    expect(protectedBy(first('02-ring5.yaml', 'S', 'E'))).toBe('rlfa')
    expect(protectedBy(first('03-ring5-highmetric.yaml', 'S', 'E'))).toBe('tilfa')
    expect(protectedBy(first('05-leaf-spine.yaml', 'L1', 'L2'))).toBe('ecmp')
  })
})

describe('text helpers', () => {
  it('writes segment lists in short form', () => {
    const p = first('03-ring5-highmetric.yaml', 'S', 'E')
    expect(segmentsShort(p.tilfa.segments!)).toBe('B · B→C · E')
  })

  it('tags LFA candidates', () => {
    expect(lfaTags({ loopFree: true, downstream: true, nodeProtecting: true })).toBe(
      'node-protecting, downstream',
    )
    expect(lfaTags({ loopFree: true, downstream: false, nodeProtecting: false })).toBe(
      'link-protecting',
    )
    expect(lfaTags({ loopFree: false, downstream: false, nodeProtecting: false })).toBe(
      'not loop-free',
    )
  })
})

describe('pickBackup', () => {
  it("'auto' takes LFA, then Remote LFA, then TI-LFA", () => {
    const t = loadFixture('02-ring5.yaml')
    const p = first('02-ring5.yaml', 'S', 'E')
    const paths = protectionPaths(t, 'S', 'E', p)
    expect(pickBackup(paths, 'auto')).toEqual({ kind: 'rlfa', path: ['S', 'A', 'B', 'C', 'E'] })
    expect(pickBackup(paths, 'lfa')).toBeNull()
    expect(pickBackup(paths, 'tilfa')?.kind).toBe('tilfa')
  })
})

describe('throughText (Phase 9.3)', () => {
  it('LFA: the failed node-protecting inequality with real numbers', () => {
    const text = throughText(
      {
        node: 'E',
        at: 'N',
        why: { method: 'lfa', via: 'N', check: { distND: 2, distNE: 1, distED: 1 } },
      },
      'S',
      'E',
      'D',
    )
    expect(text).toBe(
      'LFA N reaches D through E: dist(N,D) = 2 is not < dist(N,E) + dist(E,D) = 1+1 = 2, so N only protects the link S–E, not the router (RFC 5286 §3.2).',
    )
  })

  it('Remote LFA and TI-LFA name the part that goes through the router', () => {
    expect(
      throughText(
        { node: 'E', at: 'C', why: { method: 'rlfa', pq: 'B', leg: 'from-pq' } },
        'S',
        'E',
        'D',
      ),
    ).toMatch(/^PQ node B reaches D through E \(C→E\)\. .*RFC 8102 §2\.1/)
    expect(
      throughText(
        {
          node: 'E',
          at: 'X',
          why: { method: 'tilfa', segment: { kind: 'prefix', node: 'E', label: 16002 } },
        },
        'S',
        'E',
        'D',
      ),
    ).toMatch(/^the segment list holds Prefix-SID\(E\) \(label 16002\)/)
  })

  // D28: a failed router other than the PLR's protected neighbor is a second failure,
  // not something node protection of that neighbor would avoid.
  it('a router that is not the protected neighbor is called a second failure', () => {
    // Example 5, source SP1, TI-LFA, fail L2–SP1 and router L1: SP1's repair for L2 leaves via L1.
    const tilfa = throughText(
      { node: 'L1', at: 'SP1', why: { method: 'tilfa', segment: null } },
      'SP1',
      'L2',
      'L2',
    )
    expect(tilfa).toBe(
      "its first hop is L1. L1 is a second failure: SP1's backup was planned for the link SP1–L2 alone, and FRR plans for one failure at a time.",
    )
    expect(tilfa).not.toMatch(/SP1–L1|node protection/)
    // Example 4, source PE1, TI-LFA, fail routers P1 and PE2: the repair for P3 is planned around P1.
    expect(
      throughText(
        {
          node: 'PE2',
          at: 'P4',
          why: { method: 'tilfa', segment: { kind: 'prefix', node: 'P3', label: 16003 } },
        },
        'PE1',
        'P1',
        'P3',
      ),
    ).toBe(
      "segment Prefix-SID(P3) follows normal paths through PE2 (P4→PE2). PE2 is a second failure: PE1's backup was planned for the link PE1–P1 alone, and FRR plans for one failure at a time.",
    )
  })

  it('a backup whose own neighbor or PQ node is down says so', () => {
    // Example 4, source P1, fail P1–P4 and router P2: P1's LFA for P4 is P2.
    expect(
      throughText({ node: 'P2', at: 'P1', why: { method: 'lfa', via: 'P2' } }, 'P1', 'P4', 'P4'),
    ).toBe(
      "LFA P2 is itself down. P2 is a second failure: P1's backup was planned for the link P1–P4 alone, and FRR plans for one failure at a time.",
    )
    expect(
      throughText({ node: 'PE1', at: 'P2', why: { method: 'ecmp', via: 'PE1' } }, 'P2', 'P4', 'P3'),
    ).toMatch(/^the other ECMP next hop PE1 is itself down\. /)
    // Example 1, source S, Remote LFA, fail E–D and router N: E's PQ node is N.
    expect(
      throughText(
        { node: 'N', at: 'S', why: { method: 'rlfa', pq: 'N', leg: 'to-pq' } },
        'E',
        'D',
        'D',
      ),
    ).toBe(
      "PQ node N is itself down. N is a second failure: E's backup was planned for the link E–D alone, and FRR plans for one failure at a time.",
    )
  })

  // D29, D33: with parallel links, text names the one link meant.
  it('names the link of a bundle the backup was planned for', () => {
    // Example 7, source S, fail link S-E and router A: S's LFA for D is A, which is down.
    const t = loadFixture('07-parallel.yaml')
    for (const mode of ['lfa', 'tilfa'] as const) {
      const f = simulateFailure(t, 'S', { links: ['S-E'], nodes: ['A'] }, mode).flows.find(
        (x) => x.dest === 'D',
      )!
      expect(f.through).toBeDefined()
      const text = throughText(f.through!, f.plr!, f.next!, f.dest, f.hitLink, bundles(t))
      expect(text).toContain(
        "A is a second failure: S's backup was planned for the link S–E (S-E) alone",
      )
    }
    // S has one link to E here (no bundle), so the text stays as before.
    const b = bundles(loadFixture('01-square.yaml'))
    expect(
      throughText(
        { node: 'N', at: 'S', why: { method: 'rlfa', pq: 'N', leg: 'to-pq' } },
        'E',
        'D',
        'D',
        'E-D',
        b,
      ),
    ).toContain('planned for the link E–D alone')
  })

  it('names the protected link of a bundle, and the link of an Adj-SID', () => {
    const b = new Set(['E|S', 'B|C'])
    expect(
      throughText(
        {
          node: 'E',
          at: 'N',
          why: { method: 'lfa', via: 'N', check: { distND: 2, distNE: 1, distED: 1 } },
        },
        'S',
        'E',
        'D',
        'S-E#2',
        b,
      ),
    ).toMatch(/so N only protects the link S–E \(S-E#2\), not the router/)
    // Example 3's ring with B–C as a bundle (§9), fail S–E and router C: the Adj-SID is on B-C#2.
    expect(
      throughText(
        {
          node: 'C',
          at: 'B',
          why: {
            method: 'tilfa',
            segment: { kind: 'adj', from: 'B', to: 'C', link: 'B-C#2', label: 24002 },
          },
        },
        'S',
        'E',
        'E',
        'S-E',
        b,
      ),
    ).toBe(
      "the segment list holds Adj-SID(B→C) of link B-C#2 (label 24002), a link of C. C is a second failure: S's backup was planned for the link S–E (S-E) alone, and FRR plans for one failure at a time.",
    )
  })

  it('names the failed link whenever the PLR and its neighbor have several (random networks)', () => {
    fc.assert(
      fc.property(
        connectedTopology({ parallel: true }).filter((t) => t.nodes.length <= 10),
        fc.nat(),
        fc.nat(),
        (t, i, j) => {
          const ids = t.nodes.map((n) => n.id)
          const router = ids[i % ids.length]!
          const link = t.links[j % t.links.length]!.id
          const b = bundles(t)
          for (const s of ids) {
            if (s === router) continue
            for (const f of simulateFailure(t, s, { links: [link], nodes: [router] }, 'lfa')
              .flows) {
              if (!f.through || !isBundled(b, f.plr!, f.next!)) continue
              const text = throughText(f.through, f.plr!, f.next!, f.dest, f.hitLink, b)
              // Every "the link PLR–E" is followed by the link's id.
              const named = `the link ${f.plr}–${f.next} (${f.hitLink})`
              expect(text.split(`the link ${f.plr}–${f.next}`).length).toBe(
                text.split(named).length,
              )
            }
          }
        },
      ),
      { numRuns: 60 },
    )
  })
})

describe('tooltipLines (Phase 9.5)', () => {
  const none = { links: [], nodes: [] }

  it('router: id, name, Prefix-SID index and its label; a down router says so', () => {
    const isp = loadFixture('04-isp-core.yaml')
    expect(tooltipLines(isp, { kind: 'node', id: 'PE1' }, none)).toEqual([
      'Router PE1',
      'Prefix-SID index 11 · label 16011',
    ])
    const named = { ...isp, nodes: isp.nodes.map((n) => ({ ...n, name: 'Edge 1' })) }
    expect(tooltipLines(named, { kind: 'node', id: 'PE1' }, { links: [], nodes: ['PE1'] })).toEqual(
      [
        'Router PE1 · Edge 1',
        'Prefix-SID index 11 · label 16011',
        '✕ down: all its links are down',
      ],
    )
  })

  it('link: metric each way, Adj-SIDs (set or auto), and whether it is down', () => {
    const isp = loadFixture('04-isp-core.yaml')
    expect(tooltipLines(isp, { kind: 'link', id: 'P1-P4' }, none)).toEqual([
      'Link P1–P4',
      'Metric P1→P4 20 · P4→P1 40',
      `Adj-SID P1→P4 ${adjLabel(isp, 'P1', 'P4')} (auto) · P4→P1 ${adjLabel(isp, 'P4', 'P1')} (auto)`,
    ])
    // Example 3: B→C is set in the file (24005), so it isn't marked auto.
    const high = loadFixture('03-ring5-highmetric.yaml')
    expect(tooltipLines(high, { kind: 'link', id: 'C-B' }, { links: [], nodes: ['B'] })).toEqual([
      'Link C–B',
      'Metric 10 both ways',
      'Adj-SID C→B 24006 · B→C 24005',
      '✕ down (router B is down)',
    ])
    expect(
      tooltipLines(high, { kind: 'link', id: 'C-B' }, { links: ['C-B'], nodes: [] }).at(-1),
    ).toBe('✕ down')
  })

  it('names the link of a bundle (D29)', () => {
    const par = loadFixture('07-parallel.yaml')
    expect(tooltipLines(par, { kind: 'link', id: 'S-E#2' }, none).slice(0, 2)).toEqual([
      'Link S–E (S-E#2)',
      'Metric 20 both ways',
    ])
  })

  it('is empty for something that is gone', () => {
    expect(tooltipLines(loadFixture('01-square.yaml'), { kind: 'node', id: 'Z' }, none)).toEqual([])
  })
})

describe('per-DUT failure text (Phase 9.6)', () => {
  const zero: FailureSummary = {
    affected: 0,
    repaired: 0,
    relayed: 0,
    dropped: 0,
    looped: 0,
    unreachable: 0,
    destDown: 0,
    viaRouter: 0,
    survive: 0,
    breaks: 0,
    noBackup: 0,
  }

  it('outcomeText lists the non-zero outcomes in a fixed order', () => {
    expect(
      outcomeText({ ...zero, affected: 4, repaired: 2, relayed: 1, dropped: 1, looped: 1 }),
    ).toBe(
      '2 repaired (1 by more than one router), 1 dropped until convergence, 1 looping until convergence',
    )
    expect(outcomeText({ ...zero, affected: 1, unreachable: 1 })).toBe('0 repaired, 1 unreachable')
  })

  it('Example 6, router E down, LFA only: one line per DUT', () => {
    const all = simulateAllSources(loadFixture('06-link-protecting.yaml'), { nodes: ['E'] }, 'lfa')
    const line = (s: string) =>
      dutSummary(
        all.find((x) => x.source === s)!,
        true,
      )
    expect(line('E')).toBe('down: sends no traffic')
    expect(line('M')).toBe('nothing affected')
    expect(line('S')).toBe(
      '1 affected, 1 repaired (1 by more than one router); 0 survive, 1 breaks',
    )
    expect(line('D')).toBe('2 affected, 2 repaired; 2 survive, 0 break')
  })

  it('says which flows the survive / break part counts when not every affected one meets a down router (D32)', () => {
    // Example 6, router D and link S–N down, LFA only. From S, N and M cross S–N; only
    // M's backup (LFA E, then E-D-M) meets D. N's backup S-E-N never does.
    const all = simulateAllSources(
      loadFixture('06-link-protecting.yaml'),
      { links: ['S-N'], nodes: ['D'] },
      'lfa',
    )
    expect(
      dutSummary(
        all.find((x) => x.source === 'S')!,
        true,
      ),
    ).toBe(
      '2 affected, 2 repaired (1 by more than one router); 1 meets a down router: 0 survive, 1 breaks',
    )
  })

  it('without a router down, no survive / break part', () => {
    const all = simulateAllSources(loadFixture('02-ring5.yaml'), { links: ['S-E'] }, 'tilfa')
    expect(
      dutSummary(
        all.find((x) => x.source === 'S')!,
        false,
      ),
    ).toBe('2 affected, 2 repaired')
  })
})

describe('walkMarks', () => {
  // Example 3, S–E and C–B down: S→A→B, B repairs its failed Adj-SID and sends back to A.
  const t = loadFixture('03-ring5-highmetric.yaml')
  const f = simulateFailure(t, 'S', ['S-E', 'C-B'], 'tilfa').flows.find((x) => x.dest === 'E')!
  const w = flowWalk(t, f)!

  it('a link walked twice shows the stack of the latest visit up to the step', () => {
    expect(w.hops.map((h) => h.link)).toEqual(['A-S', 'B-A', 'B-A', undefined])
    const onBA = (step: number) =>
      walkMarks(w, step, true).packetStacks!.find((x) => x.link === 'B-A')
    expect(onBA(1)).toEqual({ link: 'B-A', lines: ['24005 B→C', '16002 E'], current: true })
    expect(onBA(2)).toEqual({ link: 'B-A', lines: ['16005 C', '16002 E'], current: true })
    expect(onBA(0)?.current).toBe(false)
  })

  it('nothing before the walk starts; no stacks when they are hidden', () => {
    expect(walkMarks(w, null, true)).toEqual({})
    expect(walkMarks(w, 3, false)).toEqual({ packetAt: 'A' })
  })
})

describe('spaceMarks: P / Q / PQ sets picked in the detail panel', () => {
  // docs/02-algorithms.md §6 Example 2: P {A,B}, extended P {A,B,C}, Q {B,C}, PQ {B,C}, ★ B.
  const rlfa = first('02-ring5.yaml', 'S', 'E').rlfa

  it('nothing picked: extended P and Q shaded, ★ B, nothing ringed', () => {
    expect(spaceMarks(rlfa, null)).toEqual({ pSpace: ['A', 'B', 'C'], qSpace: ['B', 'C'], pq: 'B' })
    expect(spaceMarks({ ...rlfa, extended: false }, null).pSpace).toEqual(['A', 'B'])
  })

  it('one set picked: only that set, its routers ringed', () => {
    expect(spaceMarks(rlfa, 'p')).toEqual({ pSpace: ['A', 'B'], pq: 'B', spot: ['A', 'B'] })
    expect(spaceMarks(rlfa, 'extP')).toEqual({
      pSpace: ['A', 'B', 'C'],
      pq: 'B',
      spot: ['A', 'B', 'C'],
    })
    expect(spaceMarks(rlfa, 'q')).toEqual({ qSpace: ['B', 'C'], pq: 'B', spot: ['B', 'C'] })
    // PQ nodes are in both spaces, so they get both shades.
    expect(spaceMarks(rlfa, 'pq')).toEqual({
      pSpace: ['B', 'C'],
      qSpace: ['B', 'C'],
      pq: 'B',
      spot: ['B', 'C'],
    })
  })

  it('no ★ when an LFA already protects the link (Example 1)', () => {
    const square = first('01-square.yaml', 'S', 'D').rlfa
    expect(spaceMarks(square, 'pq')).toEqual({
      pSpace: ['D', 'N'],
      qSpace: ['D', 'N'],
      spot: ['D', 'N'],
    })
  })

  it('a picked set that is now empty falls back to the normal shading', () => {
    expect(spaceMarks({ ...rlfa, pq: [] }, 'pq')).toEqual(spaceMarks(rlfa, null))
  })
})

describe('howText (per-link view)', () => {
  const rowsOf = (file: string, s: string) => toRows(s, computeForSource(loadFixture(file), s))
  const how = (file: string, s: string, d: string, b?: Bundles) =>
    howText(
      rowsOf(file, s).find((r) => r.dest === d)!,
      b,
    )

  it('names the backup each method uses, with labels for TI-LFA', () => {
    expect(how('02-ring5.yaml', 'S', 'C')).toBe('LFA A (node-protecting)')
    expect(how('02-ring5.yaml', 'S', 'E')).toBe('Remote LFA: tunnel to PQ node B')
    expect(how('03-ring5-highmetric.yaml', 'S', 'E')).toBe(
      'TI-LFA: B · B→C · E (16004 24005 16002)',
    )
    expect(how('04-isp-core.yaml', 'PE1', 'P1')).toBe('Remote LFA: tunnel to PQ node PE2 via P2')
    expect(how('04-isp-core.yaml', 'PE1', 'PE2')).toBe('ECMP: the other next hop P2 takes it')
  })

  it('names the link of a bundle, and says when nothing protects', () => {
    const par = loadFixture('07-parallel.yaml')
    expect(how('07-parallel.yaml', 'S', 'E', bundles(par))).toBe('LFA E (S-E#2) (link-protecting)')
    const r = parseTopology(
      'nodes: [{ id: A, sid: 1 }, { id: B, sid: 2 }]\nlinks: [{ a: A, b: B, metric: 5 }]',
    )
    if (!r.ok) throw new Error(r.errors.join())
    expect(howText(toRows('A', computeForSource(r.topology, 'A'))[0]!)).toBe(
      'Nothing: B is cut off from A when the link fails',
    )
  })
})
