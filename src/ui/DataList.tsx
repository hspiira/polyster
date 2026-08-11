/**
 * A list of records, described once as columns, laid out as either stacked
 * cards or an aligned table depending on the room it has.
 *
 * Both presentations are CSS layouts of the same DOM (styles/components.css) --
 * never render a record twice. Declare columns in the order the table should
 * read; `role` places them in the card form.
 *
 * The switch is a container query, not a breakpoint, so the component stays
 * correct in a split view or a dashboard column without being told where it is.
 */
import type { ComponentChildren } from 'preact'
import { cn } from '../lib/cn'

/**
 * Where a column lands in the card form. `primary` is the line you read first
 * (one per list); `meta` joins into one line beneath it; `status` is a chip top
 * right; `figure` is a number bottom right.
 */
export type CellRole = 'primary' | 'meta' | 'status' | 'figure'

export interface Column<T> {
  /** Stable key. Not shown. */
  id: string
  /** Table header. Also what the column is called when it needs saying aloud. */
  label: string
  render: (item: T) => ComponentChildren
  /** Defaults to `meta`. */
  role?: CellRole
  /**
   * Announced before the value, for screen readers. The header row is
   * decorative, so a value that means nothing alone must say what it is --
   * "42,000" needs this, a client's name does not.
   */
  srLabel?: string
  /** Grid track in table form. Defaults by role. */
  width?: string
}

const ROLE_ORDER: Record<CellRole, number> = {
  primary: 0,
  meta: 1,
  status: 2,
  figure: 3,
}

const DEFAULT_TRACK: Record<CellRole, string> = {
  primary: 'minmax(0, 2.2fr)',
  meta: 'minmax(0, 1fr)',
  status: 'auto',
  figure: 'auto',
}

/** Base typography per role. A column's own `render` can override any of it. */
const ROLE_CLASS: Record<CellRole, string> = {
  // No `truncate`: a primary cell is often two lines, and `white-space: nowrap`
  // on the wrapper would flatten them. It owns its own truncation.
  primary: 'font-medium text-content',
  meta: 'truncate text-sm text-content-muted',
  status: '',
  figure: 'text-sm font-semibold tabular-nums text-content',
}

function roleOf<T>(column: Column<T>): CellRole {
  return column.role ?? 'meta'
}

/**
 * Groups columns and builds the track list. Source order must be primary,
 * metas, status, figure -- grid places by source order and that is what
 * `--data-cols` describes -- so this sorts rather than trusting the caller.
 */
interface Layout<T> {
  primary: Column<T>[]
  metas: Column<T>[]
  trailing: Column<T>[]
  /** The `grid-template-columns` value for the table form. */
  template: string
}

function layoutOf<T>(columns: readonly Column<T>[]): Layout<T> {
  const ordered = [...columns].sort((a, b) => ROLE_ORDER[roleOf(a)] - ROLE_ORDER[roleOf(b)])
  return {
    primary: ordered.filter((column) => roleOf(column) === 'primary'),
    metas: ordered.filter((column) => roleOf(column) === 'meta'),
    trailing: ordered.filter((column) => {
      const role = roleOf(column)
      return role === 'status' || role === 'figure'
    }),
    template: ordered
      .map((column) => column.width ?? DEFAULT_TRACK[roleOf(column)])
      .join(' '),
  }
}

function Cell<T>({
  column,
  children,
}: {
  column: Column<T>
  children: ComponentChildren
}) {
  const role = roleOf(column)
  return (
    <span
      data-cell={role}
      data-align={role === 'figure' ? 'end' : undefined}
      class={cn('min-w-0', ROLE_CLASS[role])}
    >
      {column.srLabel && <span class="sr-only">{column.srLabel} </span>}
      {children}
    </span>
  )
}

/** The fixed primary / metas / trailing shape the header and every row share. */
function cellRow<T>(layout: Layout<T>, content: (column: Column<T>) => ComponentChildren) {
  return (
    <>
      {layout.primary.map((column) => (
        <Cell key={column.id} column={column}>
          {content(column)}
        </Cell>
      ))}
      {layout.metas.length > 0 && (
        <span class="data-meta">
          {layout.metas.map((column) => (
            <Cell key={column.id} column={column}>
              {content(column)}
            </Cell>
          ))}
        </span>
      )}
      {layout.trailing.map((column) => (
        <Cell key={column.id} column={column}>
          {content(column)}
        </Cell>
      ))}
    </>
  )
}

export function DataList<T>({
  items,
  columns,
  getKey,
  href,
  label,
  class: className,
}: {
  items: readonly T[]
  columns: readonly Column<T>[]
  getKey: (item: T) => string
  /** Makes the whole row a link. Omit for a list that does not navigate. */
  href?: (item: T) => string
  /** Names the list for screen readers, e.g. "Orders". */
  label: string
  class?: string
}) {
  const layout = layoutOf(columns)

  return (
    <div
      class={cn('data-list overflow-hidden rounded-card bg-surface shadow-raise', className)}
      style={`--data-cols: ${layout.template}`}
    >
      {/* Decorative: these are list items, not table cells, so the header
          aligns but does not label. Naming is `srLabel`'s job. */}
      <div class="data-list-head" aria-hidden="true">
        {cellRow(layout, (column) => column.label)}
      </div>

      <ul aria-label={label}>
        {items.map((item) => {
          const target = href?.(item)
          const cells = cellRow(layout, (column) => column.render(item))
          return (
            <li key={getKey(item)}>
              {target ? (
                <a href={target} class="data-row">
                  {cells}
                </a>
              ) : (
                <div class="data-row">{cells}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
