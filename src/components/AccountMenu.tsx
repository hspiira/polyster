/* Who is working, and the two things you can do about it. Separate from the
   settings gear beside it: one is "the app", this one is "me". */
import { useState } from 'preact/hooks'
import { Avatar, Card, RowList, SettingRow, Sheet } from '../ui'
import { IconSignOut, IconUsers } from './icons'
import { useShop } from '../state/ShopProvider'
import { useAuth } from '../hooks/useAuth'
import { isLocked } from '../lib/entryState'

export function AccountMenu({ staffName }: { staffName: string }) {
  const [open, setOpen] = useState(false)
  const { shop, staff, setActiveStaff } = useShop()
  const { controller } = useAuth()

  /* Clearing the active staff only reaches the PIN screen when someone has a
     PIN; otherwise app.tsx re-selects staff[0] and the row does nothing. */
  const canSwitch = isLocked(staff, null)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Working as ${staffName}`}
        class="flex size-11 items-center justify-center rounded-full active:bg-pressed"
      >
        <Avatar name={staffName} size="sm" />
      </button>

      <Sheet open={open} title="Account" onClose={() => setOpen(false)}>
        <Card>
          <div class="flex items-center gap-3">
            <Avatar name={staffName} size="lg" />
            <span class="min-w-0">
              <span class="block truncate font-semibold">{staffName}</span>
              {shop && (
                <span class="block truncate text-sm text-content-muted">{shop.name}</span>
              )}
            </span>
          </div>
        </Card>

        <div class="mt-3">
          <Card padded={false}>
            <RowList>
              {canSwitch && (
                <li>
                  <SettingRow
                    icon={<IconUsers size={20} />}
                    label="Switch staff"
                    onClick={() => {
                      setOpen(false)
                      setActiveStaff(null)
                    }}
                  />
                </li>
              )}
              <li>
                <SettingRow
                  icon={<IconSignOut size={20} />}
                  label="Sign out"
                  tone="danger"
                  onClick={() => {
                    setOpen(false)
                    void controller.signOut()
                  }}
                />
              </li>
            </RowList>
          </Card>
        </div>
      </Sheet>
    </>
  )
}
