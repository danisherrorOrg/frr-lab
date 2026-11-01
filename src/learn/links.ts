// What a link in the Learn guide points at (D60). The same Markdown works on GitHub
// (plain relative links) and in the app (chapter links turn the page, example links
// load the example).
import type { RepairMode } from '../engine/simulate'
import type { NodeId } from '../engine/types'

/** "Try it": load an example, then optionally pick a row and fail things. */
export interface TryIt {
  /** File name in examples/, e.g. `02-ring5.yaml`. */
  file: string
  source?: NodeId
  row?: { dest: NodeId; via: NodeId }
  failLinks: string[]
  failNodes: NodeId[]
  mode?: RepairMode
}

export type GuideLink =
  | { kind: 'chapter'; slug: string; anchor?: string }
  | { kind: 'anchor'; anchor: string }
  | { kind: 'example'; tryIt: TryIt }
  | { kind: 'external'; href: string }
  | { kind: 'repo'; path: string }

const MODES: RepairMode[] = ['lfa', 'rlfa', 'tilfa']
const list = (v: string | null) => (v ? v.split(',').filter((x) => x !== '') : [])

/** Classify a link from a guide chapter (relative to docs/learn/). */
export function parseGuideLink(href: string): GuideLink {
  if (/^https?:\/\//.test(href)) return { kind: 'external', href }
  if (href.startsWith('#')) return { kind: 'anchor', anchor: href.slice(1) }
  const [path = '', hash] = href.split('#')
  const ex = /^\.\.\/\.\.\/examples\/([\w.-]+\.yaml)$/.exec(path)
  if (ex) {
    const q = new URLSearchParams(hash ?? '')
    const dest = q.get('dest')
    const via = q.get('via')
    const mode = q.get('mode')
    return {
      kind: 'example',
      tryIt: {
        file: ex[1]!,
        ...(q.get('source') ? { source: q.get('source')! } : {}),
        ...(dest && via ? { row: { dest, via } } : {}),
        failLinks: list(q.get('fail')),
        failNodes: list(q.get('down')),
        ...(mode && (MODES as string[]).includes(mode) ? { mode: mode as RepairMode } : {}),
      },
    }
  }
  const ch = /^([\w-]+)\.md$/.exec(path)
  if (ch) return { kind: 'chapter', slug: ch[1]!, ...(hash ? { anchor: hash } : {}) }
  return { kind: 'repo', path }
}
