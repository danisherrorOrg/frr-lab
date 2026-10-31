// Share by URL (F2): the topology goes in the link itself, so nothing is uploaded
// (docs/03-architecture.md §8). Format: #t=<lz-string of the YAML file>&s=<source>.
// Using the YAML text means a shared link is checked by the same rules as an import.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { NodeId, Topology } from '../engine/types'
import { parseTopology, serializeTopology } from './yaml'

export type ShareResult =
  | { ok: true; topology: Topology; source?: NodeId; warnings: string[] }
  | { ok: false; errors: string[] }

/** The URL fragment (with "#") that holds this topology and source. */
export function shareHash(topology: Topology, source: NodeId | null): string {
  const t = compressToEncodedURIComponent(serializeTopology(topology))
  return source === null ? `#t=${t}` : `#t=${t}&s=${encodeURIComponent(source)}`
}

/** Reads a fragment made by shareHash(). Null when it holds no topology. */
export function readShareHash(hash: string): ShareResult | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const t = params.get('t')
  if (t === null || t === '') return null
  // URLSearchParams turns "+" into a space; lz-string's URI alphabet uses "+".
  const yaml = decompressFromEncodedURIComponent(t.replace(/ /g, '+'))
  if (!yaml) {
    return {
      ok: false,
      errors: ['The shared link is damaged or incomplete. Ask for the link again.'],
    }
  }
  const r = parseTopology(yaml)
  if (!r.ok) return r
  const source = params.get('s')
  return source === null ? r : { ...r, source }
}
