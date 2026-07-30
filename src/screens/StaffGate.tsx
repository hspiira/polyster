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
 */
import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { Avatar } from '../components/ui'
import { PinPad } from '../components/PinPad'
import { IconChevronLeft } from '../components/icons'
import { useShop } from '../state/ShopProvider'
import { verifyPin } from '../lib/pin'
import type { StaffDoc } from '../db/schema'

export function StaffGate() {
  const { staff, setActiveStaff, shop } = useShop()
  const [selected, setSelected] = useState<StaffDoc | null>(null)

  useEffect(() => {
    if (staff.length === 1 && staff[0]) setActiveStaff(staff[0])
  }, [staff, setActiveStaff])

  if (selected) {
    return (
      <Centred>
        <div class="space-y-7">
          <div class="relative flex flex-col items-center text-center">
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Back to the staff list"
              class="absolute -left-2 top-0 flex size-10 items-center justify-center rounded-full
                     text-stone-500 active:bg-stone-200 dark:text-stone-400
                     dark:active:bg-stone-800"
            >
              <IconChevronLeft size={22} />
            </button>
            <Avatar name={selected.name} />
            <h1 class="mt-3 text-xl font-semibold tracking-tight">{selected.name}</h1>
          </div>

          {/* Verify and sign in together: PinPad resolves false to shake and
              clear, so the success path has to do the sign-in itself. */}
          <PinPad
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
          <h1 class="text-2xl font-semibold tracking-tight">Who is using the app?</h1>
          <p class="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
            {shop?.name ? `${shop.name}. ` : ''}Your name is recorded against the orders you take.
          </p>
        </div>

        <ul class="space-y-2.5">
          {staff.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => setSelected(member)}
                class="flex min-h-16 w-full items-center gap-3 rounded-card border
                       border-stone-200/80 bg-white px-4 text-left shadow-card
                       transition-transform active:scale-[0.99] active:bg-stone-50
                       dark:border-stone-800 dark:bg-stone-900 dark:active:bg-stone-800"
              >
                <Avatar name={member.name} />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium">{member.name}</span>
                  {member.role === 'owner' && (
                    <span class="block text-xs text-stone-500 dark:text-stone-400">Owner</span>
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
    <main class="flex min-h-svh items-center justify-center bg-stone-100 px-6 py-10 dark:bg-stone-950">
      <div class="w-full max-w-[19rem]">{children}</div>
    </main>
  )
}

