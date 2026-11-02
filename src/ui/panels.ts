// Panel layout: show / hide and the size of the tools sidebar and the results
// panel under the diagram. A per-viewer convenience, so it lives in this browser
// only (like the theme) and never in the topology, the share link or undo.
import { useEffect, useState } from 'react'
import { create } from 'zustand'

export interface Panels {
  sidebarOpen: boolean
  /** Sidebar width in px (wide screens only). */
  sidebarWidth: number
  resultsOpen: boolean
  /** Results panel height in px (wide screens only); null = a share of the window. */
  resultsHeight: number | null
}

export const DEFAULT_PANELS: Panels = {
  sidebarOpen: true,
  sidebarWidth: 256,
  resultsOpen: true,
  resultsHeight: null,
}

export const SIDEBAR_MIN = 180
export const RESULTS_MIN = 120
/** Room the diagram keeps beside the sidebar, and above the results panel. */
const CANVAS_MIN_W = 320
const CANVAS_MIN_H = 200
/** The top bar and the legend, which also need room above the results panel. */
const CHROME_H = 200

const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(Math.max(v, lo), hi))

/** A sidebar width that leaves the diagram usable in a window `viewportW` wide. */
export const clampSidebar = (w: number, viewportW: number) =>
  clamp(w, SIDEBAR_MIN, Math.max(SIDEBAR_MIN, Math.min(560, viewportW - CANVAS_MIN_W)))

/** A results height that leaves the diagram usable in a window `viewportH` tall. */
export const clampResults = (h: number, viewportH: number) =>
  clamp(h, RESULTS_MIN, Math.max(RESULTS_MIN, viewportH - CHROME_H - CANVAS_MIN_H))

/** The results panel's height until the user drags it: about a third of the window. */
export const autoResultsHeight = (viewportH: number) => Math.round(viewportH * 0.35)

/** Saved panels, checked field by field; anything odd falls back to the default. */
export function parsePanels(text: string | null): Panels {
  let raw: unknown
  try {
    raw = text === null ? null : JSON.parse(text)
  } catch {
    raw = null
  }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const bool = (k: keyof Panels) =>
    typeof o[k] === 'boolean' ? (o[k] as boolean) : (DEFAULT_PANELS[k] as boolean)
  const num = (k: 'sidebarWidth' | 'resultsHeight') =>
    typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : null
  return {
    sidebarOpen: bool('sidebarOpen'),
    sidebarWidth: num('sidebarWidth') ?? DEFAULT_PANELS.sidebarWidth,
    resultsOpen: bool('resultsOpen'),
    resultsHeight: num('resultsHeight') ?? DEFAULT_PANELS.resultsHeight,
  }
}

const KEY = 'lfa-lab-panels'

function load(): Panels {
  try {
    return parsePanels(localStorage.getItem(KEY))
  } catch {
    // Private mode or blocked storage: start with the defaults.
    return DEFAULT_PANELS
  }
}

interface PanelStore extends Panels {
  set: (change: Partial<Panels>) => void
  reset: () => void
}

export const usePanels = create<PanelStore>((set, get) => {
  const save = () => {
    const { sidebarOpen, sidebarWidth, resultsOpen, resultsHeight } = get()
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ sidebarOpen, sidebarWidth, resultsOpen, resultsHeight }),
      )
    } catch {
      // Not saved; the layout still works for this visit.
    }
  }
  return {
    ...load(),
    set: (change) => {
      set(change)
      save()
    },
    reset: () => {
      set(DEFAULT_PANELS)
      save()
    },
  }
})

const windowSize = () => ({ w: window.innerWidth, h: window.innerHeight })

/** The window size, kept current, so panel sizes still fit after the window shrinks. */
export function useViewport() {
  const [size, setSize] = useState(windowSize)
  useEffect(() => {
    const onResize = () => setSize(windowSize())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}
