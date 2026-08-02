/**
 * wa.me link building (ARCHITECTURE.md D6).
 *
 * Manual send, not automated: the link opens WhatsApp with the message
 * pre-filled and the shop taps send. No Cloud API token, no backend, and it
 * works from a phone with no special setup. Automation is Phase 3.
 *
 * This is also the one part of the app that deliberately leaves the app.
 */
import { formatMinor } from './money'
import { formatDate } from './dates'
import type { OrderDoc } from '../db/schema'
import type { OrderBalance } from '../db/balances'

/**
 * wa.me wants digits only, with country code and no leading `+` or zero.
 *
 * Returns null rather than guessing when the number cannot be made sense of.
 * A wrong number here does not fail loudly -- it opens a chat with a stranger,
 * which is worse than showing the shop a disabled button.
 */
export function toWaNumber(phone: string | undefined, defaultCountryCode = '256'): string | null {
  if (!phone) return null

  const trimmed = phone.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 7) return null

  // +256700000000 or 256700000000 -- already international.
  if (trimmed.startsWith('+')) return digits

  // 0700000000 -- national format, swap the trunk zero for the country code.
  if (digits.startsWith('0')) return defaultCountryCode + digits.slice(1)

  // Already carries the country code.
  if (digits.startsWith(defaultCountryCode)) return digits

  // Anything else is ambiguous. Say so by returning null.
  return null
}

export function waLink(phone: string | undefined, message: string): string | null {
  const number = toWaNumber(phone)
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

interface MessageContext {
  shopName: string
  clientName: string
  // currency travels with the order (snapshotted at creation) rather than a
  // hardcoded constant, so messages read correctly outside the default shop.
  order: Pick<OrderDoc, 'summary' | 'stage' | 'pickup_due_date' | 'currency'>
  balance: OrderBalance
}

/**
 * The message that fits where the order currently is.
 *
 * Each one is short, names the item, and states one thing to do. Written to be
 * sent as-is: a template the shop has to edit every time is a template they
 * will stop using.
 */
export function suggestedMessage({ shopName, clientName, order, balance }: MessageContext): string {
  const item = order.summary
  const outstanding =
    balance.balance_minor > 0 ? formatMinor(balance.balance_minor, order.currency) : null

  switch (order.stage) {
    case 'ready':
      return outstanding
        ? `Hello ${clientName}, your ${item} is ready for pickup at ${shopName}. ` +
            `There is a balance of ${outstanding} to settle on collection. Thank you.`
        : `Hello ${clientName}, your ${item} is ready for pickup at ${shopName}. ` +
            `It is fully paid. Thank you.`

    case 'picked_up':
      return outstanding
        ? `Hello ${clientName}, thank you for collecting your ${item} from ${shopName}. ` +
            `A balance of ${outstanding} is still outstanding.`
        : `Hello ${clientName}, thank you for your custom at ${shopName}. ` +
            `We hope you are happy with your ${item}.`

    case 'in_progress':
      return (
        `Hello ${clientName}, your ${item} is being worked on at ${shopName} and is due on ` +
        `${formatDate(order.pickup_due_date)}. We will let you know as soon as it is ready.`
      )

    case 'returned':
      return `Hello ${clientName}, we have received the returned ${item}. Thank you from ${shopName}.`

    case 'measured':
      return (
        `Hello ${clientName}, we have your measurements for the ${item} at ${shopName}. ` +
        `It is due on ${formatDate(order.pickup_due_date)}.`
      )

    case 'cancelled':
      return `Hello ${clientName}, your ${item} order at ${shopName} has been cancelled. Please get in touch with any questions.`
  }
}

/** A standalone reminder for an unpaid, overdue order. */
export function balanceReminder({
  shopName,
  clientName,
  order,
  balance,
}: MessageContext): string {
  return (
    `Hello ${clientName}, this is a reminder from ${shopName} about your ${order.summary}. ` +
    `A balance of ${formatMinor(balance.balance_minor, order.currency)} is outstanding. Thank you.`
  )
}
