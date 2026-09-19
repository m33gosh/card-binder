import { supabase } from '@/lib/supabase'
import type { Profile } from '@/auth/AuthProvider'
import type { Role } from '@/auth/permissions'

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at')
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function setRole(userId: string, role: Role): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (error) throw error
}
