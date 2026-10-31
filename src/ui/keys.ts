import type { KeyboardEvent } from 'react'

/** Enter / Space pick a row; arrow keys move between rows (keyboard support). */
export function rowKeys(e: KeyboardEvent<HTMLElement>, choose: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    choose()
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const next =
      e.key === 'ArrowDown'
        ? e.currentTarget.nextElementSibling
        : e.currentTarget.previousElementSibling
    if (next instanceof HTMLElement) next.focus()
  }
}
