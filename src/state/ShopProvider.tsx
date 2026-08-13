/* The shop is the tenant every RLS policy scopes to; the staff member only
   attributes actions. Read from the replicated collection, so local-only works. */
import { createContext } from 'preact'
import { useCallback, useContext, useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { AppDatabase } from '../db/database'
import type { ShopDoc, StaffDoc } from '../db/schema'
import { useRxQueryStatus } from '../hooks/useRxQuery'

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
  /* Whether the queries have emitted. Before that, null means "not read yet",
     and treating it as "nothing here" reopens the first-run wizard. */
  loaded: boolean
}

const ShopContext = createContext<ShopContextValue | null>(null)

/* sessionStorage, not localStorage: closing the app hands the device back to
   the picker, or "who marked this ready" stops meaning anything across a shift. */
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

  const shops = useRxQueryStatus(() => db.shops.find().$, [db], [])
  const staffDocs = useRxQueryStatus(
    () => db.staff.find({ selector: { active: true }, sort: [{ name: 'asc' }] }).$,
    [db],
    [],
  )

  const shop = useMemo(() => shops.value[0]?.toJSON() ?? null, [shops.value])
  const staff = useMemo(() => staffDocs.value.map((doc) => doc.toJSON()), [staffDocs.value])
  const loaded = shops.loaded && staffDocs.loaded

  const activeStaff = useMemo(
    () => staff.find((member) => member.id === storedStaffId) ?? null,
    [staff, storedStaffId],
  )

  const setActiveStaff = useCallback((member: StaffDoc | null) => {
    writeStoredStaffId(member?.id ?? null)
    setStoredStaffId(member?.id ?? null)
  }, [])

  const value = useMemo<ShopContextValue>(
    () => ({ db, shop, staff, activeStaff, setActiveStaff, loaded }),
    [db, shop, staff, activeStaff, setActiveStaff, loaded],
  )

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop(): ShopContextValue {
  const value = useContext(ShopContext)
  if (!value) throw new Error('useShop must be used inside a ShopProvider')
  return value
}

/* The shop, asserted non-null. The shell only mounts once a shop row exists, so
   screens inside it need not repeat a null check for a state they cannot be in. */
export function useCurrentShop(): ShopContextValue & { shop: ShopDoc } {
  const value = useShop()
  if (!value.shop) throw new Error('No shop loaded -- this screen renders inside the shell')
  return value as ShopContextValue & { shop: ShopDoc }
}
