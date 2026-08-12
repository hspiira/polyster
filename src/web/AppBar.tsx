/**
 * The application bar: identity on the left, search in the middle, the account
 * on the right.
 *
 * Spans the full width above both the sidebar and the work area, because the
 * things in it are global -- which shop, search everything, who am I. A bar
 * that started after the sidebar would imply search searched the page.
 */
import { useShop } from '../state/ShopProvider'
import { getInitials } from '../ui'
import { UserMenu } from './UserMenu'
import { IconAlert, IconChevronRight, IconSearch } from '../components/icons'
import { cn } from '../lib/cn'
import { CONTROL, RADIUS, TEXT_SM, TEXT_UI, TEXT_XS } from './chrome'

export function AppBar({ onSearch }: { onSearch: () => void }) {
  const { shop } = useShop()

  return (
    <header
      class={cn(
        'flex h-11 shrink-0 items-center gap-2.5 border-b border-line bg-surface px-3',
        TEXT_UI,
      )}
    >
      <span class="flex w-[13.25rem] shrink-0 items-center gap-2">
        {shop?.logo_url ? (
          <img src={shop.logo_url} alt="" class="size-5 shrink-0 rounded object-cover" />
        ) : (
          <span
            class="grid size-5 shrink-0 place-items-center rounded bg-accent text-[10px]
                   font-bold text-accent-content"
            aria-hidden="true"
          >
            {shop ? getInitials(shop.name) : '·'}
          </span>
        )}
        <b class="truncate text-[13px] font-semibold tracking-tight">Polyster</b>
      </span>

      {/* A switcher even with one shop: it is where a second one would appear,
          and it names the shop you are working in without a page having to. */}
      <button
        type="button"
        class={cn(
          'flex shrink-0 items-center gap-1.5 px-1.5 font-medium text-content-muted',
          'hover:bg-hover hover:text-content',
          CONTROL,
          RADIUS,
          TEXT_SM,
        )}
      >
        <span class="max-w-[11rem] truncate">{shop?.name ?? 'No shop'}</span>
        <IconChevronRight size={11} class="rotate-90" />
      </button>

      <span class="flex-1" />

      {/* A button rather than a field: it opens the palette, which is where the
          typing happens. A field here would be a second place to search from,
          with its own results and its own keyboard behaviour to keep in step. */}
      <button
        type="button"
        onClick={onSearch}
        aria-keyshortcuts="Meta+K Control+K"
        class={cn(
          'flex w-[24rem] max-w-[38%] items-center gap-2 border border-line-strong bg-page px-2.5',
          'text-content-subtle hover:border-content-muted',
          CONTROL,
          RADIUS,
          TEXT_SM,
        )}
      >
        <IconSearch size={12} />
        <span class="truncate">Search orders, clients, sales</span>
        <kbd
          class={cn(
            'ml-auto rounded border border-line-strong bg-surface px-1 py-px font-mono',
            TEXT_XS,
          )}
        >
          ⌘K
        </kbd>
      </button>

      <span class="flex-1" />

      <button
        type="button"
        aria-label="Notifications"
        class={cn(
          'grid w-8 shrink-0 place-items-center text-content-muted hover:bg-hover hover:text-content',
          CONTROL,
          RADIUS,
        )}
      >
        <IconAlert size={15} />
      </button>

      <UserMenu />
    </header>
  )
}
