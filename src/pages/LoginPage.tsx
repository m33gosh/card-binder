import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { GoogleIcon } from '@/components/Icons'

const iconUrl = `${import.meta.env.BASE_URL}icons/icon.svg`

export function LoginPage() {
  const { signInWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="login">
      <div className="panel">
        <img src={iconUrl} alt="" />
        <h1>Card Binder</h1>
        <p>Every card in the collection, and what it's worth today.</p>
        <button
          className="btn primary big block google-btn"
          onClick={() => signInWithGoogle().catch((e: Error) => setError(e.message))}
        >
          <GoogleIcon /> Sign in with Google
        </button>
        {error && <div className="notice error" style={{ marginTop: 14 }}>{error}</div>}
      </div>
    </div>
  )
}
