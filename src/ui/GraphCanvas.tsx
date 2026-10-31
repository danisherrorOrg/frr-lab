import cytoscape from 'cytoscape'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { decorate, stepFlow, STYLE, sync, type Highlight } from './canvas'

/** A right-click menu on a router, at this spot inside the canvas box. */
interface Menu {
  node: string
  x: number
  y: number
}

/** Cytoscape wrapper: draws the topology and turns clicks into store actions. */
export function GraphCanvas({ highlight }: { highlight: Highlight }) {
  const box = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const [openMenu, setMenu] = useState<Menu | null>(null)
  const failedNodes = useStore((s) => s.failedNodes)
  const topology = useStore((s) => s.topology)
  const loadCount = useStore((s) => s.loadCount)
  const selection = useStore((s) => s.selection)
  const linkStart = useStore((s) => s.linkStart)
  const failedLinks = useStore((s) => s.failedLinks)
  const tool = useStore((s) => s.tool)

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
      const st = useStore.getState()
      const target = ev.target as cytoscape.Core | cytoscape.SingularElementReturnValue
      if (target === cy) {
        st.tapBackground(ev.position)
        return
      }
      const el = target as cytoscape.SingularElementReturnValue
      const id = el.id()
      if (el.isNode()) {
        if (st.tool === 'add-link') st.linkClick(id)
        else if (st.tool === 'fail-router') st.toggleFailedNode(id)
        else st.select({ kind: 'node', id })
      } else if (st.tool === 'fail-link') {
        st.toggleFailedLink(id)
      } else {
        st.select({ kind: 'link', id })
      }
    })
    // Right-click (or long-press) on a router opens a small menu (Phase 9.3).
    cy.on('cxttap', 'node', (ev) => {
      const n = ev.target as cytoscape.NodeSingular
      const p = ev.renderedPosition
      setMenu({ node: n.id(), x: p.x, y: p.y })
    })
    cy.on('cxttap', (ev) => {
      if (ev.target === cy) setMenu(null)
    })
    cy.on('pan zoom', () => setMenu(null))
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

  useEffect(() => {
    // Routers can be dragged only with the select tool, so other tools' clicks stay clicks.
    cyRef.current?.autoungrabify(tool !== 'select')
  }, [tool])

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

  // The menu's router may have been deleted or renamed since it opened.
  const menu = openMenu && topology.nodes.some((n) => n.id === openMenu.node) ? openMenu : null
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

  const cursor = tool === 'select' ? 'cursor-default' : 'cursor-crosshair'
  const menuDown = menu !== null && failedNodes.includes(menu.node)
  return (
    <div className="relative h-full w-full" onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={box}
        className={`h-full w-full ${cursor}`}
        role="img"
        aria-label={`Network diagram: ${topology.nodes.length} routers, ${topology.links.length} links`}
      />
      {menu && (
        <div
          role="menu"
          aria-label={`Router ${menu.node}`}
          className="absolute z-10 min-w-36 rounded border border-slate-300 bg-white py-1 text-sm shadow-lg dark:border-slate-600 dark:bg-slate-800"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            autoFocus
            className="block w-full px-3 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={() => {
              useStore.getState().toggleFailedNode(menu.node)
              setMenu(null)
            }}
          >
            {menuDown ? `↺ Restore router ${menu.node}` : `✕ Fail router ${menu.node}`}
          </button>
        </div>
      )}
    </div>
  )
}
