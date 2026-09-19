import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

/**
 * One way to get photos in, everywhere.
 * - On the web (GitHub Pages, iPad Safari) a normal file picker; iPad Safari
 *   offers "Take Photo" from it and hands us a JPEG.
 * - Inside the Capacitor iOS shell, the native camera / photo library.
 */
export async function pickPhotos(options: { multiple?: boolean } = {}): Promise<File[]> {
  if (Capacitor.isNativePlatform()) {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      quality: 90,
    })
    if (!photo.webPath) return []
    const blob = await (await fetch(photo.webPath)).blob()
    return [new File([blob], `photo.${photo.format || 'jpeg'}`, { type: blob.type || 'image/jpeg' })]
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,.heic,.heif'
    input.multiple = Boolean(options.multiple)
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}
