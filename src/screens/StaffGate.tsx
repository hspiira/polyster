/**
 * Staff picker and PIN gate (Phase 1 step 2).
 *
 * Sits between the shop login and the app. Its job is attribution, not
 * security -- ARCHITECTURE.md D4 and the header of lib/pin.ts. Designed for a
 * shop floor: big targets, a real number pad, and no friction in the common
 * case.
 *
 * The single-staff shop skips it entirely. A solo owner should not tap their
 * own name and type a PIN forty times a day to use their own app.
 */
import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { Avatar, Button, Card, ErrorNote } from '../components/ui'
import { IconBackspace, IconUsers } from '../components/icons'
import { useShop } from '../state/ShopProvider'
import { verifyPin } from '../lib/pin'
import type { StaffDoc } from '../db/schema'

export function StaffGate() {
  const { staff, setActiveStaff, shop } = useShop()
  const [selected, setSelected] = useState<StaffDoc | null>(null)

  // A shop with one active staff member has nothing to pick between, and the
  // PIN would be protecting the owner from themselves.
  useEffect(() => {
    if (staff.length === 1 && staff[0]) setActiveStaff(staff[0])
  }, [staff, setActiveStaff])

  if (staff.length === 0) {
    return (
      <Centred>
        <Card>
          <div class="flex size-11 items-center justify-center rounded-full bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
            <IconUsers size={22} />
          </div>
          <h1 class="mt-3 text-lg font-semibold">No staff yet</h1>
          <p class="mt-1 text-sm text-stone-600 dark:text-stone-300">
            Add at least one person under Settings so their name can be recorded against the work
            they do. If you are the only one, add yourself.
          </p>
          <a href="/settings/staff" class="mt-4 block">
            <Button block>Go to staff settings</Button>
          </a>
        </Card>
      </Centred>
    )
  }

  if (selected) {
    return (
      <Centred>
        <PinEntry
          staff={selected}
          onCancel={() => setSelected(null)}
          onVerified={() => setActiveStaff(selected)}
        />
      </Centred>
    )
  }

  return (
    <Centred>
      <div class="space-y-5">
        <div class="text-center">
          <h1 class="text-xl font-semibold tracking-tight">Who is using the app?</h1>
          <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {shop?.name ? `${shop.name}. ` : ''}Your name is recorded against the orders you take.
          </p>
        </div>

        <ul class="space-y-2">
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
    <main class="flex min-h-svh items-center justify-center bg-stone-100 px-4 py-10 dark:bg-stone-950">
      <div class="w-full max-w-sm">{children}</div>
    </main>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const
const MAX_PIN = 6

function PinEntry({
  staff,
  onCancel,
  onVerified,
}: {
  staff: StaffDoc
  onCancel: () => void
  onVerified: () => void
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function submit(candidate: string) {
    setChecking(true)
    setError(null)
    try {
      if (await verifyPin(candidate, staff.pin_hash)) {
        onVerified()
      } else {
        setError('That PIN is not right.')
        setPin('')
      }
    } finally {
      setChecking(false)
    }
  }

  function press(key: string) {
    if (checking) return
    setError(null)
    if (key === 'del') {
      setPin((current) => current.slice(0, -1))
      return
    }
    if (key === '') return
    setPin((current) => (current.length >= MAX_PIN ? current : current + key))
  }

  return (
    <div class="space-y-6">
      <div class="flex flex-col items-center text-center">
        <Avatar name={staff.name} />
        <h1 class="mt-3 text-xl font-semibold tracking-tight">{staff.name}</h1>
        <p class="mt-0.5 text-sm text-stone-500 dark:text-stone-400">Enter your PIN</p>
      </div>

      <div class="flex justify-center gap-2.5" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: MAX_PIN }, (_, index) => (
          <span
            key={index}
            class={`size-3 rounded-full transition-colors ${
              index < pin.length
                ? 'bg-brand-700 dark:bg-brand-400'
                : 'bg-stone-300 dark:bg-stone-700'
            }`}
          />
        ))}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div class="grid grid-cols-3 gap-2.5">
        {KEYS.map((key, index) => (
          <button
            key={index}
            type="button"
            disabled={key === '' || checking}
            onClick={() => press(key)}
            aria-label={key === 'del' ? 'Delete' : key || undefined}
            class="flex min-h-16 items-center justify-center rounded-card border
                   border-stone-200/80 bg-white text-xl font-medium shadow-card
                   transition-transform active:scale-95 active:bg-stone-100
                   disabled:border-transparent disabled:bg-transparent disabled:shadow-none
                   dark:border-stone-800 dark:bg-stone-900 dark:active:bg-stone-800"
          >
            {key === 'del' ? <IconBackspace size={22} /> : key}
          </button>
        ))}
      </div>

      <div class="flex gap-2">
        <Button variant="secondary" class="flex-1" onClick={onCancel} disabled={checking}>
          Back
        </Button>
        <Button class="flex-1" disabled={pin.length < 4 || checking} onClick={() => void submit(pin)}>
          {checking ? 'Checking...' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
