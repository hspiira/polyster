/* COMPATIBILITY SHIM. Do not add to this file; delete it when nothing imports
   it. Conversion steps are in docs/DESIGN_SYSTEM.md; Orders.tsx is the example. */
import type { ComponentChildren } from 'preact'
import { useLocation } from 'preact-iso'
import { cn } from '../lib/cn'
import { TONE_SOLID, type AnyTone } from '../ui/tones'

export * from '../ui'

/** @deprecated Use `Tone` from `../ui`. */
export type ChipTone = AnyTone

/** @deprecated Use `TONE_SOLID` from `../ui`, keyed by a `Tone`. */
export const ACCENT_TONES: Record<AnyTone, string> = {
  neutral: TONE_SOLID.neutral,
  accent: TONE_SOLID.accent,
  success: TONE_SOLID.success,
  money: TONE_SOLID.money,
  danger: TONE_SOLID.danger,
  info: TONE_SOLID.accent,
  good: TONE_SOLID.success,
  warn: TONE_SOLID.money,
  bad: TONE_SOLID.danger,
  alert: TONE_SOLID.danger,
  default: TONE_SOLID.neutral,
}

/** @deprecated Use `MEASURE` from `../ui`. */
export const CONTAINER = 'mx-auto w-full max-w-measure'

/** @deprecated Use `MEASURE_WIDE` from `../ui`. */
export const CONTAINER_WIDE = 'mx-auto w-full max-w-wide'

/** @deprecated Use `DataList`, which renders each record once instead of twice. */
export function DataTable({
  columns,
  children,
}: {
  columns: readonly { label: string; align?: 'right' }[]
  children: ComponentChildren
}) {
  return (
    <div class="hidden overflow-hidden rounded-card bg-surface shadow-raise lg:block">
      <table class="w-full border-collapse text-left text-sm">
        <thead>
          <tr class="border-b border-line">
            {columns.map((column) => (
              <th
                key={column.label}
                scope="col"
                class={cn(
                  'px-4 py-3 text-xs font-medium text-content-muted',
                  column.align === 'right' && 'text-right',
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** @deprecated Use `DataList`'s `href`. */
export function DataRowLink({
  href,
  children,
}: {
  href: string
  children: ComponentChildren
}) {
  const { route } = useLocation()
  return (
    <tr
      onClick={() => route(href)}
      class="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-hover"
    >
      {children}
    </tr>
  )
}

/** @deprecated Use a `DataList` `Column`. */
export function Td({
  children,
  align,
  muted,
  class: className,
}: {
  children: ComponentChildren
  align?: 'right'
  muted?: boolean
  class?: string
}) {
  return (
    <td
      class={cn(
        'px-4 py-3.5 align-middle',
        align === 'right' && 'text-right',
        muted && 'text-content-muted',
        className,
      )}
    >
      {children}
    </td>
  )
}
