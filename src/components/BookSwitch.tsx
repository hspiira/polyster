/**
 * The Orders | Clients switch that sits in `Screen`'s sticky header (as its
 * `subheader`) on both `/orders` and `/clients`.
 *
 * Spec A14: Book is one tab in the nav but not a new route -- the two screens
 * keep their own URLs (and every existing deep link into either one), and
 * this is how a shop moves between them without going back through the tab
 * bar.
 *
 * Anchors, not a tab strip: switching screens is cross-route navigation, not
 * switching panels within one screen, so it needs the affordances navigation
 * gets for free -- long-press, middle-click, open-in-new-tab -- none of which
 * a `role="tab"` `<button>` set provides. `/orders` already carries its own
 * `role="tablist"` (the open/overdue/ready/owing/all scope filter); a second
 * tablist here would be both misleading and redundant.
 *
 * `w-fit`, not full width: this sits directly above that scope filter, and two
 * identically full-width rows back to back read as one confusing double
 * control. Sizing this one to its content marks it as the coarser, outer
 * choice -- which screen -- leaving the filter below it, full width, as the
 * finer one -- which slice of that screen.
 */
import { cn } from './ui'

type BookSection = 'orders' | 'clients'

const SECTIONS: readonly { value: BookSection; label: string; href: string }[] = [
  { value: 'orders', label: 'Orders', href: '/orders' },
  { value: 'clients', label: 'Clients', href: '/clients' },
]

export function BookSwitch({ active }: { active: BookSection }) {
  return (
    <nav aria-label="Book section" class="w-fit">
      <div class="flex gap-1 rounded-control bg-stone-200 p-1 dark:bg-stone-800">
        {SECTIONS.map((section) => {
          const current = section.value === active
          return (
            <a
              key={section.value}
              href={section.href}
              aria-current={current ? 'page' : undefined}
              class={cn(
                'flex min-h-9 shrink-0 items-center justify-center rounded-control px-3.5',
                'text-sm font-medium transition-colors',
                current
                  ? 'bg-white text-stone-900 dark:bg-stone-600 dark:text-white'
                  : 'text-stone-600 dark:text-stone-400',
              )}
            >
              {section.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
