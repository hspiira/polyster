/**
 * Client list, search, and add (Phase 1 step 4), and Book's other section.
 *
 * Search filters in memory rather than through an RxDB query. A shop has
 * hundreds of clients, not millions, and the whole list is already local -- so
 * it is instant, offline by construction, and matches on phone number as well
 * as name, which is how a shop looks someone up when the phone rings.
 */
import { useMemo, useState } from 'preact/hooks'
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  DataRowLink,
  DataTable,
  HeaderAction,
  ListRow,
  RowList,
  Screen,
  SearchInput,
  Td,
} from '../components/ui'
import { IconPlus } from '../components/icons'
import { AddClientSheet } from '../components/AddClientSheet'
import { IllustrationBook, IllustrationSearch } from '../components/illustrations'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { formatMinor } from '../lib/money'
import { formatDate } from '../lib/dates'

const CLIENT_COLUMNS = [
  { label: 'Client' },
  { label: 'Phone' },
  { label: 'Orders', align: 'right' as const },
  { label: 'Outstanding', align: 'right' as const },
  { label: 'Last order' },
] as const

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

  // Desktop columns only. A phone shows name and number; a desktop table has
  // room for the question actually worth asking of a client list -- who owes
  // money, and when they were last in.
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
    const term = search.trim().toLowerCase()
    if (!term) return clients
    const digits = term.replace(/\D/g, '')
    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(term) ||
        (digits.length > 0 && (client.phone ?? '').replace(/\D/g, '').includes(digits)),
    )
  }, [clients, search])

  return (
    <>
      <Screen
        label="Clients"
        wide
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
            <Card padded={false} class="lg:hidden">
              <RowList>
                {matches.map((client) => (
                  <li key={client.id}>
                    <ListRow href={`/clients/${client.id}`} leading={<Avatar name={client.name} />}>
                      <span class="block truncate font-medium">{client.name}</span>
                      <span class="block truncate text-sm text-stone-500 dark:text-stone-400">
                        {client.phone ?? 'No phone number'}
                      </span>
                    </ListRow>
                  </li>
                ))}
              </RowList>
            </Card>
          )}

          {matches.length > 0 && (
            <DataTable columns={CLIENT_COLUMNS}>
              {matches.map((client) => {
                const tally = tallies.get(client.id)
                return (
                  <DataRowLink key={client.id} href={`/clients/${client.id}`}>
                    <Td>
                      <span class="flex items-center gap-3">
                        <Avatar name={client.name} size="sm" />
                        <span class="truncate font-medium">{client.name}</span>
                      </span>
                    </Td>
                    <Td muted>{client.phone ?? '--'}</Td>
                    <Td align="right" muted>
                      {tally?.orders ?? 0}
                    </Td>
                    <Td align="right">
                      {tally && tally.outstanding_minor > 0 ? (
                        <span class="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                          {formatMinor(tally.outstanding_minor, shop.currency)}
                        </span>
                      ) : (
                        <span class="text-stone-400 dark:text-stone-600">--</span>
                      )}
                    </Td>
                    <Td muted>
                      {tally?.lastOrderDate ? formatDate(tally.lastOrderDate.slice(0, 10)) : '--'}
                    </Td>
                  </DataRowLink>
                )
              })}
            </DataTable>
          )}
        </div>
      </Screen>

      <AddClientSheet open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
