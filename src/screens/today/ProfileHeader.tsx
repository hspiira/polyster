/**
 * Today's profile header (spec A9): who is signed in, whether their work has
 * synced, and the two doors that left the tab bar when Reports and Settings
 * lost their tabs (A15). It replaces both the page title and the Shell
 * strip's avatar, but only on Today -- see Shell.tsx.
 *
 * Two separate links, not one nested inside the other: the identity block
 * goes to Settings, the icon button goes to Reports. Nesting an interactive
 * element inside another is invalid HTML and breaks keyboard navigation, so
 * they sit side by side instead.
 */
import { Avatar } from '../../components/ui'
import { describe, SYNC_DOT_TONES } from '../../components/SyncBadge'
import { IconChart } from '../../components/icons'
import { cn } from '../../lib/cn'
import type { AuthState } from '../../lib/auth'
import type { ReplicationStatus } from '../../hooks/useReplication'

export function ProfileHeader({
  name,
  greeting,
  shopName,
  online,
  auth,
  replication,
}: {
  /** First name only, or undefined with no active staff -- see Today.tsx. */
  name?: string
  greeting: string
  /** Shown in place of the sync label when sync is healthy. Degrades quietly
   *  to the sync label itself if there is no shop name to show. */
  shopName?: string
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}) {
  // Reuses SyncBadge's own tone logic rather than re-deriving it: a problem
  // outranks identity, so the shop name only replaces the sync line when sync
  // itself has nothing to report.
  const { label, tone } = describe(online, auth, replication)
  const line2 = tone === 'good' && shopName ? shopName : label

  return (
    <div class="mb-6 flex items-center justify-between gap-3 pt-1">
      <a
        href="/settings"
        class="-ml-1 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control py-1 pr-2 pl-1
               transition-colors active:bg-stone-200 dark:active:bg-stone-800"
      >
        {name && <Avatar name={name} size="lg" />}
        <span class="min-w-0">
          {/* Custom leading rather than the text-lg/text-xs defaults: those
              set the block a few px taller than the 44px avatar next to it. */}
          <span class="block truncate text-[18px]/[20px] font-semibold tracking-tight">
            {greeting}
          </span>
          <span class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px]/[16px] text-stone-500 dark:text-stone-400">
            <span class={cn('size-2 shrink-0 rounded-full', SYNC_DOT_TONES[tone])} aria-hidden="true" />
            <span class="truncate">{line2}</span>
          </span>
        </span>
      </a>

      <a
        href="/reports"
        aria-label="Reports"
        class="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-500
               transition-colors active:bg-stone-200 dark:text-stone-400 dark:active:bg-stone-800"
      >
        <IconChart size={20} />
      </a>
    </div>
  )
}
