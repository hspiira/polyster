import { useMemo } from 'preact/hooks'
import { Card, SectionTitle } from '../../ui'
import { useCurrentShop } from '../../state/ShopProvider'
import { useRxQuery } from '../../hooks/useRxQuery'
import { formatDateTime } from '../../lib/dates'
import { STAGE_LABELS } from '../orderStage'

export function StageHistory({ orderId }: { orderId: string }) {
  const { db, staff } = useCurrentShop()

  const historyDocs = useRxQuery(
    () =>
      db.order_stage_history.find({
        selector: { order_id: orderId },
        sort: [{ changed_at: 'desc' }],
      }).$,
    [db, orderId],
    [],
  )

  const names = useMemo(() => new Map(staff.map((member) => [member.id, member.name])), [staff])
  const history = useMemo(() => historyDocs.map((doc) => doc.toJSON()), [historyDocs])

  if (history.length === 0) return null

  return (
    <section>
      <SectionTitle>History</SectionTitle>
      <Card>
        <ol class="space-y-3">
          {history.map((entry) => (
            <li key={entry.id} class="flex gap-3">
              <span class="mt-1.5 size-2 shrink-0 rounded-full bg-line-strong" />
              <span class="min-w-0 text-sm">
                <span class="block">
                  {STAGE_LABELS[entry.to_stage]}
                  {entry.changed_by && names.has(entry.changed_by) && (
                    <span class="text-content-muted">
                      {' '}
                      by {names.get(entry.changed_by)}
                    </span>
                  )}
                </span>
                <span class="block text-xs text-content-muted">
                  {formatDateTime(entry.changed_at)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  )
}
