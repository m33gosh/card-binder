import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import App from './App'
import './styles.css'

// After Google, the session arrives in the URL hash. Let the auth client read
// it before the hash router sees it, then put the router's hash back.
async function settleSignIn() {
  if (!/access_token=|refresh_token=|error=/.test(window.location.hash)) return
  const { supabase } = await import('./lib/supabase')
  await supabase.auth.getSession()
  window.history.replaceState({}, '', window.location.pathname + window.location.search + '#/')
}

await settleSignIn()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
