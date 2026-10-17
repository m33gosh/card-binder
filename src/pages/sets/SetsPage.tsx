import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCards } from '@/features/cards/api'
import type { CardRow } from '@/features/cards/types'
import { CHASES, rowInSet, setsInBinder, strip } from '@/features/sets/chase'
import { Spinner } from '@/components/Spinner'

/** What's being collected: chase lists, then every set with cards in the binder. */
export function SetsPage() {
  const [rows, setRows] = useState<CardRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listCards().then(setRows).catch((e: Error) => setError(e.message))
  }, [])
  const sets = useMemo(() => (rows ? setsInBinder(rows) : []), [rows])
  if (error) return <div className="notice error">{error}</div>
  if (!rows) return <Spinner />

  return (
    <div className="stack">
      <div>
        <h1>Sets</h1>
        <p className="muted">What you're chasing, and how far along each set is.</p>
      </div>
      <h2>Chasing</h2>
      <div className="set-list">
        {CHASES.map((c) => {
          const ids = [c.setId, ...(c.alsoIds ?? [])]
          const held = new Set(rows.filter((r) => rowInSet(r, ids)).map((r) => strip(r.card_number ?? ''))).size
          const inRun = new Set(rows.filter((r) => rowInSet(r, ids) && c.numbers.map(strip).includes(strip(r.card_number ?? ''))).map((r) => strip(r.card_number ?? ''))).size
          return (
            <Link key={c.key} to={`/sets/${encodeURIComponent(c.setId)}?chase=${c.key}`} className="set-row">
              <div>
                <strong>{c.title}</strong>
                <div className="small muted">{c.note}</div>
              </div>
              <div className="set-progress">
                <span className="display">{inRun} of {c.numbers.length}</span>
                <div className="progress"><span style={{ width: `${(100 * inRun) / c.numbers.length}%` }} /></div>
                {held > inRun && <span className="small muted">{held - inRun} other {held - inRun === 1 ? 'card' : 'cards'} from the set</span>}
              </div>
            </Link>
          )
        })}
      </div>
      <h2>Sets in the binder</h2>
      {sets.length === 0 && <p className="muted">Nothing yet. Add some cards and their sets show up here.</p>}
      <div className="set-list">
        {sets.map((s) => (
          <Link key={s.setIds.join('+')} to={`/sets/${encodeURIComponent(s.setIds[0])}${s.setIds.length > 1 ? `?also=${encodeURIComponent(s.setIds.slice(1).join(','))}` : ''}`} className="set-row">
            <div>
              <strong>{s.name}</strong>
              {s.language === 'ja' && <span className="small muted"> · Japanese</span>}
            </div>
            <div className="set-progress"><span className="display">{s.held} {s.held === 1 ? 'card' : 'cards'}</span></div>
          </Link>
        ))}
      </div>
    </div>
  )
}
