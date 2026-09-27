import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { canEditCard } from '@/auth/permissions'
import { deleteSquish, getSquish, signImageUrls, updateSquish } from '@/features/squishes/api'
import { SQUISH_CONDITIONS, type SquishRow } from '@/features/squishes/types'
import { money } from '@/components/PriceTag'
import { Spinner } from '@/components/Spinner'

export function SquishDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role, user } = useAuth()
  const [row, setRow] = useState<SquishRow | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getSquish(id)
      .then(async (r) => {
        setRow(r)
        if (r?.image_path) setPhotoUrl((await signImageUrls([r.image_path]))[r.image_path])
      })
      .catch((e: Error) => setError(e.message))
  }, [id])

  if (error) return <div className="notice error">{error}</div>
  if (!row) return <Spinner />
  const editable = canEditCard(role, user?.id, row.owner_id)

  async function gotIt() {
    if (!row) return
    setRow(await updateSquish(row.id, { wishlist: false, acquired_on: row.acquired_on ?? new Date().toISOString().slice(0, 10) }))
  }
  async function remove() {
    if (!row || !window.confirm(`Remove ${row.name}?`)) return
    await deleteSquish(row)
    navigate('/squishes')
  }

  return (
    <div className="stack">
      <Link to="/squishes" className="small">← Back to my squishes</Link>
      <div className="detail">
        <div className="photos squish-photos">
          {row.image_url && <figure><img src={row.image_url} alt={row.name} referrerPolicy="no-referrer" /><figcaption>From the web</figcaption></figure>}
          {photoUrl && <figure><img src={photoUrl} alt={`${row.name}, ours`} /><figcaption>Our photo</figcaption></figure>}
        </div>
        <div>
          <h1>{row.favorite && '♥ '}{row.name}</h1>
          <p className="muted">{[row.brand, row.character, row.squad].filter(Boolean).join(' · ')}</p>
          {row.wishlist && <div className="notice" style={{ marginBottom: 12 }}>On the wishlist. {editable && <button className="btn primary" style={{ marginLeft: 8 }} onClick={() => void gotIt()}>Got it!</button>}</div>}
          <dl className="facts">
            {row.size_inches != null && <><dt>Size</dt><dd>{row.size_inches} inches</dd></>}
            {row.color && <><dt>Colour</dt><dd>{row.color}</dd></>}
            <dt>Condition</dt><dd>{SQUISH_CONDITIONS[row.condition] ?? row.condition}</dd>
            {(row.acquired_from || row.acquired_on) && <><dt>From</dt><dd>{[row.acquired_from, row.acquired_on && new Date(row.acquired_on + 'T00:00').toLocaleDateString()].filter(Boolean).join(', ')}</dd></>}
            {row.price_paid != null && <><dt>Paid</dt><dd>{money(row.price_paid)}</dd></>}
            {row.value != null && <><dt>Worth about</dt><dd>{money(row.value)}</dd></>}
            {row.notes && <><dt>Notes</dt><dd>{row.notes}</dd></>}
            <dt>Added</dt><dd>{new Date(row.created_at).toLocaleDateString()}</dd>
          </dl>
          {editable && (
            <div className="actions">
              <Link to={`/squishes/${row.id}/edit`} className="btn primary">Edit details</Link>
              <button className="btn danger" onClick={() => void remove()}>Remove</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
