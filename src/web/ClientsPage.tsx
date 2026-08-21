/* Adds what they owe and how many orders are open -- what the person answering
   the phone needs before they finish saying hello. Search filters in memory. */
import { useMemo, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { useCurrentShop } from '../state/ShopProvider'
import { AddClientSheet } from '../components/AddClientSheet'
import { useQuery } from '../hooks/useQuery'
import { clientTotalsById, noClientTotals } from '../db/balances'
import { formatMinor } from '../lib/money'
import { EmptyState, getInitials } from '../ui'
import { IconPlus, IconSearch, IconUsers } from '../components/icons'
import { cn } from '../lib/cn'
import { Page } from './Page'
import { Table, type TableColumn } from './Table'
import { CONTROL_SM, RADIUS, TEXT_SM, TEXT_XS } from './chrome'
import { filterByQuery } from '../lib/search'
import { observeClients, observeOrders, observeShopBalances } from '../db/repo'

interface ClientRow {
  id: string
  name: string
  phone?: string
  openOrders: number
  owed_minor: number
}

export function ClientsPage() {
  const { db, shop } = useCurrentShop()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)

  const clientRows = useQuery(() => observeClients(db, shop.id), [db, shop.id], [])
  const orderRows = useQuery(() => observeOrders(db, shop.id), [db, shop.id], [])
  const balances = useQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const rows = useMemo<ClientRow[]>(() => {
    const totals = clientTotalsById(
      orderRows,
      balances,
    )

    return clientRows.map((client) => {
      const theirs = totals.get(client.id) ?? noClientTotals()
      return {
        id: client.id,
        name: client.name,
        phone: client.phone,
        openOrders: theirs.openOrders,
        owed_minor: theirs.owedMinor,
      }
    })
  }, [clientRows, orderRows, balances])

  const matches = useMemo(() => {
    return filterByQuery(rows, search, (row) => ({ text: [row.name], phone: [row.phone] }))
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
      actions={
        <button
          type="button"
          onClick={() => setAdding(true)}
          class={cn(
            'flex items-center gap-1.5 bg-accent px-3 font-semibold text-accent-content',
            'hover:brightness-110',
            CONTROL_SM,
            RADIUS,
            TEXT_SM,
          )}
        >
          <IconPlus size={14} /> Add client
        </button>
      }
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
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
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
            action={
              <button
                type="button"
                onClick={() => setAdding(true)}
                class={cn(
                  'flex items-center gap-1.5 bg-accent px-3 font-semibold text-accent-content',
                  'hover:brightness-110',
                  CONTROL_SM,
                  RADIUS,
                  TEXT_SM,
                )}
              >
                <IconPlus size={14} /> {rows.length === 0 ? 'Add the first client' : 'Add client'}
              </button>
            }
          />
        }
      />

      <AddClientSheet
        open={adding}
        onClose={() => setAdding(false)}
        // Straight to the new client, which is where you were heading anyway.
        onCreated={(clientId) => location.route(`/clients/${clientId}`)}
      />
    </Page>
  )
}
