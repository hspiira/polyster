/* Choosing who an order is for. A native select breaks down around fifty
   clients and cannot add the person at the counter. This searches and creates. */
import { useMemo, useState } from 'preact/hooks'
import { Avatar, Button, Field, Input, Sheet, cn } from '../ui'
import { IconPlus, IconSearch } from './icons'
import type { ClientDoc } from '../db/schema'
import { filterByQuery } from '../lib/search'

export function ClientPicker({
  clients,
  selectedId,
  error,
  onSelect,
  onCreate,
  onOpenChange,
}: {
  clients: readonly ClientDoc[]
  selectedId: string
  error?: string | null
  onSelect: (clientId: string) => void
  /** Resolves to the new client's id. */
  onCreate: (name: string, phone: string) => Promise<string>
  /** So a pinned action bar can get out of the way while this is up. */
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [phone, setPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  function show(next: boolean) {
    setOpen(next)
    onOpenChange?.(next)
  }

  const selected = clients.find((client) => client.id === selectedId)

  const matches = useMemo(() => {
    return filterByQuery(clients, query, (client) => ({
      text: [client.name],
      phone: [client.phone],
    })).slice(0, 50)
  }, [clients, query])

  const typed = query.trim()
  const exactExists = clients.some((client) => client.name.toLowerCase() === typed.toLowerCase())

  function close() {
    show(false)
    setQuery('')
    setPhone('')
    setCreateError(null)
  }

  async function create() {
    if (!typed) return
    setCreating(true)
    setCreateError(null)
    try {
      onSelect(await onCreate(typed, phone))
      close()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not add that client.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <Field label="Client" error={error}>
        <button
          type="button"
          onClick={() => show(true)}
          class={cn(
            'flex min-h-tap w-full items-center gap-3 rounded-control border px-3 text-left',
            'transition-colors active:bg-pressed',
            error ? 'border-danger' : 'border-line-strong',
          )}
        >
          {selected ? (
            <>
              <Avatar name={selected.name} size="sm" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-medium">{selected.name}</span>
                {selected.phone && (
                  <span class="block truncate text-[13px] text-content-muted">{selected.phone}</span>
                )}
              </span>
              <span class="shrink-0 text-[13px] text-content-muted">Change</span>
            </>
          ) : (
            <>
              <span class="text-content-subtle">
                <IconSearch size={18} />
              </span>
              <span class="flex-1 text-[15px] text-content-muted">Search or add a client</span>
            </>
          )}
        </button>
      </Field>

      <Sheet open={open} title="Who is this order for?" onClose={close}>
        <div class="space-y-3">
          <Input
            autofocus
            type="search"
            placeholder="Search by name or phone"
            value={query}
            onValue={setQuery}
          />

          {matches.length > 0 && (
            <ul class="max-h-[45svh] overflow-y-auto">
              {matches.map((client) => (
                <li key={client.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(client.id)
                      close()
                    }}
                    class="flex min-h-tap w-full items-center gap-3 rounded-control px-2 text-left
                           transition-colors active:bg-pressed"
                  >
                    <Avatar name={client.name} size="sm" />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[15px]">{client.name}</span>
                      {client.phone && (
                        <span class="block truncate text-[13px] text-content-muted">
                          {client.phone}
                        </span>
                      )}
                    </span>
                    {client.id === selectedId && (
                      <span class="shrink-0 text-[13px] font-medium text-accent">Selected</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {typed && !exactExists && (
            <div class="space-y-2 border-t border-line pt-3">
              <Input
                inputmode="tel"
                type="tel"
                placeholder="Phone number (optional)"
                value={phone}
                onValue={setPhone}
              />
              <Button block type="button" disabled={creating} onClick={() => void create()}>
                <IconPlus size={16} /> {creating ? 'Adding...' : `Add "${typed}"`}
              </Button>
              {createError && (
                <p role="alert" class="text-[13px] text-danger">
                  {createError}
                </p>
              )}
            </div>
          )}

          {!typed && clients.length === 0 && (
            <p class="py-6 text-center text-[13px] text-content-muted">
              No clients yet. Type a name above to add the first one.
            </p>
          )}

          {typed && matches.length === 0 && exactExists && (
            <p class="py-6 text-center text-[13px] text-content-muted">No match.</p>
          )}
        </div>
      </Sheet>
    </>
  )
}
