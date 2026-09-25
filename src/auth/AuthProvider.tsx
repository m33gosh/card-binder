import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Role } from './permissions'
import { reloadIfStale } from '@/lib/freshness'

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  role: Role
  created_at: string
}

interface AuthState {
  loading: boolean
  /** why the last sign-in attempt failed, if it did */
  authError: string | null
  session: Session | null
  user: User | null
  profile: Profile | null
  role: Role | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Where Google should send people back to. Works for / and /repo-name/. */
export function appOrigin(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authError, setAuthError] = useState<string | null>(() => {
    // Google can send us back with an error instead of a code
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''))
    const desc = params.get('error_description') ?? params.get('error') ?? hash.get('error_description') ?? hash.get('error')
    return desc ? desc.replace(/\+/g, ' ') : null
  })

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (cancelled) return
      if (error) setAuthError(error.message)
      else if (!data.session && /code=|access_token=/.test(window.location.search + window.location.hash)) setAuthError('Google sent us back, but the sign-in could not be completed. Please try again.')
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      setLoading(false)
      // only now, with the session settled, check for a newer build
      void reloadIfStale()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      // don't await inside the callback (supabase-js guidance); fire and forget
      void loadProfile(next?.user.id)
      // tidy the ?code= left over from the OAuth round-trip
      if (window.location.search.includes('code=')) {
        window.history.replaceState({}, '', window.location.pathname + window.location.hash)
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      authError,
      signInWithGoogle: async () => {
        setAuthError(null)
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: appOrigin(), queryParams: { prompt: 'select_account' } },
        })
        if (error) throw error
      },
      signOut: async () => {
        await supabase.auth.signOut()
        setProfile(null)
      },
      refreshProfile: () => loadProfile(session?.user.id),
    }),
    [loading, session, profile, loadProfile, authError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
