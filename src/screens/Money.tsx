/**
 * The money tab: everything about what came in and what went out.
 *
 * Sales and Expenses used to be reachable only through Settings, which is where
 * you look for how the app behaves, not for the day's takings.
 */
import { Card, ListRow, RowList, Screen, StatValue } from '../components/ui'
import { IconChart, IconReceipt, IconTag } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { formatMinor } from '../lib/money'

const SECTIONS = [
  {
    href: '/sales',
    label: 'Sales',
    hint: 'Counter sales, and what sells most',
    Icon: IconTag,
  },
  {
    href: '/expenses',
    label: 'Expenses',
    hint: 'Money out, so profit means something',
    Icon: IconReceipt,
  },
  {
    href: '/reports',
    label: 'Reports',
    hint: 'Profit, collected, outstanding, stages',
    Icon: IconChart,
  },
] as const

export function Money() {
  const { db, shop } = useCurrentShop()
  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const outstanding = [...balances.values()].reduce(
    (total, balance) => total + Math.max(0, balance.balance_minor),
    0,
  )

  return (
    <Screen label="Money">
      <div class="space-y-5">
        <Card>
          <p class="text-sm text-content-muted">Owed to you</p>
          <div class="mt-1">
            <StatValue value={formatMinor(outstanding, shop.currency)} tone="money" />
          </div>
        </Card>

        <Card padded={false}>
          <RowList>
            {SECTIONS.map(({ href, label, hint, Icon }) => (
              <li key={href}>
                <ListRow
                  href={href}
                  leading={
                    <span class="flex size-9 items-center justify-center rounded-[0.65rem] bg-surface-sunken text-content-muted">
                      <Icon size={18} />
                    </span>
                  }
                >
                  <span class="block font-medium">{label}</span>
                  <span class="block truncate text-sm text-content-muted">{hint}</span>
                </ListRow>
              </li>
            ))}
          </RowList>
        </Card>
      </div>
    </Screen>
  )
}
