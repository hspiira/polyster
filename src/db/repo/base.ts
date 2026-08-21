/* Read and write helpers every repository shares. Writes go through here so
   that each one lands with its audit event in a single transaction. */
import { liveQuery, type EntityTable, type Observable, type Table } from 'dexie'
import { newId } from '../../lib/ids'
import type { Stored } from '../dexie/database'
import type { EventAction, EventDoc } from '../schema'

export type { Observable }
export { liveQuery }

/** Timestamp every stored row and event is stamped with. */
export function now(): string {
  return new Date().toISOString()
}

/** Drops soft-deleted rows. */
export function alive<T>(rows: Stored<T>[]): Stored<T>[] {
  return rows.filter((row) => !row.deleted_at)
}

/** True when a row is absent or soft-deleted. */
export function gone<T>(row: Stored<T> | undefined): boolean {
  return !row || Boolean(row.deleted_at)
}

/** The row, or null when it is absent or soft-deleted. */
export function present<T>(row: Stored<T> | undefined): Stored<T> | null {
  return gone(row) ? null : (row as Stored<T>)
}

let actorStaffId: string | null = null

/* Who the audit log credits. Set once when a staff member unlocks the device,
   rather than threaded through forty write signatures. */
export function setActor(staffId: string | null): void {
  actorStaffId = staffId
}

export function getActor(): string | null {
  return actorStaffId
}

type Events = EntityTable<Stored<EventDoc>, 'id'>

function eventsOf(table: Table): Events {
  return table.db.table('events') as Events
}

export interface EventInput {
  shop_id: string
  entity: string
  entity_id: string
  action: EventAction
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  summary?: string
}

/** Builds an event row without writing it. */
export function buildEvent(input: EventInput): EventDoc {
  const actor = getActor()
  return {
    id: newId(),
    at: now(),
    ...(actor ? { actor_staff_id: actor } : {}),
    ...input,
  }
}

/** Appends one event. Use the write helpers below in preference to this. */
export async function logEvent(table: Table, input: EventInput): Promise<void> {
  await eventsOf(table).add(buildEvent(input))
}

function asRecord<T>(row: T): Record<string, unknown> {
  return row as unknown as Record<string, unknown>
}

type Rows<T extends { id: string }> = EntityTable<Stored<T>, 'id'>

/* Dexie derives its key and insert types from the row type, which TypeScript
   cannot resolve through a generic. Callers stay exact; only here is it loose. */
function rows<T extends { id: string }>(table: Rows<T>): Table<Stored<T>, string> {
  return table as unknown as Table<Stored<T>, string>
}

/** Inserts a row and records that it was created. */
export async function insertRow<T extends { id: string }>(
  table: Rows<T>,
  row: T,
  shopId: string,
  summary?: string,
): Promise<T> {
  const events = eventsOf(table)
  await table.db.transaction('rw', [table, events], async () => {
    await rows(table).add(row)
    await events.add(
      buildEvent({
        shop_id: shopId,
        entity: table.name,
        entity_id: row.id,
        action: 'created',
        after: asRecord(row),
        ...(summary ? { summary } : {}),
      }),
    )
  })
  return row
}

/* Applies changes to one row and records the before and after. Undefined
   values delete the key, which is how an optional field is cleared. */
export async function patchRow<T extends { id: string }>(
  table: Rows<T>,
  id: string,
  changes: Partial<Stored<T>>,
  options: { shopId?: string; summary?: string; label?: string } = {},
): Promise<Stored<T>> {
  const events = eventsOf(table)
  let updated: Stored<T> | undefined

  await table.db.transaction('rw', [table, events], async () => {
    const before = await rows(table).get(id)
    if (gone(before)) throw missing(options.label ?? table.name)

    const next = prune({ ...(before as Stored<T>), ...changes })
    await rows(table).put(next)
    updated = next

    await events.add(
      buildEvent({
        shop_id: options.shopId ?? shopIdOf(next) ?? '',
        entity: table.name,
        entity_id: id,
        action: 'updated',
        before: asRecord(before),
        after: asRecord(next),
        ...(options.summary ? { summary: options.summary } : {}),
      }),
    )
  })

  return updated as Stored<T>
}

/* Marks a row deleted without removing it, so a device that has not synced
   yet still has something to reconcile against. */
export async function softDeleteRow<T extends { id: string }>(
  table: Rows<T>,
  id: string,
  options: { summary?: string } = {},
): Promise<void> {
  const events = eventsOf(table)

  await table.db.transaction('rw', [table, events], async () => {
    const before = await rows(table).get(id)
    if (gone(before)) return

    const next = { ...(before as Stored<T>), deleted_at: now() }
    await rows(table).put(next)

    await events.add(
      buildEvent({
        shop_id: shopIdOf(next) ?? '',
        entity: table.name,
        entity_id: id,
        action: 'deleted',
        before: asRecord(before),
        ...(options.summary ? { summary: options.summary } : {}),
      }),
    )
  })
}

/** Clears a soft delete. */
export async function restoreRow<T extends { id: string }>(
  table: Rows<T>,
  id: string,
): Promise<void> {
  const events = eventsOf(table)

  await table.db.transaction('rw', [table, events], async () => {
    const before = await rows(table).get(id)
    if (!before?.deleted_at) return

    const { deleted_at: _cleared, ...rest } = before
    const next = rest as Stored<T>
    await rows(table).put(next)

    await events.add(
      buildEvent({
        shop_id: shopIdOf(next) ?? '',
        entity: table.name,
        entity_id: id,
        action: 'restored',
        before: asRecord(before),
        after: asRecord(next),
      }),
    )
  })
}

function shopIdOf(row: unknown): string | undefined {
  const value = (row as { shop_id?: unknown }).shop_id
  return typeof value === 'string' ? value : undefined
}

/** Drops keys set to undefined, which IndexedDB would otherwise store as-is. */
export function prune<T extends object>(row: T): T {
  const out = {} as Record<string, unknown>
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) out[key] = value
  }
  return out as T
}

/** The one wording for a row that is not on this device. */
export function missing(label: string): Error {
  return new Error(`That ${label} no longer exists on this device.`)
}

/** Loads a row or throws the shared not-here error. */
export async function loadOrThrow<T extends { id: string }>(
  table: Rows<T>,
  id: string,
  label: string,
): Promise<Stored<T>> {
  const row = await rows(table).get(id)
  if (gone(row)) throw missing(label)
  return row as Stored<T>
}
