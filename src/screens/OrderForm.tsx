/**
 * New and edit order form: a header plus a unit editor (Task 10).
 *
 * One component for both, because the fields are identical and keeping two
 * copies in step is a losing game. `/orders/new` creates, `/orders/:id/edit`
 * updates. Editing routes every unit change through the unit operations in
 * db/writes.ts rather than `updateOrder`, which refuses any order with more
 * than one item -- see the save path in `submit` below.
 *
 * The save button is pinned to the bottom rather than sitting at the end of
 * the form: on a phone with the keyboard up, a button below several fields is
 * two scrolls away from wherever you are typing.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useLocation, useRoute } from 'preact-iso'
import {
  Button,
  Card,
  CONTAINER,
  cn,
  ErrorNote,
  Field,
  Input,
  Screen,
  Segmented,
  Select,
  Sheet,
  Textarea,
} from '../components/ui'
import { IconPlus, IconTrash } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import {
  addOrderUnit,
  createOrder,
  removeOrderUnit,
  saveMeasurements,
  setOrderAdjustment,
  updateOrderHeader,
  updateOrderUnit,
  type OrderHeaderInput,
  type OrderUnitInput,
} from '../db/writes'
import {
  FABRIC_SOURCES,
  ORDER_TYPES,
  type FabricSource,
  type MeasurementFieldDoc,
  type OrderDoc,
  type OrderStage,
  type OrderType,
} from '../db/schema'
import { FABRIC_SOURCE_LABELS, ORDER_TYPE_LABELS } from './orderStage'
import { addDays, formatDate, today } from '../lib/dates'
import { fromMinorUnits, parseToMinor } from '../lib/money'

/** A same-day match must still be open -- a finished order is not a candidate. */
const CLOSED_STAGES: readonly OrderStage[] = ['picked_up', 'returned', 'cancelled']

type AdjustmentType = 'none' | 'discount' | 'charge'

const ADJUSTMENT_OPTIONS: { value: AdjustmentType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'discount', label: 'Discount' },
  { value: 'charge', label: 'Extra charge' },
]

interface HeaderDraft {
  client_id: string
  order_type: OrderType
  pickup_due_date: string
  return_due_date: string
  notes: string
  adjustment_type: AdjustmentType
  adjustment_amount: string
  adjustment_reason: string
}

/** One item on the order. `key` is stable across renders; `id` exists once persisted. */
interface UnitDraft {
  key: string
  id?: string
  wearer_name: string
  item_description: string
  price: string
  fabric_source: FabricSource
  measurements: Record<string, string>
}

function blankUnit(): UnitDraft {
  return {
    key: crypto.randomUUID(),
    wearer_name: '',
    item_description: '',
    price: '',
    fabric_source: 'shop',
    measurements: {},
  }
}

const BLANK_HEADER: HeaderDraft = {
  client_id: '',
  order_type: 'tailor_made',
  // A week out is the common case and saves a date-picker interaction on
  // nearly every order.
  pickup_due_date: addDays(today(), 7),
  return_due_date: '',
  notes: '',
  adjustment_type: 'none',
  adjustment_amount: '',
  adjustment_reason: '',
}

type HeaderFieldKey = 'client_id' | 'pickup_due_date' | 'return_due_date' | 'adjustment_amount'
type UnitFieldKey = 'item_description' | 'price'

/**
 * A rejection carries which field it is about, so the message can be shown
 * beside that field rather than in one note at the foot of the form.
 */
type Invalid =
  | { scope: 'header'; field: HeaderFieldKey; message: string }
  | { scope: 'unit'; key: string; field: UnitFieldKey; message: string }

interface ValidatedUnit extends OrderUnitInput {
  key: string
  id?: string
}

interface ValidatedForm {
  header: OrderHeaderInput
  units: ValidatedUnit[]
  adjustmentMinor: number
  adjustmentReason?: string
}

