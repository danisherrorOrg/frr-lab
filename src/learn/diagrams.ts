// The Learn guide's diagrams (docs/learn/img/, D60). Each is drawn from a built-in
// example by renderDiagram(); `npm run learn:diagrams` writes the SVG files, and a
// test fails if a file no longer matches what the engine gives today.
import { flexTopology } from '../engine/flex-algo'
import type { Topology } from '../engine/types'
import { EXAMPLES, exampleTopology } from '../state/examples'
import { renderDiagram, type DiagramSpec } from './diagram'

// The example with the default link protection (D51), to compare with its own setting.
const linkProtection = (t: Topology): Topology => {
  const out = { ...t }
  delete out.protection
  return out
}

export const DIAGRAMS: DiagramSpec[] = [
  {
    file: 'isp-core.svg',
    example: 'isp-core',
    alt: 'Example 4, a small ISP core: PE1 and PE2 joined through four P routers; P1–P4 costs 20 one way and 40 the other.',
  },
  {
    file: 'square-spf.svg',
    example: 'square',
    alt: 'Example 1, the square, with the cost from S above each router and the shortest path S → E → D.',
    row: { source: 'S', dest: 'D', via: 'E' },
    paths: ['primary'],
    distFrom: 'S',
  },
  {
    file: 'square-fail.svg',
    example: 'square',
    alt: 'Example 1 with link S–E failed: the primary path is cut; the post-convergence path is S → N → D.',
    row: { source: 'S', dest: 'D', via: 'E' },
    paths: ['primary', 'tilfa'],
    failLinks: ['S-E'],
  },
  {
    file: 'square-lfa.svg',
    example: 'square',
    alt: 'Example 1: the primary path S → E → D and the LFA backup S → N → D.',
    row: { source: 'S', dest: 'D', via: 'E' },
    paths: ['primary', 'lfa'],
  },
  {
    file: 'ring5-no-lfa.svg',
    example: 'ring5',
    alt: "Example 2, the ring: S's primary path to E, and A's own shortest path to E, which goes back through S.",
    row: { source: 'S', dest: 'E', via: 'E' },
    paths: ['primary'],
    extra: [{ from: 'A', to: 'E', label: "A's own path to E: back through S" }],
  },
  {
    file: 'ring5-pspace.svg',
    example: 'ring5',
    alt: "Example 2: S's P-space for link S–E is A and B.",
    row: { source: 'S', dest: 'E', via: 'E' },
    spaces: ['p'],
  },
  {
    file: 'ring5-extpspace.svg',
    example: 'ring5',
    alt: 'Example 2: extended P-space adds C, reached through neighbor A.',
    row: { source: 'S', dest: 'E', via: 'E' },
    spaces: ['extp'],
  },
  {
    file: 'ring5-qspace.svg',
    example: 'ring5',
    alt: "Example 2: E's Q-space for link S–E is B and C.",
    row: { source: 'S', dest: 'E', via: 'E' },
    spaces: ['q'],
  },
  {
    file: 'ring5-rlfa.svg',
    example: 'ring5',
    alt: 'Example 2: B and C are PQ nodes; Remote LFA tunnels to B, which forwards to E.',
    row: { source: 'S', dest: 'E', via: 'E' },
    paths: ['primary', 'rlfa'],
    spaces: ['extp', 'q'],
    pq: true,
  },
  {
    file: 'ring5-high-no-pq.svg',
    example: 'ring5-high',
    alt: 'Example 3: P-space is A and B, Q-space is C; no router is in both.',
    row: { source: 'S', dest: 'E', via: 'E' },
    spaces: ['extp', 'q'],
  },
  {
    file: 'ring5-tilfa.svg',
    example: 'ring5',
    alt: 'Example 2: the TI-LFA path S → A → B → C → E with segments Prefix-SID B (16004) and Prefix-SID E (16002).',
    row: { source: 'S', dest: 'E', via: 'E' },
    paths: ['primary', 'tilfa'],
    segments: true,
  },
  {
    file: 'ring5-high-tilfa.svg',
    example: 'ring5-high',
    alt: 'Example 3: the TI-LFA path S → A → B → C → E with segments Prefix-SID B, Adj-SID B→C (24005) and Prefix-SID E.',
    row: { source: 'S', dest: 'E', via: 'E' },
    paths: ['primary', 'tilfa'],
    segments: true,
  },
  {
    file: 'node-protection-link.svg',
    example: 'node-protection',
    alt: 'Example 8 with link protection: the Remote LFA backup via PQ node B and the TI-LFA backup both go through router E.',
    edit: linkProtection,
    row: { source: 'S', dest: 'D', via: 'E' },
    paths: ['primary', 'rlfa', 'tilfa'],
    pq: true,
  },
  {
    file: 'node-protection.svg',
    example: 'node-protection',
    alt: 'Example 8 with node protection: Remote LFA via PQ node C and TI-LFA both take S → N → B → C → D, avoiding router E.',
    row: { source: 'S', dest: 'D', via: 'E' },
    paths: ['primary', 'rlfa', 'tilfa'],
    pq: true,
    segments: true,
  },
  {
    file: 'isp-core-compare.svg',
    example: 'isp-core',
    alt: 'Example 4, PE1 → P1: Remote LFA goes the long way through PE2; TI-LFA takes PE1 → P2 → P1.',
    row: { source: 'PE1', dest: 'P1', via: 'P1' },
    paths: ['primary', 'rlfa', 'tilfa'],
    pq: true,
    segments: true,
  },
  {
    file: 'link-protecting-fail.svg',
    example: 'link-protecting',
    alt: "Example 6 with router E down: S's LFA is N, and N's own path to D goes through E.",
    row: { source: 'S', dest: 'D', via: 'E' },
    paths: ['primary', 'lfa'],
    failNodes: ['E'],
  },
  {
    file: 'srlg-link.svg',
    example: 'srlg',
    alt: 'Example 9 with link protection: the LFA via A runs over A–B, in the same duct as S–E.',
    edit: linkProtection,
    row: { source: 'S', dest: 'D', via: 'E' },
    paths: ['primary', 'lfa'],
  },
  {
    file: 'srlg.svg',
    example: 'srlg',
    alt: 'Example 9 with SRLG protection and the duct failed: the LFA and the TI-LFA repair go via C.',
    row: { source: 'S', dest: 'D', via: 'E' },
    paths: ['lfa', 'tilfa'],
    failLinks: ['S-E', 'A-B'],
  },
  {
    file: 'parallel.svg',
    example: 'parallel',
    alt: 'Example 7: two links between S and E (10 and 20). For S → E the LFA is the other link, S-E#2.',
    row: { source: 'S', dest: 'E', via: 'E' },
    paths: ['primary', 'lfa'],
  },
  {
    file: 'lan-levels.svg',
    example: 'lan-levels',
    alt: 'Example 10: LAN1 joins R2, R3 and R4. For R2 → R4 the LFA is R3 over the point-to-point link R2–R3.',
    row: { source: 'R2', dest: 'R4', via: 'R4' },
    paths: ['primary', 'lfa'],
  },
  {
    file: 'flex-algo-0.svg',
    example: 'flex-algo',
    alt: 'Example 11, algorithm 0 (IGP metric): S → D via E, LFA B.',
    row: { source: 'S', dest: 'D', via: 'E' },
    paths: ['primary', 'lfa'],
  },
  {
    file: 'flex-algo-128.svg',
    example: 'flex-algo',
    alt: 'Example 11, Flex-Algo 128 (delay, no red links): S → D via A, LFA B.',
    edit: (t) => flexTopology(t, 128),
    row: { source: 'S', dest: 'D', via: 'A' },
    paths: ['primary', 'lfa'],
  },
]

/** The SVG text of one guide diagram, by file name. */
export function diagramSvg(file: string): string | undefined {
  const spec = DIAGRAMS.find((d) => d.file === file)
  const ex = spec && EXAMPLES.find((e) => e.key === spec.example)
  return spec && ex && renderDiagram(exampleTopology(ex), spec)
}
