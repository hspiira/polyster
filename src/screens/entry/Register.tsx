/* All of registration: a shop name, your name, in. Everything else is asked at
   the moment it becomes true, not up front. */
import { useRef, useState } from 'preact/hooks'
import { useAuth } from '../../hooks/useAuth'
import { useShop } from '../../state/ShopProvider'
import { createShop, createStaff } from '../../db/writes'
import { EntryButton, EntryField, EntryForm, EntryHeading, EntryInput, EntryScreen } from './parts'

type Invalid = 'shop' | 'you' | null

export function Register({ onDone }: { onDone: () => void }) {
  const { db } = useShop()
  const { state: auth } = useAuth()
  const { setActiveStaff } = useShop()

  const [name, setName] = useState('')
  const [yourName, setYourName] = useState('')
  const [invalid, setInvalid] = useState<Invalid>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const shopRef = useRef<HTMLInputElement>(null)
  const youRef = useRef<HTMLInputElement>(null)

  async function submit(event: Event) {
    event.preventDefault()
    if (saving) return

    if (!name.trim()) {
      setInvalid('shop')
      setError('Your shop needs a name. Clients see it in every message you send.')
      shopRef.current?.focus()
      return
    }
    if (!yourName.trim()) {
      setInvalid('you')
      setError('Your name is what gets recorded against the orders you take.')
      youRef.current?.focus()
      return
    }

    setSaving(true)
    setInvalid(null)
    setError(null)
    try {
      const shop = await createShop(db, {
        name,
        supabaseAuthUserId: auth.status === 'signed_in' ? auth.userId : undefined,
      })
      // No PIN: the device is locked later, from Settings or the prompt that
      // follows the first order.
      setActiveStaff(await createStaff(db, shop.id, { name: yourName, role: 'owner' }))
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setSaving(false)
    }
  }

  return (
    <EntryScreen>
      <EntryForm
        onSubmit={submit}
        actions={
          <EntryButton type="submit" disabled={saving}>
            {saving ? 'Setting up...' : 'Start taking orders'}
          </EntryButton>
        }
      >
        <EntryHeading
          title="Your shop"
          body="Two things and you are in. Everything else can wait until you need it."
        />

        <EntryField
          label="Shop name"
          hint="Clients see this in the messages you send them."
          error={invalid === 'shop' ? error : null}
        >
          <EntryInput
            inputRef={shopRef}
            autofocus
            autocomplete="organization"
            value={name}
            onValue={(value) => {
              setName(value)
              if (invalid === 'shop') setInvalid(null)
            }}
          />
        </EntryField>

        <EntryField
          label="Your name"
          hint="Recorded against the orders you take."
          error={invalid === 'you' ? error : null}
        >
          <EntryInput
            inputRef={youRef}
            autocomplete="name"
            value={yourName}
            onValue={(value) => {
              setYourName(value)
              if (invalid === 'you') setInvalid(null)
            }}
          />
        </EntryField>

        {error && invalid === null && (
          <p role="alert" class="mt-1 text-sm leading-relaxed text-danger">
            {error}
          </p>
        )}
      </EntryForm>
    </EntryScreen>
  )
}
