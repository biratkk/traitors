import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Multiplayer from './Multiplayer.jsx'
import './App.css'

const legacyTest =
  import.meta.env.VITE_E2E_LEGACY === 'true' &&
  new URLSearchParams(location.search).has('local-preview')

const root = createRoot(document.getElementById('root'))
if (legacyTest) {
  import('./App.jsx').then(({ default: App }) =>
    root.render(<StrictMode><App /></StrictMode>),
  )
} else {
  root.render(<StrictMode><Multiplayer /></StrictMode>)
}
