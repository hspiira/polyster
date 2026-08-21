/* Read and write helpers every repository shares. Writes go through here so
   that each one lands with its audit event in a single transaction. */
import { liveQuery, type EntityTable, type Observable, type Table } from 'dexie'
import { newId } from '../../lib/ids'
import type { Stored } from '../dexie/database'
import type { EventAction, EventDoc, OutboxEntry, SyncOperation } from '../schema'
import type { SyncedStore } from '../dexie/stores'

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
type Outbox = EntityTable<OutboxEntry, 'id'>

function eventsOf(table: Table): Events {
  return table.db.table('events') as Events
}

function outboxOf(table: Table): Outbox {
  return table.db.table('sync_outbox') as Outbox
}

/* What this device still owes the server for one row. Keyed store:row_id, so
   repeated edits accumulate fields rather than queueing again. */
async function queueForPush(
  table: Table,
  rowId: string,
  operation: SyncOperation,
  fields: string[],
  updatedAt: string,
): Promise<void> {
  const outbox = outboxOf(table)
  const id = `${table.name}:${rowId}`
  const existing = await outbox.get(id)

  await outbox.put({
    id,
    store: table.name as SyncedStore,
    row_id: rowId,
    /* A row the server has never seen stays 'created' however often it is
       edited: the push sends the whole row either way. A delete outranks both. */
    operation:
      operation === 'deleted' ? 'deleted' : existing?.operation === 'created' ? 'created' : operation,
    fields: [...new Set([...(existing?.fields ?? []), ...fields])],
    updated_at: updatedAt,
    attempts: 0,
  })
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
  const at = now()
  return {
    id: newId(),
    at,
    updated_at: at,
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

/* What changed between two versions of a row, both sides. Soft delete means the
   row itself is never gone, so an event only has to carry the difference. */
export function changedFields<T>(
  before: T,
  after: T,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const from = asRecord(before)
  const to = asRecord(after)
  const changedBefore: Record<string, unknown> = {}
  const changedAfter: Record<string, unknown> = {}

  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (same(from[key], to[key])) continue
    if (key in from) changedBefore[key] = from[key]
    if (key in to) changedAfter[key] = to[key]
  }

  return { before: changedBefore, after: changedAfter }
}

/* True when a diff holds nothing worth recording. A bumped updated_at is a
   write, not a change: the row itself already carries when it was touched. */
export function nothingToRecord(diff: {
  before: Record<string, unknown>
  after: Record<string, unknown>
}): boolean {
  const keys = new Set([...Object.keys(diff.before), ...Object.keys(diff.after)])
  keys.delete('updated_at')
  return keys.size === 0
}

/* Compares by value one level deep, which covers the object-valued columns --
   measurements and permission_overrides -- without a general deep equal. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
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
  const outbox = outboxOf(table)

  await table.db.transaction('rw', [table, events, outbox], async () => {
    await rows(table).add(row)
    await events.add(
      buildEvent({
        shop_id: shopId,
        entity: table.name,
        entity_id: row.id,
        action: 'created',
        ...(summary ? { summary } : {}),
      }),
    )
    await queueForPush(table, row.id, 'created', [], updatedAtOf(row) ?? now())
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
  const outbox = outboxOf(table)
  let updated: Stored<T> | undefined

  await table.db.transaction('rw', [table, events, outbox], async () => {
    const before = await rows(table).get(id)
    if (gone(before)) throw missing(options.label ?? table.name)

    const next = prune({ ...(before as Stored<T>), ...changes })
    await rows(table).put(next)
    updated = next

    const diff = changedFields(before as Stored<T>, next)
    if (nothingToRecord(diff) && !options.summary) return

    await queueForPush(
      table,
      id,
      'updated',
      Object.keys(diff.after),
      updatedAtOf(next) ?? now(),
    )

    await events.add(
      buildEvent({
        shop_id: options.shopId ?? shopIdOf(next) ?? '',
        entity: table.name,
        entity_id: id,
        action: 'updated',
        ...diff,
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
  const outbox = outboxOf(table)

  await table.db.transaction('rw', [table, events, outbox], async () => {
    const before = await rows(table).get(id)
    if (gone(before)) return

    const stamp = now()
    const next = { ...(before as Stored<T>), deleted_at: stamp }
    await rows(table).put(next)
    await queueForPush(table, id, 'deleted', ['deleted_at'], stamp)

    await events.add(
      buildEvent({
        shop_id: shopIdOf(next) ?? '',
        entity: table.name,
        entity_id: id,
        action: 'deleted',
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
  const outbox = outboxOf(table)

  await table.db.transaction('rw', [table, events, outbox], async () => {
    const before = await rows(table).get(id)
    if (!before?.deleted_at) return

    const { deleted_at: _cleared, ...rest } = before
    const next = rest as Stored<T>
    await rows(table).put(next)
    await queueForPush(table, id, 'updated', ['deleted_at'], now())

    await events.add(
      buildEvent({
        shop_id: shopIdOf(next) ?? '',
        entity: table.name,
        entity_id: id,
        action: 'restored',
      }),
    )
  })
}

function updatedAtOf(row: unknown): string | undefined {
  const value = (row as { updated_at?: unknown }).updated_at
  return typeof value === 'string' ? value : undefined
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

export interface Sort<T> {
  key: keyof T & string
  dir?: 'asc' | 'desc'
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === undefined || a === null) return 1
  if (b === undefined || b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

/* Sorts a copy. Absent values go last whichever way round, so a row missing
   the field never leads a list. */
export function sortRows<T>(rows: Stored<T>[], sort?: Sort<T>): Stored<T>[] {
  if (!sort) return rows
  const factor = sort.dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const left = (a as Record<string, unknown>)[sort.key]
    const right = (b as Record<string, unknown>)[sort.key]
    if (left === undefined || left === null) return 1
    if (right === undefined || right === null) return -1
    return factor * compare(left, right)
  })
}

