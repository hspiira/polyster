/**
 * Seven days of workload, today first. A cell links out to that day's order
 * list rather than filtering this screen (spec N7).
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
          {/* Fixed height whether or not the dot shows, so the row cannot jitter. */}
          <span class="flex h-1.5 items-center" aria-hidden="true">
            {cell.count > 0 && <span class="size-1.5 rounded-full bg-accent" />}
          </span>
        </a>
      ))}
    </nav>
  )
}
