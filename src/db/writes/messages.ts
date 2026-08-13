import type { AppDatabase } from '../database'
import {
  type MessageTemplate,
  type OrderStage,
} from '../schema'
import { newId, now } from './shared'

// ------------------------------------------------------------- message log

/* Intent, not delivery: a wa.me link hands off to WhatsApp and this app never
   learns what happened next. */
export async function logMessage(
  db: AppDatabase,
  input: {
    client_id: string
    order_id?: string
    template: MessageTemplate
    order_stage?: OrderStage
  },
  staffId?: string,
): Promise<void> {
  await db.message_log.insert({
    id: newId(),
    client_id: input.client_id,
    channel: 'whatsapp',
    template: input.template,
    sent_at: now(),
    ...(input.order_id ? { order_id: input.order_id } : {}),
    ...(input.order_stage ? { order_stage: input.order_stage } : {}),
    ...(staffId ? { sent_by: staffId } : {}),
  })
}
