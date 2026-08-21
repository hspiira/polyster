import type { RxJsonSchema } from 'rxdb'
import { uuidField } from './shared'
import { ORDER_STAGES, type OrderStage } from './orders'

// ------------------------------------------------------------- message log

export const MESSAGE_CHANNELS = ['whatsapp', 'sms', 'call'] as const
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number]

export const MESSAGE_TEMPLATES = ['stage_update', 'balance_reminder', 'custom'] as const
export type MessageTemplate = (typeof MESSAGE_TEMPLATES)[number]

/* Records intent to send, not delivery: a wa.me link hands off to WhatsApp and
   the app never learns what happened next. */
export interface MessageLogDoc {
  id: string
  client_id: string
  /** Absent when the message is not about an order. */
  order_id?: string
  channel: MessageChannel
  template: MessageTemplate
  /** Recorded alongside the template rather than duplicating the stage enum. */
  order_stage?: OrderStage
  sent_at: string
  sent_by?: string
}
export const messageLogSchema: RxJsonSchema<MessageLogDoc> = {
  version: 1, // v1: order_stage gains repair stages (Phase 9).
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    client_id: uuidField,
    order_id: uuidField,
    channel: { type: 'string', enum: [...MESSAGE_CHANNELS] },
    template: { type: 'string', enum: [...MESSAGE_TEMPLATES] },
    order_stage: { type: 'string', enum: [...ORDER_STAGES] },
    sent_at: { type: 'string', format: 'date-time' },
    sent_by: uuidField,
  },
  required: ['id', 'client_id', 'channel', 'template', 'sent_at'],
  // order_id is optional, and Dexie rejects an index on a non-required field.
  indexes: ['client_id'],
}
