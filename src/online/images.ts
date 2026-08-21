/* Image upload, which stays on the server: a product photo is a URL the shop
   shares, and there is no point holding megabytes of it on the phone (D3). */
import { getSupabase } from '../lib/supabaseClient'
import { newId } from '../lib/ids'
import { withTimeout } from '../lib/withTimeout'

const PRODUCT_BUCKET = 'product-images'
const COLLECTION_BUCKET = 'collection-images'

const UPLOAD_TIMEOUT_MS = 30000

/** Uploads to "<shopId>/<id>.<ext>" and returns its public URL. */
async function upload(bucket: string, shopId: string, file: File): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : undefined
  const path = `${shopId}/${newId()}${ext ? `.${ext}` : ''}`

  // Bounded, because a photo on a slow connection otherwise leaves the form
  // spinning with nothing to tell the person holding the phone.
  const { error } = await withTimeout(
    getSupabase()
      .storage.from(bucket)
      .upload(path, file, { contentType: file.type || undefined }),
    UPLOAD_TIMEOUT_MS,
    'The upload is taking too long. Check your connection and try again.',
  )
  if (error) throw new Error(error.message)

  return getSupabase().storage.from(bucket).getPublicUrl(path).data.publicUrl
}

/** Best-effort cleanup when an image is replaced or removed. Never throws. */
async function remove(bucket: string, imageUrl: string): Promise<void> {
  const marker = `/${bucket}/`
  const index = imageUrl.indexOf(marker)
  if (index === -1) return
  await getSupabase()
    .storage.from(bucket)
    .remove([imageUrl.slice(index + marker.length)])
}

export function uploadProductImage(shopId: string, file: File): Promise<string> {
  return upload(PRODUCT_BUCKET, shopId, file)
}

export function deleteProductImage(imageUrl: string): Promise<void> {
  return remove(PRODUCT_BUCKET, imageUrl)
}

export function uploadCollectionImage(shopId: string, file: File): Promise<string> {
  return upload(COLLECTION_BUCKET, shopId, file)
}

export function deleteCollectionImage(imageUrl: string): Promise<void> {
  return remove(COLLECTION_BUCKET, imageUrl)
}
