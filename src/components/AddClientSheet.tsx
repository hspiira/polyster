/* Adding a client, shared by both shells so the two never drift apart. */
import { useState } from 'preact/hooks'
import { Button, ErrorNote, Field, Input, Sheet, Textarea } from '../ui'
import { useCurrentShop } from '../state/ShopProvider'
import { createClient } from '../db/writes'

export function AddClientSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: (clientId: string) => void
}) {
  const { db, shop } = useCurrentShop()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setPhone('')
    setNotes('')
    setError(null)
  }

  async function submit(event: Event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('A name is needed to find this client again.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const created = await createClient(db, shop.id, { name, phone, notes })
      reset()
      onClose()
      onCreated?.(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this client.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="New client" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Name">
          <Input
            value={name}
            autofocus
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </Field>

        <Field
          label="Phone"
          hint="Used for the WhatsApp button. Include the country code, or start with 0."
        >
          <Input
            type="tel"
            inputmode="tel"
            value={phone}
            onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
          />
        </Field>

        <Field label="Notes">
          <Textarea value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save client'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
