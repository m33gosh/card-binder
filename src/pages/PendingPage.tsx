import { useAuth } from '@/auth/AuthProvider'

export function PendingPage() {
  const { profile, signOut, refreshProfile } = useAuth()
  return (
    <div className="login">
      <div className="panel">
        <h1>Hi {profile?.display_name?.split(' ')[0] ?? 'there'}</h1>
        <p>You're signed in, but whoever runs this binder hasn't let you in yet. Ask them to open People and approve {profile?.email}.</p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => void refreshProfile()}>Check again</button>
          <button className="btn" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    </div>
  )
}
