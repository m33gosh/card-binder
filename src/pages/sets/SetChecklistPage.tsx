import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { listCards } from '@/features/cards/api'
import type { CardRow } from '@/features/cards/types'
import { buildSlots, CHASES, type Slot } from '@/features/sets/chase'
import { pricing, type SetCardBrief } from '@/lib/pricing'
import { Spinner } from '@/components/Spinner'
import { usePersistedState } from '@/lib/usePersistedState'

/** Every card in a set (or a chase run), in number order, marked have / need. */
export function SetChecklistPage() {
  const { setId = '' } = useParams()
  const [params] = useSearchParams()
  const chase = CHASES.find((c) => c.key === params.get('chase') && c.setId === setId) ?? null
  // every id this set goes by: the chase's, or the ones the Sets page found
  const ids = useMemo(() => [setId, ...(chase?.alsoIds ?? []), ...(params.get('also')?.split(',').filter(Boolean) ?? [])], [setId, chase, params])
  const [rows, setRows] = useState<CardRow[] | null>(null)
  const [cards, setCards] = useState<SetCardBrief[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [only, setOnly] = usePersistedState<'all' | 'need' | 'have'>('card-binder:checklist-filter', 'all', ['all', 'need', 'have'])

  useEffect(() => {
    let cancelled = false
    Promise.all([listCards(), pricing.listSetCards(setId, chase?.language ?? undefined)])
      .then(([r, c]) => {
        if (cancelled) return
        setRows(r)
        setCards(c)
      })
      .catch((e: Error) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [setId, chase?.language])

  const slots = useMemo<Slot[]>(() => (rows && cards ? buildSlots(cards, rows, ids, chase?.numbers ?? []) : []), [rows, cards, ids, chase])
  if (error) return <div className="notice error">{error}</div>
  if (!rows || !cards) return <Spinner />

  const have = slots.filter((s) => s.quantity > 0)
  const need = slots.filter((s) => s.quantity === 0)
  const title = chase?.title ?? rows.find((r) => ids.includes(r.set_id ?? ''))?.set_name ?? setId
  const shown = only === 'need' ? need : only === 'have' ? have : slots
  const dupes = have.reduce((n, s) => n + Math.max(0, s.quantity - 1), 0)

  return (
    <div className="stack">
      <Link to="/sets" className="small">← Sets</Link>
      <div className="collection-head">
        <div>
          <h1>{title}</h1>
          <p className="muted">
            {have.length} of {slots.length} · {need.length} still to find{dupes > 0 && ` · ${dupes} spare${dupes === 1 ? '' : 's'} for trading`}
          </p>
        </div>
      </div>
      <div className="progress"><span style={{ width: `${slots.length ? (100 * have.length) / slots.length : 0}%` }} /></div>
      {need.length > 0 && (
        <div className="notice">
          <strong>Still need:</strong> {need.map((s) => '#' + s.number.padStart(3, '0')).join(', ')}
        </div>
      )}
      <div className="tabs">
        <button className={`tab${only === 'all' ? ' active' : ''}`} onClick={() => setOnly('all')}>All {slots.length}</button>
        <button className={`tab${only === 'need' ? ' active' : ''}`} onClick={() => setOnly('need')}>Need {need.length}</button>
        <button className={`tab${only === 'have' ? ' active' : ''}`} onClick={() => setOnly('have')}>Have {have.length}</button>
      </div>
      {slots.length === 0 && <p className="muted">The catalog has no card list for this set yet.</p>}
      <div className="checklist">
        {shown.map((s) => {
          const own = s.owned[0]
          const img = own?.api_image_url || s.card?.image || ''
          const body = (
            <>
              <div className={`art${img ? '' : ' empty'}${s.quantity ? '' : ' need'}`}>{img ? <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>#{s.number}</span>}</div>
              <div className="num">#{s.number.padStart(3, '0')}{s.quantity > 1 && <span className="qty"> ×{s.quantity}</span>}</div>
              <div className="meta">{s.card?.name ?? own?.name ?? ''}</div>
              <div className={`state ${s.quantity ? 'have' : 'need'}`}>{s.quantity ? 'Have' : 'Need'}</div>
            </>
          )
          return own ? (
            <Link key={s.number} to={`/cards/${own.id}`} className="slot">{body}</Link>
          ) : (
            <div key={s.number} className="slot">{body}</div>
          )
        })}
      </div>
    </div>
  )
}
