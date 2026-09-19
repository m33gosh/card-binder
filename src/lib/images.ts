// Everything that touches pixels: HEIC conversion (iPhone photos), resizing
// before upload, and slicing a binder-page photo into individual cards.

export const CARD_ASPECT = 63 / 88 // width / height of a Pokémon card

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.86

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

/** Returns a Blob the browser can decode (HEIC → JPEG when needed). */
export async function toDecodableBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) return file
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  return Array.isArray(out) ? out[0] : out
}

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('That file could not be read as an image.'))
      img.src = url
    })
  } finally {
    // revoke after the image has decoded; the element keeps its bitmap
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image.'))), 'image/jpeg', JPEG_QUALITY),
  )
}

/** Downscale so the longest edge is MAX_EDGE, re-encoded as JPEG. */
export async function normalizeForUpload(img: HTMLImageElement): Promise<Blob> {
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvasToJpeg(canvas)
}

/** Normalised rectangle: all values 0..1 relative to the source image. */
export interface Region { x: number; y: number; w: number; h: number }

export interface GridSpec {
  /** rectangle around the whole block of cards */
  bounds: Region
  cols: number
  rows: number
  /** fraction of a cell to trim on each side so sleeve edges don't show */
  inset: number
}

export const DEFAULT_GRID: GridSpec = {
  bounds: { x: 0.08, y: 0.06, w: 0.84, h: 0.88 },
  cols: 3,
  rows: 3,
  inset: 0.03,
}

/** Split the grid bounds into row-major cell regions. */
export function gridCells(spec: GridSpec): Region[] {
  const cells: Region[] = []
  const cellW = spec.bounds.w / spec.cols
  const cellH = spec.bounds.h / spec.rows
  const dx = cellW * spec.inset
  const dy = cellH * spec.inset
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      cells.push({
        x: spec.bounds.x + c * cellW + dx,
        y: spec.bounds.y + r * cellH + dy,
        w: cellW - 2 * dx,
        h: cellH - 2 * dy,
      })
    }
  }
  return cells
}

export async function cropRegion(img: HTMLImageElement, region: Region): Promise<Blob> {
  const sx = region.x * img.naturalWidth
  const sy = region.y * img.naturalHeight
  const sw = region.w * img.naturalWidth
  const sh = region.h * img.naturalHeight
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvasToJpeg(canvas)
}
