import { useEffect, useRef, useState } from 'react'
import { pricing, pickPrice, type CatalogCard } from '@/lib/pricing'
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
        setResults(await pricing.search({ name, number }))
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
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pikachu, Mega Lucario ex…" autoFocus />
        </label>
        <label className="field" style={{ flex: '0 1 140px' }}>
          <span>Number</span>
          <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 57" inputMode="numeric" />
        </label>
      </div>
      <p className="small muted">The number is printed bottom-left on the card, like 057/191. Add it to narrow things down.</p>
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
