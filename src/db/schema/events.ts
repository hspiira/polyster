/* Append-only record of who did what. Written by src/db/repo. */
import type { RxJsonSchema } from 'rxdb'
import { idField } from './shared'

export const EVENT_ACTIONS = ['created', 'updated', 'deleted', 'restored'] as const
export type EventAction = (typeof EVENT_ACTIONS)[number]

export interface EventDoc {
  id: string
  shop_id: string
  at: string
  actor_staff_id?: string
  entity: string
  entity_id: string
  action: EventAction
  before?: Record<string, unknown>
  after?: Record<string, unknown>
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
