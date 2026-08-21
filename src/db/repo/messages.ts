import type { PolysterDatabase, Stored } from '../dexie/database'
import type { MessageLogDoc, MessageTemplate, OrderStage } from '../schema'
import { newId } from '../../lib/ids'
import { insertRow, loadOrThrow, now, observeBy, type Observable } from './base'

/** What has been sent about one order, most recent first. */
export function observeOrderMessages(
  db: PolysterDatabase,
  orderId: string,
): Observable<Stored<MessageLogDoc>[]> {
  return observeBy(db.message_log, 'order_id', orderId, { key: 'sent_at', dir: 'desc' })
}

/* Intent, not delivery: a wa.me link hands off to WhatsApp and this app never
   learns what happened next. */
export async function logMessage(
  db: PolysterDatabase,
  input: {
    client_id: string
    order_id?: string
    template: MessageTemplate
    order_stage?: OrderStage
  },
  staffId?: string,
): Promise<void> {
  // message_log has no shop of its own; the client it was sent to carries one.
  const client = await loadOrThrow(db.clients, input.client_id, 'client')

  const row: MessageLogDoc = {
    id: newId(),
    client_id: input.client_id,
    channel: 'whatsapp',
    template: input.template,
    sent_at: now(),
    ...(input.order_id ? { order_id: input.order_id } : {}),
    ...(input.order_stage ? { order_stage: input.order_stage } : {}),
    ...(staffId ? { sent_by: staffId } : {}),
  }

  await insertRow(db.message_log, row, client.shop_id, input.template)
}
