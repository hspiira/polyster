import type { OrderStage } from './orders'
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
  created_at: string
  updated_at: string
  sent_by?: string
}
