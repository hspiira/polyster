import { CredentialStep } from './steps/CredentialStep'
import { EntryQuietButton, EntryScreen } from './parts'

/**
 * Creates the shop's account. Binding it to the shop row is ShopPrompts' job,
 * driven by auth state, because a provider redirect unmounts this screen before
 * any callback here could run.
 */
export function ClaimShop({ onCancel }: { onCancel: () => void }) {
  return (
    <EntryScreen>
      <CredentialStep
        mode="create"
        title="Back up your shop"
        body="An email and a password, and your work is saved off this phone. It is also how you get back in if the phone is lost."
        submitLabel="Back up my shop"
        onSignedIn={() => {}}
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
