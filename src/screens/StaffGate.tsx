/**
 * Staff picker and PIN gate (Phase 1 step 2).
 *
 * Sits between the shop login and the app. Its job is attribution, not
 * security -- ARCHITECTURE.md D4 and the header of lib/pin.ts.
 *
 * The pad itself lives in components/PinPad.tsx, shared with the places a PIN
 * is chosen, so entering one and setting one never look like different
 * products.
 *
 * A shop with one active staff member skips all of it. A solo owner should not
 * tap their own name and type a PIN forty times a day to use their own app.
 *
 * The empty case is not handled here: a shop with no staff goes to the setup
 * flow, which is reachable. This screen previously offered a link to
 * `/settings/staff`, a route inside the shell that this very screen blocks.
 *
 * Always dark (see Landing.tsx). No back chevron on the PIN step -- swipe back instead.
 */
import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { getInitials } from '../components/ui'
import { GlowBackdrop } from '../components/GlowBackdrop'
import { PinPad } from '../components/PinPad'
import { useSwipeBack } from '../hooks/useSwipeBack'
import { useShop } from '../state/ShopProvider'
import { verifyPin } from '../lib/pin'
import type { StaffDoc } from '../db/schema'

export function StaffGate() {
  const { staff, setActiveStaff, shop } = useShop()
  const [selected, setSelected] = useState<StaffDoc | null>(null)
  const swipeRef = useSwipeBack(selected ? () => setSelected(null) : undefined)

  useEffect(() => {
    if (staff.length === 1 && staff[0]) setActiveStaff(staff[0])
  }, [staff, setActiveStaff])

  if (selected) {
    return (
      <Centred>
        <div ref={swipeRef} class="space-y-7">
          <div class="flex flex-col items-center text-center">
            <span
              class="flex size-14 items-center justify-center rounded-full border border-brand-400/40
                     bg-brand-500/25 text-lg font-semibold text-brand-300"
              aria-hidden="true"
            >
              {getInitials(selected.name)}
            </span>
            <h1 class="mt-3 text-xl font-semibold tracking-tight text-white">{selected.name}</h1>
          </div>

          {/* Verify and sign in together: PinPad resolves false to shake and
              clear, so the success path has to do the sign-in itself. */}
          <PinPad
            tone="dark"
            onComplete={async (pin) => {
              const ok = await verifyPin(pin, selected.pin_hash)
              if (ok) setActiveStaff(selected)
              return ok
            }}
          />
        </div>
      </Centred>
    )
  }

  return (
    <Centred>
      <div class="space-y-6">
        <div class="text-center">
          <h1 class="text-2xl font-semibold tracking-tight text-white">Who is using the app?</h1>
          <p class="mt-1.5 text-sm text-stone-300">
            {shop?.name ? `${shop.name}. ` : ''}Your name is recorded against the orders you take.
          </p>
        </div>

        <ul class="space-y-2.5">
          {staff.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => setSelected(member)}
                class="flex min-h-16 w-full items-center gap-3 rounded-card border border-white/10
                       bg-white/4 px-4 text-left backdrop-blur-md transition-transform
                       active:scale-[0.99] active:bg-white/8"
              >
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-full border
                         border-brand-400/40 bg-brand-500/25 text-sm font-semibold text-brand-300"
                  aria-hidden="true"
                >
                  {getInitials(member.name)}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium text-white">{member.name}</span>
                  {member.role === 'owner' && (
                    <span class="block text-xs text-stone-400">Owner</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Centred>
  )
}

function Centred({ children }: { children: ComponentChildren }) {
  return (
    <main class="relative flex min-h-svh items-center justify-center overflow-hidden bg-stone-950 px-6 py-10">
      <GlowBackdrop />
      <div class="safe-top safe-bottom relative z-10 w-full max-w-76">{children}</div>
    </main>
  )
}
