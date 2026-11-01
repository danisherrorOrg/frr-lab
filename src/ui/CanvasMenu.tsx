import type { KeyboardEvent } from 'react'
import { useStore, type Selection } from '../state/store'
import { bundles, linkName } from './format'

export type Target = Exclude<Selection, null>

const item =
  'block w-full px-3 py-1 text-left hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:hover:bg-slate-700 dark:focus:bg-slate-700'

/** ↑ / ↓ move between menu items; Escape is handled by the canvas. */
function moveFocus(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  const i = items.indexOf(document.activeElement as HTMLElement)
  const next = e.key === 'ArrowDown' ? i + 1 : i - 1
  items[(next + items.length) % items.length]?.focus()
}

/**
 * Right-click (or long-press) menu on a router or link (Phase 9.5): the actions
 * that otherwise need a tool change. Positioned by the canvas.
 */
export function CanvasMenu({
  target,
  x,
  y,
  onClose,
  onEditMetric,
}: {
  target: Target
  x: number
  y: number
  onClose: () => void
  onEditMetric: (link: string) => void
}) {
  const topology = useStore((s) => s.topology)
  const source = useStore((s) => s.source)
  const failedLinks = useStore((s) => s.failedLinks)
  const failedNodes = useStore((s) => s.failedNodes)
  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }
  const st = useStore.getState

  let label: string
  let items: { text: string; act: () => void; disabled?: boolean }[]
  if (target.kind === 'node') {
    const id = target.id
    const down = failedNodes.includes(id)
    const overload = topology.nodes.find((n) => n.id === id)?.overload === true
    label = `Router ${id}`
    items = [
      {
        text: source === id ? `◎ ${id} is the source (DUT)` : `◎ Set ${id} as source (DUT)`,
        act: () => st().setSource(id),
        disabled: source === id,
      },
      {
        text: down ? `↺ Restore router ${id}` : `✕ Fail router ${id}`,
        act: () => st().toggleFailedNode(id),
      },
      {
        text: overload ? `⬡ Clear overload bit on ${id}` : `⬡ Set overload bit on ${id}`,
        act: () => st().updateRouter(id, { overload: !overload }),
      },
      {
        text: overload ? '⇄ What if the overload bit is cleared?' : '⇄ What if it is overloaded?',
        act: () => st().openOverloadWhatIf(id),
      },
      { text: `🗑 Delete router ${id}`, act: () => st().remove(target) },
    ]
  } else {
    const l = topology.links.find((k) => k.id === target.id)
    const name = l ? linkName(bundles(topology), l.a, l.b, l.id) : target.id
    const routerDown = l !== undefined && (failedNodes.includes(l.a) || failedNodes.includes(l.b))
    const down = failedLinks.includes(target.id)
    label = `Link ${name}`
    items = [
      {
        text: down ? `↺ Restore link ${name}` : `✕ Fail link ${name}`,
        act: () => st().toggleFailedLink(target.id),
        // Its router is down, so the link is down whatever this says.
        disabled: routerDown && !down,
      },
      { text: '✎ Edit metric…', act: () => onEditMetric(target.id) },
      { text: '🔍 What uses this link?', act: () => st().openLinkView(target.id) },
      { text: '⇄ What if the metric changes?', act: () => st().openWhatIf(target.id) },
      { text: `🗑 Delete link ${name}`, act: () => st().remove(target) },
    ]
  }

  return (
    <div
      role="menu"
      aria-label={label}
      className="absolute z-20 min-w-44 rounded border border-slate-300 bg-white py-1 text-sm shadow-lg dark:border-slate-600 dark:bg-slate-800"
      style={{ left: x, top: y }}
      onKeyDown={moveFocus}
    >
      {items.map((it, i) => (
        <button
          key={it.text}
          type="button"
          role="menuitem"
          // The first item that can be used gets focus, so the keyboard works at once.
          autoFocus={i === items.findIndex((k) => !k.disabled)}
          disabled={it.disabled}
          className={`${item} disabled:text-slate-400`}
          onClick={run(it.act)}
        >
          {it.text}
        </button>
      ))}
    </div>
  )
}
