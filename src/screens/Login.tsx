/**
 * Shop-level login (IMPLEMENTATION_PLAN.md Phase 1 step 1).
 *
 * This is the shop's account, not a staff member's -- one account per shop,
 * signed in once per device and then persisted. Staff identify themselves with
 * a PIN after this, on a screen that does not exist yet (Phase 1 step 2).
 */
import { useState } from 'preact/hooks'
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
    <main class="min-h-svh flex items-center justify-center bg-gray-50 px-4 py-10">
      <form onSubmit={onSubmit} class="w-full max-w-sm space-y-5">
        <header class="space-y-1">
          <h1 class="text-2xl font-semibold text-gray-900">Tailor &amp; Rental Tracker</h1>
          <p class="text-sm text-gray-500">Sign in with your shop account.</p>
        </header>

        {!online && (
          <p class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            You appear to be offline. Signing in for the first time on this device needs a
            connection; after that the app opens without one.
          </p>
        )}

        <div class="space-y-3">
          <label class="block">
            <span class="text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              required
              autocomplete="username"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base
                     focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </label>

          <label class="block">
            <span class="text-sm font-medium text-gray-700">Password</span>
            <input
              type="password"
              required
              autocomplete="current-password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base
                     focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </label>
        </div>

        {error && (
          <p role="alert" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          class="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white
                 disabled:opacity-50"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
