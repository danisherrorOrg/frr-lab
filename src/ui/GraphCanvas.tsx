import cytoscape from 'cytoscape'
import { useEffect, useRef, useState } from 'react'
import type { NodeId } from '../engine/types'
import { useStore } from '../state/store'
import { decorate, stepFlow, STYLE, sync, type Highlight } from './canvas'
import { CanvasMenu, type Target } from './CanvasMenu'
import { tooltipLines } from './format'
import { MetricEditor } from './MetricEditor'

/** Something placed at a spot inside the canvas box. */
interface At {
  x: number
  y: number
}

const control =
  'h-8 min-w-8 rounded border border-slate-300 bg-white/90 px-2 text-sm shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800/90 dark:hover:bg-slate-700'

/** What a Cytoscape event hit: a router, a link, or nothing. */
function targetOf(ev: cytoscape.EventObject, cy: cytoscape.Core): Target | null {
  const hit = ev.target as unknown
  if (hit === cy) return null
  const el = hit as cytoscape.SingularElementReturnValue
  const id = el.id()
  return el.isNode() ? { kind: 'node', id } : { kind: 'link', id }
}

/**
 * Cytoscape wrapper: draws the topology and turns clicks into store actions.
 * `onRouterTap`: a router was clicked (to open its row, or make it the DUT).
 */
