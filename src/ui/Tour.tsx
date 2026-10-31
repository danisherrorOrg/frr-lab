import type { ReactNode } from 'react'
import type { NodeId, Segment } from '../engine/types'
import { useStore } from '../state/store'
import {
  applyTourStep,
  markTourSeen,
  segmentMeaning,
  tourFacts,
  TOUR_STEPS,
  type TourFacts,
} from './tour-steps'

const button =
  'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700'
const primary =
  'rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'

const arrow = (ids: NodeId[]) => ids.join(' → ')

/** The part of the TI-LFA path each segment covers: S → A → B, then B → C → E. */
function legs(path: NodeId[], segs: Segment[]): NodeId[][] {
  const out: NodeId[][] = []
  let at = 0
  for (const seg of segs) {
    const end = seg.kind === 'prefix' ? seg.node : seg.to
    const i = path.indexOf(end, at + 1)
    if (i < 0) return []
    out.push(path.slice(at, i + 1))
    at = i
  }
  return out
}

function stepContent(n: number, f: TourFacts | null): { title: string; body: ReactNode } {
  if (n === 0)
    return {
      title: 'Welcome to LFA Lab',
      body: (
        <p>
          LFA Lab works out the backup paths routers use when a link fails: LFA, Remote LFA and
          TI-LFA. This short tour loads a small ring, breaks one link and reads the TI-LFA label
          stack.
        </p>
      ),
    }
  if (n === 4 || !f)
    return {
      title: 'Your turn',
      body: (
        <ul className="ml-4 list-disc space-y-1">
          <li>Bring S–E back with “Restore link” in the failure panel.</li>
          <li>Fail links yourself: pick “Fail link” (F) on the left and click a link.</li>
          <li>Try the other networks in the Examples menu, or draw your own.</li>
          <li>Start this tour again any time with the Tour button at the top.</li>
        </ul>
      ),
    }
  if (n === 1) {
    const N = f.neighbor
    return {
      title: 'Example 2: a five-router ring',
      body: (
        <>
          <p>
            S sends traffic for E over the direct link S–E (cost {f.cost}), drawn in blue. The
            Details panel below shows this row.
          </p>
          {N && !f.hasLfa && (
            <p>
              If S–E fails, S’s only other neighbor is {N.id}. It is not a loop-free alternate:{' '}
              <span className="font-mono">
                dist({N.id},E)={N.toD} &lt; dist({N.id},S)+dist(S,E)={N.viaS} ✗
              </span>
              , so {N.id} might send the packet straight back to S. No LFA here.
            </p>
          )}
        </>
      ),
    }
  }
  if (n === 2)
    return {
      title: 'Fail link S–E',
      body: (
        <p>
          S–E is now down (red ✕). Within about 50 ms S moves the traffic to its TI-LFA backup:{' '}
          <strong>{arrow(f.path)}</strong>, the dashed line. The failure panel below lists every
          destination that was hit.
        </p>
      ),
    }
  const parts = legs(f.path, f.segments)
  return {
    title: 'Read the TI-LFA label stack',
    body: (
      <>
        <p>
          S pushes <span className="font-mono font-semibold">{f.labels.join(', ')}</span> (top label
          first):
        </p>
        <ul className="ml-4 list-disc space-y-1">
          {f.segments.map((seg, i) => (
            <li key={i}>
              <span className="font-mono">{seg.label}</span> = {segmentMeaning(seg, f)}
              {parts[i] && (
                <>
                  : {seg.kind === 'prefix' ? 'shortest path' : 'this exact link'}, {arrow(parts[i])}
                </>
              )}
              .
            </li>
          ))}
        </ul>
        <p>
          That is the path the network settles on after it reconverges, so traffic moves only once.
          It is under TI-LFA in the Details panel; open “Packet walk” in the failure panel to step
          through each hop.
        </p>
      </>
    ),
  }
}

/** The guided tour card (TODO backlog). Not modal: the app stays usable around it. */
export function Tour() {
  const step = useStore((s) => s.tour)
  const topology = useStore((s) => s.topology)
  const setTour = useStore((s) => s.setTour)
  if (step === null) return null
  const f = step >= 1 && step <= 3 ? tourFacts(topology) : null
  const { title, body } = stepContent(step, f)
  const go = (n: number) => {
    applyTourStep(n)
    setTour(n)
  }
  const close = () => {
    markTourSeen()
    setTour(null)
  }
  const last = step === TOUR_STEPS - 1

  return (
    <div
      role="dialog"
      aria-label="Guided tour"
      className="fixed inset-x-4 bottom-4 z-50 rounded-lg border border-slate-300 bg-white p-4 text-sm shadow-xl md:right-4 md:left-auto md:w-96 dark:border-slate-600 dark:bg-slate-800"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          {step > 0 && (
            <p className="text-xs text-slate-500">
              Step {step} of {TOUR_STEPS - 1}
            </p>
          )}
          <h2 className="font-semibold">{title}</h2>
        </div>
        <button type="button" aria-label="Close the tour" onClick={close}>
          ✕
        </button>
      </div>
      <div className="space-y-2">{body}</div>
      <div className="mt-3 flex justify-end gap-2">
        {step === 0 ? (
          <>
            <button type="button" className={button} onClick={close}>
              No thanks
            </button>
            <button type="button" className={primary} onClick={() => go(1)}>
              Start tour
            </button>
          </>
        ) : (
          <>
            <button type="button" className={button} onClick={() => go(step - 1)}>
              Back
            </button>
            {last ? (
              <button type="button" className={primary} onClick={close}>
                Finish
              </button>
            ) : (
              <button type="button" className={primary} onClick={() => go(step + 1)}>
                Next
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
