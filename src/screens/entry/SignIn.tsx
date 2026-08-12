/**
 * Sign in on a new phone: a number, then a code.
 *
 * Verifying signs the device in and replication pulls the shop down; app.tsx
 * decides what comes next.
 */
import { useState } from 'preact/hooks'
import { PhoneStep } from './steps/PhoneStep'
import { CodeStep } from './steps/CodeStep'
import { EntryQuietButton, EntryScreen } from './parts'

export function SignIn({ onCancel }: { onCancel: () => void }) {
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState(false)

  if (!sent) {
    return (
      <EntryScreen>
        <PhoneStep
          title="What is your number?"
          body="The one your shop is already set up with. We'll send a code to check it's yours."
          initialPhone={phone}
          onSent={(value) => {
            setPhone(value)
            setSent(true)
          }}
          footer={
            <div class="mt-4">
              <EntryQuietButton type="button" onClick={onCancel}>
                Back
              </EntryQuietButton>
            </div>
          }
        />
      </EntryScreen>
    )
  }

  return (
    <EntryScreen>
      <CodeStep phone={phone} onVerified={() => {}} onEditNumber={() => setSent(false)} />
    </EntryScreen>
  )
}
