import { useShop } from '../state/ShopProvider'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../hooks/useReplication'

interface SyncBadgeProps {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}

export type SyncTone = 'good' | 'waiting' | 'bad' | 'neutral'

/** The dot colour for each tone -- exported so other renderings of the same
 *  sync state (Today's profile header) use the same colours rather than a
 *  second guess at what "waiting" should look like. */
/**
 * Ring colours for the same tones, used by Today's profile header where sync
 * shows as a ring around the avatar rather than a dot beside a label. A ring
 * is a box-shadow, so it draws outside the avatar without changing layout.
 */
export const SYNC_RING_TONES: Record<SyncTone, string> = {
  good: 'ring-emerald-500',
  waiting: 'ring-amber-500',
  bad: 'ring-red-500',
  neutral: 'ring-stone-400',
}

export const SYNC_DOT_TONES: Record<SyncTone, string> = {
  good: 'bg-emerald-500',
  waiting: 'bg-amber-500',
  bad: 'bg-red-500',
  neutral: 'bg-stone-400',
}

/**
 * A single honest line about whether this device's work has reached the
 * server, with a status dot that can be read without reading.
 *
 * Deliberately not hidden when things are fine: staff need to learn what fine
 * looks like so they notice when it changes. Unsynced work nobody knows about
 * is the worst outcome this design can produce.
 */
export function SyncBadge({ online, auth, replication }: SyncBadgeProps) {
  const { shop } = useShop()
  const claimed = Boolean(shop?.supabase_auth_user_id)
  const { label, tone } = describe(online, auth, replication, claimed)

  // An unclaimed shop has nowhere to sync to, and the fix is one screen away.
  if (!claimed && auth.status !== 'local_only') {
    return (
      <a
        href="/settings/backup"
        class="inline-flex min-w-0 items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"
      >
        <span class="relative flex size-2 shrink-0">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-60" />
          <span class="relative inline-flex size-2 rounded-full bg-amber-500" />
        </span>
        <span class="truncate underline underline-offset-2">Only on this phone</span>
      </a>
    )
  }

  const text = {
    good: 'text-emerald-700 dark:text-emerald-400',
    waiting: 'text-amber-700 dark:text-amber-400',
    bad: 'text-red-700 dark:text-red-400',
    neutral: 'text-stone-500 dark:text-stone-400',
  } as const

  return (
    <span class={`inline-flex min-w-0 items-center gap-1.5 text-xs ${text[tone]}`}>
      <span class="relative flex size-2 shrink-0">
        {tone === 'waiting' && (
          <span
            class={`absolute inline-flex size-full animate-ping rounded-full ${SYNC_DOT_TONES[tone]} opacity-60`}
          />
        )}
        <span class={`relative inline-flex size-2 rounded-full ${SYNC_DOT_TONES[tone]}`} />
      </span>
      <span class="truncate">{label}</span>
    </span>
  )
}

/** The single source of truth for what each sync state means. Today's profile
 *  header reuses this rather than re-deriving tone from `online`/`auth`/
 *  `replication` a second time. */
export function describe(
  online: boolean,
  auth: AuthState,
  replication: ReplicationStatus,
  claimed = true,
): { label: string; tone: SyncTone } {
  if (auth.status === 'local_only') {
    return { label: 'Local only', tone: 'neutral' }
  }
  // Registration no longer asks for a number, so a shop can be real and still
  // have no account behind it. Nothing can sync until it does.
  if (!claimed) {
    return { label: 'Only on this phone', tone: 'waiting' }
  }
  // Needs a person to act, so it outranks every "we are just waiting" state.
  if (auth.status === 'session_expired') {
    return { label: 'Sign in again to sync', tone: 'bad' }
  }
  if (auth.status === 'offline_stale') {
    return { label: 'Offline, not yet synced', tone: 'waiting' }
  }
  if (!online) {
    return { label: 'Offline, saved on device', tone: 'waiting' }
  }

  switch (replication.status) {
    case 'synced':
      return { label: 'Synced', tone: 'good' }
    case 'syncing':
      return { label: 'Syncing', tone: 'waiting' }
    case 'error':
      return { label: 'Sync problem, saved locally', tone: 'bad' }
    case 'idle':
      return { label: 'Not syncing', tone: 'neutral' }
  }
}
