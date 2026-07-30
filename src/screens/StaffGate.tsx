/**
 * Staff picker and PIN gate (Phase 1 step 2).
 *
 * Sits between the shop login and the app. Its job is attribution, not
 * security -- ARCHITECTURE.md D4 and the header of lib/pin.ts. Designed for a
 * shop floor: round keys sized for a thumb, and no tap that the app could have
 * made for you.
 *
 * Three details that make it feel like a phone lock screen rather than a form:
 *
 *  - **It submits itself** on the last digit. `staff.pin_length` is recorded
 *    alongside the hash precisely so the pad knows when you have finished;
 *    where it is unknown (rows predating that column) a confirm button
 *    appears instead of guessing.
 *  - **Delete appears only once there is something to delete.** A permanent
 *    backspace on an empty pad is a key that does nothing.
 *  - **A wrong PIN shakes and clears itself.** No error to dismiss before
 *    trying again, which is the whole interaction on a mistyped digit.
 *
 * The single-staff shop skips all of it. A solo owner should not tap their own
 * name and type a PIN forty times a day to use their own app.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { Avatar, Button, Card } from '../components/ui'
import { IconBackspace, IconChevronLeft, IconUsers } from '../components/icons'
import { useShop } from '../state/ShopProvider'
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH, verifyPin } from '../lib/pin'
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
  const [wrong, setWrong] = useState(false)
  const [checking, setChecking] = useState(false)

  // Unknown for staff rows written before pin_length existed. Those get a
  // confirm button rather than a guess -- see 0002_staff_pin_length.sql.
  const expected = staff.pin_length
  const autoSubmits = typeof expected === 'number'
  const dots = expected ?? MAX_PIN_LENGTH

  // Guards against a second verification firing while the first is still
  // running: PBKDF2 takes a moment, and a fast double-tap on the last digit
  // would otherwise start two.
  const verifying = useRef(false)

  async function attempt(candidate: string) {
    if (verifying.current) return
    verifying.current = true
    setChecking(true)
    try {
      if (await verifyPin(candidate, staff.pin_hash)) {
        onVerified()
      } else {
        setWrong(true)
        setPin('')
        // Long enough for the shake to read as a shake.
        window.setTimeout(() => setWrong(false), 600)
      }
    } finally {
      verifying.current = false
      setChecking(false)
    }
  }

  function press(key: string) {
    if (checking) return
    setWrong(false)

    if (key === 'del') {
      setPin((current) => current.slice(0, -1))
      return
    }

    setPin((current) => {
      if (current.length >= dots) return current
      const next = current + key
      if (autoSubmits && next.length === expected) void attempt(next)
      return next
    })
  }

  const canConfirm = !autoSubmits && pin.length >= MIN_PIN_LENGTH

  return (
    <div class="space-y-7">
      <div class="relative flex flex-col items-center text-center">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back to the staff list"
          disabled={checking}
          class="absolute -left-2 top-0 flex size-10 items-center justify-center rounded-full
                 text-stone-500 active:bg-stone-200 dark:text-stone-400 dark:active:bg-stone-800"
        >
          <IconChevronLeft size={22} />
        </button>

        <Avatar name={staff.name} />
        <h1 class="mt-3 text-xl font-semibold tracking-tight">{staff.name}</h1>
        <p
          class={`mt-0.5 text-sm ${
            wrong ? 'text-red-600 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'
          }`}
          role={wrong ? 'alert' : undefined}
        >
          {wrong ? 'Wrong PIN, try again' : checking ? 'Checking...' : 'Enter your PIN'}
        </p>
      </div>

      <div
        class={`flex justify-center gap-3 ${wrong ? 'animate-shake' : ''}`}
        aria-label={`${pin.length} of ${dots} digits entered`}
      >
        {Array.from({ length: dots }, (_, index) => (
          <span
            key={index}
            class={`size-3.5 rounded-full transition-all duration-150 ${
              wrong
                ? 'bg-red-500'
                : index < pin.length
                  ? 'scale-110 bg-brand-700 dark:bg-brand-400'
                  : 'bg-stone-300 dark:bg-stone-700'
            }`}
          />
        ))}
      </div>

      <div class="grid grid-cols-3 justify-items-center gap-x-5 gap-y-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
          <PadKey key={key} label={key} disabled={checking} onPress={() => press(key)} />
        ))}

        {/* Empty cell keeps 0 centred without the delete key having to exist. */}
        <span />

        <PadKey label="0" disabled={checking} onPress={() => press('0')} />

        {pin.length > 0 ? (
          <PadKey
            label="Delete"
            ghost
            disabled={checking}
            onPress={() => press('del')}
            icon={<IconBackspace size={24} />}
          />
        ) : (
          <span />
        )}
      </div>

      {canConfirm && (
        <Button block disabled={checking} onClick={() => void attempt(pin)}>
          {checking ? 'Checking...' : 'Continue'}
        </Button>
      )}
    </div>
  )
}

function PadKey({
  label,
  icon,
  ghost = false,
  disabled,
  onPress,
}: {
  label: string
  icon?: ComponentChildren
  ghost?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      class={`flex size-[4.5rem] items-center justify-center rounded-full text-2xl font-normal
              transition-transform duration-75 active:scale-90 disabled:opacity-40 ${
                ghost
                  ? 'text-stone-500 active:bg-stone-200 dark:text-stone-400 dark:active:bg-stone-800'
                  : `border border-stone-200/80 bg-white shadow-card active:bg-stone-100
                     dark:border-stone-800 dark:bg-stone-900 dark:active:bg-stone-800`
              }`}
    >
      {icon ?? label}
    </button>
  )
}
