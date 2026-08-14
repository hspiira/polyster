import { useShop } from '../state/ShopProvider'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../hooks/useReplication'

interface SyncBadgeProps {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}

export type SyncTone = 'good' | 'waiting' | 'bad' | 'neutral'

export const SYNC_DOT_TONES: Record<SyncTone, string> = {
  good: 'bg-success',
  waiting: 'bg-warning',
  bad: 'bg-danger',
  neutral: 'bg-content-subtle',
}

const SYNC_TEXT_TONES: Record<SyncTone, string> = {
  good: 'text-success',
  waiting: 'text-warning',
  bad: 'text-danger',
  neutral: 'text-content-muted',
}

/* One honest line about whether this device's work has reached the server. Never
   hidden when fine: staff learn what fine looks like, so they notice when it is not. */
export function SyncBadge({ online, auth, replication }: SyncBadgeProps) {
  const { shop } = useShop()
  const claimed = Boolean(shop?.supabase_auth_user_id)
  const { label, tone } = describe(online, auth, replication, claimed)

  // An unclaimed shop has nowhere to sync to, and the fix is one screen away.
  if (!claimed && auth.status !== 'local_only') {
    return (
      <a
        href="/settings/backup"
        class="inline-flex min-w-0 items-center gap-1.5 text-xs text-warning"
      >
        <span class="relative flex size-2 shrink-0">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-60" />
          <span class="relative inline-flex size-2 rounded-full bg-warning" />
        </span>
        <span class="truncate underline underline-offset-2">Only on this phone</span>
      </a>
    )
  }

  return (
    <span class={`inline-flex min-w-0 items-center gap-1.5 text-xs ${SYNC_TEXT_TONES[tone]}`}>
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

/* What each sync state means. The one place online/auth/replication are turned
   into a label, so no caller re-derives it. */
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
