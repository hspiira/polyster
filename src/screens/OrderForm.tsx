/* New and edit in one component, because the fields are identical. The save
   button is pinned: below the fields it is two scrolls from where you type. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { useLocation, useRoute } from 'preact-iso'
import {
  Button,
  Card,
  MEASURE,
  Disclosure,
  cn,
  ErrorNote,
  Field,
  Input,
  Screen,
  Segmented,
  Sheet,
  Textarea,
} from '../ui'
import { IconPlus } from '../components/icons'
import { ClientPicker } from '../components/ClientPicker'
import { OrderTypePicker } from '../components/OrderTypePicker'
import { useCurrentShop } from '../state/ShopProvider'
import { useQuery } from '../hooks/useQuery'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import {
  addOrderUnit,
  createClient,
  createOrder,
  listBy,
  observeActiveMeasurementFields,
  observeClients,
  observeMeasurementProfile,
  observeOrder,
  observeOrderUnits,
  observeRecentOrders,
  observeRetiredMeasurementFields,
  removeOrderUnit,
  saveMeasurements,
  setOrderAdjustment,
  updateOrderHeader,
  updateOrderUnit,
} from '../db/repo'
import { CUSTOMER_TYPES, ORDER_TYPES, type OrderDoc } from '../db/schema'
import { CUSTOMER_TYPE_LABELS } from './orderStage'
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
import { UnitCard } from './orderForm/UnitCard'

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

  const clients = useQuery(() => observeClients(db, shop.id), [db, shop.id], [])

  const orderRow = useQuery(() => (orderId ? observeOrder(db, orderId) : observeOrder(db, '__none__')), [db, orderId], null)

  const existingUnits = useQuery(
    () =>
      orderId
        ? observeOrderUnits(db, orderId)
        : observeOrderUnits(db, '__none__'),
    [db, orderId],
    [],
  )

  const activeFields = useQuery(
    () =>
      observeActiveMeasurementFields(db, shop.id),
    [db, shop.id],
    [],
  )

  const retiredFields = useQuery(() => observeRetiredMeasurementFields(db, shop.id), [db, shop.id], [])

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
    if (!isEdit || loaded || !orderRow || existingUnits.length === 0) return
    const draft = draftFromOrder(orderRow, existingUnits)
    setHeader(draft.header)
    setUnits(draft.units)
    setLoaded(true)
  }, [isEdit, loaded, orderRow, existingUnits])

  // A new order opens on whatever this shop takes most often, so the usual
  // order needs no choice at all.
  const recentOrderRows = useQuery(
    () =>
      observeRecentOrders(db, shop.id, 20),
    [db, shop.id],
    [],
  )

  useEffect(() => {
    if (isEdit || typeTouched.current || recentOrderRows.length === 0) return
    const usual = usualOrderType(recentOrderRows.map((doc) => doc.order_type))
    setHeader((current) => (current.order_type === usual ? current : { ...current, order_type: usual }))
  }, [isEdit, recentOrderRows])

  // The order's own snapshotted currency once one is in scope (editing);
  // otherwise the shop's, since no order exists yet to snapshot from.
  const currency = orderRow?.currency ?? shop.currency

  const clientName = clients.find((client) => client.id === header.client_id)?.name ?? 'this client'

  const clientProfileRow = useQuery(() => observeMeasurementProfile(db, header.client_id || '__none__'), [db, header.client_id], null)
  const clientProfileValues = clientProfileRow?.values ?? null

  /** Task 10 step 2 (O6): ask once per client selection, never on every keystroke. */
  async function selectClient(clientId: string) {
    updateHeader({ client_id: clientId })
    if (isEdit || !clientId || checkedClientRef.current === clientId) return
    checkedClientRef.current = clientId

    const sameDay = (await listBy(db.orders, 'client_id', clientId)).filter(
      (order) =>
        order.pickup_due_date === header.pickup_due_date &&
        !CLOSED_STAGES.includes(order.stage),
    )
    if (sameDay.length > 0) setSameDayMatches(sameDay)
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
          <div class={cn(MEASURE, 'space-y-2')}>
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
