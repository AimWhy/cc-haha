import React from 'react'
import ReactDOM from 'react-dom/client'
import './theme/globals.css'
import { initializeAppZoom } from './lib/appZoom'
import { runDesktopPersistenceMigrations } from './lib/persistenceMigrations'

runDesktopPersistenceMigrations()
void initializeAppZoom()
const [{ App }, { ErrorBoundary }, { installClientDiagnosticsCapture }, { initializeTheme }] = await Promise.all([
  import('./App'),
  import('./components/ErrorBoundary'),
  import('./lib/diagnosticsCapture'),
  import('./stores/uiStore'),
])
initializeTheme()
installClientDiagnosticsCapture()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
