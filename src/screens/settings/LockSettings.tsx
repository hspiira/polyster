/**
 * Set, change or remove the PIN that locks this device.
 *
 * Registration does not ask for one, so most shops arrive here with none set.
 * Removing it is allowed: a lock nobody wants gets shared or written on the
 * counter, which is worse than no lock at all.
 */
import { useState } from 'preact/hooks'
import { Button, Card, cn, ErrorNote, InfoNote, Screen, SectionTitle } from '../../ui'
import { IconAlert, IconLock } from '../../components/icons'
import { PinPad } from '../../components/PinPad'
import { useShop } from '../../state/ShopProvider'
import { clearStaffPin, setStaffPin } from '../../db/writes'
import { PIN_LENGTH } from '../../lib/pin'
import { useBack } from '../../hooks/useBack'

type Phase = 'idle' | 'choose' | 'confirm'

export function LockSettings() {
  const back = useBack()
  const { db, staff, activeStaff } = useShop()
  const person = activeStaff ?? staff[0]

  const [phase, setPhase] = useState<Phase>('idle')
  const [first, setFirst] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (!person) return null
  const staffId = person.id
  const hasPin = Boolean(person.pin_hash)

  async function remove() {
    setError(null)
    try {
      await clearStaffPin(db, staffId)
      setSaved(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the PIN.')
    }
  }

  if (phase !== 'idle') {
    const confirming = phase === 'confirm'
    return (
      <Screen title={confirming ? 'Type it again' : 'Choose a PIN'} back="/settings/lock">
        <div class="space-y-5">
          <InfoNote>
            {confirming
              ? 'So a mistyped digit does not lock you out of your own shop.'
              : `${PIN_LENGTH} digits to open the app on this phone. It never leaves this device.`}
          </InfoNote>

          {error && <ErrorNote>{error}</ErrorNote>}

          <PinPad
            key={phase}
            tone="light"
            label="PIN"
            hint={confirming ? 'Confirm your PIN' : 'Choose your PIN'}
            errorHint="Those did not match. Start again."
            busyHint="Saving..."
            onComplete={async (pin) => {
              if (!confirming) {
                setFirst(pin)
                setError(null)
                setPhase('confirm')
                return true
              }
              if (pin !== first) {
                setFirst('')
                setError('Those two PINs did not match. Choose one again.')
                setPhase('choose')
                return false
              }
              try {
                await setStaffPin(db, person.id, pin)
                setPhase('idle')
                setSaved(true)
                return true
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not save.')
                setPhase('choose')
                return false
              }
            }}
          />
        </div>
      </Screen>
    )
  }

  return (
    <Screen title="Lock this phone" back={back}>
      <div class="space-y-5">
        <SectionTitle>Status</SectionTitle>
        <Card>
          <div class="flex items-start gap-3">
            <span
              class={cn(
                'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[0.65rem]',
                hasPin ? 'bg-success-soft text-success-on-soft' : 'bg-money-soft text-money-on-soft',
              )}
            >
              {hasPin ? <IconLock size={18} /> : <IconAlert size={18} />}
            </span>
            <div class="min-w-0">
              <p class="font-medium">{hasPin ? 'A PIN is set' : 'No PIN set'}</p>
              <p class="mt-1 text-sm leading-relaxed text-content-muted">
                {hasPin
                  ? 'This phone asks for your PIN when it has been idle, and after it has been closed and reopened.'
                  : `Anyone who picks up this phone can open your shop. A PIN asks for ${PIN_LENGTH} digits first.`}
              </p>
            </div>
          </div>
        </Card>

        {saved && <InfoNote>PIN saved. It will be asked for next time.</InfoNote>}
        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex flex-col gap-2">
          <Button
            block
            onClick={() => {
              setSaved(false)
              setError(null)
              setPhase('choose')
            }}
          >
            {hasPin ? 'Change PIN' : 'Set a PIN'}
          </Button>
          {hasPin && (
            <Button variant="secondary" block onClick={() => void remove()}>
              Remove the PIN
            </Button>
          )}
        </div>
      </div>
    </Screen>
  )
}
