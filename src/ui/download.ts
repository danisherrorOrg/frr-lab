/** Save text as a file in the browser (no upload: the file is made on the page). */
export function downloadText(name: string, text: string, type: string) {
  downloadBlob(name, new Blob([text], { type }))
}

/** Save a file the page made, e.g. a PNG of the diagram. */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
