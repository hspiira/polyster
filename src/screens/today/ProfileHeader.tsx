/**
 * Today's profile header (spec A9): who is signed in, whether their work has
 * synced, and the way through to everything that is not a tab. It replaces both
 * the page title and the Shell strip's avatar, but only on Today -- see
 * Shell.tsx.
 *
 * A link and a button side by side, never nested: the identity block goes to
 * Settings, the More button opens a sheet holding Reports and the settings
 * pages (A26). Nesting an interactive element inside another is invalid HTML
 * and breaks keyboard navigation.
 */
import { useState } from 'preact/hooks'
import { Avatar, ListRow, RowList, Sheet } from '../../components/ui'
import { describe, SYNC_RING_TONES } from '../../components/SyncBadge'
import { IconMore } from '../../components/icons'
import { cn } from '../../lib/cn'
import type { AuthState } from '../../lib/auth'
import type { ReplicationStatus } from '../../hooks/useReplication'
import { SECTIONS } from '../Settings'

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
  /** Line 2. Falls back to the sync label only when there is no shop name. */
  shopName?: string
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  // Reuses SyncBadge's tone logic rather than re-deriving it from the three
  // inputs, so the ring and the badge can never disagree.
  const { label, tone } = describe(online, auth, replication)
  // Line 2 is the shop's name. Sync moved to the ring around the avatar, so it
  // no longer competes for the line -- falling back to the label only when
  // there is no shop name to show.
  const line2 = shopName ?? label

  return (
    <div class="mb-6 flex items-center justify-between gap-3 pt-1">
      <a
        href="/settings"
        class="-ml-1 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control py-1 pr-2 pl-1
               transition-colors active:bg-stone-200 dark:active:bg-stone-800"
      >
        {name && (
          // The ring is a box-shadow, so it draws outside the 44px avatar
          // without changing the layout the text block is fitted to.
          <span
            class={cn(
              'inline-flex shrink-0 rounded-full ring-2 ring-offset-2',
              'ring-offset-stone-100 dark:ring-offset-stone-950',
              SYNC_RING_TONES[tone],
            )}
          >
            <Avatar name={name} size="lg" />
          </span>
        )}
        <span class="min-w-0">
          {/* Custom leading rather than the text-lg/text-xs defaults: those
              set the block a few px taller than the 44px avatar next to it. */}
          <span class="block truncate text-[18px]/[20px] font-semibold tracking-tight">
            {greeting}
          </span>
          <span class="mt-0.5 block truncate text-[12px]/[16px] text-stone-500 dark:text-stone-400">
            {line2}
          </span>
          {/* The ring carries sync by colour alone, which no screen reader can
              use. This is the only place the state is spoken on Today. */}
          <span class="sr-only">{label}</span>
        </span>
      </a>

      <button
        type="button"
        aria-label="More"
        onClick={() => setMoreOpen(true)}
        class="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-500
               transition-colors active:bg-stone-200 dark:text-stone-400 dark:active:bg-stone-800"
      >
        <IconMore size={20} />
      </button>

      {/* Everything that is not a tab. Reports and the settings pages both live
          here, sourced from Settings' own list so the strings exist once. */}
      <Sheet open={moreOpen} title="More" onClose={() => setMoreOpen(false)}>
        <RowList>
          {SECTIONS.map(({ href, label, hint, Icon }) => (
            <li key={href}>
              <ListRow
                href={href}
                leading={
                  <span
                    class="flex size-9 items-center justify-center rounded-full bg-stone-100
                           text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                  >
                    <Icon size={18} />
                  </span>
                }
              >
                <span class="block font-medium">{label}</span>
                <span class="block truncate text-sm text-stone-500 dark:text-stone-400">
                  {hint}
                </span>
              </ListRow>
            </li>
          ))}
        </RowList>
      </Sheet>
    </div>
  )
}
