import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { canEditCard } from '@/auth/permissions'
import { deleteCard, fieldsFromCatalog, getCard, getPriceHistory, signImageUrls, updateCard } from '@/features/cards/api'
import { CONDITION_LABELS, type CardRow, type Condition, type PricePoint } from '@/features/cards/types'
import { VARIANT_LABELS, variantLabel, type CatalogCard, type Variant } from '@/lib/pricing'
import { CatalogSearch } from '@/components/CatalogSearch'
import { PriceTag, money } from '@/components/PriceTag'
import { Spinner } from '@/components/Spinner'

export function CardDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role, user } = useAuth()
  const [card, setCard] = useState<CardRow | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | undefined>()
  const [history, setHistory] = useState<PricePoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [relinking, setRelinking] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    getCard(id)
      .then(async (row) => {
        setCard(row)
        if (row?.image_path) setPhotoUrl((await signImageUrls([row.image_path]))[row.image_path])
        if (row) setHistory(await getPriceHistory(row.id))
      })
      .catch((e: Error) => setError(e.message))
  }, [id])

  if (error) return <div className="notice error">{error}</div>
  if (!card) return <Spinner />
  const editable = canEditCard(role, user?.id, card.owner_id)

  async function save(patch: Parameters<typeof updateCard>[1]) {
    if (!card) return
    setSaving(true)
    try {
      setCard(await updateCard(card.id, patch))
      setEditing(false)
      setRelinking(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function relink(match: CatalogCard) {
    if (!card) return
    await save(fieldsFromCatalog(match, card.variant))
  }

  async function remove() {
    if (!card || !window.confirm(`Remove ${card.name} from the binder?`)) return
    await deleteCard(card)
    navigate('/')
  }

  // bars span the observed range so small moves are still visible
  const prices = history.map((h) => h.price)
  const lo = Math.min(...prices, Infinity)
  const hi = Math.max(...prices, -Infinity)
  const barHeight = (p: number) => (hi === lo ? 60 : 15 + (85 * (p - lo)) / (hi - lo))

  return (
    <div className="stack">
      <Link to="/" className="small">← Back to the binder</Link>
      <div className="detail">
        <div className="photos">
          {card.api_image_url && (
            <figure><img src={card.api_image_url} alt={`${card.name} official art`} /><figcaption>Official card</figcaption></figure>
          )}
          {photoUrl && (
            <figure><img src={photoUrl} alt={`${card.name} in the binder`} /><figcaption>Our copy</figcaption></figure>
          )}
        </div>
        <div>
          <h1>{card.name}</h1>
          {card.name_alt && <p className="muted" style={{ marginTop: -6 }}>{card.name_alt}</p>}
          <p className="muted">{[card.set_name, card.card_number && `#${card.card_number}`, card.rarity].filter(Boolean).join(' · ')}</p>
          <PriceTag price={card.market_price} currency={card.price_currency} big />
          {card.price_updated_at && (
            <p className="small muted" style={{ marginTop: 6 }}>
              Market price for {variantLabel(card.variant).toLowerCase()} on {new Date(card.price_updated_at).toLocaleDateString()} ({card.price_source})
              {card.quantity > 1 && ` · ${money(card.market_price! * card.quantity)} for all ${card.quantity}`}
            </p>
          )}
          {!card.api_card_id && <p className="notice" style={{ marginTop: 10 }}>This card isn't matched to the catalog yet, so it has no price. {editable && 'Use "Match to catalog" below.'}</p>}

          {!editing ? (
            <>
              <dl className="facts">
                <dt>How many</dt><dd>{card.quantity}</dd>
                <dt>Finish</dt><dd>{variantLabel(card.variant)}</dd>
                <dt>Condition</dt><dd>{CONDITION_LABELS[card.condition]}</dd>
                {card.language === 'ja' && <><dt>Language</dt><dd>Japanese</dd></>}
                {card.notes && <><dt>Notes</dt><dd>{card.notes}</dd></>}
                <dt>Added</dt><dd>{new Date(card.created_at).toLocaleDateString()}</dd>
              </dl>
              {history.length > 1 && (
                <>
                  <h3>Price over time</h3>
                  <div className="history" title={history.map((h) => `${new Date(h.recorded_at).toLocaleDateString()}: ${money(h.price)}`).join('\n')}>
                    {history.map((h, i) => <span key={i} style={{ height: `${barHeight(h.price)}%` }} />)}
                  </div>
                  <p className="small muted">{history.length} checks, from {money(history[0].price)} to {money(history.at(-1)!.price)}</p>
                </>
              )}
              {editable && (
                <div className="actions">
                  <button className="btn primary" onClick={() => setEditing(true)}>Edit details</button>
                  <button className="btn" onClick={() => setRelinking((v) => !v)}>{card.api_card_id ? 'Change match' : 'Match to catalog'}</button>
                  <button className="btn danger" onClick={() => void remove()}>Remove</button>
                </div>
              )}
            </>
          ) : (
            <EditForm card={card} saving={saving} onCancel={() => setEditing(false)} onSave={save} />
          )}
          {relinking && (
            <div className="panel" style={{ marginTop: 18 }}>
              <h3 style={{ marginBottom: 10 }}>Which card is it?</h3>
              <CatalogSearch initialName={card.name} initialLang={card.language === 'ja' ? 'ja' : 'en'} selectedId={card.api_card_id} onSelect={(m) => void relink(m)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EditForm({ card, saving, onCancel, onSave }: { card: CardRow; saving: boolean; onCancel: () => void; onSave: (p: Partial<CardRow>) => Promise<void> }) {
  const [name, setName] = useState(card.name)
  const [quantity, setQuantity] = useState(card.quantity)
  const [variant, setVariant] = useState<Variant>(card.variant)
  const [condition, setCondition] = useState<Condition>(card.condition)
  const [notes, setNotes] = useState(card.notes ?? '')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ name, quantity, variant, condition, notes: notes || null })
      }}
      style={{ marginTop: 16 }}
    >
      <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <div className="row">
        <label className="field"><span>How many</span><input className="input" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label>
        <label className="field"><span>Finish</span>
          <select className="select" value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
            {Object.entries(VARIANT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            {!(variant in VARIANT_LABELS) && <option value={variant}>{variantLabel(variant)}</option>}
          </select>
        </label>
        <label className="field"><span>Condition</span>
          <select className="select" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
            {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>Notes</span><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where it came from, a trade, anything worth remembering" /></label>
      <p className="small muted">Changing the finish changes which market price we use next time prices are updated.</p>
      <div className="actions">
        <button className="btn primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        <button className="btn" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
