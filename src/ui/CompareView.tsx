import { useMemo } from 'react'
import type { BackupComparison, BackupOption, CompareMethod } from '../engine/compare'
import type { ProtectionPaths } from '../engine/paths'
import type { NodeId, Topology } from '../engine/types'
import { useStore, type BackupKind } from '../state/store'
import { bundles, hopName, linkName, METHOD_NAME, segmentText, type Bundles } from './format'
import { MiniMap } from './MiniMap'

interface Props {
  comparison: BackupComparison
  /** What the main diagram can draw: Remote LFA only when it is needed. */
  paths: ProtectionPaths
  drawn: Exclude<BackupKind, 'auto'> | null
  onBackup: (b: BackupKind) => void
}

const RFC: Record<CompareMethod, string> = { lfa: 'RFC 5286', rlfa: 'RFC 7490', tilfa: 'RFC 9855' }
const btn =
  'rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 focus:outline-2 focus:outline-indigo-500 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800'
const arrow = (ids: NodeId[]) => ids.join('→')

/**
 * LFA, Remote LFA and TI-LFA for the selected row, side by side (TODO backlog,
 * docs/02-algorithms.md §10): each one's path, cost, labels and how it compares
 * with the path S takes once the network has reconverged.
 */
export function CompareView({ comparison: c, paths, drawn, onBackup }: Props) {
  const topology = useStore((s) => s.topology)
  const b = useMemo(() => bundles(topology), [topology])
  const sE = linkName(b, c.s, c.e, c.link)

  return (
    <section id="compare" aria-label="Compare backups" className="text-sm">
      <h2 className="text-base font-semibold">
        Compare backups: {c.s} → {c.d}, link {sE} fails
      </h2>
      <p className="text-slate-600 dark:text-slate-300">
        Normal path <Mono>{arrow(c.primary.path)}</Mono> (cost {c.primary.cost}).{' '}
        {c.final ? (
          <>
            Once every router has reconverged without {sE}, {c.s} uses{' '}
            <Mono>{arrow(c.final.path)}</Mono> (cost {c.final.cost}).
          </>
        ) : (
          <>
            Without {sE}, {c.d} can&apos;t be reached at all.
          </>
        )}
      </p>
      <p className="mt-1 text-slate-600 dark:text-slate-300">{verdict(c)}</p>
      <ul className="mt-2 grid gap-3 md:grid-cols-3">
        {c.options.map((o) => (
          <li
            key={o.method}
            aria-label={METHOD_NAME[o.method]}
            className={`rounded border p-2 ${
              o.used
                ? 'border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-950/40'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <Card
              c={c}
              o={o}
              b={b}
              topology={topology}
              drawable={paths[o.method] !== undefined}
              drawn={drawn === o.method}
              onDraw={() => onBackup(o.method)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One line saying which method protects and what the others would do. */
function verdict(c: BackupComparison): string {
  if (c.protectedBy === 'ecmp')
    return `ECMP protects ${c.d} first: ${c.s} keeps sending over its other equal-cost next hop, so none of the three is needed.`
  if (c.protectedBy === null) return `None of the three can protect ${c.d} against this failure.`
  const used = METHOD_NAME[c.protectedBy]
  const also = c.options.filter((o) => o.found && !o.used).map((o) => METHOD_NAME[o.method])
  const tail =
    also.length === 0 ? 'the others have no backup' : `${also.join(' and ')} would work too`
  return `${used} is the simplest that works (the order the results table uses); ${tail}.`
}

function Card({
  c,
  o,
  b,
  topology,
  drawable,
  drawn,
  onDraw,
}: {
  c: BackupComparison
  o: BackupOption
  b: Bundles
  topology: Topology
  drawable: boolean
  drawn: boolean
  onDraw: () => void
}) {
  const status = o.used
    ? { text: '✓ Used', cls: 'text-green-700 dark:text-green-400' }
    : o.found
      ? { text: '✓ Also works', cls: 'text-slate-700 dark:text-slate-200' }
      : { text: '✗ No backup', cls: 'text-red-700 dark:text-red-400' }

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {METHOD_NAME[o.method]} <span className="text-xs text-slate-500">({RFC[o.method]})</span>
        </h3>
        <span className={`text-xs font-semibold ${status.cls}`}>{status.text}</span>
      </div>
      <MiniMap
        topology={topology}
        s={c.s}
        d={c.d}
        {...(o.found && { path: o.path!, links: o.links! })}
        down={new Set([c.link])}
        {...(o.via !== undefined && { mark: o.via })}
        star={o.method === 'rlfa'}
        label={
          o.found
            ? `${METHOD_NAME[o.method]} path ${arrow(o.path!)}`
            : `No ${METHOD_NAME[o.method]} path`
        }
      />
      {o.found ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
          <dt className="text-slate-500">How</dt>
          <dd>{how(c, o, b)}</dd>
          <dt className="text-slate-500">Path</dt>
          <dd>
            <Mono>{arrow(o.path!)}</Mono>
          </dd>
          <dt className="text-slate-500">Cost</dt>
          <dd>
            {o.cost} ({plus(o.cost! - c.primary.cost)} vs normal {c.primary.cost})
          </dd>
          <dt className="text-slate-500">Labels</dt>
          <dd>
            <Mono>{o.segments!.map((x) => x.label).join(', ')}</Mono> ({o.extraLabels} extra)
          </dd>
          <dt className="text-slate-500">vs final</dt>
          <dd>{vsFinal(c, o)}</dd>
        </dl>
      ) : (
        <p className="text-xs text-slate-600 dark:text-slate-300">{whyNot(c, o)}</p>
      )}
      {o.found && !o.used && o.method === 'rlfa' && c.protectedBy === 'lfa' && (
        <p className="mt-1 text-xs text-slate-500">
          Not run here: a router uses Remote LFA only when there is no LFA (RFC 7490 §1).
        </p>
      )}
      {o.found && (
        <button
          type="button"
          className={`${btn} mt-2`}
          disabled={!drawable || drawn}
          onClick={onDraw}
          aria-label={`Draw ${METHOD_NAME[o.method]} on the diagram`}
        >
          {drawn ? 'Drawn on the diagram' : 'Draw on the diagram'}
        </button>
      )}
    </>
  )
}

const plus = (n: number) => (n >= 0 ? `+${n}` : String(n))

/** What S does, in one line with the router names. */
function how(c: BackupComparison, o: BackupOption, b: Bundles): string {
  if (o.method === 'lfa') {
    const kind = o.nodeProtecting ? 'node-protecting' : 'link-protecting only'
    return `Send to neighbor ${hopName(b, c.s, o.via!, o.viaLink)} (${kind}); no new label.`
  }
  if (o.method === 'rlfa') {
    const exit = o.exitVia === undefined ? '' : `, sent out via ${o.exitVia}`
    return o.via === c.d
      ? `Tunnel to PQ node ${o.via}, which is ${c.d} itself${exit}.`
      : `Tunnel to PQ node ${o.via} (its Prefix-SID on top${exit}), then ${o.via}'s normal path.`
  }
  return `Segment list [${o.segments!.map((x) => segmentText(x, b)).join(', ')}] on the post-convergence path.`
}

function vsFinal(c: BackupComparison, o: BackupOption): string {
  if (o.vsFinal === 'same') return 'Same path: nothing moves when the network reconverges.'
  if (o.vsFinal === 'same-cost')
    return `Same cost (${o.cost}), other path: the final one is ${arrow(c.final!.path)}.`
  return `Longer: ${o.cost} vs ${c.final!.cost} after reconvergence, so traffic moves again.`
}

function whyNot(c: BackupComparison, o: BackupOption): string {
  if (!c.final) return `${c.d} can't be reached once the link fails.`
  if (o.method === 'lfa')
    return `No neighbor passes the loop-free check: each one's path to ${c.d} goes back through ${c.s} (RFC 5286 Inequality 1).`
  if (o.method === 'rlfa')
    return `No PQ node: no router is both reachable from ${c.s} without the link (P-space) and sure to reach ${c.e} without it (Q-space).`
  return `${c.d} can't be reached once the link fails.`
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono">{children}</span>
}
