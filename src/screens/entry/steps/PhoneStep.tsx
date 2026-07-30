/**
 * Ask for the number and send a code. Shared by first-run setup, sign-in and
 * PIN recovery -- all three start the same way.
 */
import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { useAuth } from '../../../hooks/useAuth'
import { EntryButton, EntryError, EntryField, EntryForm, EntryHeading, EntryInput } from '../parts'

export function PhoneStep({
  title = 'Your phone number',
  body = "We'll send a code to check it's yours. This is how you get back in on a new phone.",
  onSent,
  footer,
}: {
  title?: string
  body?: string
  onSent: (phone: string) => void
  footer?: ComponentChildren
}) {
  const { controller } = useAuth()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await controller.requestCode(phone)
      onSent(phone)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a code.')
      setBusy(false)
    }
  }

  return (
    <EntryForm
      onSubmit={submit}
      actions={
        <>
          <EntryButton type="submit" disabled={busy}>
            {busy ? 'Sending...' : 'Send code'}
          </EntryButton>
          {footer}
        </>
      }
    >
      <EntryHeading title={title} body={body} />

      {error && <EntryError>{error}</EntryError>}

      <EntryField label="Phone number">
        <EntryInput
          autofocus
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          placeholder="0700 000 000"
          value={phone}
          onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
        />
      </EntryField>
    </EntryForm>
  )
}
