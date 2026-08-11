/**
 * Attach a number to a shop that was set up without one.
 *
 * The same two screens as sign-in, but the shop already exists here, so the
 * verified account is written onto it and replication can start.
 */
import { useState } from 'preact/hooks'
import { useShop } from '../../state/ShopProvider'
import { claimShop } from '../../db/writes'
import { PhoneStep } from './steps/PhoneStep'
import { CodeStep } from './steps/CodeStep'
import { EntryError, EntryQuietButton, EntryScreen } from './parts'

export function ClaimShop({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { db, shop } = useShop()
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!sent) {
    return (
      <EntryScreen>
        {error && <EntryError>{error}</EntryError>}
        <PhoneStep
          title="Back up your shop"
          body="Add your number and your work is saved off this phone. It is also how you get back in if the phone is lost."
          initialPhone={phone}
          onSent={(value) => {
            setPhone(value)
            setError(null)
            setSent(true)
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

  return (
    <EntryScreen>
      <CodeStep
        phone={phone}
        onEditNumber={() => setSent(false)}
        onVerified={async (userId) => {
          if (!shop) return
          try {
            await claimShop(db, shop.id, userId)
            onDone()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not back up this shop.')
            setSent(false)
          }
        }}
      />
    </EntryScreen>
  )
}
