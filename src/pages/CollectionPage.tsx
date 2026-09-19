import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { collectionValue, listCards, refreshPrices, signImageUrls } from '@/features/cards/api'
import type { CardRow } from '@/features/cards/types'
import { CardTile } from '@/components/CardTile'
import { RefreshIcon } from '@/components/Icons'
import { Spinner } from '@/components/Spinner'
import { money } from '@/components/PriceTag'

const PAGE_SIZE = 9
type Sort = 'newest' | 'value' | 'name'

export function CollectionPage() {
  const { role } = useAuth()
  const [cards, setCards] = useState<CardRow[] | null>(null)
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [refreshing, setRefreshing] = useState<{ done: number; total: number } | null>(null)
  const [refreshNote, setRefreshNote] = useState<string | null>(null)
  const arrived = (useLocation().state ?? null) as { added: number; merged: number } | null

  async function load() {
    try {
      const rows = await listCards()
      setCards(rows)
      // photos are only needed for cards without official art
      const paths = rows.filter((c) => !c.api_image_url && c.image_path).map((c) => c.image_path!)
      setPhotos(await signImageUrls(paths))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the binder.')
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const visible = useMemo(() => {
    if (!cards) return []
    const q = query.trim().toLowerCase()
    const filtered = q ? cards.filter((c) => `${c.name} ${c.set_name ?? ''} ${c.card_number ?? ''}`.toLowerCase().includes(q)) : cards
    const sorted = [...filtered]
    if (sort === 'value') sorted.sort((a, b) => (b.market_price ?? -1) - (a.market_price ?? -1))
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }, [cards, query, sort])

  const pages = useMemo(() => {
    const out: CardRow[][] = []
    for (let i = 0; i < visible.length; i += PAGE_SIZE) out.push(visible.slice(i, i + PAGE_SIZE))
    return out
  }, [visible])

  async function onRefresh() {
    if (!cards) return
    setRefreshNote(null)
    setRefreshing({ done: 0, total: cards.filter((c) => c.api_card_id).length })
    const result = await refreshPrices(cards, (done, total) => setRefreshing({ done, total }))
    setRefreshing(null)
    setRefreshNote(
      result.failed ? `Updated ${result.updated} prices; ${result.failed} couldn't be reached.` : `Updated ${result.updated} prices.`,
    )
    await load()
  }

  if (error) return <div className="notice error">{error}</div>
  if (!cards) return <Spinner />

  const total = cards.reduce((n, c) => n + c.quantity, 0)
  const unpriced = cards.filter((c) => c.market_price == null).length
  const lastPriced = cards.map((c) => c.price_updated_at).filter(Boolean).sort().at(-1)

  return (
    <>
      <div className="collection-head">
        <div>
          <div className="worth"><span className="amount">{money(collectionValue(cards))}</span></div>
          <p className="muted">
            {total} {total === 1 ? 'card' : 'cards'}
            {unpriced > 0 && `, ${unpriced} without a price yet`}
            {lastPriced && `. Prices from ${new Date(lastPriced).toLocaleDateString()}`}
          </p>
        </div>
        {can(role, 'prices:refresh') && cards.some((c) => c.api_card_id) && (
          <button className="btn" onClick={() => void onRefresh()} disabled={refreshing != null}>
            <RefreshIcon /> {refreshing ? `Checking ${refreshing.done}/${refreshing.total}` : "Update today's prices"}
          </button>
        )}
      </div>
      {refreshing && <div className="progress" style={{ marginBottom: 16 }}><span style={{ width: `${(100 * refreshing.done) / Math.max(1, refreshing.total)}%` }} /></div>}
      {refreshNote && <div className="notice ok" style={{ marginBottom: 16 }}>{refreshNote}</div>}
      {arrived && (arrived.added > 0 || arrived.merged > 0) && (
        <div className="notice ok" style={{ marginBottom: 16 }}>
          {arrived.added > 0 && `Added ${arrived.added} ${arrived.added === 1 ? 'card' : 'cards'}.`}
          {arrived.merged > 0 && ` ${arrived.merged} ${arrived.merged === 1 ? 'was' : 'were'} already in your binder, so the count went up instead.`}
        </div>
      )}

      {cards.length === 0 ? (
        <div className="empty">
          <img className="binder-art" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" />
          <h2>Your binder is empty</h2>
          <p className="muted">Take a photo of a page and the cards go in.</p>
          {can(role, 'card:create') && <Link to="/add" className="btn primary big">Add cards</Link>}
        </div>
      ) : (
        <>
          <div className="filters">
            <input className="input" placeholder="Find a card" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="newest">Newest first</option>
              <option value="value">Most valuable first</option>
              <option value="name">A to Z</option>
            </select>
          </div>
          {pages.length === 0 && <p className="muted">No cards match “{query}”.</p>}
          {pages.map((page, i) => (
            <section key={i} className="binder-page">
              <h3>Page {i + 1}</h3>
              <div className="grid">
                {page.map((c) => <CardTile key={c.id} card={c} photoUrl={c.image_path ? photos[c.image_path] : undefined} />)}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  )
}
