/**
 * Staff management (Phase 1 step 9).
 *
 * Staff are deactivated, never deleted: `orders.created_by` and
 * `payments.recorded_by` point at these rows, and a departed employee's name
 * still has to render on the orders they took.
 */
import { useMemo, useState } from 'preact/hooks'
import {
  Avatar,
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  InfoNote,
  Input,
  Screen,
  Segmented,
  Sheet,
} from '../../components/ui'
import { IconPlus, IconUsers } from '../../components/icons'
import { EmptyState } from '../../components/ui'
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
    () =>
      db.staff.find({ selector: { shop_id: shop?.id ?? '__none__' }, sort: [{ name: 'asc' }] }).$,
    [db, shop?.id],
    [],
  )
  const staff = useMemo(() => staffDocs.map((doc) => doc.toJSON()), [staffDocs])

  const [adding, setAdding] = useState(false)
  const [resettingId, setResettingId] = useState<string | null>(null)

  if (!shop) {
    return (
      <Screen title="Staff" back="/settings">
        <Card>
          <p class="text-sm text-stone-600 dark:text-stone-300">
            The shop record has not reached this device yet. It arrives with the first sync.
          </p>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen
      title="Staff"
      back="/settings"
      action={
        staff.length > 0 && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <IconPlus size={16} /> Add
          </Button>
        )
      }
    >
      <div class="space-y-4">
        {staff.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              icon={<IconUsers size={26} />}
              title="No one added yet"
              description="Add yourself first, even if you work alone. Your name is what gets recorded against the orders you take."
              action={<Button onClick={() => setAdding(true)}>Add the first person</Button>}
            />
          </Card>
        ) : (
          <Card padded={false}>
            <ul class="divide-y divide-stone-100 dark:divide-stone-800">
              {staff.map((member) => (
                <li key={member.id} class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <Avatar name={member.name} />
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center gap-2">
                        <span class="truncate font-medium">{member.name}</span>
                        {member.role === 'owner' && <Chip tone="info">Owner</Chip>}
                        {!member.active && <Chip>Inactive</Chip>}
                      </span>
                    </span>
                  </div>

                  <div class="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      class="flex-1"
                      onClick={() => setResettingId(resettingId === member.id ? null : member.id)}
                    >
                      Change PIN
                    </Button>
                    <Button
                      variant={member.active ? 'danger' : 'secondary'}
                      size="sm"
                      class="flex-1"
                      onClick={() => void setStaffActive(db, member.id, !member.active)}
                    >
                      {member.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <InfoNote>
          A PIN records who did what. It is not a lock: anyone holding this unlocked device can act
          as anyone whose PIN they know. Deactivating someone keeps their name on past orders.
        </InfoNote>
      </div>

      <AddStaffSheet open={adding} shopId={shop.id} onClose={() => setAdding(false)} />
      <ChangePinSheet staffId={resettingId} onClose={() => setResettingId(null)} />
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

  function reset() {
    setPin('')
    setConfirm('')
  }

  return { pin, setPin, confirm, setConfirm, problem, reset }
}

function AddStaffSheet({
  open,
  shopId,
  onClose,
}: {
  open: boolean
  shopId: string
  onClose: () => void
}) {
  const { db, staff } = useShop()
  const [name, setName] = useState('')
  // The first person added is almost always the owner.
  const [role, setRole] = useState<StaffRole>(staff.length === 0 ? 'owner' : 'staff')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { pin, setPin, confirm, setConfirm, problem, reset } = usePinValidation()

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
      setName('')
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this person.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="Add a person" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Name">
          <Input
            autofocus
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </Field>

        <Field label="Role">
          <Segmented
            value={role}
            options={[
              { value: 'staff' as const, label: 'Staff' },
              { value: 'owner' as const, label: 'Owner' },
            ]}
            onChange={setRole}
            label="Role"
          />
        </Field>

        <PinFields pin={pin} confirm={confirm} onPin={setPin} onConfirm={setConfirm} />

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Add'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function ChangePinSheet({ staffId, onClose }: { staffId: string | null; onClose: () => void }) {
  const { db } = useShop()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { pin, setPin, confirm, setConfirm, problem, reset } = usePinValidation()

  async function submit(event: Event) {
    event.preventDefault()
    if (!staffId) return
    const pinProblem = problem()
    if (pinProblem) {
      setError(pinProblem)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await setStaffPin(db, staffId, pin)
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the PIN.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={staffId !== null} title="Set a new PIN" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <PinFields pin={pin} confirm={confirm} onPin={setPin} onConfirm={setConfirm} />
        {error && <ErrorNote>{error}</ErrorNote>}
        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Set PIN'}
          </Button>
        </div>
      </form>
    </Sheet>
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
    <div class="flex gap-3">
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
