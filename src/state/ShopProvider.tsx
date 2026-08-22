/* The shop is the tenant every policy scopes to; the staff member only
   attributes actions. */
import { createContext } from 'preact'
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { PolysterDatabase } from '../db/dexie/database'
import type { ShopDoc, StaffDoc } from '../db/schema'
import { observeActiveStaff, observeShops, setActor } from '../db/repo'
import { useQueryStatus } from '../hooks/useQuery'

const ACTIVE_STAFF_KEY = 'tailor_tracker.active_staff_id'

export interface ShopContextValue {
  db: PolysterDatabase
  /** Null until the shop row exists on this device. */
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

export function ShopProvider({
  db,
  children,
}: {
  db: PolysterDatabase
  children: ComponentChildren
}) {
  const [storedStaffId, setStoredStaffId] = useState<string | null>(readStoredStaffId)

  const shops = useQueryStatus(() => observeShops(db), [db], [])
  const staffRows = useQueryStatus(() => observeActiveStaff(db), [db], [])

  const shop = shops.value[0] ?? null
  const staff = staffRows.value
  const loaded = shops.loaded && staffRows.loaded

  const activeStaff = useMemo(
    () => staff.find((member) => member.id === storedStaffId) ?? null,
    [staff, storedStaffId],
  )

  const setActiveStaff = useCallback((member: StaffDoc | null) => {
    writeStoredStaffId(member?.id ?? null)
    setStoredStaffId(member?.id ?? null)
  }, [])

  // Who the audit log credits, for as long as this person holds the device.
  useEffect(() => {
    setActor(activeStaff?.id ?? null)
  }, [activeStaff])

  const value = useMemo<ShopContextValue>(
    () => ({ db, shop, staff, activeStaff, setActiveStaff, loaded }),
    [db, shop, staff, activeStaff, setActiveStaff, loaded],
  )

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

/* Drops the remembered staff member. A restore replaces the staff rows, so the
   id in this session may no longer exist. */
export function forgetActiveStaff(): void {
  writeStoredStaffId(null)
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
