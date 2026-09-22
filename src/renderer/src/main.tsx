import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { getBrowserAppearanceRuntime } from './lib/appearanceRuntime'
import './styles/globals.css'

const appearanceRuntime = getBrowserAppearanceRuntime()
window.addEventListener('beforeunload', () => appearanceRuntime.dispose(), { once: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
