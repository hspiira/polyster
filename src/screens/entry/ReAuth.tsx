import { useState } from 'preact/hooks'
import { useAuth } from '../../hooks/useAuth'
import { useShop } from '../../state/ShopProvider'
import { verifiedUserOwnsShop } from '../../lib/recovery'
import { CredentialStep } from './steps/CredentialStep'
import { EntryError, EntryQuietButton, EntryScreen } from './parts'

export function ReAuth({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { controller } = useAuth()
  const { shop } = useShop()
  const [error, setError] = useState<string | null>(null)

  return (
    <EntryScreen>
      {error && <EntryError>{error}</EntryError>}
      <CredentialStep
        mode="signIn"
        title="Sign in again"
        body={`This device has stopped syncing${shop ? ` ${shop.name}` : ''}. Nothing has been lost -- signing in starts it again.`}
        submitLabel="Sign in"
        onSignedIn={async (userId) => {
          if (!verifiedUserOwnsShop(userId, shop?.supabase_auth_user_id)) {
            await controller.signOut()
            setError('That account does not own this shop. Use the one it was backed up with.')
            return
          }
          setError(null)
          onDone()
        }}
        footer={
          <div class="mt-4">
            <EntryQuietButton type="button" onClick={onCancel}>
              Not now
            </EntryQuietButton>
          </div>
        }
      />
    </EntryScreen>
  )
}
