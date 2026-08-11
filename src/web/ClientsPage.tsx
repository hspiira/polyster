/**
 * Clients, at a desk: a table with the two things you actually want when the
 * phone rings, which the phone's own list does not have room for.
 *
 * A client row on the phone shows a name and a number. Here it also shows what
 * they owe and how many orders are open, because that is what the person
 * answering has to know before they finish saying hello. Both come from
 * balances the app already computes -- nothing new is derived.
 *
 * Search filters in memory. A shop has hundreds of clients, not millions, the
 * whole list is already local, and matching on the number as well as the name
 * is how someone is looked up when the phone rings.
 */
import { useMemo, useState } from 'preact/hooks'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { formatMinor } from '../lib/money'
import { OPEN_STAGES } from '../screens/today/todayModel'
import { EmptyState, getInitials } from '../ui'
import { IconSearch, IconUsers } from '../components/icons'
import { cn } from '../lib/cn'
import { Page } from './Page'
import { Table, type TableColumn } from './Table'
import { CONTROL_SM, RADIUS, TEXT_SM, TEXT_XS } from './chrome'

interface ClientRow {
  id: string
  name: string
  phone?: string
  openOrders: number
  owed_minor: number
}

export function ClientsPage() {
  const { db, shop } = useCurrentShop()
  const [search, setSearch] = useState('')

  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id }, sort: [{ name: 'asc' }] }).$,
    [db, shop.id],
    [],
  )
  const orderDocs = useRxQuery(
    () => db.orders.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const rows = useMemo<ClientRow[]>(() => {
    const open = new Map<string, number>()
    const owed = new Map<string, number>()

    for (const doc of orderDocs) {
      const order = doc.toJSON()
      if (OPEN_STAGES.includes(order.stage)) {
        open.set(order.client_id, (open.get(order.client_id) ?? 0) + 1)
      }
      // Cancelled orders still carry a balance and are not chased, so they are
      // excluded here the way Reports excludes them from its aggregate.
      if (order.stage === 'cancelled') continue
      const balance = balances.get(order.id)?.balance_minor ?? 0
      if (balance > 0) owed.set(order.client_id, (owed.get(order.client_id) ?? 0) + balance)
    }

    return clientDocs.map((doc) => {
      const client = doc.toJSON()
      return {
        id: client.id,
        name: client.name,
        phone: client.phone,
        openOrders: open.get(client.id) ?? 0,
        owed_minor: owed.get(client.id) ?? 0,
      }
    })
  }, [clientDocs, orderDocs, balances])

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    const digits = term.replace(/\D/g, '')
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(term) ||
        (digits.length > 0 && (row.phone ?? '').replace(/\D/g, '').includes(digits)),
    )
  }, [rows, search])

  const columns: TableColumn<ClientRow>[] = [
    {
      id: 'name',
      label: 'Client',
      width: 'minmax(0, 2.2fr)',
      render: (row) => (
        <span class="flex items-center gap-2">
          <span
            class="grid size-[22px] shrink-0 place-items-center rounded-full bg-accent-soft
                   text-[9px] font-bold text-accent-on-soft"
            aria-hidden="true"
          >
            {getInitials(row.name)}
          </span>
          <span class="truncate font-semibold">{row.name}</span>
        </span>
      ),
    },
    {
      id: 'phone',
      label: 'Phone',
      width: 'minmax(0, 1.2fr)',
      render: (row) =>
        row.phone ?? <span class="text-content-subtle">No number</span>,
    },
    {
      id: 'open',
      label: 'Open orders',
      width: '6.5rem',
      align: 'end',
      render: (row) =>
        row.openOrders > 0 ? row.openOrders : <span class="text-content-subtle">—</span>,
    },
    {
      id: 'owed',
      label: 'Owed',
      width: '6.5rem',
      align: 'end',
      render: (row) =>
        row.owed_minor > 0 ? (
          <span class="font-semibold text-money">
            {formatMinor(row.owed_minor, shop.currency)}
          </span>
        ) : (
          <span class="text-content-subtle">—</span>
        ),
    },
  ]

  return (
    <Page
      crumbs={['Work']}
      title="Clients"
      viewbar={
        <>
          <span class={cn('relative', CONTROL_SM)}>
            <span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-content-subtle">
              <IconSearch size={12} />
            </span>
            <input
              type="search"
              value={search}
              placeholder="Search by name or phone"
              onInput={(event) => setSearch((event.target as HTMLInputElement).value)}
              class={cn(
                'h-full w-[18rem] border border-line-strong bg-surface pl-7 pr-2.5 text-content',
                'outline-none placeholder:text-content-subtle focus:border-accent',
                'focus:ring-2 focus:ring-focus/25',
                RADIUS,
                TEXT_SM,
              )}
            />
          </span>
          <span class="flex-1" />
          <span class={cn('text-content-subtle tabular-nums', TEXT_XS)}>
            {matches.length} of {rows.length}
          </span>
        </>
      }
    >
      <Table
        label="Clients"
        items={matches}
        columns={columns}
        getKey={(row) => row.id}
        href={(row) => `/clients/${row.id}`}
        empty={
          <EmptyState
            illustration={<IconUsers size={22} />}
            title={rows.length === 0 ? 'No clients yet' : 'No matches'}
            description={
              rows.length === 0
                ? 'Add a client and their measurements, then you can take an order for them.'
                : `Nothing found for "${search.trim()}". Check the spelling.`
            }
          />
        }
      />
    </Page>
  )
}
