/// <reference types="node" />
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CHAPTERS, chapterBySlug } from '../../src/learn/chapters'
import { rowProtection } from '../../src/learn/diagram'
import { DIAGRAMS } from '../../src/learn/diagrams'
import { parseGuideLink } from '../../src/learn/links'
import type { Block, Inline } from '../../src/learn/markdown'
import { EXAMPLES, exampleTopology } from '../../src/state/examples'

// Every link, picture and "Try it" in docs/learn/ must work, on GitHub and in the app (D60).

function inlines(xs: Inline[], out: string[]) {
  for (const x of xs) {
    if (x.kind === 'link') out.push(x.href)
    if ('children' in x) inlines(x.children, out)
  }
}
function walk(bs: Block[], links: string[], images: string[]) {
  for (const b of bs) {
    switch (b.kind) {
      case 'heading':
      case 'para':
        inlines(b.children, links)
        break
      case 'list':
        b.items.forEach((item) => walk(item, links, images))
        break
      case 'quote':
        walk(b.children, links, images)
        break
      case 'details':
        inlines(b.summary, links)
        walk(b.children, links, images)
        break
      case 'table':
        ;[b.head, ...b.rows].forEach((r) => r.forEach((c) => inlines(c, links)))
        break
      case 'image':
        images.push(b.src)
        break
    }
  }
}
const headingIds = (bs: Block[]) => bs.flatMap((b) => (b.kind === 'heading' ? [b.id] : []))

const all = CHAPTERS.map((c) => {
  const links: string[] = []
  const images: string[] = []
  walk(c.blocks, links, images)
  return { c, links, images }
})

describe('Learn guide', () => {
  it('has the 14 chapters and 4 appendices, in order', () => {
    expect(CHAPTERS.map((c) => c.slug)).toEqual([
      '00-start-here',
      '01-isis-basics',
      '02-shortest-paths',
      '03-when-a-link-fails',
      '04-lfa',
      '05-remote-lfa',
      '06-segment-routing',
      '07-ti-lfa',
      '08-comparison',
      '09-router-and-multiple-failures',
      '10-design-checks',
      '11-advanced-topics',
      '12-using-lfa-lab',
      '13-practice-exercises',
      'appendix-a-glossary',
      'appendix-b-cheat-sheet',
      'appendix-c-rfc-guide',
      'appendix-d-examples',
    ])
    for (const c of CHAPTERS) expect(c.title, c.slug).not.toBe(c.slug)
  })

  it.each(all.map((x) => [x.c.slug, x] as const))('%s: every link works', (_, { c, links }) => {
    for (const href of links) {
      const l = parseGuideLink(href)
      const where = `${c.slug}: ${href}`
      switch (l.kind) {
        case 'chapter': {
          const to = chapterBySlug(l.slug)
          expect(to, where).toBeDefined()
          if (l.anchor) expect(headingIds(to!.blocks), where).toContain(l.anchor)
          break
        }
        case 'anchor':
          expect(headingIds(c.blocks), where).toContain(l.anchor)
          break
        case 'external':
          expect(href, where).toMatch(/^https:\/\//)
          break
        case 'repo':
          expect(existsSync(new URL(`../../docs/learn/${l.path}`, import.meta.url)), where).toBe(
            true,
          )
          break
        case 'example': {
          const ex = EXAMPLES.find((e) => e.file === l.tryIt.file)
          expect(ex, where).toBeDefined()
          const t = exampleTopology(ex!)
          const source = l.tryIt.source ?? ex!.source
          expect(
            t.nodes.map((n) => n.id),
            where,
          ).toContain(source)
          if (l.tryIt.row) {
            const p = rowProtection(t, source, l.tryIt.row.dest, l.tryIt.row.via)
            expect(p, `${where}: no such row`).toBeDefined()
          }
          for (const id of l.tryIt.failLinks)
            expect(
              t.links.map((x) => x.id),
              where,
            ).toContain(id)
          for (const id of l.tryIt.failNodes)
            expect(
              t.nodes.map((n) => n.id),
              where,
            ).toContain(id)
          break
        }
      }
    }
  })

  it('draws every picture it shows, and shows every picture it draws', () => {
    const shown = new Set(all.flatMap((x) => x.images))
    for (const src of shown) {
      expect(src).toMatch(/^img\/[\w-]+\.svg$/)
      expect(DIAGRAMS.map((d) => `img/${d.file}`)).toContain(src)
    }
    for (const d of DIAGRAMS) expect(shown, d.file).toContain(`img/${d.file}`)
  })
})
