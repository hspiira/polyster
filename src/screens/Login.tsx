/**
 * Shop-level login (Phase 1 step 1).
 *
 * The shop's account, not a staff member's -- one per shop, signed in once per
 * device and then persisted. Staff identify themselves with a PIN afterwards,
 * on the staff gate.
 *
 * Reached from the landing screen, and offers a way back to it. That back path
 * matters more than it looks: this is the one screen where someone can be
 * stuck with no way forward if they do not have the shop's credentials to
 * hand.
 */
import { useState } from 'preact/hooks'
import { Button, ErrorNote, Field, Input } from '../components/ui'
import { IconChevronLeft, IconOrders } from '../components/icons'
import type { AuthController } from '../lib/auth'
import { useOnline } from '../hooks/useOnline'

interface LoginProps {
  controller: AuthController
  onBack: () => void
}

export function Login({ controller, onBack }: LoginProps) {
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
    <main class="min-h-svh bg-stone-100 dark:bg-stone-950">
      <div class="mx-auto flex min-h-svh w-full max-w-sm flex-col px-6">
        <div class="safe-top pt-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            class="-ml-2 flex size-10 items-center justify-center rounded-full text-stone-600
                   active:bg-stone-200 dark:text-stone-300 dark:active:bg-stone-800"
          >
            <IconChevronLeft size={22} />
          </button>
        </div>

        <form onSubmit={onSubmit} class="flex flex-1 flex-col justify-center pb-12">
          <header class="mb-8">
            <span class="flex size-12 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-raised">
              <IconOrders size={24} />
            </span>
            <h1 class="mt-5 text-2xl font-semibold tracking-tight">Sign in</h1>
            <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Use the account for your shop, not a personal one.
            </p>
          </header>

          {!online && (
            <p class="mb-5 rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
              You appear to be offline. The first sign-in on a device needs a connection; after
              that the app opens without one.
            </p>
          )}

          <div class="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                required
                autocomplete="username"
                inputmode="email"
                placeholder="shop@example.com"
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

          {error && (
            <div class="mt-4">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}

          <Button type="submit" block class="mt-6" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  )
}
