import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  fillServiceWorker,
  listHash,
  PRECACHE_PLACEHOLDER,
  precacheList,
} from '../../src/offline/precache'

const built = ['index.html', 'assets/index-B7rZT5l3.js', 'assets/index-DgtNFD2D.css']

describe('precache list', () => {
  it('keeps the page and every built file, sorted, without maps or sw.js', () => {
    expect(precacheList([...built, 'assets/index-B7rZT5l3.js.map', 'sw.js'])).toEqual([
      '/',
      '/assets/index-B7rZT5l3.js',
      '/assets/index-DgtNFD2D.css',
      '/index.html',
    ])
  })

  it('gives a new cache name when a file changes, the same one otherwise', () => {
    const a = listHash(precacheList(built))
    expect(listHash(precacheList([...built].reverse()))).toBe(a)
    expect(listHash(precacheList(['index.html', 'assets/index-XXXX.js']))).not.toBe(a)
    expect(a).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('service worker source', () => {
  const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')

  it('has the placeholder the build fills in', () => {
    expect(source).toContain(PRECACHE_PLACEHOLDER)
  })

  it('gets the list and version written in', () => {
    const filled = fillServiceWorker(source, built)
    expect(filled).not.toContain(PRECACHE_PLACEHOLDER)
    expect(filled).toContain('"/assets/index-B7rZT5l3.js"')
    expect(filled).toContain(`"version":"${listHash(precacheList(built))}"`)
  })

  it('refuses a source without the placeholder', () => {
    expect(() => fillServiceWorker('const PRECACHE = []', built)).toThrow(/placeholder/)
  })
})
