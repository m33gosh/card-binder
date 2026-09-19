import { useEffect, useRef, useState } from 'react'
import { pricing, pickPrice, type CatalogCard } from '@/lib/pricing'
import { looksLikeCardRef, parseCardRef } from '@/lib/cardNumber'
import { lookupRef } from '@/lib/identify'
import { money } from './PriceTag'

interface Props {
  initialName?: string
  initialNumber?: string
  selectedId?: string | null
  onSelect: (card: CatalogCard) => void
}

/** Find the official card record so we can price it. */
export function CatalogSearch({ initialName = '', initialNumber = '', selectedId, onSelect }: Props) {
  const [name, setName] = useState(initialName)
  const [number, setNumber] = useState(initialNumber)
  const [results, setResults] = useState<CatalogCard[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  // search results are lightweight; fetch the full card (with prices) on pick
  async function pick(card: CatalogCard) {
    setPicking(card.id)
    try {
      onSelect((await pricing.getCard(card.id)) ?? card)
    } catch {
      onSelect(card)
    } finally {
      setPicking(null)
    }
  }

  useEffect(() => {
    window.clearTimeout(timer.current)
    // a number like 72/84 on its own is enough to search; a bare "72" is not
    const numberAlone = !name.trim() && looksLikeCardRef(number)
    if (name.trim().length < 2 && !numberAlone) {
      setResults([])
      return
    }
    timer.current = window.setTimeout(async () => {
      setBusy(true)
      setError(null)
      try {
        // "72/84" in either box means: number 72 in a set of 84
        const ref = looksLikeCardRef(number) ? parseCardRef(number) : looksLikeCardRef(name) ? parseCardRef(name) : null
        if (ref && !name.trim()) setResults(await lookupRef(ref))
        else if (ref) setResults((await pricing.search({ name })).filter((c) => c.number === ref.number))
        else setResults(await pricing.search({ name, number }))
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
          <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="57/191" inputMode="decimal" />
        </label>
      </div>
      <p className="small muted">Fastest: the number printed bottom-left on the card, like <strong>57/191</strong>, on its own finds the exact card.</p>
      {error && <div className="notice error">{error}</div>}
      {busy && <p className="small muted">Searching…</p>}
      {!busy && name.trim().length >= 2 && results.length === 0 && !error && (
        <p className="small muted">Nothing matched. Check the spelling, or try just the first word.</p>
      )}
      <div className="search-results">
        {results.map((c) => {
          const quote = pickPrice(c, 'normal', pricing.name)
          return (
            <button key={c.id} type="button" className={`result${selectedId === c.id ? ' selected' : ''}`} onClick={() => void pick(c)} disabled={picking !== null}>
              <img src={c.images.small} alt="" loading="lazy" />
              <div className="name">{c.name}</div>
              <div className="meta">{c.set.name} #{c.number}</div>
              {quote && <div className="meta">{money(quote.price)}</div>}
              {picking === c.id && <div className="meta">Loading…</div>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
