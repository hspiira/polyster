/**
 * Shop-level login (Phase 1 step 1).
 *
 * This is the shop's account, not a staff member's -- one account per shop,
 * signed in once per device and then persisted. Staff identify themselves with
 * a PIN afterwards, on the staff gate.
 */
import { useState } from 'preact/hooks'
import { Button, ErrorNote, Field, Input } from '../components/ui'
import { IconOrders } from '../components/icons'
import type { AuthController } from '../lib/auth'
import { useOnline } from '../hooks/useOnline'

interface LoginProps {
  controller: AuthController
}

export function Login({ controller }: LoginProps) {
  const online = useOnline()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: Event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await controller.signIn(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main class="flex min-h-svh items-center justify-center bg-stone-100 px-4 py-10 dark:bg-stone-950">
      <form onSubmit={onSubmit} class="w-full max-w-sm space-y-6">
        <header class="flex flex-col items-center text-center">
          <span class="flex size-14 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-raised">
            <IconOrders size={26} />
          </span>
          <h1 class="mt-4 text-2xl font-semibold tracking-tight">Tailor &amp; Rental Tracker</h1>
          <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Sign in with your shop account.
          </p>
        </header>

        {!online && (
          <p class="rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
            You appear to be offline. Signing in for the first time on this device needs a
            connection; after that the app opens without one.
          </p>
        )}

        <div class="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              required
              autocomplete="username"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            />
          </Field>

          <Field label="Password">
            <Input
              type="password"
              required
              autocomplete="current-password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            />
          </Field>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" block disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </main>
  )
}
