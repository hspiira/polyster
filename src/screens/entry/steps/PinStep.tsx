/**
 * Choose a PIN, then type it again.
 *
 * Twice, because unlike a password field there is no way to reveal what was
 * typed -- and a PIN mistyped once is a person locked out of their own shop.
 */
import { useState } from 'preact/hooks'
import { PinPad } from '../../../components/PinPad'
import { useShop } from '../../../state/ShopProvider'
import { createStaff } from '../../../db/writes'
import { PIN_LENGTH } from '../../../lib/pin'
import { EntryCentred, EntryError, EntryHeading } from '../parts'
import type { StaffDoc } from '../../../db/schema'

export function PinStep({
  shopId,
  yourName,
  onCreated,
}: {
  shopId: string
  yourName: string
  onCreated: (staff: StaffDoc) => void
}) {
  const { db } = useShop()
  const [phase, setPhase] = useState<'choose' | 'confirm'>('choose')
  const [first, setFirst] = useState('')
  const [error, setError] = useState<string | null>(null)

  const confirming = phase === 'confirm'

  return (
    <EntryCentred>
      <EntryHeading
        centred
        title={confirming ? 'Type it again' : 'Choose a PIN'}
        body={
          confirming
            ? 'So a mistyped digit does not lock you out of your own shop.'
            : `${PIN_LENGTH} digits to open the app on this phone. It never leaves this device.`
        }
      />

      {error && <EntryError>{error}</EntryError>}

      <PinPad
        key={phase}
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
            // Deliberately not signed in here -- the caller does that once
            // setup actually finishes, or this unmounts the remaining steps.
            onCreated(await createStaff(db, shopId, { name: yourName, pin, role: 'owner' }))
            return true
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save.')
            setPhase('choose')
            return false
          }
        }}
      />
    </EntryCentred>
  )
}
