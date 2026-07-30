/**
 * A forgotten PIN.
 *
 * Two paths, decided by lib/recovery.ts. Online with a claimed shop: verify the
 * number, then choose a new PIN. Otherwise there is nothing to prove ownership
 * against, and the only honest option left is to remove the shop from this
 * device and set it up again.
 *
 * The number is typed rather than read from anywhere. Verifying a code proves
 * you own that number, so the account it resolves to is then checked against
 * the shop's own -- verify someone else's number and it will not match.
 */
import { useState } from 'preact/hooks'
import { PinPad } from '../../components/PinPad'
import { useOnline } from '../../hooks/useOnline'
import { useShop } from '../../state/ShopProvider'
import { setStaffPin } from '../../db/writes'
import { wipeLocalDatabase } from '../../db/database'
import { recoveryPath, verifiedUserOwnsShop } from '../../lib/recovery'
import { PIN_LENGTH } from '../../lib/pin'
import { PhoneStep } from './steps/PhoneStep'
import { CodeStep } from './steps/CodeStep'
import {
  EntryButton,
  EntryCentred,
  EntryDangerButton,
  EntryError,
  EntryHeading,
  EntryNote,
  EntryQuietButton,
  EntryScreen,
} from './parts'
import type { StaffDoc } from '../../db/schema'

type Stage = 'choose' | 'phone' | 'code' | 'newPin' | 'confirmPin' | 'confirmReset'

export function PinRecovery({ person, onCancel }: { person: StaffDoc; onCancel: () => void }) {
  const online = useOnline()
  const { db, shop } = useShop()

  const [stage, setStage] = useState<Stage>('choose')
  const [phone, setPhone] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const path = recoveryPath({ online, shopAuthUserId: shop?.supabase_auth_user_id })

  async function resetDevice() {
    await wipeLocalDatabase(db)
    window.location.reload()
  }

  if (stage === 'phone') {
    return (
      <EntryScreen>
        <PhoneStep
          title="Verify your number"
          body="The number this shop's account uses. We'll send a code to it."
          onSent={(sent) => {
            setPhone(sent)
            setError(null)
            setStage('code')
          }}
        />
      </EntryScreen>
    )
  }

  if (stage === 'code') {
    return (
      <EntryScreen>
        <CodeStep
          phone={phone}
          onResend={() => setStage('phone')}
          onVerified={(userId) => {
            if (!verifiedUserOwnsShop(userId, shop?.supabase_auth_user_id)) {
              setError('That number does not belong to this shop.')
              setStage('choose')
              return
            }
            setError(null)
            setStage('newPin')
          }}
        />
      </EntryScreen>
    )
  }

  if (stage === 'newPin' || stage === 'confirmPin') {
    const confirming = stage === 'confirmPin'
    return (
      <EntryScreen>
        <EntryCentred>
          <EntryHeading
            centred
            title={confirming ? 'Type it again' : 'Choose a new PIN'}
            body={
              confirming
                ? 'So a mistyped digit does not lock you out again.'
                : `${PIN_LENGTH} digits to open the app on this phone.`
            }
          />
          {error && <EntryError>{error}</EntryError>}
          <PinPad
            key={stage}
            hint={confirming ? 'Confirm your new PIN' : 'Choose your new PIN'}
            errorHint="Those did not match. Start again."
            busyHint="Saving..."
            onComplete={async (pin) => {
              if (!confirming) {
                setFirstPin(pin)
                setStage('confirmPin')
                return true
              }
              if (pin !== firstPin) {
                setFirstPin('')
                setError('Those two PINs did not match. Choose one again.')
                setStage('newPin')
                return false
              }
              try {
                await setStaffPin(db, person.id, pin)
                onCancel()
                return true
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not save the new PIN.')
                setStage('newPin')
                return false
              }
            }}
          />
        </EntryCentred>
      </EntryScreen>
    )
  }

  if (stage === 'confirmReset') {
    return (
      <EntryScreen>
        <EntryCentred>
          <EntryHeading
            title="Remove this shop?"
            body="Everything recorded on this device goes with it. Anything that has not synced yet cannot be got back."
          />
          {/* Only a claimed shop syncs anywhere, so only then is anything kept. */}
          <EntryNote>
            {shop?.supabase_auth_user_id
              ? `${shop.name} stays on any other device it syncs to. You can set this phone up again afterwards.`
              : 'This shop has never synced anywhere, so this device holds the only copy of it.'}
          </EntryNote>
          <div class="mt-6 space-y-2">
            <EntryDangerButton onClick={() => void resetDevice()}>
              Yes, remove this shop
            </EntryDangerButton>
            <EntryQuietButton onClick={() => setStage('choose')}>Cancel</EntryQuietButton>
          </div>
        </EntryCentred>
      </EntryScreen>
    )
  }

  return (
    <EntryScreen>
      <EntryCentred>
        {/* reset_only has two quite different causes -- say which one it is. */}
        <EntryHeading
          title="Forgotten your PIN?"
          body={
            path === 'verify'
              ? 'Verify the number this shop uses and choose a new one.'
              : online
                ? 'There is no account on this shop to check you against.'
                : 'Proving who you are needs a connection, and there is not one right now.'
          }
        />

        {error && <EntryError>{error}</EntryError>}

        {path === 'verify' ? (
          <EntryButton class="mt-2" onClick={() => setStage('phone')}>
            Verify your number
          </EntryButton>
        ) : (
          <EntryNote>
            {online
              ? 'This shop was set up on this device and never linked to a phone number. The only way back in is to remove it and start again.'
              : 'Come back when you have a signal and you can verify your number and choose a new PIN.'}
          </EntryNote>
        )}

        <div class="mt-8">
          <EntryQuietButton onClick={() => setStage('confirmReset')}>
            Remove this shop from this device
          </EntryQuietButton>
        </div>

        <div class="mt-2">
          <EntryQuietButton onClick={onCancel}>Back</EntryQuietButton>
        </div>
      </EntryCentred>
    </EntryScreen>
  )
}
