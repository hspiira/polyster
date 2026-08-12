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

/**
 * Full bleed on a phone, an inset card from `sm` up.
 *
 * The page pads by `--gutter` and a card pads by `--gutter` again, so on a
 * 390px screen 64px -- one sixth of the width -- went on two nested margins
 * that look like one. Cancelling the outer one with `-mx-gutter` lets the
 * surface reach both edges while the rows keep their own padding, so row text
 * lands on the same left margin as the heading above it rather than indented
 * from it. This is the plain-vs-inset list distinction iOS draws, and a phone
 * is where plain wins.
 */
export const SURFACE =
  '-mx-gutter overflow-hidden bg-surface sm:mx-0 sm:rounded-card sm:shadow-raise'

export function DueList({ sections }: { sections: readonly DueSection[] }) {
  const visible = sections.filter((section) => section.rows.length > 0)
  if (visible.length === 0) return null

  return (
    <section class={SURFACE}>
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
  const TypeIcon = ORDER_TYPE_ICONS[order.order_type]

  return (
    <a
      href={`/orders/${order.id}`}
      class="flex min-h-tap items-center gap-2.5 px-gutter py-2 transition-colors
             hover:bg-hover active:bg-pressed"
    >
      {/*
        Shape says what kind of order it is, colour says what stage it is in.
        The accent bar this replaced carried only the stage, which the meta
        line already spells out -- so a whole visual channel was spent
        repeating one word. Order type was shown nowhere on the row at all,
        and "a rental due back" reads very differently from "a repair".
        Both remain in text: the stage below, the type on the order itself.
      */}
      <span
        class={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-[0.65rem]',
          TONE_SOFT[stageTone],
        )}
      >
        <TypeIcon size={16} />
        {/*
          The glyph is the only place the row states its type, so it cannot be
          decorative. Reading it out costs a screen reader one word and gives
          it a fact the old accent bar never carried at all.
        */}
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
