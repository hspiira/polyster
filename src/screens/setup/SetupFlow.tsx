/**
 * First-run setup: the shop, and its first person.
 *
 * ## Why this exists
 *
 * Signing in gets you a shop row and nothing else. Before this, a freshly
 * signed-in device landed on the staff gate with no staff, which offered a
 * link to `/settings/staff` -- a route inside the shell that the gate itself
 * blocks. A dead end on the very first screen after sign-in.
 *
 * ## Shape
 *
 * Three steps, and only the first two are required:
 *
 *   1. **The shop** -- name and WhatsApp number. Pre-filled from whatever the
 *      administrator put in the `shops` row, so usually a confirmation.
 *   2. **You** -- name and a six-digit PIN, typed twice on the real pad. This
 *      person is the owner: the first account added to a shop always is.
 *   3. **Measurements** -- the fields this shop actually takes. Skippable,
 *      because a shop can get through a whole first day without it and the
 *      client screen offers the same setup when it is needed.
 *
 * Adding more staff is deliberately *not* here. One person can start working
 * immediately, and Settings already does that job properly. A setup wizard
 * that insists on entering the whole team before anyone can take an order is
 * a wizard people abandon.
 */
import { useState } from 'preact/hooks'
import { Button, Card, ErrorNote, Field, Input, InfoNote } from '../../components/ui'
import { PinPad } from '../../components/PinPad'
import { IconCheck, IconChevronLeft } from '../../components/icons'
import { useShop } from '../../state/ShopProvider'
import { createMeasurementField, createStaff, updateShop } from '../../db/writes'
import { toWaNumber } from '../../lib/whatsapp'
import { PIN_LENGTH } from '../../lib/pin'
import type { ShopDoc, StaffDoc } from '../../db/schema'

const SUGGESTED_FIELDS = [
  { label: 'Chest', unit: 'in' },
  { label: 'Waist', unit: 'in' },
  { label: 'Hip', unit: 'in' },
  { label: 'Shoulder', unit: 'in' },
  { label: 'Sleeve length', unit: 'in' },
  { label: 'Trouser length', unit: 'in' },
  { label: 'Neck', unit: 'in' },
  { label: 'Dress length', unit: 'in' },
] as const

type Step = 'shop' | 'person' | 'measurements'
const STEPS: Step[] = ['shop', 'person', 'measurements']

/**
 * `onDone` matters more than it looks. Creating the first staff member makes
 * the app root's conditions for showing this flow stop being true, so without
 * the caller latching on this callback the wizard unmounts the instant the
 * owner is saved and step 3 never appears. It did exactly that until it was
 * walked end to end.
 */
export function SetupFlow({ onDone }: { onDone: () => void }) {
  const { shop, setActiveStaff } = useShop()
  const [step, setStep] = useState<Step>('shop')
  const [owner, setOwner] = useState<StaffDoc | null>(null)

  if (!shop) return null

  /** Signs the new owner in and hands control back to the app root. */
  function finish() {
    if (owner) setActiveStaff(owner)
    onDone()
  }

  return (
    <main class="min-h-svh bg-stone-100 dark:bg-stone-950">
      <div class="mx-auto flex min-h-svh w-full max-w-sm flex-col px-6">
        <header class="safe-top flex items-center gap-2 pt-3 pb-2">
          {step !== 'shop' ? (
            <button
              type="button"
              aria-label="Back"
              onClick={() => setStep(STEPS[STEPS.indexOf(step) - 1] ?? 'shop')}
              class="-ml-2 flex size-10 items-center justify-center rounded-full text-stone-600
                     active:bg-stone-200 dark:text-stone-300 dark:active:bg-stone-800"
            >
              <IconChevronLeft size={22} />
            </button>
          ) : (
            <span class="size-10" />
          )}
          <Progress current={STEPS.indexOf(step)} total={STEPS.length} />
        </header>

        <div class="flex-1 pb-10">
          {step === 'shop' && <ShopStep shop={shop} onNext={() => setStep('person')} />}
          {step === 'person' && (
            <PersonStep
              onCreated={(created) => {
                setOwner(created)
                setStep('measurements')
              }}
            />
          )}
          {step === 'measurements' && <MeasurementStep shopId={shop.id} onFinish={finish} />}
        </div>
      </div>
    </main>
  )
}

function Progress({ current, total }: { current: number; total: number }) {
  return (
    <div class="flex flex-1 gap-1.5" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          class={`h-1 flex-1 rounded-full transition-colors ${
            index <= current ? 'bg-brand-600' : 'bg-stone-300 dark:bg-stone-700'
          }`}
        />
      ))}
    </div>
  )
}

function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <header class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{body}</p>
    </header>
  )
}

