/**
 * The one-time code, entered on the same pad as the PIN.
 *
 * One input idiom for the whole entry flow: six dots, self-submitting on the
 * last digit, "Delete". Nobody meets a number pad on one screen and a text
 * field on the next.
 */
import { useState } from 'preact/hooks'
import { PinPad } from '../../../components/PinPad'
import { useAuth } from '../../../hooks/useAuth'
import { formatPhoneForDisplay, toE164 } from '../../../lib/phone'
import { EntryCentred, EntryHeading, EntryQuietButton } from '../parts'

export function CodeStep({
  phone,
  onVerified,
  onResend,
}: {
  phone: string
  /** Receives the verified account id. */
  onVerified: (userId: string) => void
  onResend: () => void
}) {
  const { controller } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const e164 = toE164(phone)

  return (
    <EntryCentred>
      <EntryHeading
        centred
        title="Enter the code"
        body={`Sent to ${e164 ? formatPhoneForDisplay(e164) : phone}`}
      />

      <PinPad
        hint="Enter the code"
        errorHint={error ?? 'That code did not work. Ask for a new one.'}
        busyHint="Checking..."
        onComplete={async (code) => {
          try {
            onVerified(await controller.verifyCode(phone, code))
            return true
          } catch (err) {
            setError(err instanceof Error ? err.message : null)
            return false
          }
        }}
      />

      <EntryQuietButton type="button" onClick={onResend} class="mt-7">
        Didn't get it? Send again
      </EntryQuietButton>
    </EntryCentred>
  )
}
