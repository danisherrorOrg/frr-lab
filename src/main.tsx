import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'
import { registerServiceWorker } from './offline/register'
import { applyTheme, initialTheme } from './ui/theme'

// Before the first paint, so a dark page doesn't flash white.
applyTheme(initialTheme())
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
