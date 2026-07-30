import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../hooks/useReplication'

interface SyncBadgeProps {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}

/**
 * A single honest line about whether this device's work has reached the
 * server. Deliberately not hidden when things are fine: staff need to be able
 * to glance and know, rather than discover a week of unsynced orders later.
 */
export function SyncBadge({ online, auth, replication }: SyncBadgeProps) {
  const { label, tone } = describe(online, auth, replication)

  const tones = {
    good: 'bg-green-50 text-green-700 border-green-200',
    waiting: 'bg-amber-50 text-amber-800 border-amber-200',
    bad: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-gray-50 text-gray-600 border-gray-200',
  } as const

  return (
    <span class={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${tones[tone]}`}>
      {label}
    </span>
  )
}

function describe(
  online: boolean,
  auth: AuthState,
  replication: ReplicationStatus,
): { label: string; tone: 'good' | 'waiting' | 'bad' | 'neutral' } {
  if (auth.status === 'local_only') {
    return { label: 'Local only, not configured for sync', tone: 'neutral' }
  }
  if (auth.status === 'offline_stale') {
    return { label: 'Working offline, changes not yet synced', tone: 'waiting' }
  }
  if (!online) {
    return { label: 'Offline, changes saved on this device', tone: 'waiting' }
  }

  switch (replication.status) {
    case 'synced':
      return { label: 'Synced', tone: 'good' }
    case 'syncing':
      return { label: 'Syncing...', tone: 'waiting' }
    case 'error':
      return { label: 'Sync problem, work is saved locally', tone: 'bad' }
    case 'idle':
      return { label: 'Not syncing', tone: 'neutral' }
  }
}
