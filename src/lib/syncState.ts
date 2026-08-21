/* Sync state as the UI sees it. Nothing writes anything but 'idle' yet: the
   device holds the only copy until a backup is exported. */
export type ReplicationStatus =
  | { status: 'idle' }
  | { status: 'syncing' }
  | { status: 'synced' }
  | { status: 'error'; error: unknown }

export const NOT_SYNCING: ReplicationStatus = { status: 'idle' }
