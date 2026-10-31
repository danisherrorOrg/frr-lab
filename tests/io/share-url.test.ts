import { compressToEncodedURIComponent } from 'lz-string'
import { describe, expect, it } from 'vitest'
import { readShareHash, shareHash } from '../../src/io/share-url'
import { loadFixture } from '../helpers'

const FIXTURES = [
  '01-square.yaml',
  '02-ring5.yaml',
  '03-ring5-highmetric.yaml',
  '04-isp-core.yaml',
  '05-leaf-spine.yaml',
]

describe('share URL', () => {
  it.each(FIXTURES)('round-trips %s with its source', (file) => {
    const t = loadFixture(file)
    const hash = shareHash(t, t.nodes[1]!.id)
    expect(hash.startsWith('#t=')).toBe(true)
    // URL-safe: nothing that needs escaping in a fragment.
    expect(hash).toMatch(/^#[A-Za-z0-9+\-$=&_.%]*$/)
    const back = readShareHash(hash)
    expect(back).toEqual({ ok: true, topology: t, source: t.nodes[1]!.id, warnings: [] })
  })

  it('keeps names, positions and asymmetric metrics', () => {
    const t = loadFixture('04-isp-core.yaml')
    const odd = {
      ...t,
      name: 'Core & edge #1',
      nodes: t.nodes.map((n, i) => ({ ...n, name: `Router ${i}`, pos: { x: i * 10, y: -i } })),
    }
    const back = readShareHash(shareHash(odd, null))
    expect(back).toEqual({ ok: true, topology: odd, warnings: [] })
  })

  it('accepts the hash with or without the leading #', () => {
    const t = loadFixture('01-square.yaml')
    expect(readShareHash(shareHash(t, 'S').slice(1))).toMatchObject({ ok: true, source: 'S' })
  })

  it('returns null when there is no shared topology', () => {
    expect(readShareHash('')).toBeNull()
    expect(readShareHash('#')).toBeNull()
    expect(readShareHash('#section-2')).toBeNull()
  })

  it('gives a clear error for a broken link', () => {
    expect(readShareHash('#t=not-really-compressed!!')).toEqual({
      ok: false,
      errors: ['The shared link is damaged or incomplete. Ask for the link again.'],
    })
  })

  it('validates the topology like an imported file', () => {
    const bad = compressToEncodedURIComponent(
      'nodes:\n  - { id: A, sid: 1 }\n  - { id: A, sid: 2 }\n',
    )
    const r = readShareHash(`#t=${bad}`)
    expect(r?.ok).toBe(false)
    if (r && !r.ok) expect(r.errors.join(' ')).toContain('id "A" is already used')
  })
})
