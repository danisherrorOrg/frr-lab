import type { PacketAction, PacketHop, PacketWalk as Walk } from '../engine/packet-walk'
import type { NodeId, Segment } from '../engine/types'
import { hopName, linkName, type Bundles } from './format'

interface Props {
  walk: Walk
  /** The protected link S–E, for the text at S. */
  e: NodeId
  failedLink: string
  /** Current hop, or null before the walk is started. */
  step: number | null
  onStep: (step: number | null) => void
  onPhp: (php: boolean) => void
  b: Bundles
}

const btn =
  'rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-40 focus:outline-2 focus:outline-indigo-500 dark:border-slate-600 dark:hover:bg-slate-800'

const segName = (s: Segment, b: Bundles) =>
  s.kind === 'prefix'
    ? `Prefix-SID(${s.node})`
    : `Adj-SID(${s.from}→${hopName(b, s.from, s.to, s.link)})`

/** A label stack, top first: "16004 B · 24005 B→C · 16002 E", or "no labels". */
function Stack({ segs, b }: { segs: Segment[] | undefined; b: Bundles }) {
  if (segs === undefined) return <span className="text-slate-400">–</span>
  if (segs.length === 0) return <span className="text-slate-500 italic">no labels (IP)</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {segs.map((s, i) => (
        <span
          key={i}
          title={segName(s, b)}
          className={`rounded px-1 font-mono text-xs ${
            s.kind === 'adj'
              ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
              : 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200'
          }`}
        >
          {s.label}{' '}
          <span className="opacity-70">
            {s.kind === 'prefix' ? s.node : `${s.from}→${hopName(b, s.from, s.to, s.link)}`}
          </span>
        </span>
      ))}
    </span>
  )
}

/** One action as a plain-English sentence with the real numbers (UI rule: show numbers). */
function actionText(
  a: PacketAction,
  hop: PacketHop,
  walk: Walk,
  e: NodeId,
  failed: string,
  b: Bundles,
) {
  const r = hop.router
  const own = walk.hops[0]!.received[0]!
  switch (a.kind) {
    case 'push':
      return a.segments.length === 0
        ? `The packet comes in with ${walk.d}'s label ${own.label}. The repair needs no extra labels.`
        : `Pushes ${a.segments.map((s) => `${s.label} (${segName(s, b)})`).join(', ')} on top of ${walk.d}'s label ${own.label} (RFC 9855 §5).`
    case 'repair-out':
      return `Link ${linkName(b, r, e, failed)} is down, so ${r} sends out of its repair interface to ${hopName(b, r, a.to, a.link)}, not its normal next hop ${e}.`
    case 'forward': {
      const y = a.segment.node
      return `Top label ${a.segment.label} is ${y}'s Prefix-SID: ${r} uses its normal table to reach ${y}. Next hop ${a.to}, since c(${r},${a.to}) + dist(${a.to},${y}) = ${a.metric} + ${a.distNextY} = ${a.distRY} = dist(${r},${y}).`
    }
    case 'php':
      return `PHP: ${hop.to} is the end of the segment ${segName(a.segment, b)}, so ${r} pops ${a.segment.label} before sending (penultimate-hop popping).`
    case 'pop-end':
      return `${a.segment.label} is ${r}'s own Prefix-SID: this segment ends here, so ${r} pops it.`
    case 'pop-adj':
      return `${a.segment.label} is ${r}'s own Adj-SID for link ${linkName(b, r, a.segment.to, a.segment.link)}: ${r} pops it and sends out that link (metric ${hop.metric}), whatever its normal table says.`
    case 'deliver':
      return walk.php
        ? `No labels left (the previous router popped ${walk.d}'s label): delivered as a plain IP packet.`
        : `No labels left: delivered as a plain IP packet.`
  }
}

/**
 * Step through the TI-LFA repair router by router, with the label stack at each one
 * (docs/02-algorithms.md §4.5, TODO backlog "Packet walk").
 */
