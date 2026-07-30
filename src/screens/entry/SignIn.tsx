/**
 * Sign in: a number, then a code.
 *
 * The same two screens setup opens with -- only the backend knows whether a
 * number already has a shop, so there is nothing for the user to declare.
 */
import { useState } from 'preact/hooks'
import { PhoneStep } from './steps/PhoneStep'
import { CodeStep } from './steps/CodeStep'
import { EntryQuietButton, EntryScreen } from './parts'

export function SignIn({ onCancel }: { onCancel: () => void }) {
  const [phone, setPhone] = useState<string | null>(null)

  if (phone === null) {
    return (
      <EntryScreen>
        <PhoneStep
          onSent={setPhone}
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
      {/* Verifying signs the device in; the app root decides what comes next. */}
      <CodeStep phone={phone} onVerified={() => {}} onResend={() => setPhone(null)} />
    </EntryScreen>
  )
}
