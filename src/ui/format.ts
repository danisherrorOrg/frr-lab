// Small text helpers for the results table and detail panel. No routing maths:
// they only read what the engine returned.
import type { ProtectionPaths } from '../engine/paths'
import type { NodeId, Protection, Segment } from '../engine/types'
import type { BackupKind } from '../state/store'

export type Method = 'ecmp' | 'lfa' | 'rlfa' | 'tilfa'

export const METHOD_NAME: Record<Method, string> = {
  ecmp: 'ECMP',
  lfa: 'LFA',
  rlfa: 'Remote LFA',
  tilfa: 'TI-LFA',
}

/**
 * The simplest method that protects this pair, in the order coverage counts
 * them (docs/02-algorithms.md §5): ECMP, LFA, Remote LFA, TI-LFA.
 */
export function protectedBy(p: Protection): Method | null {
  if (p.ecmpProtected) return 'ecmp'
  if (p.lfa.best !== undefined) return 'lfa'
  if (p.rlfa.needed && p.rlfa.best !== undefined) return 'rlfa'
  if (p.tilfa.path !== undefined) return 'tilfa'
  return null
}

export const segmentText = (s: Segment): string =>
  s.kind === 'prefix' ? `Prefix ${s.node}` : `Adj ${s.from}→${s.to}`

/** "B · B→C · E": short form for the table. */
export const segmentsShort = (segs: Segment[]): string =>
  segs.map((s) => (s.kind === 'prefix' ? s.node : `${s.from}→${s.to}`)).join(' · ')

/** Tags for one LFA candidate, e.g. "node-protecting, downstream". */
export function lfaTags(c: {
  loopFree: boolean
  downstream: boolean
  nodeProtecting: boolean
}): string {
  if (!c.loopFree) return 'not loop-free'
  const tags = [c.nodeProtecting ? 'node-protecting' : 'link-protecting']
  if (c.downstream) tags.push('downstream')
  return tags.join(', ')
}

/** The backup path to draw: the chosen kind, or for 'auto' the first that exists. */
export function pickBackup(
  paths: ProtectionPaths,
  kind: BackupKind,
): { kind: Exclude<BackupKind, 'auto'>; path: NodeId[] } | null {
  const order = kind === 'auto' ? (['lfa', 'rlfa', 'tilfa'] as const) : [kind]
  for (const k of order) {
    const path = paths[k]
    if (path) return { kind: k, path }
  }
  return null
}

/** Parse a number typed in a field; '' and non-numbers give NaN so range checks fail. */
export const toNumber = (text: string) => (text.trim() === '' ? NaN : Number(text.trim()))

/** File name from the topology name: "Small ISP core" → "small-isp-core.yaml". */
export const fileName = (name: string) =>
  `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'topology'
  }.yaml`
