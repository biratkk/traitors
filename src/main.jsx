import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Multiplayer from './Multiplayer.jsx'

const legacyTest =
  import.meta.env.VITE_E2E_LEGACY === 'true' &&
  new URLSearchParams(location.search).has('local-preview')

createRoot(document.getElementById('root')).render(
  <StrictMode>{legacyTest ? <App /> : <Multiplayer />}</StrictMode>,
)
