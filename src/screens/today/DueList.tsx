/**
 * The day's work as one list.
 *
 * Four separate cards spent roughly 260px of a 390px-wide phone on card
 * headers and gaps to label six rows -- more chrome than content, and the
 * "Due today" card paid 43px of it to show a single order. The sections are
 * now labels inside one surface, which is the same grouping for a fraction of
 * the height.
 *
 * Counts live in the hero sentence above, not on these labels: saying "2 late"
 * and then "Overdue 2" is the same fact twice, and the second one costs a line.
 */
import { cn } from '../../lib/cn'
import { formatMinor } from '../../lib/money'
import { formatDueDate } from '../../lib/dates'
import { MoreLink } from '../../components/ui'
import { STAGE_LABELS, STAGE_TONES } from '../orderStage'
import { normalizeTone, TONE_SOLID } from '../../ui/tones'
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
    <section class="overflow-hidden rounded-card bg-surface shadow-raise">
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
      {/*
        A label, not a card header: a dot for the tone and one line of text.
        `first:pt-3` keeps the top of the surface from looking loose while
        every later section still gets air above it.
      */}
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

/**
 * Two lines, never three.
 *
 * The old row put the amount in the same wrapping meta line as the client and
 * the due date, so a real client name pushed "USh 252,000 due" onto a third
 * line and the row cost 86px. The amount is its own column now, and the stage
 * moves from a pill on the right into the meta line -- which is where the
 * freed width came from.
 */
function Row({ row }: { row: DueRow }) {
  const { order } = row
  const stageTone = normalizeTone(STAGE_TONES[order.stage])
  const overdue = formatDueDate(row.dueDate).includes('overdue')

  return (
    <a
      href={`/orders/${order.id}`}
      class="flex min-h-tap items-stretch gap-2.5 pr-gutter transition-colors
             hover:bg-hover active:bg-pressed"
    >
      {/*
        The bar carries the stage. Urgency is already said by which section the
        row sits in, so repeating it here would spend the only colour a row has
        on a fact the reader just read. The stage is still written out in the
        meta line -- colour is never the only carrier.
      */}
      <span class={cn('w-1 shrink-0 rounded-r-full', TONE_SOLID[stageTone])} aria-hidden="true" />

      <span class="min-w-0 flex-1 py-2">
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
