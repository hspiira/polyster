/**
 * Staff management (Phase 1 step 9): the shop's people, after setup.
 *
 * Staff are deactivated, never deleted: `orders.created_by` and
 * `payments.recorded_by` point at these rows, and a departed employee's name
 * still has to render on the orders they took.
 *
 * Adding someone and changing a PIN both use the same pad as the staff gate,
 * so a person's first encounter with a PIN looks like every later one. A
 * number pad on one screen and a text field on the next is how a small app
 * starts feeling like two.
 */
import { useMemo, useState } from 'preact/hooks'
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Field,
  InfoNote,
  Input,
  Screen,
  Segmented,
  Sheet,
} from '../../components/ui'
import { PinPad } from '../../components/PinPad'
import { IconPlus } from '../../components/icons'
import { IllustrationBook } from '../../components/illustrations'
import { useShop } from '../../state/ShopProvider'
import { useRxQuery } from '../../hooks/useRxQuery'
import { useAuth } from '../../hooks/useAuth'
import { useOnline } from '../../hooks/useOnline'
import { createStaff, setStaffActive, setStaffPin } from '../../db/writes'
import { PIN_LENGTH } from '../../lib/pin'
import type { StaffDoc, StaffRole } from '../../db/schema'

export function StaffSettings() {
  const { db, shop, activeStaff } = useShop()
  const { state: auth } = useAuth()
  const online = useOnline()
  // Inviting someone new only helps once their PIN can reach every device
  // this shop uses -- see ARCHITECTURE.md D14.
  const canInvite = auth.status === 'signed_in' && online

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
  const [resetting, setResetting] = useState<StaffDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const activeCount = staff.filter((member) => member.active).length

  async function toggleActive(member: StaffDoc) {
    // Deactivating the last active person would leave the shop with an empty
    // picker on the next launch, which drops it back into the setup flow.
    if (member.active && activeCount <= 1) {
      setError('At least one person has to stay active, or nobody can use the app.')
      return
    }
    setError(null)
    await setStaffActive(db, member.id, !member.active)
  }

  return (
    <Screen
      title="Staff"
      subtitle={`${activeCount} active`}
      back="/settings"
      action={
        staff.length > 0 && (
          <Button size="sm" onClick={() => setAdding(true)} disabled={!canInvite}>
            <IconPlus size={16} /> Add
          </Button>
        )
      }
    >
      <div class="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {staff.length > 0 && !canInvite && (
          <InfoNote>
            {auth.status === 'local_only'
              ? "Inviting someone new needs a live connection, so their PIN reaches every device this shop uses -- this app is running fully offline."
              : "Inviting someone new needs a live connection, so their PIN reaches every device this shop uses. You're offline right now."}
          </InfoNote>
        )}

        {staff.length === 0 ? (
          <EmptyState
            illustration={<IllustrationBook size={72} />}
            title="No one added yet"
            description="Add yourself first, even if you work alone. Your name is what gets recorded against the orders you take."
            action={<Button onClick={() => setAdding(true)}>Add the first person</Button>}
          />
        ) : (
          <Card padded={false}>
            <ul>
              {staff.map((member) => (
                <li key={member.id} class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <Avatar name={member.name} />
                    <span class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span class="truncate font-medium">{member.name}</span>
                      {member.role === 'owner' && <Chip tone="info">Owner</Chip>}
                      {member.id === activeStaff?.id && <Chip tone="good">You</Chip>}
                      {!member.active && <Chip>Inactive</Chip>}
                    </span>
                  </div>

                  <div class="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      class="flex-1"
                      onClick={() => setResetting(member)}
                    >
                      Change PIN
                    </Button>
                    <Button
                      variant={member.active ? 'danger' : 'secondary'}
                      size="sm"
                      class="flex-1"
                      onClick={() => void toggleActive(member)}
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
      <ChangePinSheet member={resetting} onClose={() => setResetting(null)} />
    </Screen>
  )
}

/**
 * Name and role, then the PIN twice.
 *
 * Twice because a PIN cannot be revealed the way a password field can, and one
 * mistyped digit locks that person out until someone else resets it.
 */
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
  // The first person added to a shop is almost always the owner.
  const [role, setRole] = useState<StaffRole>(staff.length === 0 ? 'owner' : 'staff')
  const [phase, setPhase] = useState<'details' | 'pin' | 'confirm'>('details')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setPhase('details')
    setFirstPin('')
    setError(null)
  }

  function close() {
    reset()
    onClose()
  }

  return (
    <Sheet
      open={open}
      title={phase === 'details' ? 'Add a person' : `PIN for ${name}`}
      onClose={close}
    >
      {phase === 'details' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) {
              setError('A name is needed.')
              return
            }
            setError(null)
            setPhase('pin')
          }}
          class="space-y-4"
        >
          <Field label="Name">
            <Input
              autofocus
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </Field>

          <Field label="Role" hint="Owner is a label for now, not a permission level.">
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

          {error && <ErrorNote>{error}</ErrorNote>}

          <div class="flex gap-2 pt-1">
            <Button variant="secondary" class="flex-1" type="button" onClick={close}>
              Cancel
            </Button>
            <Button class="flex-1" type="submit">
              Choose a PIN
            </Button>
          </div>
        </form>
      ) : (
        <div class="space-y-4 pb-2">
          {error && <ErrorNote>{error}</ErrorNote>}
          <PinPad
            key={phase}
            tone="light"
            hint={
              phase === 'confirm'
                ? 'Type it again to confirm'
                : `Choose ${PIN_LENGTH} digits for ${name}`
            }
            errorHint="Those did not match. Start again."
            busyHint="Saving..."
            onComplete={async (pin) => {
              if (phase === 'pin') {
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
                await createStaff(db, shopId, { name, pin, role })
                close()
                return true
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not add this person.')
                setPhase('pin')
                return false
              }
            }}
          />
        </div>
      )}
    </Sheet>
  )
}

function ChangePinSheet({ member, onClose }: { member: StaffDoc | null; onClose: () => void }) {
  const { db } = useShop()
  const [phase, setPhase] = useState<'pin' | 'confirm'>('pin')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  function close() {
    setPhase('pin')
    setFirstPin('')
    setError(null)
    onClose()
  }

  return (
    <Sheet
      open={member !== null}
      title={member ? `New PIN for ${member.name}` : 'New PIN'}
      onClose={close}
    >
      <div class="space-y-4 pb-2">
        {error && <ErrorNote>{error}</ErrorNote>}
        <PinPad
          key={phase}
          tone="light"
          hint={phase === 'confirm' ? 'Type it again to confirm' : `Choose ${PIN_LENGTH} digits`}
          errorHint="Those did not match. Start again."
          busyHint="Saving..."
          onComplete={async (pin) => {
            if (!member) return false
            if (phase === 'pin') {
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
              await setStaffPin(db, member.id, pin)
              close()
              return true
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not change the PIN.')
              setPhase('pin')
              return false
            }
          }}
        />
      </div>
    </Sheet>
  )
}
