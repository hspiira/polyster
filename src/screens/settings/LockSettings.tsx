/* Set, change or remove the device PIN. Removing is allowed: a lock nobody
   wants gets written on the counter, which is worse than no lock. */
import { useState } from 'preact/hooks'
import { Button, Card, cn, ErrorNote, InfoNote, Screen, SectionTitle } from '../../ui'
import { IconAlert, IconLock } from '../../components/icons'
import { ChoosePinPad } from '../../components/ChoosePinPad'
import { useShop } from '../../state/ShopProvider'
import { clearStaffPin, setStaffPin } from '../../db/repo'
import {
  DEFAULT_ITERATIONS,
  PIN_LENGTH,
  TARGET_HASH_MS,
  measureHashMs,
  recommendIterations,
} from '../../lib/pin'
import { useBack } from '../../hooks/useBack'

type Phase = 'idle' | 'choose' | 'confirm'

export function LockSettings() {
  const back = useBack()
  const { db, staff, activeStaff } = useShop()
  const person = activeStaff ?? staff[0]

  const [phase, setPhase] = useState<Phase>('idle')
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

          <ChoosePinPad
            chooseHint="Choose your PIN"
            confirmHint="Confirm your PIN"
            onError={setError}
            onPhase={(isConfirming) => setPhase(isConfirming ? 'confirm' : 'choose')}
            onChosen={async (pin) => {
              try {
                await setStaffPin(db, staffId, pin)
                setPhase('idle')
                setSaved(true)
                return null
              } catch (err) {
                return err instanceof Error ? err.message : 'Could not save.'
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

        <PinCostCheck />
      </div>
    </Screen>
  )
}

/* DEFAULT_ITERATIONS was extrapolated from a desktop, never measured on a phone.
   Dev only: this is a workbench reading, not something a shop owner needs. */
function PinCostCheck() {
  const [ms, setMs] = useState<number | null>(null)
  const [running, setRunning] = useState(false)

  if (!import.meta.env.DEV) return null

  async function run() {
    setRunning(true)
    try {
      setMs(await measureHashMs())
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <SectionTitle>PIN cost on this device</SectionTitle>
      <Card>
        <p class="text-sm leading-relaxed text-content-muted">
          {ms === null
            ? `Times one hash at ${DEFAULT_ITERATIONS.toLocaleString()} iterations. Target is ${TARGET_HASH_MS}ms on the slowest phone a shop uses.`
            : `${Math.round(ms)}ms at ${DEFAULT_ITERATIONS.toLocaleString()} iterations. For ${TARGET_HASH_MS}ms, use ${recommendIterations(ms, DEFAULT_ITERATIONS).toLocaleString()}.`}
        </p>
        <div class="mt-3">
          <Button variant="secondary" onClick={() => void run()} disabled={running}>
            {running ? 'Timing...' : 'Time it'}
          </Button>
        </div>
      </Card>
    </>
  )
}
