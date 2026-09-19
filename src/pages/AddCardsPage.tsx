import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { CatalogSearch } from '@/components/CatalogSearch'
import { CameraIcon, PageIcon } from '@/components/Icons'
import { Spinner } from '@/components/Spinner'
import { money } from '@/components/PriceTag'
import { createCard, fieldsFromCatalog, findOwnCardByCatalogId, updateCard, uploadCardImage } from '@/features/cards/api'
import type { CardRow } from '@/features/cards/types'
import { BinderCropper } from '@/features/import/BinderCropper'
import { pickPhotos } from '@/lib/camera'
import { DEFAULT_GRID, cropRegion, gridCells, loadImage, normalizeForUpload, toDecodableBlob, type GridSpec } from '@/lib/images'
import { pickPrice, pricing, VARIANT_LABELS, type CatalogCard, type Variant } from '@/lib/pricing'
import { identifyCard } from '@/lib/identify'

interface Draft {
  id: string
  blob: Blob
  url: string
  match: CatalogCard | null
  name: string
  variant: Variant
  /** what the corner text suggested; needs a human to confirm */
  suggested: CatalogCard | null
  reading: 'waiting' | 'reading' | 'done' | 'failed'
}

type Step =
  | { kind: 'choose' }
  | { kind: 'decoding' }
  | { kind: 'crop'; img: HTMLImageElement; url: string; spec: GridSpec }
  | { kind: 'review'; drafts: Draft[]; identifying: string | null }
  | { kind: 'saving'; done: number; total: number }

