/**
 * The current shop and the staff member currently using the device.
 *
 * These are two different things and it matters. The *shop* is the tenant --
 * one row, authenticated at the Supabase level, and the thing every RLS policy
 * scopes to. The *staff member* is whoever tapped their name on the picker,
 * used only to attribute actions (ARCHITECTURE.md section 4). Losing the staff
 * selection is a minor inconvenience; losing the shop means the app has
 * nothing to show.
 *
 * The shop is read from the replicated `shops` collection rather than from the
 * auth user id. RLS guarantees the account can only ever see its own row, so
 * "the one shop in the local database" and "this account's shop" are the same
 * thing -- and reading it this way also works in local-only development, where
 * there is no Supabase session at all.
 */
import { createContext } from 'preact'
import { useCallback, useContext, useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { AppDatabase } from '../db/database'
import type { ShopDoc, StaffDoc } from '../db/schema'
import { useRxQuery } from '../hooks/useRxQuery'

const ACTIVE_STAFF_KEY = 'tailor_tracker.active_staff_id'

export interface ShopContextValue {
  db: AppDatabase
  /** Null until the first replication pull brings the shop row down. */
  shop: ShopDoc | null
  /** Active staff for this shop, ordered by name. */
  staff: StaffDoc[]
  /** Whoever is currently attributed for actions, or null before the gate. */
  activeStaff: StaffDoc | null
  setActiveStaff(staff: StaffDoc | null): void
}

const ShopContext = createContext<ShopContextValue | null>(null)

/**
 * The staff selection lives in sessionStorage, not localStorage. Closing the
 * app should hand the device back to the picker -- a PIN that outlives the
 * session would make "who marked this ready" meaningless the moment two people
 * share a phone across a shift.
 */
function readStoredStaffId(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_STAFF_KEY)
  } catch {
    return null
  }
}

function writeStoredStaffId(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(ACTIVE_STAFF_KEY, id)
    else sessionStorage.removeItem(ACTIVE_STAFF_KEY)
  } catch {
    // Private browsing. The picker just reappears on reload.
  }
}

export function ShopProvider({ db, children }: { db: AppDatabase; children: ComponentChildren }) {
  const [storedStaffId, setStoredStaffId] = useState<string | null>(readStoredStaffId)

  const shops = useRxQuery(() => db.shops.find().$, [db], [])
  const staffDocs = useRxQuery(
    () => db.staff.find({ selector: { active: true }, sort: [{ name: 'asc' }] }).$,
    [db],
    [],
  )

  const shop = useMemo(() => shops[0]?.toJSON() ?? null, [shops])
  const staff = useMemo(() => staffDocs.map((doc) => doc.toJSON()), [staffDocs])

  const activeStaff = useMemo(
    () => staff.find((member) => member.id === storedStaffId) ?? null,
    [staff, storedStaffId],
  )

  const setActiveStaff = useCallback((member: StaffDoc | null) => {
    writeStoredStaffId(member?.id ?? null)
    setStoredStaffId(member?.id ?? null)
  }, [])

  const value = useMemo<ShopContextValue>(
    () => ({ db, shop, staff, activeStaff, setActiveStaff }),
    [db, shop, staff, activeStaff, setActiveStaff],
  )

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop(): ShopContextValue {
  const value = useContext(ShopContext)
  if (!value) throw new Error('useShop must be used inside a ShopProvider')
  return value
}

/**
 * The shop, asserted non-null. For screens rendered inside the shell, which
 * only mounts once a shop row exists -- saves every one of them repeating the
 * same null check for a state they cannot be in.
 */
export function useCurrentShop(): ShopContextValue & { shop: ShopDoc } {
  const value = useShop()
  if (!value.shop) throw new Error('No shop loaded -- this screen renders inside the shell')
  return value as ShopContextValue & { shop: ShopDoc }
}