function ShopStep({ shop, onNext }: { shop: ShopDoc; onNext: () => void }) {
  const { db } = useShop()
  const [name, setName] = useState(shop.name)
  const [whatsapp, setWhatsapp] = useState(shop.whatsapp_number ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('The shop needs a name -- it appears in every message you send a client.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateShop(db, shop.id, { name, whatsapp_number: whatsapp })
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const numberLooksWrong = whatsapp.trim().length > 0 && toWaNumber(whatsapp) === null

  return (
    <form onSubmit={submit}>
      <StepHeading
        title="Your shop"
        body="This is the name clients see in the messages you send them. You can change it later in Settings."
      />

      <Card>
        <div class="space-y-4">
          <Field label="Shop name">
            <Input
              autofocus
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </Field>
          <Field
            label="WhatsApp number"
            hint="Your shop's own number. Optional."
            error={numberLooksWrong ? 'This may not be a number WhatsApp recognises.' : null}
          >
            <Input
              type="tel"
              inputmode="tel"
              placeholder="+256 700 000000"
              value={whatsapp}
              onInput={(e) => setWhatsapp((e.target as HTMLInputElement).value)}
            />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      </Card>

      <Button type="submit" block class="mt-5" disabled={saving}>
        {saving ? 'Saving...' : 'Continue'}
      </Button>
    </form>
  )
}

/**
 * Name, then a PIN typed twice on the real pad.
 *
 * Two entries rather than one, because unlike a password field there is no
 * way to reveal what was typed -- and a PIN mistyped once is a person locked
 * out of their own shop until someone with Settings access resets it.
 */
function PersonStep({ onCreated }: { onCreated: (staff: StaffDoc) => void }) {
  const { db, shop } = useShop()
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<'name' | 'pin' | 'confirm'>('name')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (phase === 'name') {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim()) {
            setError('Your name is what gets recorded against the orders you take.')
            return
          }
          setError(null)
          setPhase('pin')
        }}
      >
        <StepHeading
          title="Add yourself"
          body="Every order and payment records who handled it. You are the owner of this shop; you can add the rest of your team later."
        />

        <Card>
          <div class="space-y-4">
            <Field label="Your name">
              <Input
                autofocus
                value={name}
                onInput={(e) => setName((e.target as HTMLInputElement).value)}
              />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
        </Card>

        <Button type="submit" block class="mt-5">
          Continue
        </Button>
      </form>
    )
  }

  const confirming = phase === 'confirm'

  return (
    <div>
      <StepHeading
        title={confirming ? 'Type it again' : 'Choose a PIN'}
        body={
          confirming
            ? 'So a mistyped digit does not lock you out of your own shop.'
            : `${PIN_LENGTH} digits. You tap this to say it is you before taking an order. It is not a password -- anyone holding this phone who knows it can act as you.`
        }
      />

      {error && (
        <div class="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <PinPad
        key={phase}
        hint={confirming ? 'Confirm your PIN' : 'Choose your PIN'}
        errorHint="Those did not match. Start again."
        busyHint="Saving..."
        onComplete={async (pin) => {
          if (!confirming) {
            setFirstPin(pin)
            setPhase('confirm')
            return true
          }

          if (pin !== firstPin) {
            setFirstPin('')
            setPhase('pin')
            setError('Those two PINs did not match. Choose one again.')
            return false
          }

          try {
            const created = await createStaff(db, shop!.id, { name, pin, role: 'owner' })
            // Deliberately not signed in yet -- doing so here unmounts the
            // whole flow before the last step can render. The caller signs
            // them in once setup actually finishes.
            onCreated(created)
            return true
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save.')
            setPhase('pin')
            return false
          }
        }}
      />
    </div>
  )
}

function MeasurementStep({ shopId, onFinish }: { shopId: string; onFinish: () => void }) {
  const { db } = useShop()
  const [chosen, setChosen] = useState<string[]>(['Chest', 'Waist', 'Hip'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(label: string) {
    setChosen((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    )
  }

  async function finish(fields: readonly string[]) {
    setSaving(true)
    setError(null)
    try {
      await Promise.all(
        fields.map((label, index) => {
          const suggestion = SUGGESTED_FIELDS.find((item) => item.label === label)
          return createMeasurementField(db, shopId, {
            label,
            unit: suggestion?.unit,
            display_order: index,
          })
        }),
      )
      onFinish()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save those fields.')
      setSaving(false)
    }
  }

  return (
    <div>
      <StepHeading
        title="What do you measure?"
        body="The client measurement form is built from this list, so only what you pick here gets asked for. Add, remove, or reorder them any time in Settings."
      />

      <Card>
        <div class="flex flex-wrap gap-2">
          {SUGGESTED_FIELDS.map(({ label }) => {
            const active = chosen.includes(label)
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggle(label)}
                aria-pressed={active}
                class={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm
                        font-medium transition-colors ${
                          active
                            ? 'bg-brand-700 text-white dark:bg-brand-600'
                            : 'bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-300/70 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700'
                        }`}
              >
                {active && <IconCheck size={15} />}
                {label}
              </button>
            )
          })}
        </div>
      </Card>

      {error && (
        <div class="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div class="mt-5 space-y-2">
        <Button block disabled={saving || chosen.length === 0} onClick={() => void finish(chosen)}>
          {saving ? 'Setting up...' : `Finish with ${chosen.length} field${chosen.length === 1 ? '' : 's'}`}
        </Button>
        <Button variant="ghost" block disabled={saving} onClick={() => void finish([])}>
          Skip for now
        </Button>
      </div>

      <div class="mt-4">
        <InfoNote>
          Skipping is fine. The client screen offers this same setup the first time you go to
          record someone's measurements.
        </InfoNote>
      </div>
    </div>
  )
}

