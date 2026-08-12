/**
 * Ask for the number and send a code. Shared by sign-in, claiming a shop, and
 * PIN recovery.
 *
 * The number is normalised as you type and echoed back, because the app assumes
 * a Ugandan prefix for anything typed without one. Getting that wrong sends the
 * code to a different country, so it is shown before it is sent, not after.
 */
import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { useAuth } from '../../../hooks/useAuth'
import { formatPhoneForDisplay, toE164 } from '../../../lib/phone'
import { EntryButton, EntryField, EntryForm, EntryHeading, EntryInput } from '../parts'

export function PhoneStep({
  title = 'Your phone number',
  body = "We'll send a code to check it's yours. This is how you get back in on a new phone.",
  initialPhone = '',
  onSent,
  footer,
}: {
  title?: string
  body?: string
  initialPhone?: string
  onSent: (phone: string) => void
  footer?: ComponentChildren
}) {
  const { controller } = useAuth()
  const [phone, setPhone] = useState(initialPhone)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const e164 = toE164(phone)
  const hint = phone.trim()
    ? e164
      ? `Sending to ${formatPhoneForDisplay(e164)}`
      : 'Start with 0, or with + and your country code.'
    : 'Starts with 0, or with + for another country.'

  async function submit(event: Event) {
    event.preventDefault()
    if (busy) return
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
          <EntryButton type="submit" disabled={busy || !e164}>
            {busy ? 'Sending...' : 'Send code'}
          </EntryButton>
          {footer}
        </>
      }
    >
      <EntryHeading title={title} body={body} />

      <EntryField label="Phone number" hint={hint} error={error}>
        <EntryInput
          autofocus
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          placeholder="0700 000 000"
          value={phone}
          onInput={(e) => {
            setPhone((e.target as HTMLInputElement).value)
            if (error) setError(null)
          }}
        />
      </EntryField>
    </EntryForm>
  )
}
