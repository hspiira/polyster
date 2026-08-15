/* A forgotten PIN, two paths, decided by lib/recovery.ts. Signing in proves you
   own the account, not that it owns this shop -- so the ids are compared. */
import { useState } from 'preact/hooks'
import { ChoosePinPad } from '../../components/ChoosePinPad'
import { useAuth } from '../../hooks/useAuth'
import { useOnline } from '../../hooks/useOnline'
import { useShop } from '../../state/ShopProvider'
import { setStaffPin } from '../../db/writes'
import { wipeLocalDatabase } from '../../db/database'
import { recoveryPath, verifiedUserOwnsShop } from '../../lib/recovery'
import { PIN_LENGTH } from '../../lib/pin'
import { CredentialStep } from './steps/CredentialStep'
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

type Stage = 'choose' | 'signIn' | 'newPin' | 'confirmPin' | 'confirmReset'

export function PinRecovery({ person, onCancel }: { person: StaffDoc; onCancel: () => void }) {
  const online = useOnline()
  const { controller } = useAuth()
  const { db, shop } = useShop()

  const [stage, setStage] = useState<Stage>('choose')
  const [error, setError] = useState<string | null>(null)

  const path = recoveryPath({ online, shopAuthUserId: shop?.supabase_auth_user_id })

  async function resetDevice() {
    await wipeLocalDatabase(db)
    window.location.reload()
  }

  if (stage === 'signIn') {
    return (
      <EntryScreen>
        <CredentialStep
          mode="signIn"
          title="Sign in to this shop"
          body="The email and password this shop is backed up with. Then you can choose a new PIN."
          submitLabel="Sign in"
          onSignedIn={async (userId) => {
            if (!verifiedUserOwnsShop(userId, shop?.supabase_auth_user_id)) {
              // Do not leave the wrong account signed in: replication would
              // push this shop's rows under an id RLS rejects.
              await controller.signOut()
              setError('That account does not belong to this shop.')
              setStage('choose')
              return
            }
            setError(null)
            setStage('newPin')
          }}
          footer={
            <div class="mt-4">
              <EntryQuietButton type="button" onClick={() => setStage('choose')}>
                Back
              </EntryQuietButton>
            </div>
          }
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
          {/* onPhase keeps the wizard's own heading tracking the pad's phase,
              which is why this screen does not need its own copy of the dance. */}
          <ChoosePinPad
            tone="dark"
            chooseHint="Choose your new PIN"
            confirmHint="Confirm your new PIN"
            onError={setError}
            onPhase={(isConfirming) => setStage(isConfirming ? 'confirmPin' : 'newPin')}
            onChosen={async (pin) => {
              try {
                await setStaffPin(db, person.id, pin)
                onCancel()
                return null
              } catch (err) {
                return err instanceof Error ? err.message : 'Could not save the new PIN.'
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
              ? "Sign in to this shop's account and choose a new one."
              : online
                ? 'There is no account on this shop to check you against.'
                : 'Proving who you are needs a connection, and there is not one right now.'
          }
        />

        {error && <EntryError>{error}</EntryError>}

        {path === 'verify' ? (
          <EntryButton class="mt-2" onClick={() => setStage('signIn')}>
            Sign in to this shop
          </EntryButton>
        ) : (
          <EntryNote>
            {online
              ? 'This shop was set up on this device and never backed up to an account. The only way back in is to remove it and start again.'
              : 'Come back when you have a signal and you can sign in and choose a new PIN.'}
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
