import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { listSquishes, signImageUrls, squishValue } from '@/features/squishes/api'
import type { SquishRow } from '@/features/squishes/types'
import { Spinner } from '@/components/Spinner'
import { money } from '@/components/PriceTag'
import { usePersistedState } from '@/lib/usePersistedState'

type Sort = 'newest' | 'name' | 'size' | 'squad' | 'value' | 'brand'
const SORTS: readonly Sort[] = ['newest', 'name', 'size', 'squad', 'value', 'brand']
type Tab = 'have' | 'wishlist'

export function SquishListPage() {
  const { role } = useAuth()
  const [rows, setRows] = useState<SquishRow[] | null>(null)
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = usePersistedState<Sort>('card-binder:squish-sort', 'newest', SORTS)
  const [tab, setTab] = usePersistedState<Tab>('card-binder:squish-tab', 'have', ['have', 'wishlist'])
  const arrived = (useLocation().state ?? null) as { added?: string } | null

  useEffect(() => {
    listSquishes()
      .then(async (list) => {
        setRows(list)
        setPhotos(await signImageUrls(list.filter((r) => !r.image_url && r.image_path).map((r) => r.image_path!)))
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const visible = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    const inTab = rows.filter((r) => (tab === 'wishlist' ? r.wishlist : !r.wishlist))
    const filtered = q ? inTab.filter((r) => `${r.name} ${r.brand ?? ''} ${r.character ?? ''} ${r.squad ?? ''} ${r.color ?? ''}`.toLowerCase().includes(q)) : inTab
    const byName = (a: SquishRow, b: SquishRow) => a.name.localeCompare(b.name)
    const sorted = [...filtered]
    if (sort === 'name') sorted.sort(byName)
    if (sort === 'size') sorted.sort((a, b) => (b.size_inches ?? -1) - (a.size_inches ?? -1) || byName(a, b))
    if (sort === 'squad') sorted.sort((a, b) => (a.squad ?? 'zzz').localeCompare(b.squad ?? 'zzz') || byName(a, b))
    if (sort === 'brand') sorted.sort((a, b) => (a.brand ?? 'zzz').localeCompare(b.brand ?? 'zzz') || byName(a, b))
    if (sort === 'value') sorted.sort((a, b) => (b.value ?? b.price_paid ?? -1) - (a.value ?? a.price_paid ?? -1) || byName(a, b))
    return sorted
  }, [rows, query, sort, tab])

  if (error) return <div className="notice error">{error}</div>
  if (!rows) return <Spinner />
  const have = rows.filter((r) => !r.wishlist)
  const wished = rows.length - have.length
  const spent = have.reduce((s, r) => s + (r.price_paid ?? 0), 0)

  return (
    <>
      <div className="collection-head">
        <div>
          <div className="worth"><span className="amount">{money(squishValue(rows))}</span></div>
          <p className="muted">
            {have.length} {have.length === 1 ? 'squish' : 'squishes'}
            {spent > 0 && `, ${money(spent)} spent`}
            {wished > 0 && `, ${wished} on the wishlist`}
          </p>
        </div>
        {can(role, 'card:create') && <Link to="/squishes/new" className="btn primary">Add a squish</Link>}
      </div>
      {arrived?.added && <div className="notice ok" style={{ marginBottom: 16 }}>Added {arrived.added}.</div>}

      <div className="tabs">
        <button className={`tab${tab === 'have' ? ' active' : ''}`} onClick={() => setTab('have')}>My squishes</button>
        <button className={`tab${tab === 'wishlist' ? ' active' : ''}`} onClick={() => setTab('wishlist')}>Wishlist{wished > 0 && ` (${wished})`}</button>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <h2>No squishes yet</h2>
          <p className="muted">Add the first one, or start a wishlist.</p>
          {can(role, 'card:create') && <Link to="/squishes/new" className="btn primary big">Add a squish</Link>}
        </div>
      ) : (
        <>
          <div className="filters">
            <input className="input" placeholder="Find a squish" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="newest">Newest first</option>
              <option value="name">A to Z</option>
              <option value="size">Biggest first</option>
              <option value="squad">By squad</option>
              <option value="brand">By brand</option>
              <option value="value">Most valuable first</option>
            </select>
          </div>
          {visible.length === 0 && <p className="muted">{tab === 'wishlist' ? 'Nothing on the wishlist yet.' : `No squishes match “${query}”.`}</p>}
          <div className="squish-grid">
            {visible.map((r) => {
              const src = r.image_url || (r.image_path ? photos[r.image_path] : undefined)
              return (
                <Link key={r.id} to={`/squishes/${r.id}`} className="squish-tile">
                  <div className={`art${src ? '' : ' empty'}`}>{src ? <img src={src} alt={r.name} loading="lazy" referrerPolicy="no-referrer" /> : <span>No photo</span>}</div>
                  {r.favorite && <span className="fav" title="Favourite">♥</span>}
                  <div className="caption">
                    <div className="name">{r.name}</div>
                    {(r.value ?? r.price_paid) != null && <span className="price-tag">{money(r.value ?? r.price_paid!)}</span>}
                  </div>
                  <div className="meta">{[r.size_inches != null && `${r.size_inches}″`, r.brand, r.squad].filter(Boolean).join(' · ')}</div>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
