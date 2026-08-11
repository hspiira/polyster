/**
 * The web design's record table.
 *
 * A grid, not a `<table>`: rows are links, and a link cannot be a table row
 * without either nesting an anchor per cell or giving up keyboard behaviour.
 * ARIA carries the semantics the element no longer does.
 *
 * Distinct from ui/DataList, which describes a record once and lets CSS choose
 * a card or a table. Nothing here folds into cards, because nothing here ever
 * has to -- that is the point of the split (spec W1). What this gains for it:
 * selection, sorting, a sticky header, and a footer that can count.
 */
import type { ComponentChildren } from 'preact'
import { cn } from '../lib/cn'
import { GUTTER, ROW, TEXT_XS } from './chrome'

export interface TableColumn<T> {
  id: string
  label: string
  /**
   * A `grid-template-columns` track.
   *
   * Give flexible tracks a real minimum -- `minmax(7rem, 2.4fr)`, not
   * `minmax(0, 2.4fr)`. A zero minimum lets the column collapse to nothing
   * while fixed neighbours keep their width, which is how the orders table once
   * rendered rows with no order name in them at all.
   */
  width: string
  align?: 'end'
  sortable?: boolean
  render: (item: T) => ComponentChildren
}

export function Table<T>({
  items,
  columns,
  getKey,
  href,
  label,
  selected,
  onToggleSelect,
  sort,
  onSort,
  footer,
  empty,
}: {
  items: readonly T[]
  columns: readonly TableColumn<T>[]
  getKey: (item: T) => string
  href?: (item: T) => string
  label: string
  /** Omit both selection props for a list that cannot be acted on in bulk. */
  selected?: ReadonlySet<string>
  onToggleSelect?: (key: string) => void
  sort?: { column: string; direction: 'asc' | 'desc' }
  onSort?: (column: string) => void
  footer?: ComponentChildren
  empty?: ComponentChildren
}) {
  const selectable = Boolean(selected && onToggleSelect)
  const template = [selectable ? '1.75rem' : null, ...columns.map((c) => c.width)]
    .filter(Boolean)
    .join(' ')

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-line bg-surface">
      <div
        role="row"
        class={cn(
          'grid shrink-0 items-center gap-2.5 border-b border-line bg-page px-2.5 py-1.5',
          'font-semibold text-content-subtle',
          TEXT_XS,
        )}
        style={`grid-template-columns: ${template}`}
      >
        {selectable && <span />}
        {columns.map((column) => {
          const active = sort?.column === column.id
          const content = (
            <>
              {column.label}
              {column.sortable && (
                <span aria-hidden="true" class={cn('ml-0.5', !active && 'opacity-0')}>
                  {active && sort?.direction === 'desc' ? '↓' : '↑'}
                </span>
              )}
            </>
          )
          return (
            <span key={column.id} class={cn('min-w-0', column.align === 'end' && 'text-right')}>
              {column.sortable && onSort ? (
                <button
                  type="button"
                  onClick={() => onSort(column.id)}
                  class="font-semibold hover:text-content"
                  aria-label={`Sort by ${column.label}`}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </span>
          )
        })}
      </div>

      <ul aria-label={label} class="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 && empty && <li class="px-2.5 py-8">{empty}</li>}
        {items.map((item) => {
          const key = getKey(item)
          const isSelected = selected?.has(key) ?? false
          const cells = (
            <>
              {selectable && (
                <span
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  aria-label="Select row"
                  onClick={(event) => {
                    // The row is a link; selecting must not follow it.
                    event.preventDefault()
                    event.stopPropagation()
                    onToggleSelect?.(key)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== ' ' && event.key !== 'Enter') return
                    event.preventDefault()
                    event.stopPropagation()
                    onToggleSelect?.(key)
                  }}
                  class={cn(
                    'block size-[13px] rounded-sm border-[1.5px]',
                    isSelected ? 'border-accent bg-accent' : 'border-line-strong bg-surface',
                  )}
                />
              )}
              {columns.map((column) => (
                <span
                  key={column.id}
                  class={cn(
                    'min-w-0 truncate',
                    column.align === 'end' && 'text-right tabular-nums',
                  )}
                >
                  {column.render(item)}
                </span>
              ))}
            </>
          )

          const rowClass = cn(
            'grid items-center gap-2.5 border-b border-line px-2.5 last:border-b-0',
            ROW,
            isSelected ? 'bg-accent-soft' : 'hover:bg-hover',
          )
          const target = href?.(item)

          return (
            <li key={key}>
              {target ? (
                <a
                  href={target}
                  role="row"
                  aria-selected={isSelected}
                  class={rowClass}
                  style={`grid-template-columns: ${template}`}
                >
                  {cells}
                </a>
              ) : (
                <div
                  role="row"
                  aria-selected={isSelected}
                  class={rowClass}
                  style={`grid-template-columns: ${template}`}
                >
                  {cells}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {footer && (
        <div
          class={cn(
            'flex shrink-0 items-center gap-2.5 border-t border-line bg-page py-1.5 text-[11.5px]',
            'text-content-subtle',
            GUTTER,
          )}
        >
          {footer}
        </div>
      )}
    </div>
  )
}
