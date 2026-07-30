/**
 * Staff management (Phase 1 step 9).
 *
 * Staff are deactivated, never deleted: `orders.created_by` and
 * `payments.recorded_by` point at these rows, and a departed employee's name
 * still has to render on the orders they took.
 */
import { useMemo, useState } from 'preact/hooks'
import { Button, Card, ErrorNote, Field, Input, Screen, Select } from '../../components/ui'
import { useShop } from '../../state/ShopProvider'
import { useRxQuery } from '../../hooks/useRxQuery'
import { createStaff, setStaffActive, setStaffPin } from '../../db/writes'
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH, assertValidPin } from '../../lib/pin'
import type { StaffRole } from '../../db/schema'

export function StaffSettings() {
  const { db, shop } = useShop()

  // Not filtered to active, unlike the picker -- this is where someone is
  // brought back after being deactivated by mistake.
  const staffDocs = useRxQuery(
    () => db.staff.find({ selector: { shop_id: shop?.id ?? '__none__' }, sort: [{ name: 'asc' }] }).$,
    [db, shop?.id],
    [],
  )
  const staff = useMemo(() => staffDocs.map((doc) => doc.toJSON()), [staffDocs])

  const [adding, setAdding] = useState(false)
  const [resettingId, setResettingId] = useState<string | null>(null)

  if (!shop) {
    return (
      <Screen title="Staff">
        <Card>
          <p class="text-sm text-gray-600">
            The shop record has not reached this device yet. It arrives with the first sync.
          </p>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen
      title="Staff"
      action={
        !adding && (
          <Button class="px-3" onClick={() => setAdding(true)}>
            Add
          </Button>
        )
      }
    >
      <div class="space-y-4">
        {adding && <AddStaffForm shopId={shop.id} onDone={() => setAdding(false)} />}

        {staff.length === 0 && !adding && (
          <Card>
            <p class="text-sm text-gray-600">
              No one has been added yet. Add yourself first, even if you work alone -- your name is
              what gets recorded against the orders you take.
            </p>
            <Button class="mt-3 w-full" onClick={() => setAdding(true)}>
              Add the first person
            </Button>
          </Card>
        )}

        {staff.length > 0 && (
          <Card class="!p-0">
            <ul class="divide-y divide-gray-100 px-3">
              {staff.map((member) => (
                <li key={member.id} class="space-y-2 py-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="min-w-0">
                      <span class="block truncate font-medium text-gray-900">
                        {member.name}
                        {!member.active && <span class="text-gray-400"> (inactive)</span>}
                      </span>
                      <span class="block text-xs text-gray-500">
                        {member.role === 'owner' ? 'Owner' : 'Staff'}
                      </span>
                    </span>
                    <span class="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        class="px-2 text-xs"
                        onClick={() => setResettingId(resettingId === member.id ? null : member.id)}
                      >
                        {resettingId === member.id ? 'Cancel' : 'Change PIN'}
                      </Button>
                      <Button
                        variant="ghost"
                        class="px-2 text-xs"
                        onClick={() => void setStaffActive(db, member.id, !member.active)}
                      >
                        {member.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </span>
                  </div>

                  {resettingId === member.id && (
                    <ChangePinForm staffId={member.id} onDone={() => setResettingId(null)} />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <p class="text-xs text-gray-500">
          A PIN records who did what. It is not a lock: anyone holding this unlocked device can
          act as anyone whose PIN they know. Deactivating someone keeps their name on past orders.
        </p>
      </div>
    </Screen>
  )
}

function usePinValidation() {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')

  function problem(): string | null {
    try {
      assertValidPin(pin)
    } catch {
      return `A PIN must be ${MIN_PIN_LENGTH} to ${MAX_PIN_LENGTH} digits.`
    }
    if (pin !== confirm) return 'The two PINs do not match.'
    return null
  }

  return { pin, setPin, confirm, setConfirm, problem }
}

function AddStaffForm({ shopId, onDone }: { shopId: string; onDone: () => void }) {
  const { db, staff } = useShop()
  const [name, setName] = useState('')
  // The first person added is almost always the owner.
  const [role, setRole] = useState<StaffRole>(staff.length === 0 ? 'owner' : 'staff')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { pin, setPin, confirm, setConfirm, problem } = usePinValidation()

  async function submit(event: Event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('A name is needed.')
      return
    }
    const pinProblem = problem()
    if (pinProblem) {
      setError(pinProblem)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createStaff(db, shopId, { name, pin, role })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this person.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <form onSubmit={submit} class="space-y-3">
        <h2 class="font-medium text-gray-900">Add a person</h2>

        <Field label="Name">
          <Input autofocus value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </Field>

        <Field label="Role">
          <Select
            value={role}
            onChange={(e) => setRole((e.target as HTMLSelectElement).value as StaffRole)}
          >
            <option value="staff">Staff</option>
            <option value="owner">Owner</option>
          </Select>
        </Field>

        <PinFields
          pin={pin}
          confirm={confirm}
          onPin={setPin}
          onConfirm={setConfirm}
        />

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2">
          <Button variant="secondary" class="flex-1" type="button" onClick={onDone}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Add'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function ChangePinForm({ staffId, onDone }: { staffId: string; onDone: () => void }) {
  const { db } = useShop()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { pin, setPin, confirm, setConfirm, problem } = usePinValidation()

  async function submit(event: Event) {
    event.preventDefault()
    const pinProblem = problem()
    if (pinProblem) {
      setError(pinProblem)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await setStaffPin(db, staffId, pin)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the PIN.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} class="space-y-3 rounded-lg bg-gray-50 p-3">
      <PinFields pin={pin} confirm={confirm} onPin={setPin} onConfirm={setConfirm} />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" class="w-full" disabled={saving}>
        {saving ? 'Saving...' : 'Set new PIN'}
      </Button>
    </form>
  )
}

function PinFields({
  pin,
  confirm,
  onPin,
  onConfirm,
}: {
  pin: string
  confirm: string
  onPin: (value: string) => void
  onConfirm: (value: string) => void
}) {
  // inputmode numeric rather than type="number": a PIN is a string of digits,
  // not a quantity, and a number input strips leading zeros.
  const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, MAX_PIN_LENGTH)

  return (
    <div class="flex gap-2">
      <div class="flex-1">
        <Field label="PIN" hint={`${MIN_PIN_LENGTH}-${MAX_PIN_LENGTH} digits`}>
          <Input
            inputmode="numeric"
            autocomplete="off"
            value={pin}
            onInput={(e) => onPin(digitsOnly((e.target as HTMLInputElement).value))}
          />
        </Field>
      </div>
      <div class="flex-1">
        <Field label="Confirm">
          <Input
            inputmode="numeric"
            autocomplete="off"
            value={confirm}
            onInput={(e) => onConfirm(digitsOnly((e.target as HTMLInputElement).value))}
          />
        </Field>
      </div>
    </div>
  )
}
