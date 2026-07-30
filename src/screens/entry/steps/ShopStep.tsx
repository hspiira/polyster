/**
 * The shop, and the person setting it up.
 *
 * One screen because they are one act: an account maps to exactly one shop
 * (ARCHITECTURE section 4), and the owner is its first and, for now, only
 * person.
 *
 * The WhatsApp number is deliberately not asked for here. It is optional,
 * editable in Settings, and this screen already carries enough.
 */
import { useState } from 'preact/hooks'
import { useAuth } from '../../../hooks/useAuth'
import { useShop } from '../../../state/ShopProvider'
import { createShop } from '../../../db/writes'
import { EntryButton, EntryError, EntryField, EntryForm, EntryHeading, EntryInput } from '../parts'
import type { ShopDoc } from '../../../db/schema'

export function ShopStep({ onCreated }: { onCreated: (shop: ShopDoc, yourName: string) => void }) {
  const { db } = useShop()
  const { state: auth } = useAuth()
  const [name, setName] = useState('')
  const [yourName, setYourName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()

    if (!name.trim()) {
      setError('The shop needs a name -- clients see it in every message you send.')
      return
    }
    if (!yourName.trim()) {
      setError('Your name is what gets recorded against the orders you take.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const created = await createShop(db, {
        name,
        supabaseAuthUserId: auth.status === 'signed_in' ? auth.userId : undefined,
      })
      onCreated(created, yourName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setSaving(false)
    }
  }

  return (
    <EntryForm
      onSubmit={submit}
      actions={
        <EntryButton type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Continue'}
        </EntryButton>
      }
    >
      <EntryHeading
        title="Your shop"
        body="The name clients see in the messages you send them. You can change it later in Settings."
      />

      {error && <EntryError>{error}</EntryError>}

      <EntryField label="Shop name">
        <EntryInput
          autofocus
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </EntryField>

      <EntryField label="Your name">
        <EntryInput
          value={yourName}
          onInput={(e) => setYourName((e.target as HTMLInputElement).value)}
        />
      </EntryField>
    </EntryForm>
  )
}
