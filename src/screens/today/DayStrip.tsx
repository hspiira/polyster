/**
 * Seven days of workload. Informational: a cell links out to the order list
 * for that day rather than filtering this screen (spec N7).
 *
 * The strip runs from today forward, not Monday to Sunday. A tailor reads it
 * to answer "what is coming", so spending three cells on days already worked
 * would be three cells wasted -- and `buildDayStrip` already counts it this
 * way, under test.
 */
import { formatDate } from '../../lib/dates'
import { cn } from '../../lib/cn'
import type { DayCell } from './todayModel'

export function DayStrip({ cells }: { cells: readonly DayCell[] }) {
  return (
    <nav aria-label="The week ahead" class="mb-4 flex gap-1">
      {cells.map((cell) => (
        <a
          key={cell.date}
          href={`/orders?due=${cell.date}`}
          aria-label={
            cell.count === 0
              ? `Nothing due on ${formatDate(cell.date)}`
              : `${cell.count} due on ${formatDate(cell.date)}`
          }
          class={cn(
            'flex flex-1 flex-col items-center gap-1 rounded-control py-1.5',
            'transition-colors active:bg-pressed',
            // Today is a filled tile, the way the rest of the app marks a
            // current selection. Every other day stays flat so the fill means
            // one thing only.
            cell.isToday ? 'bg-surface-sunken' : 'hover:bg-hover',
          )}
        >
          <span class="text-[11px] leading-none text-content-subtle">{cell.weekdayInitial}</span>
          <span
            class={cn(
              'text-[15px] leading-none tabular-nums',
              cell.isToday ? 'font-semibold text-content' : 'text-content-muted',
            )}
          >
            {cell.dayOfMonth}
          </span>
          {/*
            A dot, not the number. The count is one glance's worth of "is this
            day busy", and the exact figure is on the list the cell opens.
            Fixed height whether or not it shows, so the row cannot jitter.
          */}
          <span class="flex h-1.5 items-center" aria-hidden="true">
            {cell.count > 0 && <span class="size-1.5 rounded-full bg-accent" />}
          </span>
        </a>
      ))}
    </nav>
  )
}
