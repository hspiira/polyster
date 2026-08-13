/* New and edit in one component, because the fields are identical. The save
   button is pinned: below the fields it is two scrolls from where you type. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useLocation, useRoute } from 'preact-iso'
import {
  Button,
  Card,
  CONTAINER,
  Disclosure,
  cn,
  ErrorNote,
  Field,
  Input,
  Screen,
  Segmented,
  Sheet,
  Textarea,
} from '../components/ui'
import { IconPlus, IconTrash } from '../components/icons'
import { ClientPicker } from '../components/ClientPicker'
import { OrderTypePicker } from '../components/OrderTypePicker'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import {
  addOrderUnit,
  createClient,
  createOrder,
  removeOrderUnit,
  saveMeasurements,
  setOrderAdjustment,
  updateOrderHeader,
  updateOrderUnit,
} from '../db/writes'
import {
  CUSTOMER_TYPES,
  FABRIC_SOURCES,
  ORDER_TYPES,
  type MeasurementFieldDoc,
  type OrderDoc,
} from '../db/schema'
import { CUSTOMER_TYPE_LABELS, FABRIC_SOURCE_LABELS } from './orderStage'
import { formatDate } from '../lib/dates'
import { formatMinor, parseToMinor } from '../lib/money'
import {
  dueDateLabel,
  needsFulfilmentDate,
  needsMeasurements,
  needsReturn,
  usualOrderType,
} from '../lib/orderTypes'
import {
  CLOSED_STAGES,
  blankHeader,
  blankUnit,
  draftFromOrder,
  isInvalid,
  planUnitWrites,
  unitsSubtotalMinor,
  validateOrderForm,
  type AdjustmentType,
  type HeaderDraft,
  type HeaderFieldKey,
  type Invalid,
  type UnitDraft,
  type UnitFieldKey,
} from './orderFormModel'

const ADJUSTMENT_OPTIONS: { value: AdjustmentType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'discount', label: 'Discount' },
  { value: 'charge', label: 'Extra charge' },
]

export function OrderForm() {
  const { params } = useRoute()
  const location = useLocation()
  const { db, shop, activeStaff } = useCurrentShop()
  const flags = useFeatureFlags(db, shop.id)

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
    ...blankHeader(),
    // /orders/new?client=<id> from a client's page, so taking an order for
    // someone you are already looking at does not mean finding them again.
    client_id: new URLSearchParams(location.query as Record<string, string>).get('client') ?? '',
  }))
  const [units, setUnits] = useState<UnitDraft[]>(() => [blankUnit()])
  const [loaded, setLoaded] = useState(!isEdit)
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<Invalid | null>(null)
  const [saving, setSaving] = useState(false)

  // Once the user picks a type themselves, stop second-guessing them.
  const typeTouched = useRef(false)

  // A sheet owns the screen while it is up: the pinned bar would otherwise show
  // through the last few pixels, and stay tappable behind a modal.
  const [sheetOpen, setSheetOpen] = useState(false)

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
    const draft = draftFromOrder(orderDoc.toJSON(), existingUnits)
    setHeader(draft.header)
    setUnits(draft.units)
    setLoaded(true)
  }, [isEdit, loaded, orderDoc, existingUnits])

  // A new order opens on whatever this shop takes most often, so the usual
  // order needs no choice at all.
  const recentOrderDocs = useRxQuery(
    () =>
      db.orders.find({
        selector: { shop_id: shop.id },
        sort: [{ created_at: 'desc' }],
        limit: 20,
      }).$,
    [db, shop.id],
    [],
  )

  useEffect(() => {
    if (isEdit || typeTouched.current || recentOrderDocs.length === 0) return
    const usual = usualOrderType(recentOrderDocs.map((doc) => doc.order_type))
    setHeader((current) => (current.order_type === usual ? current : { ...current, order_type: usual }))
  }, [isEdit, recentOrderDocs])

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


  async function submit(event: Event) {
    event.preventDefault()
    const result = validateOrderForm({ header, units, currency })
    if (isInvalid(result)) {
      setInvalid(result)
      return
    }
    setInvalid(null)

    setSaving(true)
    setError(null)
    try {
      if (orderId) {
        await updateOrderHeader(db, orderId, result.header)

        const plan = planUnitWrites(
          result.units,
          existingUnits.map((unit) => unit.id),
        )
        for (const unit of plan.toAdd) {
          const added = await addOrderUnit(db, orderId, unit)
          setUnits((current) =>
            current.map((draft) => (draft.key === unit.key ? { ...draft, id: added.id } : draft)),
          )
        }
        for (const unit of plan.toUpdate) {
          await updateOrderUnit(db, unit.id!, unit)
        }
        for (const id of plan.toRemoveIds) {
          await removeOrderUnit(db, id)
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
            fabric_source: firstUnit.fabric_source,
            measurements: firstUnit.measurements,
            ...(firstUnit.wearer_name ? { wearer_name: firstUnit.wearer_name } : {}),
          },
          activeStaff?.id,
        )

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

  const isCorporate = header.customer_type === 'corporate'

  const unitsTotalMinor = unitsSubtotalMinor(units, currency)
  const adjustmentMinor =
    header.adjustment_type === 'none'
      ? 0
      : (parseToMinor(header.adjustment_amount, currency) ?? 0) *
        (header.adjustment_type === 'discount' ? -1 : 1)
  const totalMinor = Math.max(0, unitsTotalMinor + adjustmentMinor)

  // A flag turned off after an order was created must not hide that order's own
  // type: it gates new selections only, so the existing value stays visible.
  const visibleOrderTypes = ORDER_TYPES.filter((type) => {
    if (type === 'pre_order') return flags.pre_orders || header.order_type === 'pre_order'
    if (type === 'repair') return flags.repairs || header.order_type === 'repair'
    return true
  })
  const optionsSummary = [
    isCorporate ? header.organisation_name.trim() || 'Corporate' : null,
    header.adjustment_type === 'discount'
      ? 'Discount'
      : header.adjustment_type === 'charge'
        ? 'Extra charge'
        : null,
    header.notes.trim() ? 'Notes' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const visibleCustomerTypes = CUSTOMER_TYPES.filter(
    (type) => type !== 'corporate' || flags.corporate_orders || header.customer_type === 'corporate',
  )

  return (
    <Screen title={isEdit ? 'Edit order' : 'New order'} back={backTo}>
      <form onSubmit={submit}>
        <div class="space-y-5">
          {error && <ErrorNote>{error}</ErrorNote>}

          <OrderTypePicker
            value={header.order_type}
            options={visibleOrderTypes}
            onOpenChange={setSheetOpen}
            onChange={(order_type) => {
              typeTouched.current = true
              updateHeader({ order_type })
            }}
          />

          <ClientPicker
            clients={clients}
            selectedId={header.client_id}
            error={headerErrorFor('client_id')}
            onOpenChange={setSheetOpen}
            onSelect={(id) => void selectClient(id)}
            onCreate={async (name, phone) => {
              const created = await createClient(db, shop.id, {
                name,
                ...(phone.trim() ? { phone: phone.trim() } : {}),
              })
              return created.id
            }}
          />

          <section class="space-y-3">
            <h2 class="px-1 text-[13px] font-semibold">Items</h2>

            {activeFields.length === 0 && (
              <p class="px-1 text-xs text-content-muted">
                No measurement fields set up yet.{' '}
                <a href="/settings/measurements" class="font-medium text-accent">
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
                showMeasurements={needsMeasurements(header.order_type)}
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

          <Card flush>
            <div class="space-y-4">
              <Field label={dueDateLabel(header.order_type)} error={headerErrorFor('pickup_due_date')}>
                <Input
                  type="date"
                  value={header.pickup_due_date}
                  onInput={(e) => updateHeader({ pickup_due_date: (e.target as HTMLInputElement).value })}
                />
              </Field>

              {needsReturn(header.order_type) && (
                <>
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
                  <Field
                    label="Deposit"
                    hint={`Held and refundable, in ${currency}. Optional.`}
                    error={headerErrorFor('deposit_amount')}
                  >
                    <Input
                      inputmode="decimal"
                      placeholder="0"
                      value={header.deposit_amount}
                      onInput={(e) =>
                        updateHeader({ deposit_amount: (e.target as HTMLInputElement).value })
                      }
                    />
                  </Field>
                </>
              )}

              {needsFulfilmentDate(header.order_type) && (
                <Field label="Expected date" hint="When it should be ready, if you know.">
                  <Input
                    type="date"
                    value={header.expected_fulfilment_date}
                    onInput={(e) =>
                      updateHeader({ expected_fulfilment_date: (e.target as HTMLInputElement).value })
                    }
                  />
                </Field>
              )}
            </div>
          </Card>

          <Disclosure
            label="More"
            summary={optionsSummary}
            forceOpen={
              invalid?.scope === 'header' &&
              (invalid.field === 'organisation_name' || invalid.field === 'adjustment_amount')
            }
          >
            {(flags.corporate_orders || isCorporate) && (
              <Field label="Customer">
                <Segmented
                  value={header.customer_type}
                  options={visibleCustomerTypes.map((type) => ({
                    value: type,
                    label: CUSTOMER_TYPE_LABELS[type],
                  }))}
                  onChange={(customer_type) => updateHeader({ customer_type })}
                  label="Customer type"
                />
              </Field>
            )}

            {isCorporate && (
              <>
                <Field label="Company" error={headerErrorFor('organisation_name')}>
                  <Input
                    value={header.organisation_name}
                    placeholder="Company name"
                    onInput={(e) =>
                      updateHeader({ organisation_name: (e.target as HTMLInputElement).value })
                    }
                  />
                </Field>
                <Field label="Purchase order reference" hint="Optional.">
                  <Input
                    value={header.purchase_order_reference}
                    onInput={(e) =>
                      updateHeader({ purchase_order_reference: (e.target as HTMLInputElement).value })
                    }
                  />
                </Field>
                <Field label="Contact person" hint="Optional.">
                  <Input
                    value={header.contact_person}
                    onInput={(e) => updateHeader({ contact_person: (e.target as HTMLInputElement).value })}
                  />
                </Field>
              </>
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
          </Disclosure>
        </div>

        {/* Pinned so the total and the save are reachable without scrolling back
            past every field. `bottom-0` because the tab bar hides itself on this
            route; `lg:left-56` clears the side rail. */}
        <div
          class={cn(
            'fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pt-2.5 lg:left-56',
            'pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
            sheetOpen && 'hidden',
          )}
        >
          <div class={cn(CONTAINER, 'space-y-2')}>
            {/* The one figure you are asked for out loud, kept in view while you type. */}
            <div class="flex items-baseline justify-between px-0.5">
              <span class="text-[13px] text-content-muted">
                {units.length === 1 ? 'Total' : `Total of ${units.length} items`}
                {adjustmentMinor !== 0 && (adjustmentMinor < 0 ? ' after discount' : ' with charge')}
              </span>
              <span class="text-[17px] font-semibold tabular-nums">
                {formatMinor(totalMinor, currency)}
              </span>
            </div>
            <div class="flex gap-2">
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
        </div>
      </form>

      <Sheet
        open={sameDayMatches.length > 0}
        title="Same-day order already open"
        onClose={() => setSameDayMatches([])}
      >
        <p class="text-sm text-content-muted">
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
  showMeasurements,
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
  /** Only where something is made or altered to fit. */
  showMeasurements: boolean
  hasClientProfile: boolean
  errorFor: (field: UnitFieldKey) => string | null
  onChange: (patch: Partial<UnitDraft>) => void
  onRemove: () => void
  onCopyFromClient: () => void
  onSaveToClient: () => void
}) {
  const retiredWithValue = retiredFields.filter((field) => unit.measurements[field.id] !== undefined)
  const filledMeasurements = Object.values(unit.measurements).filter((v) => v.trim()).length
  const detailSummary = [
    unit.wearer_name.trim() || null,
    FABRIC_SOURCE_LABELS[unit.fabric_source],
    filledMeasurements > 0 ? `${filledMeasurements} measured` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card flush>
      <div class="mb-3 flex items-center justify-between gap-2">
        <p class="text-sm font-semibold text-content-muted">Item {index + 1}</p>
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            class="text-danger"
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

        <Field label="Price" hint={`Amount in ${currency}.`} error={errorFor('price')}>
          <Input
            inputmode="decimal"
            placeholder="0"
            value={unit.price}
            onInput={(e) => onChange({ price: (e.target as HTMLInputElement).value })}
          />
        </Field>

        {/* Measurements are the point of a tailored item, so they sit on the card
            rather than behind a disclosure. A rental or a shelf purchase is not
            being made to fit, so it does not ask. */}
        {showMeasurements && (activeFields.length > 0 || retiredWithValue.length > 0) && (
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

        <Disclosure label="Wearer and fabric" summary={detailSummary}>
          <Field label="Wearer" hint="Who this is for, if not the client themselves.">
            <Input
              value={unit.wearer_name}
              placeholder="Optional"
              onInput={(e) => onChange({ wearer_name: (e.target as HTMLInputElement).value })}
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
        </Disclosure>
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
    <div class="space-y-3 border-t border-line pt-4">
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p class="text-sm font-medium text-content">Measurements</p>
        {clientId && (
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            {hasClientProfile && (
              <button
                type="button"
                onClick={onCopyFromClient}
                class="text-xs font-semibold text-accent"
              >
                Copy from {clientName}'s measurements
              </button>
            )}
            <button
              type="button"
              onClick={onSaveToClient}
              class="text-xs font-semibold text-accent"
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
        <p class="text-xs text-content-muted">
          {clientName} has no saved measurements yet -- nothing to copy in.
        </p>
      )}

      {groups.map(([group, groupFields]) => (
        <div key={group || '_ungrouped'} class="space-y-3">
          {group && (
            <p class="text-xs font-semibold tracking-wide text-content-subtle uppercase">
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
