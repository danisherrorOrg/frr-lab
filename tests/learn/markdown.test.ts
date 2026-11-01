import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown, plain, slug } from '../../src/learn/markdown'

describe('parseInline', () => {
  it('reads code, strong, em and links', () => {
    expect(parseInline('a `x<y` **b *c* d** [d](e.md#f) g')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'code', text: 'x<y' },
      { kind: 'text', text: ' ' },
      {
        kind: 'strong',
        children: [
          { kind: 'text', text: 'b ' },
          { kind: 'em', children: [{ kind: 'text', text: 'c' }] },
          { kind: 'text', text: ' d' },
        ],
      },
      { kind: 'text', text: ' ' },
      { kind: 'link', href: 'e.md#f', children: [{ kind: 'text', text: 'd' }] },
      { kind: 'text', text: ' g' },
    ])
  })

  it('keeps a lone * and brackets without a link as text', () => {
    expect(plain(parseInline('2 * 3 [not a link] dist(N,D)'))).toBe('2 * 3 [not a link] dist(N,D)')
  })

  it('keeps * inside code spans', () => {
    expect(parseInline('`a*b*c`')).toEqual([{ kind: 'code', text: 'a*b*c' }])
  })
})

describe('slug', () => {
  it('matches GitHub heading anchors', () => {
    expect(slug('Inequality 1: loop-free (required)')).toBe('inequality-1-loop-free-required')
    expect(slug('`dist(X,Y)` from any router')).toBe('distxy-from-any-router')
  })
})

describe('parseMarkdown', () => {
  it('reads headings, paragraphs and code', () => {
    const md = '# Title\n\nOne\ntwo.\n\n```\nx < y\n```\n'
    expect(parseMarkdown(md)).toEqual([
      { kind: 'heading', level: 1, id: 'title', children: [{ kind: 'text', text: 'Title' }] },
      { kind: 'para', children: [{ kind: 'text', text: 'One two.' }] },
      { kind: 'code', lang: '', text: 'x < y' },
    ])
  })

  it('reads tables, with | inside code', () => {
    const [t] = parseMarkdown('| A | B |\n|---|---|\n| `a|b` | 2 |\n')
    expect(t).toMatchObject({
      kind: 'table',
      rows: [[[{ kind: 'code', text: 'a|b' }], [{ text: '2' }]]],
    })
  })

  it('reads ordered and nested lists', () => {
    const [l] = parseMarkdown('1. one\n2. two\n   - inner\n3. three\n')
    expect(l).toMatchObject({ kind: 'list', ordered: true })
    if (l?.kind !== 'list') throw new Error('not a list')
    expect(l.items).toHaveLength(3)
    expect(l.items[1]![1]).toMatchObject({ kind: 'list', ordered: false })
  })

  it('reads quotes with lists inside', () => {
    const [q] = parseMarkdown('> **Try it**\n>\n> - one\n> - two\n')
    expect(q).toMatchObject({
      kind: 'quote',
      children: [{ kind: 'para' }, { kind: 'list', items: [[{}], [{}]] }],
    })
  })

  it('reads details with a summary', () => {
    const [d] = parseMarkdown('<details>\n<summary>Answers</summary>\n\n1. yes\n\n</details>\n')
    expect(d).toMatchObject({
      kind: 'details',
      summary: [{ text: 'Answers' }],
      children: [{ kind: 'list', ordered: true }],
    })
  })

  it('reads an image on its own line and a rule', () => {
    expect(parseMarkdown('![A ring](img/ring.svg)\n\n---\n')).toEqual([
      { kind: 'image', alt: 'A ring', src: 'img/ring.svg' },
      { kind: 'hr' },
    ])
  })
})
