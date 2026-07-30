/**
 * The lock screen.
 *
 * One person, one pad. No list of names: showing them invites signing in as
 * someone else, and they are exactly the people attribution protects (spec E4).
 *
 * No back affordance -- there is nothing behind this screen.
 */
import { useRef, useState } from 'preact/hooks'
import { PinPad } from '../../components/PinPad'
import { getInitials } from '../../components/ui'
import { useShop } from '../../state/ShopProvider'
import { verifyPin } from '../../lib/pin'
import { backoffMs } from '../../lib/lockPolicy'
import { PinRecovery } from './PinRecovery'
import { EntryCentred, EntryQuietButton, EntryScreen } from './parts'
import type { AuthState } from '../../lib/auth'

export function LockScreen({ authStatus }: { authStatus: AuthState['status'] }) {
  const { staff, shop, setActiveStaff } = useShop()
  const failures = useRef(0)
  const [recovering, setRecovering] = useState(false)

  // One device, one person (spec consequence 1), so this is the only candidate.
  const person = staff[0]
  if (!person) return null

  if (recovering) {
    return <PinRecovery person={person} onCancel={() => setRecovering(false)} />
  }

  return (
    <EntryScreen>
      <EntryCentred>
        <div class="flex flex-col items-center text-center">
          <span
            class="flex size-14 items-center justify-center rounded-full border border-brand-400/40
                   bg-brand-500/25 text-lg font-semibold text-brand-300"
            aria-hidden="true"
          >
            {getInitials(person.name)}
          </span>
          <h1 class="mt-3 text-xl font-semibold tracking-tight text-white">{person.name}</h1>
          {shop?.name && <p class="mt-0.5 text-sm text-stone-400">{shop.name}</p>}
        </div>

        <div class="mt-7">
          <PinPad
            onComplete={async (pin) => {
              // A delay with a ceiling, never a lockout -- see lib/lockPolicy.ts.
              const delay = backoffMs(failures.current)
              if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))

              const ok = await verifyPin(pin, person.pin_hash)
              failures.current = ok ? 0 : failures.current + 1
              if (ok) setActiveStaff(person)
              return ok
            }}
          />
        </div>

        <div class="mt-7">
          <EntryQuietButton onClick={() => setRecovering(true)}>
            Forgotten your PIN?
          </EntryQuietButton>
        </div>

        {authStatus === 'offline_stale' && (
          <p class="mt-6 rounded-card border border-amber-500/30 bg-amber-500/12 px-4 py-3 text-xs leading-relaxed text-amber-300">
            Working offline -- sync is paused. Everything you record is saved here and sends when
            you are back on.
          </p>
        )}
      </EntryCentred>
    </EntryScreen>
  )
}
