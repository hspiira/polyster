/* Append-only record of who did what. Written by src/db/repo. */

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
  /** Carried for sync uniformity; an event is never edited. */
  updated_at: string
}

