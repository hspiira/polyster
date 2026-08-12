/**
 * The one-time code, on the same pad as the PIN.
 *
 * Resending happens here rather than by going back to the number screen, which
 * used to throw the number away and make you type it again. The cooldown stops
 * a second tap sending a second code before the first has arrived.
 */
import { useEffect, useState } from 'preact/hooks'
import { PinPad } from '../../../components/PinPad'
import { useAuth } from '../../../hooks/useAuth'
import { formatPhoneForDisplay, toE164 } from '../../../lib/phone'
import { EntryCentred, EntryHeading, EntryQuietButton } from '../parts'

const RESEND_AFTER_SECONDS = 45

export function CodeStep({
  phone,
  onVerified,
  onEditNumber,
}: {
  phone: string
  /** Receives the verified account id. */
  onVerified: (userId: string) => void
  onEditNumber: () => void
}) {
  const { controller } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [waitSeconds, setWaitSeconds] = useState(RESEND_AFTER_SECONDS)

  useEffect(() => {
    if (waitSeconds <= 0) return
    const timer = window.setTimeout(() => setWaitSeconds((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [waitSeconds])

  const e164 = toE164(phone)

  async function resend() {
    setNotice(null)
    setError(null)
    try {
      await controller.requestCode(phone)
      setWaitSeconds(RESEND_AFTER_SECONDS)
      setNotice('A new code is on its way.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send another code.')
    }
  }

  return (
    <EntryCentred>
      <EntryHeading
        centred
        title="Enter the code"
        body={`Sent to ${e164 ? formatPhoneForDisplay(e164) : phone}`}
      />

      <PinPad
        oneTimeCode
        label="One-time code"
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

      {notice && (
        <p role="status" class="mt-5 text-center text-sm text-stone-300">
          {notice}
        </p>
      )}

      <div class="mt-7 space-y-1">
        <EntryQuietButton type="button" onClick={() => void resend()} disabled={waitSeconds > 0}>
          {waitSeconds > 0 ? `Send again in ${waitSeconds}s` : "Didn't get it? Send again"}
        </EntryQuietButton>
        <EntryQuietButton type="button" onClick={onEditNumber}>
          Use a different number
        </EntryQuietButton>
      </div>
    </EntryCentred>
  )
}
