import { describe, expect, it } from 'vitest'
import { createDatabase } from '../dexie/database'
import { pullChanges, type Source } from './pull'
import { compareCursors, cursorOf, isAfterCursor, type Row } from './plan'

/* A bulk write gives many rows one _modified -- a seed, or a migration with
   `default now()`. Does a page boundary inside that group lose the rest? */
describe('the pull cursor at a page boundary', () => {
  it('does not skip rows that share a timestamp with the last of a page', async () => {
    const db = createDatabase(`cursor_${Date.now()}`)
    const SAME = '2026-08-22T10:00:00.000Z'

    // Six clients, all written by one bulk operation, so all share _modified.
    const all: Row[] = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      shop_id: 'shop-1',
      name: `Client ${i}`,
      created_at: SAME,
      updated_at: SAME,
      _modified: SAME,
    }))

    // A server that pages at two rows, the way a real one would.
    const PAGE = 2
    const source: Source = {
      async since(store, cursor) {
        if (store !== 'clients') return []
        return all
          .filter((row) => isAfterCursor(cursorOf(row), cursor))
          .sort((a, b) => compareCursors(cursorOf(a), cursorOf(b)))
          .slice(0, PAGE)
      },
    }

    // Pull repeatedly, the way the app does on a timer.
    for (let run = 0; run < 5; run++) await pullChanges(db, source)

    const stored = (await db.clients.toArray()).map((row) => row.id).sort()
    db.close()
    await db.delete()

    expect(stored).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5'])
  })
})
