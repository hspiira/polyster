/* The date, sync state, and the way to Settings. The date is the heading, not
   the word "Today", which the tab bar already says. */
import { SyncBadge } from '../../components/SyncBadge'
import { AccountMenu } from '../../components/AccountMenu'
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

        {/* Two targets, not one. The gear was previously inside the same link
            as the avatar, so tapping a face opened preferences. */}
        <div class="-mr-1.5 flex shrink-0 items-center gap-0.5">
          <a
            href="/settings"
            aria-label="Settings"
            class="flex size-11 items-center justify-center rounded-full
                   text-content-subtle active:bg-pressed"
          >
            <IconSettings size={20} />
          </a>
          {staffName && (
            <>
              <span aria-hidden="true" class="h-5 w-px shrink-0 bg-line-strong" />
              <AccountMenu staffName={staffName} />
            </>
          )}
        </div>
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
