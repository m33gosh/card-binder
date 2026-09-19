import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { gridCells, type GridSpec } from '@/lib/images'

interface Props {
  imageUrl: string
  spec: GridSpec
  onChange: (spec: GridSpec) => void
}

/**
 * Drag the two yellow corners until the frame hugs the block of cards; the
 * dashed cells show exactly what each card crop will be.
 */
export function BinderCropper({ imageUrl, spec, onChange }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'tl' | 'br' | null>(null)

  function toNormalized(e: ReactPointerEvent) {
    const rect = box.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  function onMove(e: ReactPointerEvent) {
    if (!dragging) return
    const p = toNormalized(e)
    const b = spec.bounds
    const min = 0.1
    if (dragging === 'tl') {
      const x = Math.min(p.x, b.x + b.w - min)
      const y = Math.min(p.y, b.y + b.h - min)
      onChange({ ...spec, bounds: { x, y, w: b.x + b.w - x, h: b.y + b.h - y } })
    } else {
      onChange({ ...spec, bounds: { ...b, w: Math.max(min, p.x - b.x), h: Math.max(min, p.y - b.y) } })
    }
  }

  const pct = (n: number) => `${n * 100}%`
  const b = spec.bounds
  const cells = gridCells(spec)

  return (
    <div>
      <div
        ref={box}
        className="cropper"
        onPointerMove={onMove}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        <img src={imageUrl} alt="Binder page" draggable={false} />
        <div className="bounds" style={{ left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) }} />
        {cells.map((c, i) => (
          <div key={i} className="cell" style={{ left: pct(c.x), top: pct(c.y), width: pct(c.w), height: pct(c.h) }} />
        ))}
        <div
          className="handle"
          role="slider"
          aria-label="Top left corner"
          style={{ left: pct(b.x), top: pct(b.y) }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging('tl') }}
        />
        <div
          className="handle"
          role="slider"
          aria-label="Bottom right corner"
          style={{ left: pct(b.x + b.w), top: pct(b.y + b.h) }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging('br') }}
        />
      </div>
      <div className="crop-controls">
        <label>
          Across
          <select className="select" value={spec.cols} onChange={(e) => onChange({ ...spec, cols: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          Down
          <select className="select" value={spec.rows} onChange={(e) => onChange({ ...spec, rows: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          Trim edges
          <input type="range" min={0} max={0.12} step={0.005} value={spec.inset} onChange={(e) => onChange({ ...spec, inset: Number(e.target.value) })} />
        </label>
      </div>
    </div>
  )
}