export function PacketWalk({ walk, e, failedLink, step, onStep, onPhp, b }: Props) {
  const last = walk.hops.length - 1
  const hop = step === null ? undefined : walk.hops[step]

  return (
    <div
      aria-label="Packet walk"
      role="group"
      onKeyDown={(ev) => {
        if (step === null) return
        if (ev.key === 'ArrowRight' && step < last) onStep(step + 1)
        else if (ev.key === 'ArrowLeft' && step > 0) onStep(step - 1)
        else return
        ev.preventDefault()
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {step === null ? (
          <button type="button" className={btn} onClick={() => onStep(0)}>
            ▶ Start packet walk
          </button>
        ) : (
          <>
            <button
              type="button"
              className={btn}
              disabled={step === 0}
              onClick={() => onStep(step - 1)}
              aria-label="Previous router"
            >
              ◀ Back
            </button>
            <span className="text-xs text-slate-600 dark:text-slate-300" aria-live="polite">
              Router {step + 1} of {walk.hops.length}: <strong>{hop!.router}</strong>
            </span>
            <button
              type="button"
              className={btn}
              disabled={step === last}
              onClick={() => onStep(step + 1)}
              aria-label="Next router"
            >
              Next ▶
            </button>
            <button type="button" className={btn} onClick={() => onStep(null)}>
              Stop
            </button>
          </>
        )}
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={walk.php} onChange={(ev) => onPhp(ev.target.checked)} />
          PHP (penultimate-hop popping)
        </label>
      </div>

      {hop && (
        <div className="mt-2 rounded border border-violet-300 bg-violet-50 p-2 dark:border-violet-700 dark:bg-violet-950/40">
          <p>
            <span className="text-slate-500">Arrives at {hop.router} with:</span>{' '}
            <Stack segs={hop.received} b={b} />
          </p>
          <ol className="my-1 list-decimal pl-5">
            {hop.actions.map((a, i) => (
              <li key={i}>{actionText(a, hop, walk, e, failedLink, b)}</li>
            ))}
          </ol>
          {hop.to !== undefined && (
            <p>
              <span className="text-slate-500">
                Leaves for {hopName(b, hop.router, hop.to, hop.link)} with:
              </span>{' '}
              <Stack segs={hop.sent} b={b} />
            </p>
          )}
        </div>
      )}

      <table className="mt-2 w-full text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="pr-2">Router</th>
            <th className="pr-2">Arrives with (top first)</th>
            <th className="pr-2">Does</th>
            <th className="pr-2">Leaves with</th>
          </tr>
        </thead>
        <tbody>
          {walk.hops.map((h, i) => (
            <tr
              key={i}
              onClick={() => onStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={`cursor-pointer align-top ${i === step ? 'bg-violet-100 dark:bg-violet-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <td className="pr-2 font-semibold">{h.router}</td>
              <td className="pr-2">
                <Stack segs={h.received} b={b} />
              </td>
              <td className="pr-2">{h.actions.map((a) => ACTION_SHORT[a.kind]).join(', ')}</td>
              <td className="pr-2">
                {h.to === undefined ? 'delivered' : <Stack segs={h.sent} b={b} />}
                {h.to !== undefined && <span className="text-slate-500"> → {h.to}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-slate-500">
        Total {walk.cost}, the post-convergence cost. Only {walk.s} uses the repair; every other
        router just reads the top label. Assumes the packet reaches {walk.s} already carrying{' '}
        {walk.d}&apos;s label.
      </p>
    </div>
  )
}

const ACTION_SHORT: Record<PacketAction['kind'], string> = {
  push: 'push',
  'repair-out': 'repair interface',
  forward: 'forward',
  php: 'PHP pop',
  'pop-end': 'pop (own SID)',
  'pop-adj': 'pop Adj-SID',
  deliver: 'deliver',
}
