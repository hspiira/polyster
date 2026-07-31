/**
 * Client list, search, and add (Phase 1 step 4), and Book's other section.
 *
 * Search filters in memory rather than through an RxDB query. A shop has
 * hundreds of clients, not millions, and the whole list is already local -- so
 * it is instant, offline by construction, and matches on phone number as well
 * as name, which is how a shop looks someone up when the phone rings.
 *
 * ## Book, not a route of its own
 *
 * The nav's "Book" tab reads as active here too (spec A14, via `TabBar`'s two
 * prefixes), even though it points at `/orders`. `BookSwitch` renders above
 * everything else so a shop can flip back to Orders without leaving the tab;
 * `/clients` itself, and every link into it, is unchanged.
 */
import { useMemo, useState } from 'preact/hooks'
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  HeaderAction,
  Input,
  ListRow,
  RowList,
  Screen,
  SearchInput,
  Sheet,
  Textarea,
} from '../components/ui'
import { BookSwitch } from '../components/BookSwitch'
import { IconPlus } from '../components/icons'
import { IllustrationBook, IllustrationSearch } from '../components/illustrations'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { createClient } from '../db/writes'

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
        subtitle={clients.length > 0 ? `${clients.length} in total` : undefined}
        // In the header rather than floating: the tab bar's centre button is
        // already this app's one floating action, and two is a menu (spec N12).
        action={
          clients.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          <BookSwitch active="clients" />

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
            <Card padded={false}>
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
        </div>
      </Screen>

      <AddClientSheet open={adding} onClose={() => setAdding(false)} />
    </>
  )
}

function AddClientSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, shop } = useCurrentShop()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setPhone('')
    setNotes('')
    setError(null)
  }

  async function submit(event: Event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('A name is needed to find this client again.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createClient(db, shop.id, { name, phone, notes })
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this client.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="New client" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Name">
          <Input
            value={name}
            autofocus
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </Field>

        <Field
          label="Phone"
          hint="Used for the WhatsApp button. Include the country code, or start with 0."
        >
          <Input
            type="tel"
            inputmode="tel"
            value={phone}
            onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
          />
        </Field>

        <Field label="Notes">
          <Textarea
            value={notes}
            onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save client'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
