import type { PolysterDatabase, Stored } from '../dexie/database'
import type { EventDoc } from '../schema'
import { liveQuery, sortRows, type Observable } from './base'

/** What happened in a shop, most recent first. */
export function observeShopEvents(
  db: PolysterDatabase,
  shopId: string,
  limit = 200,
): Observable<Stored<EventDoc>[]> {
  return liveQuery(async () => {
    const rows = await db.events
      .where('[shop_id+at]')
      .between([shopId, ''], [shopId, '￿'])
      .toArray()
    return sortRows(rows, { key: 'at', dir: 'desc' }).slice(0, limit)
  })
}

/** Everything ever recorded against one row, oldest first. */
export function observeHistory(
  db: PolysterDatabase,
  entity: string,
  entityId: string,
): Observable<Stored<EventDoc>[]> {
  return liveQuery(async () => {
    const rows = await db.events.where('[entity+entity_id]').equals([entity, entityId]).toArray()
    return sortRows(rows, { key: 'at' })
  })
}

/** Everything one staff member did, most recent first. */
export function observeStaffEvents(
  db: PolysterDatabase,
  shopId: string,
  staffId: string,
  limit = 200,
): Observable<Stored<EventDoc>[]> {
  return liveQuery(async () => {
    const rows = await db.events
      .where('[shop_id+at]')
      .between([shopId, ''], [shopId, '￿'])
      .toArray()
    const mine = rows.filter((row) => row.actor_staff_id === staffId)
    return sortRows(mine, { key: 'at', dir: 'desc' }).slice(0, limit)
  })
}
