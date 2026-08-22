import { useShop } from '../state/ShopProvider'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../lib/syncState'

interface SyncBadgeProps {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
  /** Rows this device still owes the server. */
  pending?: number
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
export function SyncBadge({ online, auth, replication, pending = 0 }: SyncBadgeProps) {
  const { shop } = useShop()
  const claimed = Boolean(shop?.supabase_auth_user_id)
  const { label, tone } = describe(online, auth, replication, claimed, pending)

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

  /* A live region: this is the one place the app says whether work has left the
     device, and it changes without anyone navigating to it. */
  return (
    <span
      role="status"
      aria-live="polite"
      class={`inline-flex min-w-0 items-center gap-1.5 text-xs ${SYNC_TEXT_TONES[tone]}`}
    >
      <span class="relative flex size-2 shrink-0" aria-hidden="true">
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
  pending = 0,
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
    return { label: waiting('Offline', pending), tone: 'waiting' }
  }
  if (!online) {
    return { label: waiting('Offline', pending), tone: 'waiting' }
  }

  switch (replication.status) {
    case 'synced':
      // Work done since the run finished is still owed, and saying so is better
      // than a green tick over a queue.
      return pending > 0
        ? { label: waiting('Saved here', pending), tone: 'waiting' }
        : { label: 'Synced', tone: 'good' }
    case 'syncing':
      return { label: 'Syncing', tone: 'waiting' }
    case 'error':
      return { label: waiting('Sync problem', pending), tone: 'bad' }
    case 'idle':
      return { label: pending > 0 ? waiting('Not syncing', pending) : 'Not syncing', tone: 'neutral' }
  }
}

/* A count, so "offline" says how much is at stake rather than only that it is.
   One is spelled out: "1 not sent" reads as a typo. */
function waiting(prefix: string, pending: number): string {
  if (pending <= 0) return prefix
  return `${prefix}, ${pending === 1 ? 'one change' : `${pending} changes`} not sent`
}
