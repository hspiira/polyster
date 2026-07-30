import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../hooks/useReplication'

interface SyncBadgeProps {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
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
  const { label, tone } = describe(online, auth, replication)

  const dots = {
    good: 'bg-emerald-500',
    waiting: 'bg-amber-500',
    bad: 'bg-red-500',
    neutral: 'bg-stone-400',
  } as const

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
          <span class={`absolute inline-flex size-full animate-ping rounded-full ${dots[tone]} opacity-60`} />
        )}
        <span class={`relative inline-flex size-2 rounded-full ${dots[tone]}`} />
      </span>
      <span class="truncate">{label}</span>
    </span>
  )
}

function describe(
  online: boolean,
  auth: AuthState,
  replication: ReplicationStatus,
): { label: string; tone: 'good' | 'waiting' | 'bad' | 'neutral' } {
  if (auth.status === 'local_only') {
    return { label: 'Local only', tone: 'neutral' }
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