/** Live list of every row in a table. */
export function observeAll<T extends { id: string }>(
  table: Rows<T>,
  sort?: Sort<T>,
): Observable<Stored<T>[]> {
  return liveQuery(async () => sortRows(alive(await rows(table).toArray()), sort))
}

/** Live list of the rows an index points at. */
export function observeBy<T extends { id: string }>(
  table: Rows<T>,
  index: keyof T & string,
  value: string,
  sort?: Sort<T>,
): Observable<Stored<T>[]> {
  return liveQuery(async () => {
    const found = await rows(table).where(index).equals(value).toArray()
    return sortRows(alive(found), sort)
  })
}

/** Live single row by primary key, null while absent or once deleted. */
export function observeRow<T extends { id: string }>(
  table: Rows<T>,
  id: string,
): Observable<Stored<T> | null> {
  return liveQuery(async () => present(await rows(table).get(id)))
}

/** Live first row an index points at. */
export function observeOneBy<T extends { id: string }>(
  table: Rows<T>,
  index: keyof T & string,
  value: string,
): Observable<Stored<T> | null> {
  return liveQuery(async () => {
    const found = await rows(table).where(index).equals(value).toArray()
    return alive(found)[0] ?? null
  })
}

/** The rows an index points at, once. */
export async function listBy<T extends { id: string }>(
  table: Rows<T>,
  index: keyof T & string,
  value: string,
  sort?: Sort<T>,
): Promise<Stored<T>[]> {
  const found = await rows(table).where(index).equals(value).toArray()
  return sortRows(alive(found), sort)
}

/** Every row in a table, once. */
export async function listAll<T extends { id: string }>(
  table: Rows<T>,
  sort?: Sort<T>,
): Promise<Stored<T>[]> {
  return sortRows(alive(await rows(table).toArray()), sort)
}

/** One row by primary key, once. Null when absent or deleted. */
export async function getRow<T extends { id: string }>(
  table: Rows<T>,
  id: string,
): Promise<Stored<T> | null> {
  return present(await rows(table).get(id))
}

/* Retracts a row that cannot be cancelled by a negative one: stamps who voided
   it and why, and soft-deletes it, as one change with one event. */
export async function voidRow<T extends { id: string }>(
  table: Rows<T>,
  id: string,
  input: { reason?: string; staffId?: string } = {},
): Promise<void> {
  const events = eventsOf(table)
  const outbox = outboxOf(table)

  await table.db.transaction('rw', [table, events, outbox], async () => {
    const before = await rows(table).get(id)
    if (gone(before)) return

    const timestamp = now()
    const next = {
      ...(before as Stored<T>),
      voided_at: timestamp,
      deleted_at: timestamp,
      ...(input.staffId ? { voided_by: input.staffId } : {}),
      ...(input.reason?.trim() ? { void_reason: input.reason.trim() } : {}),
    } as Stored<T>
    await rows(table).put(next)
    await queueForPush(table, id, 'deleted', Object.keys(changedFields(before, next).after), timestamp)

    await events.add(
      buildEvent({
        shop_id: shopIdOf(next) ?? '',
        entity: table.name,
        entity_id: id,
        action: 'deleted',
        ...changedFields(before as Stored<T>, next),
        ...(input.reason?.trim() ? { summary: input.reason.trim() } : {}),
      }),
    )
  })
}