export function GraphCanvas({
  highlight,
  onRouterTap,
}: {
  highlight: Highlight
  onRouterTap?: (id: NodeId) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const onTap = useRef(onRouterTap)
  const [openMenu, setMenu] = useState<(At & { target: Target }) | null>(null)
  const [hover, setHover] = useState<(At & { target: Target }) | null>(null)
  const [openEditor, setEditor] = useState<(At & { link: string }) | null>(null)
  const failedNodes = useStore((s) => s.failedNodes)
  const topology = useStore((s) => s.topology)
  const loadCount = useStore((s) => s.loadCount)
  const selection = useStore((s) => s.selection)
  const linkStart = useStore((s) => s.linkStart)
  const failedLinks = useStore((s) => s.failedLinks)
  const tool = useStore((s) => s.tool)
  const notice = useStore((s) => s.notice)

  useEffect(() => {
    onTap.current = onRouterTap
  }, [onRouterTap])

  useEffect(() => {
    const cy = cytoscape({
      container: box.current,
      style: STYLE,
      minZoom: 0.2,
      maxZoom: 3,
      boxSelectionEnabled: false,
      selectionType: 'single',
    })
    // We draw our own selection, so turn off Cytoscape's.
    cy.autounselectify(true)

    cy.on('tap', (ev) => {
      setMenu(null)
      setHover(null)
      const st = useStore.getState()
      const target = targetOf(ev, cy)
      if (target === null) {
        st.tapBackground(ev.position)
        return
      }
      const { id } = target
      if (target.kind === 'node') {
        if (st.tool === 'add-link') st.linkClick(id)
        else if (st.tool === 'fail-router') st.toggleFailedNode(id)
        else {
          st.select({ kind: 'node', id })
          onTap.current?.(id)
        }
      } else if (st.tool === 'fail-link') {
        st.toggleFailedLink(id)
      } else {
        st.select({ kind: 'link', id })
      }
    })
    // Double-click a link: edit its metric right there (Phase 9.5). Not in the
    // fail-link tool, where the two clicks already failed and restored it.
    cy.on('dbltap', 'edge', (ev) => {
      if (useStore.getState().tool === 'fail-link') return
      const p = ev.renderedPosition
      setMenu(null)
      setEditor({ link: (ev.target as cytoscape.EdgeSingular).id(), x: p.x, y: p.y })
    })
    // Right-click (a long press on touch screens) on a router or link opens a menu.
    cy.on('cxttap', (ev) => {
      setHover(null)
      const target = targetOf(ev, cy)
      const p = ev.renderedPosition
      setMenu(target && { target, x: p.x, y: p.y })
    })
    cy.on('taphold', 'node, edge', (ev) => {
      const target = targetOf(ev, cy)
      const p = ev.renderedPosition
      if (target) setMenu({ target, x: p.x, y: p.y })
    })
    cy.on('mouseover', 'node, edge', (ev) => {
      const target = targetOf(ev, cy)
      const p = ev.renderedPosition
      if (target) setHover({ target, x: p.x, y: p.y })
    })
    cy.on('mouseout', 'node, edge', () => setHover(null))
    cy.on('pan zoom grab drag', () => {
      setMenu(null)
      setHover(null)
      setEditor(null)
    })
    // Routers can be dragged with every tool: a drag never counts as a click (Phase 9.5).
    cy.on('dragfree', 'node', (ev) => {
      const n = ev.target as cytoscape.NodeSingular
      useStore.getState().moveRouter(n.id(), n.position())
    })

    cyRef.current = cy
    sync(cy, useStore.getState().topology)
    cy.fit(undefined, 40)
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [])

  useEffect(() => {
    if (cyRef.current) sync(cyRef.current, topology)
  }, [topology])

  useEffect(() => {
    cyRef.current?.fit(undefined, 40)
  }, [loadCount])

  // Cytoscape remembers where its box is on the page and only looks again when the box
  // changes size. A notice opening or closing above the diagram moves the box without
  // resizing it, so clicks would land on the wrong spot (a restored router couldn't be
  // failed again until its "back up" notice was closed). resize() makes it look again;
  // it is cheap when the size is the same.
  useEffect(() => {
    cyRef.current?.resize()
  }, [notice])
  /** Before every click, in case something else moved the box. */
  const remeasure = () => cyRef.current?.resize()

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    decorate(cy, topology, highlight, {
      selection: selection?.id ?? null,
      linkStart,
      failed: failedLinks,
      failedNodes,
    })
  }, [topology, highlight, selection, linkStart, failedLinks, failedNodes])

  // The menu's or editor's router or link may have been deleted or renamed since it opened.
  const exists = (t: Target) =>
    t.kind === 'node'
      ? topology.nodes.some((n) => n.id === t.id)
      : topology.links.some((l) => l.id === t.id)
  const menu = openMenu && exists(openMenu.target) ? openMenu : null
  const editor = openEditor && exists({ kind: 'link', id: openEditor.link }) ? openEditor : null
  const tip = hover && !menu && !editor && exists(hover.target) ? hover : null
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  // Traffic on the repair path: marching dashes, unless the user asked for less motion.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !highlight.flowing) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let offset = 0
    const timer = window.setInterval(() => {
      offset = (offset + 2) % 1600
      stepFlow(cy, offset)
    }, 50)
    return () => window.clearInterval(timer)
  }, [highlight])

  /** Zoom by `factor` around the middle of the canvas (buttons for touch and trackpads). */
  const zoomBy = (factor: number) => {
    const cy = cyRef.current
    if (!cy) return
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    })
  }

  const cursor = tool === 'select' ? 'cursor-default' : 'cursor-crosshair'
  return (
    <div
      className="relative h-full w-full"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDownCapture={remeasure}
    >
      <div
        ref={box}
        className={`h-full w-full ${cursor}`}
        role="img"
        aria-label={`Network diagram: ${topology.nodes.length} routers, ${topology.links.length} links`}
      />
      <div
        role="toolbar"
        aria-label="Diagram view"
        className="absolute top-2 right-2 z-10 flex gap-1"
      >
        <button
          type="button"
          className={control}
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoomBy(1.25)}
        >
          +
        </button>
        <button
          type="button"
          className={control}
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoomBy(0.8)}
        >
          −
        </button>
        <button
          type="button"
          className={control}
          title="Show the whole network"
          onClick={() => cyRef.current?.fit(undefined, 40)}
        >
          Fit
        </button>
        <button
          type="button"
          className={control}
          title="Place the routers again so links are short and routers don't overlap (undo with Ctrl+Z)"
          onClick={() => useStore.getState().autoLayout()}
        >
          Auto layout
        </button>
      </div>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 rounded bg-slate-900/90 px-2 py-1 text-xs whitespace-nowrap text-white shadow dark:bg-slate-100/95 dark:text-slate-900"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
        >
          {tooltipLines(topology, tip.target, { links: failedLinks, nodes: failedNodes }).map(
            (line) => (
              <div key={line}>{line}</div>
            ),
          )}
        </div>
      )}
      {menu && (
        <CanvasMenu
          target={menu.target}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onEditMetric={(link) => setEditor({ link, x: menu.x, y: menu.y })}
        />
      )}
      {editor && (
        <MetricEditor
          key={editor.link}
          link={editor.link}
          x={editor.x}
          y={editor.y}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  )
}
