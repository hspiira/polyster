/* The date, sync state, and the way to Settings. The date is the heading, not
   the word "Today", which the tab bar already says. */
import { Avatar } from '../../ui'
import { SyncBadge } from '../../components/SyncBadge'
import { IconSettings } from '../../components/icons'
import type { AuthState } from '../../lib/auth'
import type { ReplicationStatus } from '../../hooks/useReplication'

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short' })

function toLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

export function TodayTop({
  date,
  staffName,
  online,
  auth,
  replication,
}: {
  /** YYYY-MM-DD. */
  date: string
  staffName?: string
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}) {
  const local = toLocalDate(date)

  return (
    <header class="mb-3">
      <div class="flex items-center justify-between gap-3">
        <SyncBadge online={online} auth={auth} replication={replication} />
        <a
          href="/settings"
          aria-label="Settings"
          class="-mr-1 flex min-h-11 items-center gap-1.5 rounded-control px-1
                 text-content-subtle active:bg-pressed"
        >
          <IconSettings size={17} />
          {staffName && <Avatar name={staffName} size="sm" />}
        </a>
      </div>

      {/* Not an `h1`: `Screen label` already renders one, visually hidden. */}
      <p aria-hidden="true" class="mt-0.5 flex items-baseline gap-2">
        <span class="text-[32px] font-semibold leading-none tracking-tight tabular-nums">
          {local.getDate()}
        </span>
        <span class="text-[22px] font-medium leading-none tracking-tight text-content-muted">
          {WEEKDAY.format(local)}
        </span>
        <span class="text-[15px] leading-none text-content-subtle">{MONTH.format(local)}</span>
      </p>
    </header>
  )
}
