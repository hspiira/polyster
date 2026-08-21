import type { PolysterDatabase, Stored } from '../dexie/database'
import type { EventDoc } from '../schema'
import { liveQuery, sortRows, type Observable } from './base'

/* What happened in a shop, most recent first. Read backwards off the compound
   index so the cost is the limit, not the whole history. */
export function observeShopEvents(
  db: PolysterDatabase,
  shopId: string,
  limit = 200,
): Observable<Stored<EventDoc>[]> {
  return liveQuery(() => recentEvents(db, shopId, limit))
}

function recentEvents(
  db: PolysterDatabase,
  shopId: string,
  limit: number,
): Promise<Stored<EventDoc>[]> {
  return db.events
    .where('[shop_id+at]')
    .between([shopId, ''], [shopId, '￿'])
    .reverse()
    .limit(limit)
    .toArray()
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

/* Everything one staff member did, most recent first. Walks backwards and stops
   at the limit rather than reading the shop's whole history to filter it. */
export function observeStaffEvents(
  db: PolysterDatabase,
  shopId: string,
  staffId: string,
  limit = 200,
): Observable<Stored<EventDoc>[]> {
  return liveQuery(async () => {
    const mine: Stored<EventDoc>[] = []
    await db.events
      .where('[shop_id+at]')
      .between([shopId, ''], [shopId, '￿'])
      .reverse()
      .until(() => mine.length >= limit)
      .each((row) => {
        if (row.actor_staff_id === staffId) mine.push(row)
      })
    return mine.slice(0, limit)
  })
}
