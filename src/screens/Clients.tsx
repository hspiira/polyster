/* Client list, search and add. Search filters in memory: the whole list is
   already local, and it matches on number as well as name. */
import { useMemo, useState } from 'preact/hooks'
import {
  Avatar,
  Button,
  DataList,
  EmptyState,
  HeaderAction,
  Screen,
  SearchInput,
  type Column,
} from '../ui'
import { IconPlus } from '../components/icons'
import { AddClientSheet } from '../components/AddClientSheet'
import { IllustrationBook, IllustrationSearch } from '../components/illustrations'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { formatMinor } from '../lib/money'
import { filterByQuery } from '../lib/search'
import { formatDate } from '../lib/dates'

interface ClientTally {
  orders: number
  outstanding_minor: number
  lastOrderDate?: string
}

export function Clients() {
  const { db, shop } = useCurrentShop()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)

  const docs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id }, sort: [{ name: 'asc' }] }).$,
    [db, shop.id],
    [],
  )
  const clients = useMemo(() => docs.map((doc) => doc.toJSON()), [docs])

  // Table-form-only columns. A phone shows name and number; the wide form has
  // room for who owes money and when they were last in.
  const orderDocs = useRxQuery(
    () => db.orders.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const tallies = useMemo(() => {
    const byClient = new Map<string, ClientTally>()
    for (const doc of orderDocs) {
      const order = doc.toJSON()
      if (order.stage === 'cancelled') continue
      const tally = byClient.get(order.client_id) ?? { orders: 0, outstanding_minor: 0 }
      tally.orders += 1
      const balance = balances.get(order.id)
      if (balance && balance.balance_minor > 0) tally.outstanding_minor += balance.balance_minor
      if (!tally.lastOrderDate || order.created_at > tally.lastOrderDate) {
        tally.lastOrderDate = order.created_at
      }
      byClient.set(order.client_id, tally)
    }
    return byClient
  }, [orderDocs, balances])

  const matches = useMemo(() => {
    return filterByQuery(clients, search, (client) => ({
      text: [client.name],
      phone: [client.phone],
    }))
  }, [clients, search])

  // Closes over `tallies` and `shop.currency`, so it is not hoisted. See
  // ORDER_COLUMNS in Orders.tsx for the self-sufficient shape.
  const columns: readonly Column<(typeof clients)[number]>[] = [
    {
      id: 'name',
      label: 'Client',
      role: 'primary',
      render: (client) => <span class="truncate">{client.name}</span>,
    },
    {
      id: 'phone',
      label: 'Phone',
      render: (client) => client.phone ?? 'No phone number',
    },
    {
      id: 'orders',
      label: 'Orders',
      role: 'figure',
      wideOnly: true,
      render: (client) => tallies.get(client.id)?.orders ?? 0,
    },
    {
      id: 'outstanding',
      label: 'Outstanding',
      role: 'figure',
      srLabel: 'Outstanding',
      render: (client) => {
        const tally = tallies.get(client.id)
        return tally && tally.outstanding_minor > 0 ? (
          <span class="text-money">{formatMinor(tally.outstanding_minor, shop.currency)}</span>
        ) : (
          <span class="hidden font-normal text-content-subtle @[44rem]/data-list:inline">--</span>
        )
      },
    },
    {
      id: 'lastOrder',
      label: 'Last order',
      wideOnly: true,
      render: (client) => {
        const tally = tallies.get(client.id)
        return tally?.lastOrderDate ? formatDate(tally.lastOrderDate.slice(0, 10)) : '--'
      },
    },
  ]

  return (
    <>
      <Screen
        label="Clients"
        width="wide"
        // In the header rather than floating: the tab bar's centre button is
        // already this app's one floating action, and two is a menu (spec N12).
        action={
          clients.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          {clients.length > 0 && (
            <SearchInput
              placeholder="Search by name or phone"
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            />
          )}

          {clients.length === 0 && (
            <EmptyState
              spacious
              illustration={<IllustrationBook size={112} />}
              title="No clients yet"
              description="Add the first client and their measurements, then you can take an order for them."
              action={
                <Button onClick={() => setAdding(true)}>
                  <IconPlus size={18} /> Add a client
                </Button>
              }
            />
          )}

          {clients.length > 0 && matches.length === 0 && (
            <EmptyState
              spacious
              illustration={<IllustrationSearch size={112} />}
              title="No matches"
              description={`Nothing found for "${search.trim()}". Check the spelling, or add them as a new client.`}
              action={<Button onClick={() => setAdding(true)}>Add a client</Button>}
            />
          )}

          {matches.length > 0 && (
            <DataList
              label="Clients"
              items={matches}
              columns={columns}
              getKey={(client) => client.id}
              href={(client) => `/clients/${client.id}`}
              leading={(client) => <Avatar name={client.name} size="sm" />}
            />
          )}
        </div>
      </Screen>

      <AddClientSheet open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
