/**
 * Client list, search, and add (Phase 1 step 4).
 *
 * Search filters in memory rather than through an RxDB query. A shop has
 * hundreds of clients, not millions, and the whole list is already local -- so
 * this is instant, works offline by construction, and matches on phone number
 * as well as name, which is how a shop actually looks someone up when they
 * call.
 */
import { useMemo, useState } from 'preact/hooks'
import { Button, Card, EmptyState, ErrorNote, Field, Input, ListRow, Screen, Textarea } from '../components/ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { createClient } from '../db/writes'
import type { ClientDoc } from '../db/schema'

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
    <Screen
      title="Clients"
      action={
        !adding && (
          <Button onClick={() => setAdding(true)} class="px-3">
            Add
          </Button>
        )
      }
    >
      {adding && <AddClientForm onDone={() => setAdding(false)} />}

      {clients.length > 0 && (
        <Input
          type="search"
          placeholder="Search by name or phone"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          class="mb-3"
        />
      )}

      {clients.length === 0 && !adding && (
        <EmptyState
          title="No clients yet"
          description="Add the first client and their measurements, then you can take an order for them."
          action={<Button onClick={() => setAdding(true)}>Add a client</Button>}
        />
      )}

      {clients.length > 0 && matches.length === 0 && (
        <EmptyState
          title="No matches"
          description={`Nothing found for "${search.trim()}". Check the spelling, or add them as a new client.`}
          action={<Button onClick={() => setAdding(true)}>Add a client</Button>}
        />
      )}

      {matches.length > 0 && (
        <Card class="!p-0">
          <ul class="px-3">
            {matches.map((client) => (
              <li key={client.id}>
                <ClientRow client={client} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Screen>
  )
}

function ClientRow({ client }: { client: ClientDoc }) {
  return (
    <ListRow href={`/clients/${client.id}`}>
      <span class="min-w-0">
        <span class="block truncate font-medium text-gray-900">{client.name}</span>
        {client.phone && <span class="block text-sm text-gray-500">{client.phone}</span>}
      </span>
      <span class="text-gray-400" aria-hidden="true">
        ›
      </span>
    </ListRow>
  )
}

function AddClientForm({ onDone }: { onDone: () => void }) {
  const { db, shop } = useCurrentShop()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this client.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card class="mb-4">
      <form onSubmit={submit} class="space-y-3">
        <h2 class="font-medium text-gray-900">New client</h2>

        <Field label="Name">
          <Input
            value={name}
            autofocus
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </Field>

        <Field label="Phone" hint="Used for the WhatsApp button. Include the country code, or start with 0.">
          <Input
            type="tel"
            inputmode="tel"
            value={phone}
            onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
          />
        </Field>

        <Field label="Notes">
          <Textarea value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2">
          <Button variant="secondary" class="flex-1" type="button" onClick={onDone}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save client'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
