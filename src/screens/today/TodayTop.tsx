/**
 * Today's top: sync state, the way to Settings, and the page's name.
 *
 * Replaces the profile header (spec A9). That header carried a greeting, the
 * shop name, an avatar ring and a "More" sheet holding Reports and the settings
 * pages -- roughly a fifth of the viewport spent telling someone their own name
 * on the one screen where the work is most urgent.
 *
 * What it carried is not lost, only moved. Reports is now the Money tab, so it
 * needs no sheet; Settings is the avatar; sync is a line, which is what
 * ARCHITECTURE section 9 asks for and all it asks for. The greeting is gone,
 * and the spec that introduced it already called it "untested copy" that "may
 * read as tone-deaf" above a hero saying two orders are late.
 */
import { Avatar } from '../../components/ui'
import { SyncBadge } from '../../components/SyncBadge'
import { IconSettings } from '../../components/icons'
import type { AuthState } from '../../lib/auth'
import type { ReplicationStatus } from '../../hooks/useReplication'

export function TodayTop({
  staffName,
  online,
  auth,
  replication,
}: {
  staffName?: string
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}) {
  return (
    <header class="mb-4">
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

      {/*
        Not an `h1`: `Screen label="Today"` already renders one, visually hidden,
        so a second would announce the page name twice to a screen reader. This
        is the same word made visible, and it is decorative by definition.
      */}
      <p
        aria-hidden="true"
        class="mt-1 text-[26px] font-semibold leading-tight tracking-tight"
      >
        Today
      </p>
    </header>
  )
}
