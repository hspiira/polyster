/**
 * The day's work as one list: sections are labels inside one surface, not four
 * cards. Counts live in the hero sentence above, so the labels do not repeat
 * them.
 */
import { cn } from '../../lib/cn'
import { formatMinor } from '../../lib/money'
import { formatDueDate } from '../../lib/dates'
import { FLUSH_SURFACE, MoreLink } from '../../components/ui'
import { ORDER_TYPE_ICONS, ORDER_TYPE_LABELS, STAGE_LABELS, STAGE_TONES } from '../orderStage'
import { normalizeTone, TONE_SOFT, TONE_SOLID } from '../../ui/tones'
import { capRows } from './todayModel'
import type { DueRow } from './todayModel'
import type { FilterScope } from '../Orders'
import type { AnyTone } from '../../ui/tones'

/** Rows shown per section before the "See all" link takes over. */
const ROW_CAP = 4

export interface DueSection {
  title: string
  tone: AnyTone
  filter: FilterScope
  rows: DueRow[]
}

export function DueList({ sections }: { sections: readonly DueSection[] }) {
  const visible = sections.filter((section) => section.rows.length > 0)
  if (visible.length === 0) return null

  return (
    <section class={FLUSH_SURFACE}>
      {visible.map((section) => (
        <Section key={section.title} section={section} />
      ))}
    </section>
  )
}

function Section({ section }: { section: DueSection }) {
  const { rows: shown, hidden } = capRows(section.rows, ROW_CAP)

  return (
    <>
      <h2 class="flex items-center gap-2 px-gutter pt-4 pb-1.5 first:pt-3">
        <span
          class={cn('size-1.5 shrink-0 rounded-full', TONE_SOLID[normalizeTone(section.tone)])}
          aria-hidden="true"
        />
        <span class="text-[13px] font-semibold">{section.title}</span>
      </h2>

      <ul>
        {shown.map((row) => (
          <li key={`${row.order.id}-${row.kind}`}>
            <Row row={row} />
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <MoreLink href={`/orders?filter=${section.filter}`}>
          See all {section.rows.length}
        </MoreLink>
      )}
    </>
  )
}

/** Two lines, never three: the amount is its own column, not part of the meta. */
function Row({ row }: { row: DueRow }) {
  const { order } = row
  const stageTone = normalizeTone(STAGE_TONES[order.stage])
  const overdue = formatDueDate(row.dueDate).includes('overdue')
  const TypeIcon = ORDER_TYPE_ICONS[order.order_type]

  return (
    <a
      href={`/orders/${order.id}`}
      class="flex min-h-tap items-center gap-2.5 px-gutter py-2 transition-colors
             hover:bg-hover active:bg-pressed"
    >
      {/* Shape is the order type, colour is the stage. */}
      <span
        class={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-[0.65rem]',
          TONE_SOFT[stageTone],
        )}
      >
        <TypeIcon size={16} />
        {/* The glyph is the only place the row states its type. */}
        <span class="sr-only">{ORDER_TYPE_LABELS[order.order_type]}</span>
      </span>

      <span class="min-w-0 flex-1">
        <span class="flex items-baseline gap-2">
          <span class="min-w-0 flex-1 truncate text-[15px] font-medium">{order.summary}</span>
          {row.outstanding_minor > 0 && (
            <span class="shrink-0 text-[13px] font-semibold tabular-nums text-money">
              {formatMinor(row.outstanding_minor, order.currency)}
            </span>
          )}
        </span>

        <span class="mt-0.5 block truncate text-[13px] text-content-muted">
          {row.clientName}
          {' · '}
          <span class={cn(overdue && 'text-danger')}>{formatDueDate(row.dueDate)}</span>
          {row.kind === 'return' && ' · return'}
          {' · '}
          {STAGE_LABELS[order.stage]}
        </span>
      </span>
    </a>
  )
}
