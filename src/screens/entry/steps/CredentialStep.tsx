import { useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { useAuth } from '../../../hooks/useAuth'
import { MIN_PASSWORD_LENGTH, emailProblem, passwordProblem } from '../../../lib/credentials'
import {
  EntryButton,
  EntryDivider,
  EntryField,
  EntryForm,
  EntryHeading,
  EntryInput,
  EntryNote,
  EntryQuietButton,
  EntryReveal,
} from '../parts'
import { ProviderSignIn } from './ProviderSignIn'

type Field = 'email' | 'password'

export function CredentialStep({
  mode,
  title,
  body,
  submitLabel,
  onSignedIn,
  onForgot,
  footer,
}: {
  mode: 'signIn' | 'create'
  title: string
  body: string
  submitLabel: string
  onSignedIn: (userId: string) => void | Promise<void>
  onForgot?: () => void
  footer?: ComponentChildren
}) {
  const { controller } = useAuth()
  const { canEmailRecover } = controller.options()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [invalid, setInvalid] = useState<Field | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmSent, setConfirmSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function submit(event: Event) {
    event.preventDefault()
    if (busy) return

    const emailIssue = emailProblem(email)
    if (emailIssue) {
      setInvalid('email')
      setError(emailIssue)
      emailRef.current?.focus()
      return
    }
    const passwordIssue = mode === 'create' ? passwordProblem(password) : password ? null : 'Enter your password.'
    if (passwordIssue) {
      setInvalid('password')
      setError(passwordIssue)
      passwordRef.current?.focus()
      return
    }

    setBusy(true)
    setInvalid(null)
    setError(null)
    try {
      if (mode === 'create') {
        const outcome = await controller.register(email, password)
        if (outcome.status === 'confirm_email') {
          setConfirmSent(true)
          setBusy(false)
          return
        }
        await onSignedIn(outcome.userId)
        return
      }
      await onSignedIn(await controller.signIn(email, password))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
      setBusy(false)
    }
  }

  if (confirmSent) {
    return (
      <>
        <EntryHeading
          title="Check your email"
          body={`We sent a link to ${email.trim()}. Open it on this phone and you are in.`}
        />
        <EntryNote>
          Nothing arrived? This project still has email confirmation switched on. Whoever set up
          Supabase can turn it off, and then this step disappears.
        </EntryNote>
        <div class="mt-6">
          <EntryQuietButton type="button" onClick={() => setConfirmSent(false)}>
            Use a different email
          </EntryQuietButton>
        </div>
      </>
    )
  }

  return (
    <EntryForm
      onSubmit={submit}
      actions={
        <>
          <EntryButton type="submit" disabled={busy}>
            {busy ? 'Just a moment...' : submitLabel}
          </EntryButton>
          {mode === 'signIn' && onForgot && canEmailRecover && (
            <EntryQuietButton type="button" onClick={onForgot}>
              I have forgotten my password
            </EntryQuietButton>
          )}
          <ProvidersBlock />
        </>
      }
      footer={footer}
    >
      <EntryHeading title={title} body={body} />

      <EntryField
        label="Email"
        error={invalid === 'email' ? error : null}
        hint={mode === 'create' ? 'This is how you get back in on a new phone.' : undefined}
      >
        <EntryInput
          inputRef={emailRef}
          autofocus
          type="email"
          inputmode="email"
          autocomplete="email"
          autocapitalize="none"
          spellcheck={false}
          placeholder="you@example.com"
          value={email}
          onInput={(e) => {
            setEmail((e.target as HTMLInputElement).value)
            if (invalid === 'email') setInvalid(null)
          }}
        />
      </EntryField>

      <EntryField
        label="Password"
        error={invalid === 'password' ? error : null}
        hint={
          mode === 'create'
            ? `At least ${MIN_PASSWORD_LENGTH} characters. Write it somewhere safe.`
            : undefined
        }
      >
        <EntryInput
          inputRef={passwordRef}
          type={shown ? 'text' : 'password'}
          autocomplete={mode === 'create' ? 'new-password' : 'current-password'}
          value={password}
          onInput={(e) => {
            setPassword((e.target as HTMLInputElement).value)
            if (invalid === 'password') setInvalid(null)
          }}
          trailing={<EntryReveal shown={shown} onToggle={() => setShown(!shown)} />}
        />
      </EntryField>

      {error && invalid === null && (
        <p role="alert" class="mt-1 text-sm leading-relaxed text-red-400">
          {error}
        </p>
      )}
    </EntryForm>
  )
}

function ProvidersBlock() {
  const { controller } = useAuth()
  if (controller.options().providers.length === 0) return null

  return (
    <>
      <EntryDivider>or</EntryDivider>
      <ProviderSignIn />
    </>
  )
}
