import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Service worker registration removed — was causing black screen.
// The SW file at /offline-sw.js now self-unregisters any stale registration.

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)