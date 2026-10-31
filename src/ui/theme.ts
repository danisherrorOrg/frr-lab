// Light / dark theme. The `.dark` class on <html> drives Tailwind's dark: styles (D13).
export type Theme = 'light' | 'dark'

const KEY = 'lfa-lab-theme'

/** The saved choice, else the OS setting. Storage can be blocked, so it may fail quietly. */
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Private mode or blocked storage: fall back to the OS setting.
  }
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export const currentTheme = (): Theme =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

/** Apply a theme; `remember` saves it so it wins over the OS setting next time. */
export function applyTheme(theme: Theme, remember = false) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  if (!remember) return
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Not saved; the toggle still works for this visit.
  }
}
