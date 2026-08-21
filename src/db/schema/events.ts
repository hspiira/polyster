/* Append-only record of who did what. Written by the repository layer, never by
   a screen, so coverage does not depend on remembering at each call site. */
import type { RxJsonSchema } from 'rxdb'
import { idField } from './shared'

export const EVENT_ACTIONS = ['created', 'updated', 'deleted', 'restored'] as const
export type EventAction = (typeof EVENT_ACTIONS)[number]

export interface EventDoc {
  id: string
  shop_id: string
  at: string
  /* Absent for anything the app did on nobody's behalf: a migration, an import,
     a write made before a staff row existed. */
  actor_staff_id?: string
  entity: string
  entity_id: string
  action: EventAction
  /** Only the fields that changed, so the row stays small. */
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  /* What the shop would call it, when "updated" is too thin -- "took payment",
     "refunded deposit", "marked ready". */
  summary?: string
}

export const eventSchema: RxJsonSchema<EventDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idField,
    shop_id: idField,
    at: { type: 'string', format: 'date-time', maxLength: 30 },
    actor_staff_id: idField,
    entity: { type: 'string', maxLength: 40 },
    entity_id: idField,
    action: { type: 'string', enum: [...EVENT_ACTIONS] },
    before: { type: 'object', additionalProperties: true },
    after: { type: 'object', additionalProperties: true },
    summary: { type: 'string' },
  },
  required: ['id', 'shop_id', 'at', 'entity', 'entity_id', 'action'],
  indexes: [['shop_id', 'at'], ['entity', 'entity_id']],
}
