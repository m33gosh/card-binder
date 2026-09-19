import { useEffect, useState } from 'react'

/**
 * useState that survives leaving the page: the value is kept in this
 * browser's storage. For small per-device preferences only.
 */
export function usePersistedState<T extends string>(key: string, initial: T, allowed?: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null
      if (stored != null && (!allowed || allowed.includes(stored))) return stored
    } catch {
      /* storage unavailable */
    }
    return initial
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* ignore */
    }
  }, [key, value])
  return [value, setValue] as const
}
