import { useEffect, useState } from 'react'
import { useAuth, type Profile } from '@/auth/AuthProvider'
import { ROLES, ROLE_LABELS, type Role } from '@/auth/permissions'
import { listProfiles, setRole } from '@/features/admin/api'
import { Spinner } from '@/components/Spinner'

export function PeoplePage() {
  const { user } = useAuth()
  const [people, setPeople] = useState<Profile[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listProfiles().then(setPeople).catch((e: Error) => setError(e.message))
  }, [])

  async function change(p: Profile, role: Role) {
    if (p.id === user?.id && role !== 'admin' && !window.confirm('Step down as the person who runs the binder? You would need another admin to restore it.')) return
    try {
      await setRole(p.id, role)
      setPeople((list) => list?.map((x) => (x.id === p.id ? { ...x, role } : x)) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change that.')
    }
  }

  if (error) return <div className="notice error">{error}</div>
  if (!people) return <Spinner />
  const pending = people.filter((p) => p.role === 'pending').length

  return (
    <div className="stack">
      <div>
        <h1>People</h1>
        <p className="muted">Anyone with a Google account can sign in, but they get a binder only once you let them in here. Each person's binder is their own.{pending > 0 && ` ${pending} waiting.`}</p>
      </div>
      <div className="people">
        {people.map((p) => (
          <div key={p.id} className={`person${p.role === 'pending' ? ' pending' : ''}`}>
            {p.avatar_url ? <img className="avatar" src={p.avatar_url} alt="" referrerPolicy="no-referrer" /> : <span className="avatar" />}
            <div className="who">
              <strong>{p.display_name ?? p.email}{p.id === user?.id && ' (you)'}</strong>
              <span className="small muted">{p.email}</span>
            </div>
            <select className="select" value={p.role} onChange={(e) => void change(p, e.target.value as Role)} aria-label={`Role for ${p.email}`}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="panel small muted">
        <p><strong>Has a binder</strong> can fill and manage their own binder. <strong>Runs the app</strong> can also approve people here. Nobody can see anyone else's cards.</p>
        <p style={{ margin: 0 }}>The same rules are enforced by the database, not just hidden in the app.</p>
      </div>
    </div>
  )
}
