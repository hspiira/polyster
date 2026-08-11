/**
 * Record a sale: money taken over the counter, now.
 *
 * The direct answer to the pilot shop's "it feels like it is created for the
 * client and not the tailor". Selling a ready-made shirt used to mean creating
 * a client record for a stranger, inventing a pickup date for a garment being
 * carried out of the shop, and then advancing three stages of a transaction
 * that had already finished.
 *
 * So this form asks four things -- what, how many, how much, how paid -- and
 * only the first and third are required. The client field is last, optional,
 * and labelled as optional, because on most counter sales there is nobody to
 * attach.
 *
 * Item comes first because that is the order a tailor thinks in: "two kitenge
 * shirts, forty each". The order form asks for the client first, which is
 * correct there -- an order genuinely belongs to someone who will collect it.
 */
import { useMemo, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  InfoNote,
  Screen,
  Segmented,
  Select,
  Textarea,
} from '../components/ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { recordSale } from '../db/writes'
import { PAYMENT_METHODS, type PaymentMethod } from '../db/schema'
import { PAYMENT_METHOD_LABELS } from './orderStage'
import { formatMinor, parseToMinor } from '../lib/money'

export function SaleForm() {
  const location = useLocation()
  const { db, shop, activeStaff } = useCurrentShop()

  const [item, setItem] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [clientId, setClientId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id }, sort: [{ name: 'asc' }] }).$,
    [db, shop.id],
    [],
  )
  const clients = useMemo(() => clientDocs.map((doc) => doc.toJSON()), [clientDocs])

  // Shown live, so the shop sees the total before committing rather than
  // discovering it on the receipt. Quantity is the common mis-entry.
  const unitMinor = parseToMinor(price, shop.currency)
  const count = Number.parseInt(quantity, 10)
  const totalMinor =
    unitMinor !== null && Number.isInteger(count) && count > 0 ? unitMinor * count : null

  async function submit(event: Event) {
    event.preventDefault()

    if (!item.trim()) {
      setError('Say what was sold, so the report can tell one line from another.')
      return
    }
    if (!Number.isInteger(count) || count < 1) {
      setError('Quantity has to be a whole number, at least one.')
      return
    }
    if (unitMinor === null) {
      setError('Enter the price as a number.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await recordSale(
        db,
        shop,
        {
          item_description: item,
          quantity: count,
          unit_price_minor: unitMinor,
          method,
          ...(clientId ? { client_id: clientId } : {}),
          ...(notes.trim() ? { notes } : {}),
        },
        activeStaff?.id,
      )
      location.route('/sales', true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record this sale.')
      setSaving(false)
    }
  }

  return (
    <Screen title="Record a sale" back="/sales">
      <form onSubmit={submit} class="space-y-4">
        <Card>
          <div class="space-y-4">
            <Field label="What was sold" hint="A shirt, a head wrap, a metre of fabric.">
              <Input
                autofocus
                value={item}
                placeholder="Kitenge shirt"
                onInput={(e) => setItem((e.target as HTMLInputElement).value)}
              />
            </Field>

            <div class="flex gap-3">
              <div class="w-24 shrink-0">
                <Field label="Quantity">
                  <Input
                    inputmode="numeric"
                    value={quantity}
                    onInput={(e) =>
                      setQuantity((e.target as HTMLInputElement).value.replace(/\D/g, ''))
                    }
                  />
                </Field>
              </div>
              <div class="flex-1">
                <Field label="Price each" hint={`Amount in ${shop.currency}.`}>
                  <Input
                    inputmode="decimal"
                    value={price}
                    placeholder="0"
                    onInput={(e) => setPrice((e.target as HTMLInputElement).value)}
                  />
                </Field>
              </div>
            </div>

            {totalMinor !== null && count > 1 && (
              <p class="text-sm text-stone-600 dark:text-stone-300">
                Total{' '}
                <span class="font-semibold tabular-nums">
                  {formatMinor(totalMinor, shop.currency)}
                </span>
              </p>
            )}

            <Field label="Paid by">
              <Segmented
                value={method}
                options={PAYMENT_METHODS.map((value) => ({
                  value,
                  label: PAYMENT_METHOD_LABELS[value],
                }))}
                onChange={setMethod}
                label="Payment method"
              />
            </Field>
          </div>
        </Card>

        <Card>
          <div class="space-y-4">
            <Field
              label="Client (optional)"
              hint="Only if they are a client you already keep records for. A walk-in needs nobody."
            >
              <Select
                value={clientId}
                onChange={(e) => setClientId((e.target as HTMLSelectElement).value)}
              >
                <option value="">No client — walk-in</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Notes (optional)">
              <Textarea
                value={notes}
                onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
              />
            </Field>
          </div>
        </Card>

        {error && <ErrorNote>{error}</ErrorNote>}

        <InfoNote>
          A sale is money already taken. If someone is paying in instalments, or collecting later,
          that is an order rather than a sale.
        </InfoNote>

        <div class="flex gap-2">
          <Button variant="secondary" class="flex-1" type="button" onClick={() => location.route('/sales')}>
            Cancel
          </Button>
          <Button class="flex-2" type="submit" disabled={saving}>
            {saving
              ? 'Saving...'
              : totalMinor !== null
                ? `Record ${formatMinor(totalMinor, shop.currency)}`
                : 'Record sale'}
          </Button>
        </div>
      </form>
    </Screen>
  )
}
