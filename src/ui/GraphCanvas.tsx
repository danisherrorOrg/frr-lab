import cytoscape from 'cytoscape'
import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { decorate, STYLE, sync, type Highlight } from './canvas'

/** Cytoscape wrapper: draws the topology and turns clicks into store actions. */
export function GraphCanvas({ highlight }: { highlight: Highlight }) {
  const box = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
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
      const st = useStore.getState()
      const target = ev.target as cytoscape.Core | cytoscape.SingularElementReturnValue
      if (target === cy) {
        if (st.tool === 'add-router') st.addRouter(ev.position)
        else st.select(null)
        if (st.linkStart !== null) st.setTool(st.tool)
        return
      }
      const el = target as cytoscape.SingularElementReturnValue
      const id = el.id()
      if (el.isNode()) {
        if (st.tool === 'add-link') st.linkClick(id)
        else st.select({ kind: 'node', id })
      } else if (st.tool === 'fail-link') {
        st.toggleFailed(id)
      } else {
        st.select({ kind: 'link', id })
      }
    })
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
    })
  }, [topology, highlight, selection, linkStart, failedLinks])

  const cursor = tool === 'select' ? 'cursor-default' : 'cursor-crosshair'
  return (
    <div
      ref={box}
      className={`h-full w-full ${cursor}`}
      role="img"
      aria-label={`Network diagram: ${topology.nodes.length} routers, ${topology.links.length} links`}
    />
  )
}