export function OrderForm() {
  const { params } = useRoute()
  const location = useLocation()
  const { db, shop, activeStaff } = useCurrentShop()

  const orderId = params.id
  const isEdit = Boolean(orderId)

  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id }, sort: [{ name: 'asc' }] }).$,
    [db, shop.id],
    [],
  )
  const clients = useMemo(() => clientDocs.map((doc) => doc.toJSON()), [clientDocs])

  const orderDoc = useRxQuery(
    () => (orderId ? db.orders.findOne(orderId).$ : db.orders.findOne('__none__').$),
    [db, orderId],
    null,
  )

  const existingUnitDocs = useRxQuery(
    () =>
      orderId
        ? db.order_units.find({ selector: { order_id: orderId }, sort: [{ position: 'asc' }] }).$
        : db.order_units.find({ selector: { order_id: '__none__' } }).$,
    [db, orderId],
    [],
  )
  const existingUnits = useMemo(() => existingUnitDocs.map((doc) => doc.toJSON()), [existingUnitDocs])

  const activeFieldDocs = useRxQuery(
    () =>
      db.measurement_fields.find({
        selector: { shop_id: shop.id, active: { $ne: false } },
        sort: [{ display_order: 'asc' }],
      }).$,
    [db, shop.id],
    [],
  )
  const activeFields = useMemo(() => activeFieldDocs.map((doc) => doc.toJSON()), [activeFieldDocs])

  const retiredFieldDocs = useRxQuery(
    () => db.measurement_fields.find({ selector: { shop_id: shop.id, active: false } }).$,
    [db, shop.id],
    [],
  )
  const retiredFields = useMemo(() => retiredFieldDocs.map((doc) => doc.toJSON()), [retiredFieldDocs])

  const [header, setHeader] = useState<HeaderDraft>(() => ({
    ...BLANK_HEADER,
    // /orders/new?client=<id> from a client's page, so taking an order for
    // someone you are already looking at does not mean finding them again.
    client_id: new URLSearchParams(location.query as Record<string, string>).get('client') ?? '',
  }))
  const [units, setUnits] = useState<UnitDraft[]>(() => [blankUnit()])
  const [loaded, setLoaded] = useState(!isEdit)
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<Invalid | null>(null)
  const [saving, setSaving] = useState(false)

  const [sameDayMatches, setSameDayMatches] = useState<OrderDoc[]>([])
  // The client a same-day check has already run (and been answered) for --
  // so re-renders and unrelated field edits never reopen the prompt.
  const checkedClientRef = useRef<string | null>(null)

  function updateHeader(patch: Partial<HeaderDraft>) {
    setHeader((current) => ({ ...current, ...patch }))
    if (invalid?.scope === 'header' && invalid.field in patch) setInvalid(null)
  }

  function updateUnit(key: string, patch: Partial<UnitDraft>) {
    setUnits((current) => current.map((unit) => (unit.key === key ? { ...unit, ...patch } : unit)))
    if (invalid?.scope === 'unit' && invalid.key === key && invalid.field in patch) setInvalid(null)
  }

  function addUnit() {
    setUnits((current) => [...current, blankUnit()])
  }

  /** Refuses locally, with the same message removeOrderUnit would throw. */
  function removeUnit(key: string) {
    if (units.length <= 1) {
      setError('An order needs at least one item.')
      return
    }
    setError(null)
    setUnits((current) => current.filter((unit) => unit.key !== key))
  }

  function headerErrorFor(field: HeaderFieldKey): string | null {
    return invalid?.scope === 'header' && invalid.field === field ? invalid.message : null
  }

  function unitErrorFor(key: string, field: UnitFieldKey): string | null {
    return invalid?.scope === 'unit' && invalid.key === key && invalid.field === field
      ? invalid.message
      : null
  }

  useEffect(() => {
    if (!isEdit || loaded || !orderDoc || existingUnits.length === 0) return
    const order = orderDoc.toJSON()
    setHeader({
      client_id: order.client_id,
      order_type: order.order_type,
      pickup_due_date: order.pickup_due_date,
      return_due_date: order.return_due_date ?? '',
      notes: order.notes ?? '',
      adjustment_type:
        order.price_adjustment_minor === 0 ? 'none' : order.price_adjustment_minor < 0 ? 'discount' : 'charge',
      adjustment_amount:
        order.price_adjustment_minor === 0
          ? ''
          : String(fromMinorUnits(Math.abs(order.price_adjustment_minor), order.currency)),
      adjustment_reason: order.adjustment_reason ?? '',
    })
    setUnits(
      existingUnits.map((unit) => ({
        key: unit.id,
        id: unit.id,
        wearer_name: unit.wearer_name ?? '',
        item_description: unit.item_description,
        price: String(fromMinorUnits(unit.price_minor, order.currency)),
        fabric_source: unit.fabric_source,
        measurements: Object.fromEntries(
          Object.entries(unit.measurements).map(([key, value]) => [key, String(value)]),
        ),
      })),
    )
    setLoaded(true)
  }, [isEdit, loaded, orderDoc, existingUnits])

  // The order's own snapshotted currency once one is in scope (editing);
  // otherwise the shop's, since no order exists yet to snapshot from.
  const currency = orderDoc?.toJSON().currency ?? shop.currency

  const clientName = clients.find((client) => client.id === header.client_id)?.name ?? 'this client'

  const clientProfileDoc = useRxQuery(
    () => db.measurement_profiles.findOne({ selector: { client_id: header.client_id || '__none__' } }).$,
    [db, header.client_id],
    null,
  )
  const clientProfileValues = clientProfileDoc?.toJSON().values ?? null

  /** Task 10 step 2 (O6): ask once per client selection, never on every keystroke. */
  async function selectClient(clientId: string) {
    updateHeader({ client_id: clientId })
    if (isEdit || !clientId || checkedClientRef.current === clientId) return
    checkedClientRef.current = clientId

    const openSameDay = await db.orders
      .find({
        selector: {
          client_id: clientId,
          pickup_due_date: header.pickup_due_date,
          stage: { $nin: [...CLOSED_STAGES] },
        },
      })
      .exec()
    if (openSameDay.length > 0) {
      setSameDayMatches(openSameDay.map((doc) => doc.toJSON()))
    }
  }

  function copyFromClientInto(unitKey: string) {
    if (!clientProfileValues) return
    const asStrings = Object.fromEntries(
      Object.entries(clientProfileValues).map(([key, value]) => [key, String(value)]),
    )
    updateUnit(unitKey, { measurements: asStrings })
  }

  async function saveToClientFrom(unitKey: string) {
    const unit = units.find((candidate) => candidate.key === unitKey)
    if (!unit || !header.client_id) return
    setError(null)
    try {
      const values: Record<string, string> = {}
      for (const [key, value] of Object.entries(unit.measurements)) {
        if (value.trim()) values[key] = value.trim()
      }
      await saveMeasurements(db, header.client_id, values, activeStaff?.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save those measurements.')
    }
  }

  function validate(): ValidatedForm | Invalid {
    if (!header.client_id) {
      return { scope: 'header', field: 'client_id', message: 'Choose which client this order is for.' }
    }
    if (!header.pickup_due_date) {
      return { scope: 'header', field: 'pickup_due_date', message: 'A pickup date is needed.' }
    }
    if (header.return_due_date && header.return_due_date < header.pickup_due_date) {
      return {
        scope: 'header',
        field: 'return_due_date',
        message: 'The return date cannot be before the pickup date.',
      }
    }

    let adjustmentMinor = 0
    if (header.adjustment_type !== 'none') {
      const magnitude = parseToMinor(header.adjustment_amount, currency)
      if (magnitude === null || magnitude === 0) {
        return {
          scope: 'header',
          field: 'adjustment_amount',
          message: 'Enter the adjustment as a number greater than zero.',
        }
      }
      adjustmentMinor = header.adjustment_type === 'discount' ? -magnitude : magnitude
    }

    const validatedUnits: ValidatedUnit[] = []
    for (const unit of units) {
      if (!unit.item_description.trim()) {
        return { scope: 'unit', key: unit.key, field: 'item_description', message: 'Describe this item.' }
      }
      const price = parseToMinor(unit.price, currency)
      if (price === null) {
        return { scope: 'unit', key: unit.key, field: 'price', message: 'Enter the price as a number.' }
      }
      validatedUnits.push({
        key: unit.key,
        id: unit.id,
        item_description: unit.item_description,
        price_minor: price,
        fabric_source: unit.fabric_source,
        measurements: unit.measurements,
        ...(unit.wearer_name.trim() ? { wearer_name: unit.wearer_name } : {}),
      })
    }

    return {
      header: {
        client_id: header.client_id,
        order_type: header.order_type,
        pickup_due_date: header.pickup_due_date,
        ...(header.return_due_date ? { return_due_date: header.return_due_date } : {}),
        ...(header.notes.trim() ? { notes: header.notes } : {}),
      },
      units: validatedUnits,
      adjustmentMinor,
      adjustmentReason: header.adjustment_reason.trim() || undefined,
    }
  }

  async function submit(event: Event) {
    event.preventDefault()
    const result = validate()
    if ('scope' in result) {
      setInvalid(result)
      return
    }
    setInvalid(null)

    setSaving(true)
    setError(null)
    try {
      if (orderId) {
        await updateOrderHeader(db, orderId, result.header)

        // Add first, remove last: removeOrderUnit refuses to leave zero
        // units, so the persisted count must never dip below the draft's
        // final length while these writes are in flight.
        for (const unit of result.units) {
          if (unit.id) continue
          await addOrderUnit(db, orderId, unit)
        }
        for (const unit of result.units) {
          if (!unit.id) continue
          await updateOrderUnit(db, unit.id, unit)
        }
        const keptIds = new Set(
          result.units.map((unit) => unit.id).filter((id): id is string => Boolean(id)),
        )
        for (const original of existingUnits) {
          if (!keptIds.has(original.id)) await removeOrderUnit(db, original.id)
        }

        await setOrderAdjustment(db, orderId, result.adjustmentMinor, result.adjustmentReason)
        location.route(`/orders/${orderId}`, true)
      } else {
        const [firstUnit, ...restUnits] = result.units
        if (!firstUnit) throw new Error('An order needs at least one item.')

        const created = await createOrder(
          db,
          shop.id,
          {
            ...result.header,
            item_description: firstUnit.item_description,
            price_total_minor: firstUnit.price_minor,
          },
          activeStaff?.id,
        )

        // createOrder's own unit only knows description and price -- the rest
        // of what this form collects for item 1 has to be patched in after.
        const createdUnits = await db.order_units.find({ selector: { order_id: created.id } }).exec()
        const createdFirstUnit = createdUnits[0]
        if (createdFirstUnit) {
          await updateOrderUnit(db, createdFirstUnit.id, {
            fabric_source: firstUnit.fabric_source,
            measurements: firstUnit.measurements,
            ...(firstUnit.wearer_name ? { wearer_name: firstUnit.wearer_name } : {}),
          })
        }

        for (const unit of restUnits) {
          await addOrderUnit(db, created.id, unit)
        }

        if (result.adjustmentMinor !== 0) {
          await setOrderAdjustment(db, created.id, result.adjustmentMinor, result.adjustmentReason)
        }

        location.route(`/orders/${created.id}`, true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this order.')
      setSaving(false)
    }
  }

  const backTo = orderId ? `/orders/${orderId}` : '/orders'

  if (clients.length === 0) {
    return (
      <Screen title="New order" back="/orders">
        <Card>
          <p class="text-sm text-stone-600 dark:text-stone-300">
            An order belongs to a client, and there are none yet. Add the client first.
          </p>
          <Button linkTo="/clients" block class="mt-3">
            Go to clients
          </Button>
        </Card>
      </Screen>
    )
  }

  const isRental = header.order_type === 'rental'

  return (
    <Screen title={isEdit ? 'Edit order' : 'New order'} back={backTo}>
      <form onSubmit={submit}>
        <div class="space-y-5">
          {error && <ErrorNote>{error}</ErrorNote>}

          <Card>
            <div class="space-y-4">
              <Field label="Client" error={headerErrorFor('client_id')}>
                <Select
                  value={header.client_id}
                  onChange={(e) => void selectClient((e.target as HTMLSelectElement).value)}
                >
                  <option value="">Choose a client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Type">
                <Segmented
                  value={header.order_type}
                  options={ORDER_TYPES.map((type) => ({ value: type, label: ORDER_TYPE_LABELS[type] }))}
                  onChange={(order_type) => updateHeader({ order_type })}
                  label="Order type"
                />
              </Field>

              <Field
                label={isRental ? 'Collection date' : 'Pickup date'}
                error={headerErrorFor('pickup_due_date')}
              >
                <Input
                  type="date"
                  value={header.pickup_due_date}
                  onInput={(e) => updateHeader({ pickup_due_date: (e.target as HTMLInputElement).value })}
                />
              </Field>

              {isRental && (
                <Field
                  label="Return date"
                  hint="When the item is due back."
                  error={headerErrorFor('return_due_date')}
                >
                  <Input
                    type="date"
                    min={header.pickup_due_date}
                    value={header.return_due_date}
                    onInput={(e) =>
                      updateHeader({ return_due_date: (e.target as HTMLInputElement).value })
                    }
                  />
                </Field>
              )}

              <Field label="Adjustment" hint="A haggled discount, a late fee, or a damage charge.">
                <Segmented
                  value={header.adjustment_type}
                  options={ADJUSTMENT_OPTIONS}
                  onChange={(adjustment_type) => updateHeader({ adjustment_type })}
                  label="Adjustment type"
                />
              </Field>

              {header.adjustment_type !== 'none' && (
                <>
                  <Field
                    label="Amount"
                    hint={`Amount in ${currency}.`}
                    error={headerErrorFor('adjustment_amount')}
                  >
                    <Input
                      inputmode="decimal"
                      placeholder="0"
                      value={header.adjustment_amount}
                      onInput={(e) =>
                        updateHeader({ adjustment_amount: (e.target as HTMLInputElement).value })
                      }
                    />
                  </Field>
                  <Field label="Reason">
                    <Input
                      value={header.adjustment_reason}
                      placeholder={header.adjustment_type === 'discount' ? 'Loyal client' : 'Rush job'}
                      onInput={(e) =>
                        updateHeader({ adjustment_reason: (e.target as HTMLInputElement).value })
                      }
                    />
                  </Field>
                </>
              )}

              <Field label="Notes">
                <Textarea
                  value={header.notes}
                  onInput={(e) => updateHeader({ notes: (e.target as HTMLTextAreaElement).value })}
                />
              </Field>
            </div>
          </Card>

          <section class="space-y-4">
            <div class="flex items-center justify-between px-1">
              <h2 class="text-xs font-semibold tracking-wide text-stone-500 dark:text-stone-400">
                Items
              </h2>
            </div>

            {activeFields.length === 0 && (
              <p class="px-1 text-xs text-stone-500 dark:text-stone-400">
                No measurement fields set up yet.{' '}
                <a href="/settings/measurements" class="font-medium text-brand-700 dark:text-brand-400">
                  Set them up
                </a>
                .
              </p>
            )}

            {units.map((unit, index) => (
              <UnitCard
                key={unit.key}
                index={index}
                unit={unit}
                currency={currency}
                canRemove={units.length > 1}
                activeFields={activeFields}
                retiredFields={retiredFields}
                clientId={header.client_id}
                clientName={clientName}
                hasClientProfile={clientProfileValues !== null}
                errorFor={(field) => unitErrorFor(unit.key, field)}
                onChange={(patch) => updateUnit(unit.key, patch)}
                onRemove={() => removeUnit(unit.key)}
                onCopyFromClient={() => copyFromClientInto(unit.key)}
                onSaveToClient={() => void saveToClientFrom(unit.key)}
              />
            ))}

            <Button variant="secondary" type="button" block onClick={addUnit}>
              <IconPlus size={16} /> Add another item
            </Button>
          </section>
        </div>

        {/*
          Pinned to the bottom edge so it is reachable without scrolling back
          past every field.

          `bottom-0`, not `bottom-14`: the tab bar hides itself on this route
          (see TabBar.isFullScreenTask), so there is nothing beneath to clear.
          The old offset was a guess at the bar's height that stopped being
          true, and the tab bar's centre action ended up overlapping the submit
          button.
        */}
        {/* `lg:left-56` clears the side rail. `inset-x-0` alone is measured
            from the viewport, not from the padded page, so on desktop this bar
            ran underneath the rail. */}
        <div
          class="fixed inset-x-0 bottom-0 z-20 bg-white px-4 pt-3 lg:left-56 dark:bg-stone-900
                 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <div class={cn(CONTAINER, 'flex gap-2')}>
            <Button
              variant="secondary"
              class="flex-1"
              type="button"
              onClick={() => location.route(backTo)}
            >
              Cancel
            </Button>
            <Button class="flex-2" type="submit" disabled={saving || (isEdit && !loaded)}>
              {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create order'}
            </Button>
          </div>
        </div>
      </form>

      <Sheet
        open={sameDayMatches.length > 0}
        title="Same-day order already open"
        onClose={() => setSameDayMatches([])}
      >
        <p class="text-sm text-stone-600 dark:text-stone-300">
          {clientName} already has{' '}
          {sameDayMatches.length === 1 ? 'an open order' : `${sameDayMatches.length} open orders`} due{' '}
          {formatDate(header.pickup_due_date)}. Add this item to one of them, or keep this as a separate
          order -- your call.
        </p>
        <div class="mt-4 space-y-2">
          {sameDayMatches.map((match) => (
            <Button
              key={match.id}
              block
              variant="secondary"
              onClick={() => location.route(`/orders/${match.id}/edit`, true)}
            >
              Add to {match.summary} ({match.reference})
            </Button>
          ))}
          <Button block onClick={() => setSameDayMatches([])}>
            Start a separate order
          </Button>
        </div>
      </Sheet>
    </Screen>
  )
}

function UnitCard({
  index,
  unit,
  currency,
  canRemove,
  activeFields,
  retiredFields,
  clientId,
  clientName,
  hasClientProfile,
  errorFor,
  onChange,
  onRemove,
  onCopyFromClient,
  onSaveToClient,
}: {
  index: number
  unit: UnitDraft
  currency: string
  canRemove: boolean
  activeFields: MeasurementFieldDoc[]
  retiredFields: MeasurementFieldDoc[]
  clientId: string
  clientName: string
  hasClientProfile: boolean
  errorFor: (field: UnitFieldKey) => string | null
  onChange: (patch: Partial<UnitDraft>) => void
  onRemove: () => void
  onCopyFromClient: () => void
  onSaveToClient: () => void
}) {
  const retiredWithValue = retiredFields.filter((field) => unit.measurements[field.id] !== undefined)

  return (
    <Card>
      <div class="mb-3 flex items-center justify-between gap-2">
        <p class="text-sm font-semibold text-stone-500 dark:text-stone-400">Item {index + 1}</p>
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            class="text-red-600 dark:text-red-400"
            aria-label={`Remove ${unit.item_description || `item ${index + 1}`}`}
            onClick={onRemove}
          >
            <IconTrash size={18} />
          </Button>
        )}
      </div>

      <div class="space-y-4">
        <Field label="Description" error={errorFor('item_description')}>
          <Input
            value={unit.item_description}
            placeholder="Navy two-piece suit"
            onInput={(e) => onChange({ item_description: (e.target as HTMLInputElement).value })}
          />
        </Field>

        <Field label="Wearer" hint="Who this is for, if not the client themselves.">
          <Input
            value={unit.wearer_name}
            placeholder="Optional"
            onInput={(e) => onChange({ wearer_name: (e.target as HTMLInputElement).value })}
          />
        </Field>

        <Field label="Price" hint={`Amount in ${currency}.`} error={errorFor('price')}>
          <Input
            inputmode="decimal"
            placeholder="0"
            value={unit.price}
            onInput={(e) => onChange({ price: (e.target as HTMLInputElement).value })}
          />
        </Field>

        <Field label="Fabric">
          <Segmented
            value={unit.fabric_source}
            options={FABRIC_SOURCES.map((value) => ({ value, label: FABRIC_SOURCE_LABELS[value] }))}
            onChange={(fabric_source) => onChange({ fabric_source })}
            label="Fabric source"
          />
        </Field>

        {(activeFields.length > 0 || retiredWithValue.length > 0) && (
          <MeasurementsBlock
            fields={activeFields}
            retiredWithValue={retiredWithValue}
            values={unit.measurements}
            clientId={clientId}
            clientName={clientName}
            hasClientProfile={hasClientProfile}
            onChangeField={(fieldId, value) =>
              onChange({ measurements: { ...unit.measurements, [fieldId]: value } })
            }
            onCopyFromClient={onCopyFromClient}
            onSaveToClient={onSaveToClient}
          />
        )}
      </div>
    </Card>
  )
}

function MeasurementsBlock({
  fields,
  retiredWithValue,
  values,
  clientId,
  clientName,
  hasClientProfile,
  onChangeField,
  onCopyFromClient,
  onSaveToClient,
}: {
  fields: MeasurementFieldDoc[]
  retiredWithValue: MeasurementFieldDoc[]
  values: Record<string, string>
  clientId: string
  clientName: string
  hasClientProfile: boolean
  onChangeField: (fieldId: string, value: string) => void
  onCopyFromClient: () => void
  onSaveToClient: () => void
}) {
  // Fields with no group sort first, then each named group -- a display
  // grouping only, never a reordering of the shop's own field order.
  const groups = useMemo(() => {
    const byGroup = new Map<string, MeasurementFieldDoc[]>()
    for (const field of fields) {
      const key = field.group_label ?? ''
      const bucket = byGroup.get(key)
      if (bucket) bucket.push(field)
      else byGroup.set(key, [field])
    }
    return [...byGroup.entries()]
  }, [fields])

  return (
    <div class="space-y-3 border-t border-stone-100 pt-4 dark:border-stone-800">
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p class="text-sm font-medium text-stone-700 dark:text-stone-300">Measurements</p>
        {clientId && (
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            {hasClientProfile && (
              <button
                type="button"
                onClick={onCopyFromClient}
                class="text-xs font-semibold text-brand-700 dark:text-brand-400"
              >
                Copy from {clientName}'s measurements
              </button>
            )}
            <button
              type="button"
              onClick={onSaveToClient}
              class="text-xs font-semibold text-brand-700 dark:text-brand-400"
            >
              Save to {clientName}'s measurements
            </button>
          </div>
        )}
      </div>

      {/* copyMeasurementsFromClient is a no-op with no profile to copy --
          the button must not imply otherwise, so it is hidden rather than
          shown disabled. */}
      {clientId && !hasClientProfile && (
        <p class="text-xs text-stone-500 dark:text-stone-400">
          {clientName} has no saved measurements yet -- nothing to copy in.
        </p>
      )}

      {groups.map(([group, groupFields]) => (
        <div key={group || '_ungrouped'} class="space-y-3">
          {group && (
            <p class="text-xs font-semibold tracking-wide text-stone-400 uppercase dark:text-stone-500">
              {group}
            </p>
          )}
          <div class="grid grid-cols-2 gap-3">
            {groupFields.map((field) => (
              <Field key={field.id} label={field.unit ? `${field.label} (${field.unit})` : field.label}>
                <Input
                  inputmode={field.field_type === 'text' ? undefined : 'decimal'}
                  placeholder="—"
                  value={values[field.id] ?? ''}
                  onInput={(e) => onChangeField(field.id, (e.target as HTMLInputElement).value)}
                />
              </Field>
            ))}
          </div>
        </div>
      ))}

      {retiredWithValue.length > 0 && (
        <div class="grid grid-cols-2 gap-3">
          {retiredWithValue.map((field) => (
            <Field
              key={field.id}
              label={`${field.unit ? `${field.label} (${field.unit})` : field.label} (retired)`}
            >
              <Input value={values[field.id] ?? ''} disabled readOnly />
            </Field>
          ))}
        </div>
      )}
    </div>
  )
}
