import { useState } from 'preact/hooks'
import { useAuth } from '../../hooks/useAuth'
import { emailProblem } from '../../lib/credentials'
import { CredentialStep } from './steps/CredentialStep'
import {
  EntryButton,
  EntryField,
  EntryForm,
  EntryHeading,
  EntryInput,
  EntryNote,
  EntryQuietButton,
  EntryScreen,
} from './parts'

export function SignIn({ onCancel }: { onCancel: () => void }) {
  const [forgot, setForgot] = useState(false)

  if (forgot) {
    return (
      <EntryScreen>
        <ForgotPassword onBack={() => setForgot(false)} />
      </EntryScreen>
    )
  }

  return (
    <EntryScreen>
      <CredentialStep
        mode="signIn"
        title="Sign in"
        body="The email your shop is set up with. Your work syncs back down to this phone."
        submitLabel="Sign in"
        // app.tsx decides what comes next once replication has pulled the shop.
        onSignedIn={() => {}}
        onForgot={() => setForgot(true)}
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

function ForgotPassword({ onBack }: { onBack: () => void }) {
  const { controller } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (sent) {
    return (
      <>
        <EntryHeading
          title="Check your email"
          body={`If ${email.trim()} has a shop, a reset link is on its way to it.`}
        />
        <div class="mt-6">
          <EntryQuietButton type="button" onClick={onBack}>
            Back to sign in
          </EntryQuietButton>
        </div>
      </>
    )
  }

  async function submit(event: Event) {
    event.preventDefault()
    if (busy) return

    const problem = emailProblem(email)
    if (problem) {
      setError(problem)
      return
    }

    setBusy(true)
    setError(null)
    try {
      await controller.sendPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a reset link.')
      setBusy(false)
    }
  }

  return (
    <EntryForm
      onSubmit={submit}
      actions={
        <EntryButton type="submit" disabled={busy}>
          {busy ? 'Sending...' : 'Send a reset link'}
        </EntryButton>
      }
      footer={
        <div class="mt-4">
          <EntryQuietButton type="button" onClick={onBack}>
            Back
          </EntryQuietButton>
        </div>
      }
    >
      <EntryHeading
        title="Reset your password"
        body="We'll email a link that lets you choose a new one."
      />

      <EntryField label="Email" error={error}>
        <EntryInput
          autofocus
          type="email"
          inputmode="email"
          autocomplete="email"
          autocapitalize="none"
          spellcheck={false}
          placeholder="you@example.com"
          value={email}
          onValue={(value) => {
            setEmail(value)
            if (error) setError(null)
          }}
        />
      </EntryField>

      <EntryNote>
        Your shop stays on this phone either way. Resetting only changes how you sign in on a new
        one.
      </EntryNote>
    </EntryForm>
  )
}
