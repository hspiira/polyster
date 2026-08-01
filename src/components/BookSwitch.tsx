/**
 * The Orders | Clients switch that sits atop both `/orders` and `/clients`.
 *
 * Spec A14: Book is one tab in the nav but not a new route -- the two screens
 * keep their own URLs (and every existing deep link into either one), and
 * this is how a shop moves between them without going back through the tab
 * bar. `useLocation().route` rather than a plain `<a>` because it is a
 * same-shell navigation, not a page load, matching the pattern `Orders.tsx`
 * and `OrderForm.tsx` already use for their own segment changes.
 */
import { useLocation } from 'preact-iso'
import { Segmented } from './ui'

type BookSection = 'orders' | 'clients'

const SECTIONS: readonly { value: BookSection; label: string }[] = [
  { value: 'orders', label: 'Orders' },
  { value: 'clients', label: 'Clients' },
]

const ROUTES: Record<BookSection, string> = {
  orders: '/orders',
  clients: '/clients',
}

/**
 * `w-fit` rather than `Segmented`'s own full-width default: `Orders.tsx`
 * stacks this above its own open/overdue/ready/owing/all scope filter, and
 * two identically-styled full-width pills back to back read as one confusing
 * double row. Sizing this one to its content instead of the row's width
 * marks it as the coarser, outer choice -- which screen -- and leaves the
 * filter below it, full-width, as the finer one -- which slice of that
 * screen.
 */
export function BookSwitch({ active }: { active: BookSection }) {
  const location = useLocation()
  return (
    <div class="w-fit">
      <Segmented
        value={active}
        options={SECTIONS}
        onChange={(value) => location.route(ROUTES[value])}
        label="Book section"
      />
    </div>
  )
}
