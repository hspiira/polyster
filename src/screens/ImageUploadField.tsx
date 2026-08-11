import { useState } from 'preact/hooks'
import { Field, ErrorNote } from '../components/ui'

export function ImageUploadField({
  imageUrl,
  onChange,
  upload,
  onDelete,
  label = 'Photo',
}: {
  imageUrl: string
  onChange: (url: string) => void
  upload: (file: File) => Promise<string>
  onDelete: (url: string) => Promise<void>
  label?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const previous = imageUrl
      const url = await upload(file)
      onChange(url)
      if (previous) void onDelete(previous)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that image.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Field label={label} hint="Optional.">
      <div class="space-y-2">
        {imageUrl && <img src={imageUrl} alt="" class="h-24 w-24 rounded-control object-cover" />}
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={handleFile}
          class="block w-full text-sm text-content-muted file:mr-3 file:rounded-control
                 file:border-0 file:bg-surface-sunken file:px-3 file:py-2 file:text-sm
                 file:font-medium file:text-content"
        />
        {uploading && <span class="text-xs text-content-muted">Uploading...</span>}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Field>
  )
}