export function AddCardsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [error, setError] = useState<string | null>(null)

  // free object URLs when leaving the page
  useEffect(() => () => {
    if (step.kind === 'review') step.drafts.forEach((d) => URL.revokeObjectURL(d.url))
    if (step.kind === 'crop') URL.revokeObjectURL(step.url)
  }, [step])

  async function decode(file: File): Promise<HTMLImageElement> {
    return loadImage(await toDecodableBlob(file))
  }

  function draftFrom(blob: Blob): Draft {
    return { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), match: null, name: '', variant: 'normal', suggested: null, reading: 'waiting' }
  }

  async function startBinderPage() {
    setError(null)
    const [file] = await pickPhotos()
    if (!file) return
    setStep({ kind: 'decoding' })
    try {
      const img = await decode(file)
      // the image element keeps its bitmap, but we need a URL to display it
      const shown = await normalizeForUpload(img)
      setStep({ kind: 'crop', img, url: URL.createObjectURL(shown), spec: DEFAULT_GRID })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo.')
      setStep({ kind: 'choose' })
    }
  }

  async function startSingles() {
    setError(null)
    const files = await pickPhotos({ multiple: true })
    if (files.length === 0) return
    setStep({ kind: 'decoding' })
    try {
      const drafts: Draft[] = []
      for (const file of files) drafts.push(draftFrom(await normalizeForUpload(await decode(file))))
      setStep({ kind: 'review', drafts, identifying: null })
      void readCorners(drafts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read those photos.')
      setStep({ kind: 'choose' })
    }
  }

  async function cutIntoCards() {
    if (step.kind !== 'crop') return
    const drafts: Draft[] = []
    for (const cell of gridCells(step.spec)) drafts.push(draftFrom(await cropRegion(step.img, cell)))
    setStep({ kind: 'review', drafts, identifying: null })
    void readCorners(drafts)
  }

  /** Read each card's corner and suggest a match; two at a time to be gentle on the free services. */
  async function readCorners(drafts: Draft[]) {
    const queue = [...drafts]
    const worker = async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        patchDraft(d.id, { reading: 'reading' })
        try {
          const result = await identifyCard(d.blob)
          patchDraft(d.id, { reading: 'done', suggested: result.candidates[0] ?? null })
        } catch {
          patchDraft(d.id, { reading: 'failed' })
        }
      }
    }
    await Promise.all([worker(), worker()])
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setStep((s) => (s.kind === 'review' ? { ...s, drafts: s.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)) } : s))
  }

  function removeDraft(id: string) {
    setStep((s) => {
      if (s.kind !== 'review') return s
      const drafts = s.drafts.filter((d) => d.id !== id)
      return { ...s, drafts, identifying: s.identifying === id ? null : s.identifying }
    })
  }

  function identified(id: string, match: CatalogCard) {
    setStep((s) => {
      if (s.kind !== 'review') return s
      const drafts = s.drafts.map((d) => (d.id === id ? { ...d, match, name: match.name, suggested: null } : d))
      // move on to the next card that still needs a name
      const next = drafts.find((d) => !d.match && !d.name)
      return { ...s, drafts, identifying: next?.id ?? null }
    })
  }

  async function saveAll() {
    if (step.kind !== 'review' || !user) return
    const ready = step.drafts.filter((d) => d.match || d.name.trim())
    setStep({ kind: 'saving', done: 0, total: ready.length })
    let done = 0
    let merged = 0
    // catalog id -> the row it now lives in, so a second copy bumps the
    // quantity instead of adding another row and another photo
    const rows = new Map<string, CardRow>()
    try {
      for (const d of ready) {
        if (d.match) {
          const existing = rows.get(d.match.id) ?? (await findOwnCardByCatalogId(d.match.id))
          if (existing) {
            rows.set(d.match.id, await updateCard(existing.id, { quantity: existing.quantity + 1 }))
            merged++
            setStep({ kind: 'saving', done: ++done, total: ready.length })
            continue
          }
        }
        const image_path = await uploadCardImage(user.id, d.blob)
        const catalog = d.match ? fieldsFromCatalog(d.match, d.variant) : {}
        const created = await createCard(user.id, {
          name: d.name.trim() || d.match!.name,
          set_name: null, set_id: null, card_number: null, rarity: null,
          api_card_id: null, api_image_url: null,
          market_price: null, price_currency: 'USD', price_source: null, price_updated_at: null,
          supertype: null, types: null, hp: null, attack_power: null,
          ...catalog,
          image_path,
          variant: d.variant,
          condition: 'near_mint',
          quantity: 1,
          notes: null,
        })
        if (d.match) rows.set(d.match.id, created)
        setStep({ kind: 'saving', done: ++done, total: ready.length })
      }
      navigate('/', { state: { added: ready.length - merged, merged } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving stopped part-way. The cards saved so far are in the binder.')
      setStep({ kind: 'choose' })
    }
  }

  return (
    <div className="stack">
      {error && <div className="notice error">{error}</div>}

      {step.kind === 'choose' && (
        <>
          <div>
            <h1>Add cards</h1>
            <p className="muted">Photos straight from the iPad or iPhone work, HEIC included.</p>
          </div>
          <div className="import-choice">
            <button type="button" className="choice" onClick={() => void startBinderPage()}>
              <PageIcon />
              <strong>A whole binder page</strong>
              <span className="muted">One photo of a page, then we cut it into the nine cards.</span>
            </button>
            <button type="button" className="choice" onClick={() => void startSingles()}>
              <CameraIcon />
              <strong>One card at a time</strong>
              <span className="muted">Pick one or more photos, one card in each.</span>
            </button>
          </div>
        </>
      )}

      {step.kind === 'decoding' && (
        <>
          <Spinner />
          <p className="muted" style={{ textAlign: 'center' }}>Reading the photo…</p>
        </>
      )}

      {step.kind === 'crop' && (
        <>
          <div>
            <h1>Line up the page</h1>
            <p className="muted">Drag the yellow corners so the frame hugs all the cards. Each dashed box becomes one card.</p>
          </div>
          <BinderCropper imageUrl={step.url} spec={step.spec} onChange={(spec) => setStep({ ...step, spec })} />
          <div className="actions">
            <button className="btn primary big" onClick={() => void cutIntoCards()}>Cut into {step.spec.cols * step.spec.rows} cards</button>
            <button className="btn" onClick={() => setStep({ kind: 'choose' })}>Start over</button>
          </div>
        </>
      )}

      {step.kind === 'review' && (
        <ReviewStep
          drafts={step.drafts}
          identifying={step.identifying}
          onIdentify={(id) => setStep({ ...step, identifying: id })}
          onIdentified={identified}
          onConfirm={(id) => setStep((s) => (s.kind === 'review' ? { ...s, drafts: s.drafts.map((d) => (d.id === id && d.suggested ? { ...d, match: d.suggested, name: d.suggested.name, suggested: null } : d)) } : s))}
          onPatch={patchDraft}
          onRemove={removeDraft}
          onSave={() => void saveAll()}
          onCancel={() => setStep({ kind: 'choose' })}
        />
      )}

      {step.kind === 'saving' && (
        <>
          <h1>Adding to the binder</h1>
          <div className="progress"><span style={{ width: `${(100 * step.done) / Math.max(1, step.total)}%` }} /></div>
          <p className="muted">{step.done} of {step.total} saved</p>
        </>
      )}
    </div>
  )
}

interface ReviewProps {
  drafts: Draft[]
  identifying: string | null
  onIdentify: (id: string | null) => void
  onIdentified: (id: string, match: CatalogCard) => void
  onConfirm: (id: string) => void
  onPatch: (id: string, patch: Partial<Draft>) => void
  onRemove: (id: string) => void
  onSave: () => void
  onCancel: () => void
}

function ReviewStep({ drafts, identifying, onIdentify, onIdentified, onConfirm, onPatch, onRemove, onSave, onCancel }: ReviewProps) {
  const current = drafts.find((d) => d.id === identifying) ?? null
  const ready = drafts.filter((d) => d.match || d.name.trim()).length
  const reading = drafts.filter((d) => d.reading === 'waiting' || d.reading === 'reading').length
  const suggestions = drafts.filter((d) => !d.match && d.suggested).length
  const total = drafts.reduce((sum, d) => sum + (d.match ? pickPrice(d.match, d.variant, pricing.name)?.price ?? 0 : 0), 0)

  return (
    <>
      <div>
        <h1>Name each card</h1>
        <p className="muted">
          {reading > 0 && `Reading the numbers off ${reading} ${reading === 1 ? 'card' : 'cards'}… `}
          {suggestions > 0 && `${suggestions} ${suggestions === 1 ? 'card has a match' : 'cards have matches'} to check. `}
          {ready} of {drafts.length} ready{total > 0 && `, worth about ${money(total)}`}.
        </p>
      </div>
      {current && (
        <div className="panel">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <img src={current.url} alt="" style={{ width: 90, borderRadius: 8, aspectRatio: '63/88', objectFit: 'cover' }} />
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3 style={{ marginBottom: 8 }}>Which card is this?</h3>
              <CatalogSearch key={current.id} initialName={current.name} selectedId={current.match?.id} onSelect={(m) => onIdentified(current.id, m)} />
              <details style={{ marginTop: 10 }}>
                <summary className="small muted">Can't find it? Save it with just a name</summary>
                <label className="field" style={{ marginTop: 8 }}>
                  <span>Name</span>
                  <input className="input" value={current.name} onChange={(e) => onPatch(current.id, { name: e.target.value, match: null })} placeholder="Whatever's printed at the top" />
                </label>
                <p className="small muted">You can match it to the catalog later from the card's page.</p>
              </details>
            </div>
          </div>
        </div>
      )}

      <div className="review-grid">
        {drafts.map((d) => (
          <div key={d.id} className={`review-item${d.match ? ' matched' : ''}${!d.match && d.suggested ? ' suggested' : ''}`}>
            <div className="pair">
              <img src={d.url} alt="" />
              {!d.match && d.suggested && <img src={d.suggested.images.small} alt={`${d.suggested.name} from the catalog`} />}
            </div>
            {!d.match && d.suggested ? (
              <>
                <div className="name">Is it {d.suggested.name}?</div>
                <div className="meta small muted">{d.suggested.set.name} #{d.suggested.number}</div>
                <button className="btn primary" onClick={() => onConfirm(d.id)}>Yes, that's it</button>
                <button className="btn" onClick={() => onIdentify(d.id)}>No, find it</button>
              </>
            ) : (
              <>
                <div className="name">{d.match?.name ?? (d.name || (d.reading === 'waiting' || d.reading === 'reading' ? 'Reading…' : 'Not named yet'))}</div>
            {d.match && (
              <select className="select" value={d.variant} onChange={(e) => onPatch(d.id, { variant: e.target.value as Variant })} style={{ minHeight: 36, padding: '4px 8px', fontSize: '0.85rem' }}>
                {(Object.keys(d.match.prices).length ? (Object.keys(d.match.prices) as Variant[]) : (['normal'] as Variant[])).map((v) => (
                  <option key={v} value={v}>{VARIANT_LABELS[v]} {d.match!.prices[v] != null && `· ${money(d.match!.prices[v]!)}`}</option>
                ))}
              </select>
            )}
                <button className={`btn${identifying === d.id ? ' primary' : ''}`} onClick={() => onIdentify(d.id)}>{d.match ? 'Change' : 'Find it'}</button>
              </>
            )}
            <button className="btn ghost danger" onClick={() => onRemove(d.id)}>Remove</button>
          </div>
        ))}
      </div>

      <div className="actions">
        <button className="btn primary big" onClick={onSave} disabled={ready === 0}>Add {ready} {ready === 1 ? 'card' : 'cards'} to the binder</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
      {ready < drafts.length && <p className="small muted">Cards that aren't named yet will be left out. Remove any that aren't real cards (like empty sleeves).</p>}
    </>
  )
}
