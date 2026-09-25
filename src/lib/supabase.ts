import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

// A placeholder client keeps the app bootable (with a clear message) when the
// env vars are missing, e.g. a fresh clone before .env.local exists.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // implicit: the session comes back in the URL itself, so it works even
      // when iOS hands the Google result to a different browser context
      // (home-screen app → in-app browser), which broke the PKCE hand-off
      flowType: 'implicit',
    },
  },
)

export const CARD_IMAGES_BUCKET = 'card-images'
