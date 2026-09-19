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
    // iOS Safari can drop the result of a file input that isn't in the
    // document, and the camera takes long enough for that to bite. Keep the
    // input attached (and referenced) until it answers.
    document.querySelector('#photo-picker')?.remove()
    const input = document.createElement('input')
    input.id = 'photo-picker'
    input.type = 'file'
    input.accept = 'image/*,.heic,.heif'
    input.multiple = Boolean(options.multiple)
    input.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px'
    const finish = (files: File[]) => {
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])))
    input.addEventListener('cancel', () => finish([]))
    document.body.appendChild(input)
    input.click()
  })
}
