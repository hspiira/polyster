/* Search everything on ⌘K, across orders, clients and sales at once: a shop
   looking for "Achen" does not care which table it is in. Local and synchronous. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { saleTotalMinor } from '../db/profit'
import { formatMinor } from '../lib/money'
import { cn } from '../lib/cn'
import { RADIUS, TEXT_SM, TEXT_XS } from './chrome'
import { matchesQuery } from '../lib/search'

interface Hit {
  id: string
  kind: 'Order' | 'Client' | 'Sale'
  title: string
  detail: string
  href: string
}

/** Enough to be useful, few enough to scan without scrolling. */
const LIMIT = 8

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, shop } = useCurrentShop()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const orderDocs = useRxQuery(
    () => db.orders.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const saleDocs = useRxQuery(
    () => db.sales.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )

  const clientNames = useMemo(
    () => new Map(clientDocs.map((doc) => [doc.id, doc.name])),
    [clientDocs],
  )

  const hits = useMemo<Hit[]>(() => {
    const term = query.trim().toLowerCase()
    if (term.length < 2) return []
    const found: Hit[] = []

    for (const doc of clientDocs) {
      const client = doc.toJSON()
      if (matchesQuery(term, { text: [client.name], phone: [client.phone] })) {
        found.push({
          id: client.id,
          kind: 'Client',
          title: client.name,
          detail: client.phone ?? 'No number',
          href: `/clients/${client.id}`,
        })
      }
    }

    for (const doc of orderDocs) {
      const order = doc.toJSON()
      const client = clientNames.get(order.client_id) ?? ''
      if (
        matchesQuery(term, { text: [order.summary, client, order.reference] })
      ) {
        found.push({
          id: order.id,
          kind: 'Order',
          title: order.summary,
          detail: client || 'Unknown client',
          href: `/orders?open=${order.id}`,
        })
      }
    }

    for (const doc of saleDocs) {
      const sale = doc.toJSON()
      if (matchesQuery(term, { text: [sale.item_description] })) {
        found.push({
          id: sale.id,
          kind: 'Sale',
          title: sale.item_description,
          detail: formatMinor(saleTotalMinor(sale), shop.currency),
          href: '/sales',
        })
      }
    }

    // Orders first: they are what someone is usually chasing. Then clients,
    // then sales, which are history rather than work.
    const rank = { Order: 0, Client: 1, Sale: 2 } as const
    return found.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, LIMIT)
  }, [query, orderDocs, clientDocs, saleDocs, clientNames, shop.currency])

  // Reset per opening, so ⌘K is always a fresh search rather than the last one.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    input.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    setCursor(0)
  }, [query])

  if (!open) return null

  function go(hit: Hit | undefined) {
    if (!hit) return
    location.route(hit.href)
    closeRef.current()
  }

  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      <button type="button" aria-label="Close" onClick={onClose} class="absolute inset-0 bg-scrim" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        class={cn('relative w-full max-w-[32rem] overflow-hidden bg-surface shadow-overlay', RADIUS)}
      >
        <input
          ref={input}
          type="text"
          value={query}
          placeholder="Search orders, clients, sales"
          aria-label="Search orders, clients and sales"
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onClose()
              return
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setCursor((current) => Math.min(current + 1, Math.max(0, hits.length - 1)))
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setCursor((current) => Math.max(current - 1, 0))
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              go(hits[cursor])
            }
          }}
          class="w-full border-0 bg-transparent px-3.5 py-3 text-[15px] text-content outline-none
                 placeholder:text-content-subtle"
        />

        {query.trim().length >= 2 && (
          <ul class="max-h-[22rem] overflow-y-auto border-t border-line">
            {hits.length === 0 ? (
              <li class={cn('px-3.5 py-3 text-content-subtle', TEXT_SM)}>
                Nothing matches “{query.trim()}”.
              </li>
            ) : (
              hits.map((hit, index) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => go(hit)}
                    aria-selected={index === cursor}
                    class={cn(
                      'flex w-full items-center gap-2.5 px-3.5 py-2 text-left',
                      index === cursor && 'bg-accent-soft',
                    )}
                  >
                    <span
                      class={cn(
                        'w-[3.25rem] shrink-0 font-semibold uppercase tracking-[0.05em]',
                        index === cursor ? 'text-accent-on-soft' : 'text-content-subtle',
                        TEXT_XS,
                      )}
                    >
                      {hit.kind}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class={cn('block truncate font-medium', TEXT_SM)}>{hit.title}</span>
                      <span class={cn('block truncate text-content-muted', TEXT_XS)}>
                        {hit.detail}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        <div
          class={cn(
            'flex items-center gap-3 border-t border-line bg-page px-3.5 py-1.5 text-content-subtle',
            TEXT_XS,
          )}
        >
          <span>↑ ↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  )
}
