import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const LIVE = env.LIVE && env.SUPABASE_SERVICE_ROLE_KEY
describe.skipIf(!LIVE)('prices borrowed from the listings', () => {
  it('prices a 30th Celebration card the main catalog lists without prices', async () => {
    const url = import.meta.env.VITE_SUPABASE_URL as string
    const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const email = `borrow-test-${Date.now()}@example.com`
    const password = crypto.randomUUID() + 'Aa1!'
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    try {
      await admin.from('profiles').update({ role: 'editor' }).eq('id', created.user.id)
      const { supabase } = await import('../supabase')
      await supabase.auth.signInWithPassword({ email, password })
      const { pricing } = await import('./index')
      for (const id of ['30th-021', '30th-092', '30th-c-018', 'mep-078']) {
        const card = await pricing.getCard(id, 'en')
        console.log(id, card?.name, card?.number, 'set', card?.set.id, card?.set.printedTotal, 'prices', JSON.stringify(card?.prices), card?.priceSource)
      }
      const greninja = await pricing.getCard('30th-021', 'en')
      expect(Object.keys(greninja?.prices ?? {}).length).toBeGreaterThan(0)
      const gengar = await pricing.getCard('30th-c-018', 'en')
      expect(Object.keys(gengar?.prices ?? {}).length).toBeGreaterThan(0)
      expect(gengar?.images.large).toBeTruthy()
      const toxel = await pricing.getCard('mep-078', 'en')
      expect(toxel?.images.large).toContain('tcgplayer')
    } finally {
      await admin.auth.admin.deleteUser(created.user.id)
    }
  }, 120000)
})
