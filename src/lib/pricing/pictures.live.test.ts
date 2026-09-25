// Runs the real search route with a real signed-in session. Opt in with
// LIVE=1 and SUPABASE_SERVICE_ROLE_KEY (used only to create a throwaway user).
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const LIVE = env.LIVE && env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(!LIVE)('Japanese search results carry pictures', () => {
  it('borrows TCGplayer pictures for main-catalog results that have none', async () => {
    const url = import.meta.env.VITE_SUPABASE_URL as string
    const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const email = `pictures-test-${Date.now()}@example.com`
    const password = crypto.randomUUID() + 'Aa1!'
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    try {
      await admin.from('profiles').update({ role: 'editor' }).eq('id', created.user.id)
      const { supabase } = await import('../supabase')
      const { error: sErr } = await supabase.auth.signInWithPassword({ email, password })
      if (sErr) throw sErr
      const { pricing } = await import('./index')
      const results = await pricing.search({ name: 'タネボー', lang: 'ja' })
      const megaBrave = results.find((c) => c.id === 'M1L-007')
      console.log(results.slice(0, 6).map((c) => `${c.id} ${c.images.small ? 'pic' : 'NO PIC'}`).join(' | '))
      expect(megaBrave).toBeDefined()
      expect(megaBrave!.images.small).toContain('tcgplayer')
      const full = await pricing.getCard('M1L-007', 'ja')
      expect(full?.nameAlt).toBe('Seedot')
      expect(full?.set.name).toBe('Mega Brave')
    } finally {
      await admin.auth.admin.deleteUser(created.user.id)
    }
  }, 120000)
})
