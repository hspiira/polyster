import { useMemo } from 'preact/hooks'
import { Card, SectionTitle, cn } from '../../components/ui'
import { IconCheck } from '../../components/icons'
import { useCurrentShop } from '../../state/ShopProvider'
import { useRxQuery } from '../../hooks/useRxQuery'
import { setUnitDone } from '../../db/writes'
import { formatMinor } from '../../lib/money'

/** The unit list, with a per-unit done tick (Task 10). */
export function ItemsSection({
  orderId,
  currency,
  onError,
}: {
  orderId: string
  currency: string
  onError: (message: string | null) => void
}) {
  const { db } = useCurrentShop()
  const unitDocs = useRxQuery(
    () => db.order_units.find({ selector: { order_id: orderId }, sort: [{ position: 'asc' }] }).$,
    [db, orderId],
    [],
  )
  const units = useMemo(() => unitDocs.map((doc) => doc.toJSON()), [unitDocs])

  if (units.length === 0) return null

  async function toggle(unitId: string, done: boolean): Promise<void> {
    onError(null)
    try {
      await setUnitDone(db, unitId, done)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not update that item.')
    }
  }

  return (
    <section>
      <SectionTitle>Items</SectionTitle>
      <Card padded={false}>
        <ul>
          {units.map((unit) => (
            <li key={unit.id} class="flex items-center gap-3 px-4 py-3.5">
              <button
                type="button"
                aria-pressed={unit.done}
                aria-label={unit.done ? `Mark ${unit.item_description} not done` : `Mark ${unit.item_description} done`}
                onClick={() => void toggle(unit.id, !unit.done)}
                class={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full transition-colors',
                  unit.done
                    ? 'bg-accent text-accent-content'
                    : 'bg-neutral-soft text-transparent',
                )}
              >
                <IconCheck size={14} />
              </button>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{unit.item_description}</span>
                {unit.wearer_name && (
                  <span class="block text-xs text-content-muted">
                    For {unit.wearer_name}
                  </span>
                )}
              </span>
              <span class="shrink-0 text-sm font-medium tabular-nums">
                {formatMinor(unit.price_minor, currency)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}
