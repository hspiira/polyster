/* Customer lifetime value (§82). Cash accounting, like profit.ts: unpaid orders
   are not value received, so this counts payments, never face value. */
import { signedAmountMinor } from './balances'
import { saleTotalMinor } from './profit'
import type { ClientDoc, OrderDoc, PaymentDoc, SaleDoc } from './schema'

export interface CustomerValue {
  clientId: string
  name: string
  ordersCount: number
  paidMinor: number
  lastPaidAt: string | null
}

export function customerLifetimeValues(
  clients: readonly ClientDoc[],
  orders: readonly OrderDoc[],
  payments: readonly PaymentDoc[],
  sales: readonly SaleDoc[],
): CustomerValue[] {
  const clientIdByOrderId = new Map(orders.map((order) => [order.id, order.client_id]))
  const ordersCountByClient = new Map<string, number>()
  for (const order of orders) {
    ordersCountByClient.set(order.client_id, (ordersCountByClient.get(order.client_id) ?? 0) + 1)
  }

  const paidMinorByClient = new Map<string, number>()
  const lastPaidAtByClient = new Map<string, string>()

  function credit(clientId: string | undefined, amountMinor: number, when: string): void {
    if (!clientId) return
    paidMinorByClient.set(clientId, (paidMinorByClient.get(clientId) ?? 0) + amountMinor)
    const current = lastPaidAtByClient.get(clientId)
    if (!current || when > current) lastPaidAtByClient.set(clientId, when)
  }

  for (const payment of payments) {
    credit(clientIdByOrderId.get(payment.order_id), signedAmountMinor(payment), payment.payment_date)
  }
  for (const sale of sales) {
    credit(sale.client_id, saleTotalMinor(sale), sale.sold_at)
  }

  return clients
    .map((client) => ({
      clientId: client.id,
      name: client.name,
      ordersCount: ordersCountByClient.get(client.id) ?? 0,
      paidMinor: paidMinorByClient.get(client.id) ?? 0,
      lastPaidAt: lastPaidAtByClient.get(client.id) ?? null,
    }))
    .filter((value) => value.ordersCount > 0 || value.paidMinor > 0)
    .sort((a, b) => b.paidMinor - a.paidMinor)
}
