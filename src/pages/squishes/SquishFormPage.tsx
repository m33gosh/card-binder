import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { createSquish, deleteSquishImage, getSquish, signImageUrls, updateSquish, uploadSquishImage } from '@/features/squishes/api'
import { BRANDS, EMPTY_SQUISH, SQUISH_CONDITIONS, type SquishCondition, type SquishInput } from '@/features/squishes/types'
import { pickPhotos } from '@/lib/camera'
import { loadImage, normalizeForUpload, toDecodableBlob } from '@/lib/images'
import { pictureFromPage, searchSquishmallowWiki, type PictureHit } from '@/lib/pictures'
import { Spinner } from '@/components/Spinner'

export function SquishFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [form, setForm] = useState<SquishInput | null>(id ? null : { ...EMPTY_SQUISH })
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [existingPhoto, setExistingPhoto] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [wikiHits, setWikiHits] = useState<PictureHit[]>([])
  const [wikiBusy, setWikiBusy] = useState(false)
  const [link, setLink] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    getSquish(id)
      .then(async (row) => {
        if (!row) throw new Error('That squish is not in your collection.')
        const { id: _id, owner_id: _o, created_at: _c, updated_at: _u, ...rest } = row
        setForm(rest)
        if (row.image_path) setExistingPhoto((await signImageUrls([row.image_path]))[row.image_path])
      })
      .catch((e: Error) => setError(e.message))
  }, [id])

  const set = <K extends keyof SquishInput>(key: K, value: SquishInput[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))
  const num = (v: string) => (v.trim() === '' ? null : Number(v))

  async function takePhoto() {
    const [file] = await pickPhotos()
    if (!file) return
    try {
      const blob = await normalizeForUpload(await loadImage(await toDecodableBlob(file)))
      setPhoto({ blob, url: URL.createObjectURL(blob) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo.')
    }
  }

  async function findOnWiki() {
    if (!form?.name.trim()) return
    setWikiBusy(true)
    setError(null)
    try {
      const hits = await searchSquishmallowWiki(form.character ? `${form.name} ${form.character}` : form.name)
      setWikiHits(hits)
      if (hits.length === 0) setError('The wiki has nothing under that name. Try just the first name, or paste a store link below.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Picture search failed.')
    } finally {
      setWikiBusy(false)
    }
  }

  async function useLink() {
    if (!link.trim()) return
    setLinkBusy(true)
    setError(null)
    try {
      const hit = await pictureFromPage(link.trim())
      set('image_url', hit.full)
      setLink('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get a picture from that link.')
    } finally {
      setLinkBusy(false)
    }
  }

  async function save() {
    if (!form || !user) return
    if (!form.name.trim()) {
      setError('Give it a name first.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      let image_path = form.image_path
      if (photo) {
        if (image_path) await deleteSquishImage(image_path)
        image_path = await uploadSquishImage(user.id, photo.blob)
      }
      const input = { ...form, name: form.name.trim(), image_path }
      if (id) {
        await updateSquish(id, input)
        navigate(`/squishes/${id}`)
      } else {
        const row = await createSquish(user.id, input)
        navigate('/squishes', { state: { added: row.name } })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !form) return <div className="notice error">{error}</div>
  if (!form) return <Spinner />
  const preview = photo?.url ?? form.image_url ?? existingPhoto

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <Link to={id ? `/squishes/${id}` : '/squishes'} className="small">← Back</Link>
      <h1>{id ? 'Edit squish' : form.wishlist ? 'Add to wishlist' : 'Add a squish'}</h1>
      {error && <div className="notice error">{error}</div>}

      <div className="squish-form-photo">
        <div className={`art${preview ? '' : ' empty'}`}>{preview ? <img src={preview} alt="" referrerPolicy="no-referrer" /> : <span>No picture yet</span>}</div>
        <div className="stack" style={{ gap: 10, flex: 1, minWidth: 220 }}>
          <button type="button" className="btn" onClick={() => void takePhoto()}>{existingPhoto || photo ? 'Retake photo' : 'Take a photo'}</button>
          {form.brand === 'Squishmallows' && (
            <button type="button" className="btn" onClick={() => void findOnWiki()} disabled={wikiBusy || !form.name.trim()}>{wikiBusy ? 'Looking…' : 'Find a picture on the Squishmallows wiki'}</button>
          )}
          <div className="row" style={{ gap: 6 }}>
            <input className="input" placeholder="Paste a store link for the picture" value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" style={{ flex: 1 }} />
            <button type="button" className="btn" onClick={() => void useLink()} disabled={linkBusy || !link.trim()}>{linkBusy ? '…' : 'Use'}</button>
          </div>
          {form.image_url && <button type="button" className="btn ghost small" onClick={() => set('image_url', null)}>Remove the web picture</button>}
        </div>
      </div>
      {wikiHits.length > 0 && (
        <div className="search-results">
          {wikiHits.map((h) => (
            <button key={h.full} type="button" className={`result${form.image_url === h.full ? ' selected' : ''}`} onClick={() => { set('image_url', h.full); setWikiHits([]) }}>
              <img src={h.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ aspectRatio: '1' }} />
              <div className="name">{h.title}</div>
            </button>
          ))}
        </div>
      )}

      <div className="row">
        <label className="field"><span>Name</span><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Cam" autoFocus={!id} /></label>
        <label className="field"><span>Brand</span>
          <input className="input" list="brands" value={form.brand ?? ''} onChange={(e) => set('brand', e.target.value || null)} placeholder="Squishmallows" />
          <datalist id="brands">{BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
        </label>
      </div>
      <div className="row">
        <label className="field"><span>What is it</span><input className="input" value={form.character ?? ''} onChange={(e) => set('character', e.target.value || null)} placeholder="cat, axolotl, dragon" /></label>
        <label className="field"><span>Squad or line</span><input className="input" value={form.squad ?? ''} onChange={(e) => set('squad', e.target.value || null)} placeholder="Fantasy Squad" /></label>
      </div>
      <div className="row">
        <label className="field"><span>Size (inches)</span><input className="input" type="number" step="0.5" min="0" value={form.size_inches ?? ''} onChange={(e) => set('size_inches', num(e.target.value))} inputMode="decimal" /></label>
        <label className="field"><span>Colour</span><input className="input" value={form.color ?? ''} onChange={(e) => set('color', e.target.value || null)} placeholder="teal with pink belly" /></label>
        <label className="field"><span>Condition</span>
          <select className="select" value={form.condition} onChange={(e) => set('condition', e.target.value as SquishCondition)}>
            {Object.entries(SQUISH_CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        <label className="field"><span>Where from</span><input className="input" value={form.acquired_from ?? ''} onChange={(e) => set('acquired_from', e.target.value || null)} placeholder="Target, Grandma…" /></label>
        <label className="field"><span>When</span><input className="input" type="date" value={form.acquired_on ?? ''} onChange={(e) => set('acquired_on', e.target.value || null)} /></label>
      </div>
      <div className="row">
        <label className="field"><span>Price paid</span><input className="input" type="number" step="0.01" min="0" value={form.price_paid ?? ''} onChange={(e) => set('price_paid', num(e.target.value))} inputMode="decimal" /></label>
        <label className="field"><span>Worth about</span><input className="input" type="number" step="0.01" min="0" value={form.value ?? ''} onChange={(e) => set('value', num(e.target.value))} inputMode="decimal" /></label>
      </div>
      <div className="row" style={{ gap: 20 }}>
        <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.favorite} onChange={(e) => set('favorite', e.target.checked)} /> Favourite</label>
        <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.wishlist} onChange={(e) => set('wishlist', e.target.checked)} /> On the wishlist (don't have it yet)</label>
      </div>
      <label className="field"><span>Notes</span><textarea className="textarea" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} placeholder="Anything worth remembering" /></label>

      <div className="actions">
        <button className="btn primary big" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : id ? 'Save changes' : form.wishlist ? 'Add to wishlist' : 'Add to my squishes'}</button>
        <Link to={id ? `/squishes/${id}` : '/squishes'} className="btn">Cancel</Link>
      </div>
    </div>
  )
}
