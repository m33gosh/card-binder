import { useEffect, useRef, useState } from 'react'
import { pricing, pickPrice, type CatalogCard } from '@/lib/pricing'
import { looksLikeCardRef, parseCardRef } from '@/lib/cardNumber'
import { lookupRef } from '@/lib/identify'
import { money } from './PriceTag'

interface Props {
  initialName?: string
  selectedId?: string | null
  onSelect: (card: CatalogCard) => void
}

/** Find the official card record so we can price it. */
export function CatalogSearch({ initialName = '', selectedId, onSelect }: Props) {
  const [name, setName] = useState(initialName)
  const [number, setNumber] = useState('')
  const [results, setResults] = useState<CatalogCard[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (name.trim().length < 2) {
      setResults([])
      return
    }
    timer.current = window.setTimeout(async () => {
      setBusy(true)
      setError(null)
      try {
        // "72/84" typed in the name box means: number 72 in a set of 84
        const ref = looksLikeCardRef(name) ? parseCardRef(name) : null
        setResults(ref ? await lookupRef(ref) : await pricing.search({ name, number }))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed.')
      } finally {
        setBusy(false)
      }
    }, 350)
    return () => window.clearTimeout(timer.current)
  }, [name, number])

  return (
    <div>
      <div className="row">
        <label className="field">
          <span>Card name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pikachu, or 57/191" autoFocus />
        </label>
        <label className="field" style={{ flex: '0 1 140px' }}>
          <span>Number</span>
          <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 57" inputMode="numeric" />
        </label>
      </div>
      <p className="small muted">Fastest: type the number printed bottom-left on the card, like <strong>57/191</strong>, into the name box.</p>
      {error && <div className="notice error">{error}</div>}
      {busy && <p className="small muted">Searching…</p>}
      {!busy && name.trim().length >= 2 && results.length === 0 && !error && (
        <p className="small muted">Nothing matched. Check the spelling, or try just the first word.</p>
      )}
      <div className="search-results">
        {results.map((c) => {
          const quote = pickPrice(c, 'normal', pricing.name)
          return (
            <button key={c.id} type="button" className={`result${selectedId === c.id ? ' selected' : ''}`} onClick={() => onSelect(c)}>
              <img src={c.images.small} alt="" loading="lazy" />
              <div className="name">{c.name}</div>
              <div className="meta">{c.set.name} #{c.number}</div>
              <div className="meta">{quote ? money(quote.price) : 'no price'}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
